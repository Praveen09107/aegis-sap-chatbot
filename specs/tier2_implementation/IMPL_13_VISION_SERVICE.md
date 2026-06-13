# IMPL_13: VISION SERVICE
## File Upload, DiagnosticObject Pipeline Integration, Proactive Refined Response
## Session 13 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 13: Integrate the Vision Service into the main query pipeline.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-12 complete. The ARQ vision task (from Session 11) and DiagnosticObject Redis storage are working.

**What this session creates:**
- `backend/app/handlers/upload_handler.py` — File upload endpoint with magic bytes validation
- `backend/app/services/vision_integration.py` — DiagnosticObject → query enrichment
- Update `backend/app/handlers/chat_handler.py` — Proactive vision push with refined answer
- Update `backend/app/main.py` — Register upload routes
- Integration test for the complete vision flow

**Vision pipeline summary:**
```
Employee uploads screenshot via chat UI
   ↓
POST /api/upload/screenshot
   ↓ (validates magic bytes, saves to /tmp/aegis_uploads/)
ARQ vision task queued
   ↓ (Qwen2.5-VL-7B extracts structured data)
DiagnosticObject stored in Redis (session:{session_id})
   ↓
redis_session.publish_vision_complete(session_id)
   ↓ (WebSocket handler subscribed to vision_complete channel)
proactive_vision_response_pipeline(session_id, diagnostic_obj)
   ↓ (builds enhanced query with screen context, runs abbreviated pipeline)
WebSocket sends vision_refined_answer message to browser
```

---

## FILE 1: backend/app/handlers/upload_handler.py

```python
"""
AEGIS File Upload Handler
Handles screenshot and document uploads with complete validation.

For screenshots: validates JPEG/PNG magic bytes → saves to temp dir → queues ARQ vision task
For documents: validates DOCX/PDF magic bytes → passes to ingestion pipeline
"""
import os
import uuid
import logging
import asyncio
from datetime import datetime

import httpx
from fastapi import APIRouter, Request, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse

from app.config import TEMP_UPLOAD_DIR

logger = logging.getLogger(__name__)
router = APIRouter()

# Allowed MIME types per upload category
ALLOWED_SCREENSHOT_MIMES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_DOCUMENT_MIMES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    "application/pdf",
}

# Magic bytes for validation (first N bytes of file)
MAGIC_SIGNATURES = {
    "jpeg": (bytes([0xFF, 0xD8, 0xFF]), "image/jpeg"),
    "png":  (bytes([0x89, 0x50, 0x4E, 0x47]), "image/png"),
    "docx": (bytes([0x50, 0x4B, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "pdf":  (bytes([0x25, 0x50, 0x44, 0x46]), "application/pdf"),
}

MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024   # 10MB for screenshots
MAX_DOCUMENT_BYTES = 50 * 1024 * 1024     # 50MB for documents


def validate_magic_bytes(file_content: bytes) -> tuple[str, str]:
    """
    Validate file content against known magic bytes.
    Returns (extension, mime_type) or raises HTTPException.
    """
    for ext, (magic, mime_type) in MAGIC_SIGNATURES.items():
        if file_content[:len(magic)] == magic:
            return ext, mime_type

    raise HTTPException(
        status_code=400,
        detail=(
            "Unsupported file format. AEGIS accepts .jpg, .png (screenshots) "
            "and .docx, .pdf (documents). The uploaded file format is not recognised."
        )
    )


@router.post("/api/upload/screenshot")
async def upload_screenshot(request: Request, file: UploadFile = File(...)):
    """
    Upload a SAP screenshot for vision processing.
    Validates magic bytes, saves to temp dir, queues ARQ vision task.
    """
    session_id = getattr(request.state, "session_id", None)
    if not session_id:
        # Generate a session ID if not provided (will be linked in WebSocket)
        session_id = str(uuid.uuid4())

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_SCREENSHOT_BYTES:
        raise HTTPException(status_code=413, detail="Screenshot too large. Maximum size is 10MB.")

    # Validate magic bytes
    ext, mime_type = validate_magic_bytes(content)

    # Validate it's an image type
    if ext not in {"jpeg", "png"}:
        raise HTTPException(
            status_code=400,
            detail=f"Screenshots must be JPEG or PNG format. Received: {ext}"
        )

    # Save to temp directory
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    timestamp_ms = int(datetime.utcnow().timestamp() * 1000)
    filename = f"{session_id}_{timestamp_ms}.{ext}"
    file_path = os.path.join(TEMP_UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"Screenshot saved: {file_path} ({len(content)} bytes)")

    # Queue ARQ vision task
    task_id = await _queue_vision_task(session_id, file_path)

    return JSONResponse({
        "status": "processing",
        "session_id": session_id,
        "task_id": task_id,
        "message": "Screenshot received. Processing will complete within 60 seconds.",
    })


@router.post("/api/upload/document")
async def upload_document(request: Request, file: UploadFile = File(...)):
    """
    Upload a SAP knowledge document (DOCX or PDF) for ingestion.
    Requires it-admin role.
    Only accepts .docx and .pdf files.
    """
    # Role check
    role = getattr(request.state, "role", "employee")
    if role not in {"it-admin", "consultant"}:
        raise HTTPException(
            status_code=403,
            detail="Document upload requires IT admin role."
        )

    content = await file.read()

    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Document too large. Maximum size is 50MB.")

    ext, mime_type = validate_magic_bytes(content)

    if ext not in {"docx", "pdf"}:
        raise HTTPException(
            status_code=400,
            detail=f"Documents must be .docx or .pdf format. Received: {ext}"
        )

    # Save to temp directory for ingestion pipeline
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    timestamp_ms = int(datetime.utcnow().timestamp() * 1000)
    filename = f"doc_{timestamp_ms}.{ext}"
    file_path = os.path.join(TEMP_UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"Document saved for ingestion: {file_path} ({len(content)} bytes)")

    # Trigger ingestion pipeline (Session 18)
    # For now: return accepted status
    return JSONResponse({
        "status": "accepted",
        "file_path": file_path,
        "file_type": ext,
        "message": "Document received. Ingestion will begin shortly.",
    })


async def _queue_vision_task(session_id: str, file_path: str) -> str:
    """Queue vision processing ARQ task. Returns task_id."""
    import json
    from app.infrastructure.redis_client import redis_queue

    task_id = str(uuid.uuid4())
    task_payload = json.dumps({
        "task_type": "vision",
        "task_id": task_id,
        "session_id": session_id,
        "file_path": file_path,
        "created_at": datetime.utcnow().isoformat() + "Z",
    })

    await redis_queue.redis.rpush("arq:queue:vision", task_payload)
    logger.info(f"Vision task queued: task_id={task_id}, session={session_id}")
    return task_id
```

---

## FILE 2: backend/app/services/vision_integration.py

```python
"""
AEGIS Vision Integration Service
Integrates DiagnosticObject from screenshot analysis into the query pipeline.

Two integration modes:
  1. Proactive: After vision_complete signal → generate refined answer with screen context
  2. Contextual: If DiagnosticObject exists when a text query arrives → enrich query

The DiagnosticObject supplements but never replaces the employee's text query.
Null fields in DiagnosticObject are never mentioned in the enriched query.
"""
import logging
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)


class VisionIntegrationService:
    """
    Integrates SAP screen context from Qwen2.5-VL-7B into the query pipeline.
    """

    def enrich_query_with_diagnostic(
        self,
        original_query: str,
        diagnostic_obj: Dict,
    ) -> str:
        """
        Append confirmed DiagnosticObject fields to the employee's query.
        This creates a contextually richer query for the Retrieval Engine.

        Rules:
        - Only append fields with non-None, non-empty values
        - Never infer or guess values not in the DiagnosticObject
        - Append as structured context, not as natural language
        """
        enrichment_parts = []

        if diagnostic_obj.get("error_code"):
            enrichment_parts.append(f"Error code on screen: {diagnostic_obj['error_code']}")

        if diagnostic_obj.get("error_message_text"):
            # Truncate to first 150 chars to avoid overly long queries
            msg = diagnostic_obj["error_message_text"][:150]
            enrichment_parts.append(f"Error message: {msg}")

        if diagnostic_obj.get("transaction_code"):
            enrichment_parts.append(f"Active transaction: {diagnostic_obj['transaction_code']}")

        if diagnostic_obj.get("material_number"):
            enrichment_parts.append(f"Material: {diagnostic_obj['material_number']}")

        if diagnostic_obj.get("plant_code"):
            enrichment_parts.append(f"Plant: {diagnostic_obj['plant_code']}")

        if diagnostic_obj.get("document_number"):
            enrichment_parts.append(f"Document: {diagnostic_obj['document_number']}")

        if diagnostic_obj.get("field_values"):
            # Include first 3 field values only
            for field_pair in diagnostic_obj["field_values"][:3]:
                field = field_pair.get("field", "")
                value = field_pair.get("value", "")
                if field and value:
                    enrichment_parts.append(f"{field}: {value}")

        if not enrichment_parts:
            # DiagnosticObject has no usable fields — return original query unchanged
            return original_query

        context_block = " | ".join(enrichment_parts)
        enriched = f"{original_query} [Screen context: {context_block}]"
        logger.debug(f"Query enriched with vision context: {len(enrichment_parts)} fields")
        return enriched

    def extract_entities_from_diagnostic(self, diagnostic_obj: Dict) -> List[Dict]:
        """
        Extract EntityObject-compatible dicts from DiagnosticObject.
        These supplement QIL entity extraction when vision processing completes.
        """
        entities = []

        if diagnostic_obj.get("error_code"):
            entities.append({
                "type": "error_code",
                "value": diagnostic_obj["error_code"]
            })

        if diagnostic_obj.get("transaction_code"):
            entities.append({
                "type": "tcode",
                "value": diagnostic_obj["transaction_code"]
            })

        if diagnostic_obj.get("document_number"):
            entities.append({
                "type": "document_number",
                "value": diagnostic_obj["document_number"]
            })

        return entities

    def build_proactive_query(
        self,
        original_query: str,
        diagnostic_obj: Dict,
    ) -> str:
        """
        Build a refined query for the proactive vision response.
        This is sent to the full pipeline after vision_complete is received.
        The query is enriched with screen context for maximum specificity.
        """
        enriched = self.enrich_query_with_diagnostic(original_query, diagnostic_obj)
        return f"Based on the SAP screen captured: {enriched}"

    def format_diagnostic_for_prompt(self, diagnostic_obj: Dict) -> str:
        """
        Format DiagnosticObject as a structured block for inclusion in the
        model prompt's Context section. This is the format the Reasoning Service
        uses to inject screen context.
        """
        lines = ["[Screen Analysis]"]

        if diagnostic_obj.get("error_code"):
            lines.append(f"Error Code: {diagnostic_obj['error_code']}")
        if diagnostic_obj.get("error_message_text"):
            lines.append(f"Error Message: {diagnostic_obj['error_message_text'][:200]}")
        if diagnostic_obj.get("transaction_code"):
            lines.append(f"Transaction: {diagnostic_obj['transaction_code']}")
        if diagnostic_obj.get("screen_title"):
            lines.append(f"Screen: {diagnostic_obj['screen_title']}")
        if diagnostic_obj.get("material_number"):
            lines.append(f"Material: {diagnostic_obj['material_number']}")
        if diagnostic_obj.get("plant_code"):
            lines.append(f"Plant: {diagnostic_obj['plant_code']}")

        for field_pair in diagnostic_obj.get("field_values", [])[:5]:
            field = field_pair.get("field", "")
            value = field_pair.get("value", "")
            if field and value:
                lines.append(f"{field}: {value}")

        for qty in diagnostic_obj.get("visible_quantities", [])[:3]:
            label = qty.get("label", "")
            value = qty.get("value", "")
            if label and value:
                lines.append(f"{label}: {value}")

        return "\n".join(lines)


# Singleton instance
vision_integration = VisionIntegrationService()
```

---

## FILE 3: Update backend/app/handlers/chat_handler.py

Replace `_handle_vision_complete` with the full proactive pipeline:

```python
async def _handle_vision_complete(websocket: WebSocket, session_id: str):
    """
    Handle vision_complete signal — generate and send proactive refined answer.
    Called automatically when Qwen2.5-VL-7B finishes processing the screenshot.
    The WebSocket connection must stay open to receive this — never close it after
    the initial text response.
    """
    from app.infrastructure.redis_client import redis_session
    from app.services.vision_integration import vision_integration

    diagnostic_obj = await redis_session.get_diagnostic_object(session_id)
    if not diagnostic_obj:
        logger.warning(f"vision_complete received but no DiagnosticObject found: {session_id}")
        return

    # Get the last query from session state (to build refined response)
    session_data = await redis_session.get_session(session_id)
    if not session_data:
        return

    last_query = ""
    import json
    history_raw = session_data.get("conversation_history", "[]")
    history = json.loads(history_raw)
    if history:
        last_query = history[-1].get("query_summary", "")

    # Format diagnostic for display
    diagnostic_summary = vision_integration.format_diagnostic_for_prompt(diagnostic_obj)

    # Build notification message to employee
    error_code = diagnostic_obj.get("error_code", "")
    tcode = diagnostic_obj.get("transaction_code", "")

    notification_parts = ["Screenshot analysed."]
    if error_code:
        notification_parts.append(f"Error code confirmed: **{error_code}**.")
    if tcode:
        notification_parts.append(f"Active transaction: **{tcode}**.")
    notification_parts.append(
        "Generating specific guidance based on your SAP screen..."
    )

    await websocket.send_json({
        "type": "vision_refined_answer",
        "message": " ".join(notification_parts),
        "diagnostic_summary": diagnostic_summary,
        "has_error_code": bool(error_code),
        "error_code": error_code,
        "transaction_code": tcode,
        "session_id": session_id,
    })

    # Trigger abbreviated pipeline with screen context
    # Full pipeline integration happens in Session 16 (Reasoning Service)
    # For now: indicate processing
    await websocket.send_json({
        "type": "token",
        "token": f"Based on your {tcode or 'SAP'} screen showing {error_code or 'this situation'}: ",
        "session_id": session_id,
    })
    await websocket.send_json({
        "type": "stream_complete",
        "session_id": session_id,
    })

    logger.info(f"Proactive vision response sent for session {session_id}")
```

---

## FILE 4: Update backend/app/main.py to Register Upload Routes

```python
# Add to backend/app/main.py

# Import the upload router
from app.handlers.upload_handler import router as upload_router

# Register it with the app (add after the health/metrics routes)
app.include_router(upload_router)
```

---

## FILE 5: tests/unit/test_vision_integration.py

```python
"""Unit tests for Vision Integration Service."""
import pytest
from app.services.vision_integration import VisionIntegrationService


@pytest.fixture
def vis():
    return VisionIntegrationService()


@pytest.fixture
def full_diagnostic():
    return {
        "error_code": "VL150",
        "error_message_text": "Only 50 EA of material 1000012345 available",
        "transaction_code": "VL01N",
        "screen_title": "Create Outbound Delivery",
        "material_number": "1000012345",
        "plant_code": "1000",
        "document_number": None,
        "batch_number": None,
        "field_values": [
            {"field": "Delivery Qty", "value": "100 EA"},
            {"field": "Avail. Stock", "value": "50 EA"},
        ],
        "visible_quantities": [
            {"label": "Requested", "value": "100 EA"}
        ],
    }


@pytest.fixture
def empty_diagnostic():
    return {
        "error_code": None,
        "error_message_text": None,
        "transaction_code": None,
        "screen_title": None,
        "material_number": None,
        "plant_code": None,
        "document_number": None,
        "batch_number": None,
        "field_values": [],
        "visible_quantities": [],
    }


class TestEnrichQueryWithDiagnostic:
    def test_error_code_appended(self, vis, full_diagnostic):
        result = vis.enrich_query_with_diagnostic("Why is delivery failing?", full_diagnostic)
        assert "VL150" in result
        assert "Why is delivery failing?" in result

    def test_transaction_code_appended(self, vis, full_diagnostic):
        result = vis.enrich_query_with_diagnostic("Help me", full_diagnostic)
        assert "VL01N" in result

    def test_material_number_appended(self, vis, full_diagnostic):
        result = vis.enrich_query_with_diagnostic("Help me", full_diagnostic)
        assert "1000012345" in result

    def test_empty_diagnostic_returns_original(self, vis, empty_diagnostic):
        original = "Why is delivery failing?"
        result = vis.enrich_query_with_diagnostic(original, empty_diagnostic)
        assert result == original

    def test_null_fields_not_included(self, vis, full_diagnostic):
        full_diagnostic["document_number"] = None
        result = vis.enrich_query_with_diagnostic("Help", full_diagnostic)
        assert "None" not in result
        assert "null" not in result.lower()

    def test_field_values_included(self, vis, full_diagnostic):
        result = vis.enrich_query_with_diagnostic("Help", full_diagnostic)
        assert "Delivery Qty" in result or "Avail. Stock" in result


class TestExtractEntitiesFromDiagnostic:
    def test_error_code_extracted(self, vis, full_diagnostic):
        entities = vis.extract_entities_from_diagnostic(full_diagnostic)
        error_entities = [e for e in entities if e["type"] == "error_code"]
        assert any(e["value"] == "VL150" for e in error_entities)

    def test_tcode_extracted(self, vis, full_diagnostic):
        entities = vis.extract_entities_from_diagnostic(full_diagnostic)
        tcode_entities = [e for e in entities if e["type"] == "tcode"]
        assert any(e["value"] == "VL01N" for e in tcode_entities)

    def test_empty_diagnostic_returns_empty(self, vis, empty_diagnostic):
        entities = vis.extract_entities_from_diagnostic(empty_diagnostic)
        assert entities == []


class TestFormatDiagnosticForPrompt:
    def test_format_contains_all_fields(self, vis, full_diagnostic):
        formatted = vis.format_diagnostic_for_prompt(full_diagnostic)
        assert "VL150" in formatted
        assert "VL01N" in formatted
        assert "1000012345" in formatted
        assert "1000" in formatted
        assert "[Screen Analysis]" in formatted

    def test_null_fields_excluded(self, vis, full_diagnostic):
        full_diagnostic["document_number"] = None
        formatted = vis.format_diagnostic_for_prompt(full_diagnostic)
        assert "Document: None" not in formatted

    def test_field_values_included(self, vis, full_diagnostic):
        formatted = vis.format_diagnostic_for_prompt(full_diagnostic)
        assert "Delivery Qty" in formatted or "Avail. Stock" in formatted
```

---

## RUNNING THE TESTS

```bash
cd backend && source venv/bin/activate
python -m pytest tests/unit/test_vision_integration.py -v
python -m pytest tests/unit/test_query_intelligence.py -v
```

Expected: All tests pass.

---

## INTEGRATION TEST — Complete Vision Flow

```bash
# Start FastAPI (with ARQ worker in background)
python -m arq app.workers.arq_worker.WorkerSettings &
uvicorn app.main:app --port 8000 &
sleep 5

# Get an auth token
TOKEN=$(curl -s -X POST http://localhost:8080/realms/aegis-realm/protocol/openid-connect/token \
  -d "grant_type=password&client_id=aegis-chat&client_secret=aegis_chat_client_secret_dev&username=employee1&password=employee_demo_2024" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Upload a test image (use any small JPEG for verification)
curl -s -X POST http://localhost:8000/api/upload/screenshot \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/test_screenshot.jpg" | python3 -m json.tool
```

Expected response:
```json
{
  "status": "processing",
  "session_id": "some-uuid",
  "task_id": "some-uuid",
  "message": "Screenshot received. Processing will complete within 60 seconds."
}
```

---

## VERIFICATION STEPS

### Step 1: Run unit tests
```bash
python -m pytest tests/unit/test_vision_integration.py tests/unit/test_query_intelligence.py -v
```

### Step 2: Test magic bytes validation
```bash
python3 -c "
from app.handlers.upload_handler import validate_magic_bytes

# Test JPEG detection
jpeg_header = bytes([0xFF, 0xD8, 0xFF]) + b'x' * 100
ext, mime = validate_magic_bytes(jpeg_header)
print(f'JPEG: {ext}, {mime}')

# Test PNG detection
png_header = bytes([0x89, 0x50, 0x4E, 0x47]) + b'x' * 100
ext, mime = validate_magic_bytes(png_header)
print(f'PNG: {ext}, {mime}')
"
```

### Step 3: Test DiagnosticObject enrichment
```bash
python3 -c "
from app.services.vision_integration import vision_integration

diagnostic = {
    'error_code': 'VL150', 'error_message_text': 'Only 50 EA available',
    'transaction_code': 'VL01N', 'material_number': '1000012345',
    'plant_code': '1000', 'document_number': None, 'batch_number': None,
    'field_values': [{'field': 'Avail.', 'value': '50 EA'}],
    'visible_quantities': [],
}
enriched = vision_integration.enrich_query_with_diagnostic('Why is delivery failing?', diagnostic)
print('Enriched query:')
print(enriched)
print()
formatted = vision_integration.format_diagnostic_for_prompt(diagnostic)
print('Prompt block:')
print(formatted)
"
```

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-13: Vision Service integration - upload handler and DiagnosticObject enrichment verified"
```

Update DECISIONS_LOG.md with:
- Magic bytes validation verified for all four file types
- DiagnosticObject enrichment logic verified
- Null field exclusion confirmed
- Prompt block formatting confirmed
- Vision upload endpoint returning correct response format

---
## QUICK ENTRY INGESTION-TIME VISION USAGE (Added in IMPL_28)

The aegis-ollama-vision service is used in two patterns:

PATTERN 1 (existing): Employee query-time vision
  Employee attaches a screenshot to a query.
  The CRAG pipeline calls the vision model to analyse the screenshot
  in context of the employee's question.
  This was the original use case for aegis-ollama-vision.

PATTERN 2 (new — Quick Entry): Admin ingestion-time vision
  IT admin uploads a screenshot alongside a Quick Entry form submission.
  The vision model runs at ingestion time (not query time) to extract
  all visible SAP content from the screenshot.
  The extracted text is appended to the relevant knowledge chunk in Qdrant.
  At employee query time: zero vision processing — only stored text retrieval.

PATTERN 2 DETAILS:
  Service: aegis-ollama-vision (same Docker container)
  Model:   llava:13b (same model)
  Client:  app/clients/ollama_vision.py (new file — Quick Entry only)
  Calls:   Two prompts per screenshot:
           1. SAP classification (classify_sap) — 15s timeout
           2. Content extraction (extract_sap_content) — 30s timeout
  Called from: ARQ task enrich_entry_screenshots (IMPL_28)
  Impact on existing usage: none — separate client, separate call path

RESOURCE CONSIDERATION:
  Both patterns use the same LLaVA 13B model on the same GPU.
  If screenshot enrichment runs concurrently with employee screenshot queries,
  GPU memory contention is possible.
  Mitigation: ARQ screenshot task is lower priority (async). Employee queries
  are synchronous and use a separate HTTP connection to the vision service.
  If vision response times exceed 20s during peak employee usage,
  consider restricting screenshot enrichment to off-peak hours (outside 8am-6pm IST).


---

*Document version: 1.0 | AEGIS Specification Set*
