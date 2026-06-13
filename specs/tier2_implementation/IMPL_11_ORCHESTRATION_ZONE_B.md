# IMPL_11: ORCHESTRATION — ZONE B
## ARQ Worker, Conversation State Machine, Circuit Breakers, WebSocket Handler
## Session 11 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 11: Zone B orchestration — ARQ background task worker, Conversation State Machine, Circuit Breakers, and WebSocket streaming handler.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-10 complete. FastAPI running. All data stores healthy.

**What this session creates:**
- `backend/app/infrastructure/circuit_breaker.py` — per-service circuit breakers with fallback chains
- `backend/app/models/session.py` — session state dataclasses
- `backend/app/models/retrieval.py` — EnrichedQuery and retrieval dataclasses (stubs for now)
- `backend/app/models/api.py` — API request/response models
- `backend/app/workers/arq_worker.py` — ARQ worker entry point with all task registrations
- `backend/app/tasks/vision_task.py` — screenshot processing + proactive WebSocket push
- `backend/app/tasks/audit_task.py` — audit log writes
- `backend/app/tasks/feedback_task.py` — feedback diagnosis algorithm
- `backend/app/tasks/cache_task.py` — semantic cache population
- `backend/app/tasks/knowledge_gap_task.py` — gap event recording
- `backend/app/tasks/ticket_task.py` — mock ticket creation
- `backend/app/tasks/cleanup_task.py` — nightly stale cache cleanup
- `backend/app/handlers/chat_handler.py` — WebSocket chat handler (pipeline stub)
- Update `backend/app/main.py` to register WebSocket route

---

## FILE 1: backend/app/infrastructure/circuit_breaker.py

```python
"""
AEGIS Circuit Breaker
Per-service failure tracking with automatic open/half-open/close transitions.
One circuit breaker per external service dependency.

State Machine:
  CLOSED → normal operation
  OPEN   → fast-fail, no calls attempted (after failure threshold exceeded)
  HALF_OPEN → test call allowed, if succeeds → CLOSED, if fails → OPEN

Configuration from AEGIS_CONFIGURATION_CONSTANTS.md:
  Window: 10 calls, threshold: 50%, cooldown: 30 seconds
"""
import time
import logging
from enum import Enum
from collections import deque
from typing import Optional, Callable, Any, Dict

from app.config import (
    CIRCUIT_BREAKER_WINDOW,
    CIRCUIT_BREAKER_FAIL_THRESHOLD,
    CIRCUIT_BREAKER_COOLDOWN,
)

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """
    Circuit breaker for a single external service dependency.
    Thread-safe for asyncio (single-threaded event loop).
    """

    def __init__(self, service_name: str):
        self.service_name = service_name
        self._state = CircuitState.CLOSED
        self._failure_window: deque = deque(maxlen=CIRCUIT_BREAKER_WINDOW)
        self._opened_at: Optional[float] = None
        self._total_calls = 0
        self._total_failures = 0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            # Check if cooldown has expired → transition to HALF_OPEN
            if time.monotonic() - self._opened_at >= CIRCUIT_BREAKER_COOLDOWN:
                self._state = CircuitState.HALF_OPEN
                logger.info(f"Circuit {self.service_name}: OPEN → HALF_OPEN (cooldown expired)")
        return self._state

    @property
    def is_open(self) -> bool:
        return self.state == CircuitState.OPEN

    @property
    def allows_call(self) -> bool:
        """Returns True if a call should be attempted (CLOSED or HALF_OPEN)."""
        s = self.state
        return s == CircuitState.CLOSED or s == CircuitState.HALF_OPEN

    def record_success(self):
        """Record a successful call. Closes circuit if in HALF_OPEN state."""
        self._total_calls += 1
        self._failure_window.append(False)
        if self._state == CircuitState.HALF_OPEN:
            self._state = CircuitState.CLOSED
            self._opened_at = None
            logger.info(f"Circuit {self.service_name}: HALF_OPEN → CLOSED (test call succeeded)")

    def record_failure(self):
        """Record a failed call. Opens circuit if failure rate threshold exceeded."""
        self._total_calls += 1
        self._total_failures += 1
        self._failure_window.append(True)

        if self._state == CircuitState.HALF_OPEN:
            # Single failure in HALF_OPEN → back to OPEN
            self._state = CircuitState.OPEN
            self._opened_at = time.monotonic()
            logger.warning(f"Circuit {self.service_name}: HALF_OPEN → OPEN (test call failed)")
            return

        if self._state == CircuitState.CLOSED:
            window = list(self._failure_window)
            if len(window) >= CIRCUIT_BREAKER_WINDOW:
                failure_rate = sum(window) / len(window)
                if failure_rate >= CIRCUIT_BREAKER_FAIL_THRESHOLD:
                    self._state = CircuitState.OPEN
                    self._opened_at = time.monotonic()
                    logger.warning(
                        f"Circuit {self.service_name}: CLOSED → OPEN "
                        f"(failure rate {failure_rate:.0%} >= {CIRCUIT_BREAKER_FAIL_THRESHOLD:.0%})"
                    )

    def get_stats(self) -> Dict:
        window = list(self._failure_window)
        return {
            "service": self.service_name,
            "state": self.state.value,
            "window_failures": sum(window),
            "window_size": len(window),
            "total_calls": self._total_calls,
            "total_failures": self._total_failures,
        }


class CircuitBreakerRegistry:
    """
    Registry of all circuit breakers in AEGIS.
    One breaker per external service dependency.
    """

    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._initialize()

    def _initialize(self):
        services = [
            "qdrant",
            "opensearch",
            "postgres",
            "redis_session",
            "redis_queue",
            "vault",
            "keycloak",
            "ollama_main",
            "ollama_judge",
            "ollama_vision",
            "bge_service",
            "deberta_service",
        ]
        for service in services:
            self._breakers[service] = CircuitBreaker(service)

    def get(self, service_name: str) -> CircuitBreaker:
        """Get circuit breaker for a specific service."""
        if service_name not in self._breakers:
            self._breakers[service_name] = CircuitBreaker(service_name)
        return self._breakers[service_name]

    def get_all_stats(self) -> Dict:
        """Get status of all circuit breakers (for health endpoint)."""
        return {name: cb.get_stats() for name, cb in self._breakers.items()}

    def any_open(self) -> bool:
        """Check if any circuit breaker is open."""
        return any(cb.is_open for cb in self._breakers.values())

    async def qdrant_and_opensearch_both_open(self) -> bool:
        """Check if both retrieval services are unavailable (triggers fallback chain)."""
        return (self._breakers["qdrant"].is_open and
                self._breakers["opensearch"].is_open)


# Singleton registry
circuit_registry = CircuitBreakerRegistry()
```

---

## FILE 2: backend/app/models/session.py

```python
"""
AEGIS Session State Models
Dataclasses for session state objects.
Field names match EXACTLY the Redis hash field names in AEGIS_DATA_CONTRACTS.md.
"""
from dataclasses import dataclass, field
from typing import List, Optional
import json


@dataclass
class EntityObject:
    """A SAP entity extracted from an employee query."""
    type: str   # "error_code" | "tcode" | "document_number" | "module"
    value: str  # e.g. "VL150" or "VL01N" or "SD"


@dataclass
class ConversationTurn:
    """One turn in the conversation history (compressed form for session state)."""
    query_summary: str          # Truncated to 200 chars
    answer_summary: str         # Truncated to 300 chars
    classification: str         # ERROR_RESOLUTION | PROCESS | CONFIG | SIMPLE_FACT
    confidence_badge: str       # green | amber | none
    retrieved_doc_ids: List[str]


@dataclass
class SessionState:
    """
    Complete session state object.
    All string fields because Redis hashes store everything as strings.
    """
    user_id_hash: str
    created_at: str
    conversation_history: List[ConversationTurn] = field(default_factory=list)
    active_retrieval_mode: str = "B"
    last_entities: List[EntityObject] = field(default_factory=list)
    last_document_ids: List[str] = field(default_factory=list)
    model_tier_last: int = 1
    confidence_history: List[float] = field(default_factory=list)
    unresolved_count: int = 0
    intent_label: str = ""
    diagnostic_object_ready: bool = False
    last_updated_at: str = ""

    def to_redis_hash(self) -> dict:
        """Serialize to Redis hash format (all string values)."""
        return {
            "user_id_hash": self.user_id_hash,
            "created_at": self.created_at,
            "conversation_history": json.dumps([
                {
                    "query_summary": t.query_summary,
                    "answer_summary": t.answer_summary,
                    "classification": t.classification,
                    "confidence_badge": t.confidence_badge,
                    "retrieved_doc_ids": t.retrieved_doc_ids,
                }
                for t in self.conversation_history
            ]),
            "active_retrieval_mode": self.active_retrieval_mode,
            "last_entities": json.dumps([
                {"type": e.type, "value": e.value} for e in self.last_entities
            ]),
            "last_document_ids": json.dumps(self.last_document_ids),
            "model_tier_last": str(self.model_tier_last),
            "confidence_history": json.dumps(self.confidence_history),
            "unresolved_count": str(self.unresolved_count),
            "intent_label": self.intent_label,
            "diagnostic_object_ready": "true" if self.diagnostic_object_ready else "false",
            "last_updated_at": self.last_updated_at,
        }

    @classmethod
    def from_redis_hash(cls, data: dict) -> "SessionState":
        """Deserialize from Redis hash format."""
        conv_raw = json.loads(data.get("conversation_history", "[]"))
        entities_raw = json.loads(data.get("last_entities", "[]"))

        return cls(
            user_id_hash=data.get("user_id_hash", ""),
            created_at=data.get("created_at", ""),
            conversation_history=[
                ConversationTurn(
                    query_summary=t.get("query_summary", ""),
                    answer_summary=t.get("answer_summary", ""),
                    classification=t.get("classification", "SIMPLE_FACT"),
                    confidence_badge=t.get("confidence_badge", "none"),
                    retrieved_doc_ids=t.get("retrieved_doc_ids", []),
                )
                for t in conv_raw
            ],
            active_retrieval_mode=data.get("active_retrieval_mode", "B"),
            last_entities=[
                EntityObject(type=e.get("type", ""), value=e.get("value", ""))
                for e in entities_raw
            ],
            last_document_ids=json.loads(data.get("last_document_ids", "[]")),
            model_tier_last=int(data.get("model_tier_last", "1")),
            confidence_history=json.loads(data.get("confidence_history", "[]")),
            unresolved_count=int(data.get("unresolved_count", "0")),
            intent_label=data.get("intent_label", ""),
            diagnostic_object_ready=data.get("diagnostic_object_ready", "false") == "true",
            last_updated_at=data.get("last_updated_at", ""),
        )

    def generate_intent_label(self, classification: str, primary_entity: Optional[EntityObject]) -> str:
        """
        Generate intent label deterministically (rule-based, zero latency).
        Format: {CLASSIFICATION}:{entity_value}
        Examples: ERROR_RESOLUTION:VL150, PROCEDURE:YDSA, CONFIG:WITHHOLDING_TAX
        """
        if primary_entity:
            return f"{classification}:{primary_entity.value}"
        return classification

    def add_conversation_turn(
        self,
        query: str,
        answer: str,
        classification: str,
        confidence_badge: str,
        doc_ids: List[str],
    ):
        """Add a new turn and keep only the last MAX_CONVERSATION_HISTORY_TURNS turns."""
        from app.config import MAX_CONVERSATION_HISTORY_TURNS, QUERY_SUMMARY_MAX_CHARS, ANSWER_SUMMARY_MAX_CHARS
        turn = ConversationTurn(
            query_summary=query[:MAX_CONVERSATION_HISTORY_TURNS * 67],  # ~200 chars
            answer_summary=answer[:300],
            classification=classification,
            confidence_badge=confidence_badge,
            retrieved_doc_ids=doc_ids,
        )
        self.conversation_history.append(turn)
        if len(self.conversation_history) > MAX_CONVERSATION_HISTORY_TURNS:
            self.conversation_history = self.conversation_history[-MAX_CONVERSATION_HISTORY_TURNS:]

    def add_confidence_score(self, score: float):
        """Add validation score to history, keep last 5."""
        self.confidence_history.append(round(score, 4))
        if len(self.confidence_history) > 5:
            self.confidence_history = self.confidence_history[-5:]
```

---

## FILE 3: backend/app/models/api.py

```python
"""AEGIS API Request/Response Models (Pydantic)."""
from typing import Optional, List
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class FeedbackRequest(BaseModel):
    session_id: str
    turn_index: int
    signal: str  # "positive" | "negative"


class UploadResponse(BaseModel):
    status: str
    document_id: Optional[str] = None
    chunk_count: Optional[int] = None
    message: str


class AttributionPanelData(BaseModel):
    primary_document_id: str
    primary_document_name: str
    verified_by: str
    verified_date: str
    secondary_sources: List[dict] = []
    confidence_badge: str
```

---

## FILE 4: backend/app/tasks/vision_task.py

```python
"""
AEGIS Vision Task
ARQ background task: processes screenshot → extracts DiagnosticObject →
stores in Redis → triggers proactive WebSocket push via Pub/Sub.

CRITICAL: task receives file_path (string), NOT image bytes.
File is at /tmp/aegis_uploads/{session_id}_{timestamp}.{ext}
"""
import os
import json
import base64
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Vision extraction prompt — instructs Qwen2.5-VL-7B to extract structured SAP data
VISION_EXTRACTION_PROMPT = """You are analyzing a screenshot of an SAP screen.
Extract the following information and return it as a valid JSON object.
Set any field to null if it is not visible in the screenshot.

Required JSON structure:
{
  "error_code": "SAP error code if visible (e.g. VL150, F5201) or null",
  "error_message_text": "Complete error message text exactly as shown or null",
  "transaction_code": "T-code visible in screen title (e.g. VL01N, MM02) or null",
  "screen_title": "Full screen title bar text or null",
  "material_number": "Material number if visible or null",
  "plant_code": "Plant code (4-digit number) if visible or null",
  "document_number": "10-digit SAP document number if visible or null",
  "batch_number": "Batch/lot number if visible or null",
  "field_values": [{"field": "field label", "value": "field value"}],
  "visible_quantities": [{"label": "quantity label", "value": "quantity with unit"}]
}

Return ONLY the JSON object, no other text."""


async def process_vision_task(
    ctx: Dict,
    file_path: str,
    session_id: str,
):
    """
    ARQ vision task handler.
    Processes screenshot and stores DiagnosticObject in Redis.
    Publishes vision_complete signal for proactive WebSocket push.
    Retry: 3 times, 30s delay (configured in WorkerSettings).
    """
    logger.info(f"Vision task started: session={session_id}, file={file_path}")

    try:
        # Step 1: Verify file exists
        if not os.path.exists(file_path):
            logger.error(f"Vision task: file not found: {file_path}")
            return {"status": "failed", "reason": "file_not_found"}

        # Step 2: Read image and encode as base64
        with open(file_path, "rb") as f:
            image_bytes = f.read()
        image_b64 = base64.b64encode(image_bytes).decode()

        # Determine MIME type from file extension
        ext = os.path.splitext(file_path)[1].lower()
        mime_type = "image/jpeg" if ext in {".jpg", ".jpeg"} else "image/png"

        # Step 3: Call Ollama vision API (Qwen2.5-VL-7B)
        import httpx
        from app.config import OLLAMA_VISION_URL, MODEL_VISION, VISION_PROCESSING_TIMEOUT

        async with httpx.AsyncClient(timeout=VISION_PROCESSING_TIMEOUT) as client:
            response = await client.post(
                f"{OLLAMA_VISION_URL}/api/chat",
                json={
                    "model": MODEL_VISION,
                    "messages": [
                        {
                            "role": "user",
                            "content": VISION_EXTRACTION_PROMPT,
                            "images": [image_b64],
                        }
                    ],
                    "stream": False,
                    "options": {"temperature": 0.0},
                },
            )
            response.raise_for_status()
            result = response.json()

        # Step 4: Parse DiagnosticObject from model response
        model_output = result.get("message", {}).get("content", "")
        diagnostic_obj = _parse_diagnostic_object(model_output)

        # Step 5: Store DiagnosticObject in Redis
        from app.infrastructure.redis_client import redis_session
        await redis_session.set_diagnostic_object(session_id, diagnostic_obj)
        logger.info(f"Vision task: DiagnosticObject stored for session={session_id}")

        # Step 6: Publish vision_complete signal for proactive WebSocket push
        await redis_session.publish_vision_complete(session_id)
        logger.info(f"Vision task: vision_complete published for session={session_id}")

        return {"status": "success", "session_id": session_id}

    except Exception as e:
        logger.error(f"Vision task failed for session={session_id}: {e}")
        raise  # Re-raise for ARQ retry mechanism

    finally:
        # Step 7: Always clean up temp file
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.debug(f"Cleaned up temp file: {file_path}")
        except Exception as cleanup_err:
            logger.warning(f"Could not clean up temp file {file_path}: {cleanup_err}")


def _parse_diagnostic_object(model_output: str) -> Dict:
    """
    Parse DiagnosticObject JSON from model output.
    Returns safe defaults for all fields if parsing fails.
    """
    default = {
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

    try:
        # Try to find JSON in the output (model may add preamble)
        text = model_output.strip()
        if "{" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            json_str = text[start:end]
            parsed = json.loads(json_str)
            # Validate required fields exist (fill missing with None)
            for key in default:
                if key not in parsed:
                    parsed[key] = default[key]
            return parsed
    except json.JSONDecodeError as e:
        logger.warning(f"Could not parse DiagnosticObject JSON: {e}. Output: {model_output[:200]}")

    return default
```

---

## FILE 5: backend/app/tasks/audit_task.py

```python
"""AEGIS Audit Task — Writes audit records to the append-only audit_log table."""
import logging
from typing import Dict

logger = logging.getLogger(__name__)


async def write_audit_log(ctx: Dict, audit_data: Dict):
    """
    ARQ audit task. Writes one record to audit_log.
    Retry: 5 times, 10s delay.
    """
    try:
        import asyncpg
        from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

        conn = await asyncpg.connect(
            host=POSTGRES_HOST, port=POSTGRES_PORT,
            database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD
        )
        try:
            await conn.execute(
                """
                INSERT INTO audit_log (
                    occurred_at, user_id_hash, session_id, trace_id, request_type,
                    governance_trigger_flags, validation_score, model_tier,
                    retrieved_document_ids, confidence_badge, feedback_signal
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                audit_data["occurred_at"],
                audit_data["user_id_hash"],
                audit_data["session_id"],
                audit_data["trace_id"],
                audit_data["request_type"],
                audit_data.get("governance_trigger_flags", {}),
                audit_data.get("validation_score"),
                audit_data.get("model_tier"),
                audit_data.get("retrieved_document_ids", []),
                audit_data.get("confidence_badge"),
                audit_data.get("feedback_signal", "none"),
            )
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"Audit task failed: {e}")
        raise
```

---

## FILE 6: backend/app/tasks/feedback_task.py

```python
"""
AEGIS Feedback Diagnosis Task
Classifies thumbs-down feedback as retrieval failure or generation failure.

Algorithm from AEGIS architecture:
1. Re-run retrieval for the failed query
2. Evaluate each claim from the failed answer against retrieved chunks using DeBERTa NLI
3. If avg max entailment < 0.65 → retrieval failure → knowledge_gap_events
4. If avg max entailment >= 0.65 but employee gave thumbs-down → generation failure → human_review_queue
"""
import json
import logging
from typing import Dict, List

from app.config import FEEDBACK_RETRIEVAL_FAIL_THRESHOLD

logger = logging.getLogger(__name__)


async def run_feedback_diagnosis(ctx: Dict, feedback_data: Dict):
    """
    ARQ feedback diagnosis task.
    Retry: 2 times, 60s delay.
    """
    feedback_event_id = feedback_data["feedback_event_id"]
    query_text = feedback_data["query_text"]
    answer_text = feedback_data["answer_text"]

    logger.info(f"Feedback diagnosis started for feedback_event_id={feedback_event_id}")

    try:
        import httpx
        import asyncpg
        from app.config import (
            DEBERTA_SERVICE_URL,
            QDRANT_HOST, QDRANT_PORT,
            POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
        )

        async with httpx.AsyncClient(timeout=60) as client:
            # Step 1: Re-embed the query
            embed_resp = await client.post(
                f"http://{QDRANT_HOST.replace('aegis-qdrant', 'aegis-bge')}:8002/embed-single",
                json={"text": query_text}
            )
            query_vector = embed_resp.json()["embedding"]

            # Step 2: Re-run retrieval (simplified — search all error collection)
            from qdrant_client import QdrantClient
            from qdrant_client.models import SearchParams, NamedVector
            qclient = QdrantClient(host=QDRANT_HOST.replace("aegis-qdrant", "localhost"), port=QDRANT_PORT)
            search_results = qclient.search(
                collection_name="meridian_errors",
                query_vector=NamedVector(name="content", vector=query_vector),
                limit=5,
                search_params=SearchParams(hnsw_ef=64),
                with_payload=True,
            )
            chunks = [r.payload.get("chunk_text", "") for r in search_results]

            # Step 3: Decompose answer into claims (simple sentence split)
            import re
            claims = [s.strip() for s in re.split(r'[.!?]+', answer_text) if len(s.strip()) > 20]

            if not claims or not chunks:
                logger.warning(f"No claims or chunks for diagnosis of {feedback_event_id}")
                return

            # Step 4: Evaluate each claim against each chunk using DeBERTa NLI
            all_max_entailments = []
            for claim in claims[:5]:  # Limit to 5 claims for performance
                max_ent = 0.0
                for chunk in chunks[:3]:  # Limit to 3 chunks
                    # Truncate chunk to 350 tokens (approx 280 words)
                    chunk_words = chunk.split()
                    chunk_truncated = " ".join(chunk_words[:280])

                    nli_resp = await client.post(
                        f"{DEBERTA_SERVICE_URL}/nli",
                        json={"hypothesis": claim, "premises": [chunk_truncated]}
                    )
                    nli_result = nli_resp.json()
                    max_ent = max(max_ent, nli_result.get("max_entailment", 0.0))

                all_max_entailments.append(max_ent)

            avg_entailment = sum(all_max_entailments) / len(all_max_entailments) if all_max_entailments else 0.0

        # Step 5: Classify failure
        conn = await asyncpg.connect(
            host=POSTGRES_HOST, port=POSTGRES_PORT,
            database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD
        )
        try:
            if avg_entailment < FEEDBACK_RETRIEVAL_FAIL_THRESHOLD:
                # Retrieval failure — knowledge base gap
                diagnosis_type = "retrieval_failure"
                await conn.execute(
                    """
                    INSERT INTO knowledge_gap_events (session_id, query_text, extracted_entities, gap_description)
                    VALUES ($1, $2, $3, $4)
                    """,
                    feedback_data.get("session_id", "unknown"),
                    query_text,
                    json.dumps([]),
                    f"Feedback diagnosis: avg entailment {avg_entailment:.2f} < threshold. Knowledge base may not cover this query.",
                )
                logger.info(f"Feedback {feedback_event_id}: RETRIEVAL FAILURE (avg_ent={avg_entailment:.2f})")
            else:
                # Generation failure — correct answer needed from IT admin
                diagnosis_type = "generation_failure"
                await conn.execute(
                    """
                    INSERT INTO human_review_queue (source_feedback_id, query_text, answer_text, unsupported_claims)
                    VALUES ($1, $2, $3, $4)
                    """,
                    feedback_event_id,
                    query_text,
                    answer_text,
                    [],  # Empty unsupported claims for now
                )
                logger.info(f"Feedback {feedback_event_id}: GENERATION FAILURE (avg_ent={avg_entailment:.2f})")

            # Update feedback_events with diagnosis result
            await conn.execute(
                """
                UPDATE feedback_events
                SET diagnosis_result = $1, diagnosis_completed_at = NOW()
                WHERE id = $2
                """,
                json.dumps({"type": diagnosis_type, "avg_entailment": avg_entailment}),
                feedback_event_id,
            )
        finally:
            await conn.close()

    except Exception as e:
        logger.error(f"Feedback diagnosis failed for {feedback_event_id}: {e}")
        raise
```

---

## FILE 7: backend/app/tasks/cache_task.py

```python
"""AEGIS Cache Task — Writes high-confidence answers to semantic cache."""
import logging
import uuid
from datetime import datetime
from typing import Dict

logger = logging.getLogger(__name__)


async def write_semantic_cache(ctx: Dict, cache_data: Dict):
    """
    ARQ cache write task. Embeds query and stores in Qdrant cache_queries.
    No retry (cache miss is acceptable).
    """
    try:
        import httpx
        from qdrant_client import QdrantClient
        from qdrant_client.models import PointStruct
        from app.config import QDRANT_HOST, QDRANT_PORT, BGE_SERVICE_URL, EMBEDDING_MODEL_VERSION

        query_text = cache_data["query_text"]

        async with httpx.AsyncClient(timeout=30) as client:
            embed_resp = await client.post(
                f"{BGE_SERVICE_URL}/embed-single",
                json={"text": query_text}
            )
            embedding = embed_resp.json()["embedding"]

        qclient = QdrantClient(host=QDRANT_HOST.replace("aegis-qdrant", "localhost"), port=QDRANT_PORT)
        point_id = str(uuid.uuid4())

        qclient.upsert(
            collection_name="cache_queries",
            points=[PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "query_text": query_text,
                    "answer_text": cache_data["answer_text"],
                    "validation_score": cache_data["validation_score"],
                    "document_ids": cache_data["document_ids"],
                    "created_at": datetime.utcnow().isoformat(),
                    "embedding_model_version": EMBEDDING_MODEL_VERSION,
                }
            )]
        )
        logger.info(f"Cache entry written: {point_id[:8]}...")
    except Exception as e:
        logger.warning(f"Cache write failed (non-critical): {e}")
        # Do not re-raise — cache miss is acceptable
```

---

## FILE 8: backend/app/tasks/knowledge_gap_task.py

```python
"""AEGIS Knowledge Gap Task — Records INSUFFICIENT CRAG events."""
import json
import logging
from typing import Dict

logger = logging.getLogger(__name__)


async def record_knowledge_gap(ctx: Dict, gap_data: Dict):
    """
    ARQ knowledge gap recording task.
    Retry: 3 times, 15s delay.
    """
    try:
        import asyncpg
        from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

        conn = await asyncpg.connect(
            host=POSTGRES_HOST, port=POSTGRES_PORT,
            database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD
        )
        try:
            await conn.execute(
                """
                INSERT INTO knowledge_gap_events (session_id, query_text, extracted_entities, gap_description)
                VALUES ($1, $2, $3, $4)
                """,
                gap_data.get("session_id", ""),
                gap_data.get("query_text", ""),
                json.dumps(gap_data.get("extracted_entities", [])),
                gap_data.get("gap_description", "CRAG returned INSUFFICIENT"),
            )
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"Knowledge gap task failed: {e}")
        raise
```

---

## FILE 9: backend/app/tasks/ticket_task.py

```python
"""AEGIS Mock Ticket Task — Creates support ticket when AEGIS cannot answer."""
import uuid
import logging
from datetime import datetime
from typing import Dict

logger = logging.getLogger(__name__)


async def create_mock_ticket(ctx: Dict, ticket_data: Dict):
    """
    ARQ mock ticket creation task.
    Retry: 3 times, 15s delay.
    """
    try:
        import asyncpg
        from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

        ticket_id = f"TKT-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8]}"

        conn = await asyncpg.connect(
            host=POSTGRES_HOST, port=POSTGRES_PORT,
            database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD
        )
        try:
            await conn.execute(
                """
                INSERT INTO mock_tickets (ticket_id, session_id, user_id_hash, query_text, reason)
                VALUES ($1, $2, $3, $4, $5)
                """,
                ticket_id,
                ticket_data.get("session_id", ""),
                ticket_data.get("user_id_hash", ""),
                ticket_data.get("query_text", ""),
                ticket_data.get("reason", "AEGIS could not find sufficient documentation"),
            )
        finally:
            await conn.close()

        logger.info(f"Mock ticket created: {ticket_id}")
        return {"ticket_id": ticket_id, "status": "created"}

    except Exception as e:
        logger.error(f"Ticket creation failed: {e}")
        raise
```

---

## FILE 10: backend/app/tasks/cleanup_task.py

```python
"""AEGIS Nightly Cleanup Task — Removes stale semantic cache entries."""
import logging
from datetime import datetime, timedelta
from typing import Dict

logger = logging.getLogger(__name__)


async def nightly_cleanup(ctx: Dict):
    """
    Scheduled ARQ task — runs nightly.
    Deletes semantic cache entries older than 24 hours.
    """
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Filter, FieldCondition, Range
        from app.config import QDRANT_HOST, QDRANT_PORT

        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        qclient = QdrantClient(host=QDRANT_HOST.replace("aegis-qdrant", "localhost"), port=QDRANT_PORT)

        # Count before cleanup
        collection_info = qclient.get_collection("cache_queries")
        count_before = collection_info.points_count

        # Delete stale points by scrolling and filtering
        deleted = 0
        offset = None
        while True:
            results, offset = qclient.scroll(
                collection_name="cache_queries",
                limit=100,
                offset=offset,
                with_payload=["created_at"],
            )
            stale_ids = [
                r.id for r in results
                if r.payload and r.payload.get("created_at", "9999") < cutoff
            ]
            if stale_ids:
                from qdrant_client.models import PointIdsList
                qclient.delete(
                    collection_name="cache_queries",
                    points_selector=PointIdsList(points=stale_ids)
                )
                deleted += len(stale_ids)
            if offset is None:
                break

        logger.info(f"Nightly cleanup: deleted {deleted} stale cache entries (before: {count_before})")
        return {"deleted": deleted, "cutoff": cutoff}

    except Exception as e:
        logger.error(f"Nightly cleanup failed: {e}")
        raise
```

---

## FILE 11: backend/app/workers/arq_worker.py

```python
"""
AEGIS ARQ Worker Entry Point
Defines WorkerSettings that ARQ uses to configure the worker process.
All task functions registered here with their retry policies.

Start command: python -m arq app.workers.arq_worker.WorkerSettings
"""
import logging
from typing import Any

from arq.connections import RedisSettings

from app.config import REDIS_QUEUE_URL
from app.tasks.vision_task import process_vision_task
from app.tasks.audit_task import write_audit_log
from app.tasks.feedback_task import run_feedback_diagnosis
from app.tasks.cache_task import write_semantic_cache
from app.tasks.knowledge_gap_task import record_knowledge_gap
from app.tasks.ticket_task import create_mock_ticket
from app.tasks.cleanup_task import nightly_cleanup

logger = logging.getLogger(__name__)


async def startup(ctx: dict):
    """Worker startup — connect to required services."""
    logger.info("ARQ worker starting up")
    from app.infrastructure.redis_client import redis_session, redis_queue
    await redis_session.connect()
    await redis_queue.connect()
    ctx["redis_session"] = redis_session
    ctx["redis_queue"] = redis_queue
    logger.info("ARQ worker ready")


async def shutdown(ctx: dict):
    """Worker shutdown — close connections."""
    logger.info("ARQ worker shutting down")
    from app.infrastructure.redis_client import redis_session, redis_queue
    await redis_session.close()
    await redis_queue.close()


class WorkerSettings:
    """
    ARQ WorkerSettings class.
    Defines all task functions and their retry policies.
    """
    functions = [
        process_vision_task,
        write_audit_log,
        run_feedback_diagnosis,
        write_semantic_cache,
        record_knowledge_gap,
        create_mock_ticket,
        nightly_cleanup,
    ]

    # Redis Instance 2 (ARQ queue store)
    redis_settings = RedisSettings.from_dsn(REDIS_QUEUE_URL)

    # Worker configuration
    max_jobs = 10           # Maximum concurrent jobs
    job_timeout = 180       # Seconds before a job is considered timed out
    poll_delay = 0.5        # Seconds between queue polls
    queue_read_limit = 10   # Max jobs to read per poll

    # Per-task retry configuration
    # Format: task_function → (max_tries, retry_delay_seconds)
    # ARQ uses job_try parameter — configure via task decorator or here
    job_retries = {
        "process_vision_task": 3,
        "write_audit_log": 5,
        "run_feedback_diagnosis": 2,
        "write_semantic_cache": 0,      # No retry for cache writes
        "record_knowledge_gap": 3,
        "create_mock_ticket": 3,
        "nightly_cleanup": 1,
    }

    on_startup = startup
    on_shutdown = shutdown
```

---

## FILE 12: backend/app/handlers/chat_handler.py

WebSocket handler stub — receives messages, manages session, queues vision tasks, and delivers responses. The full AI pipeline integration happens in Sessions 12-17; this establishes the infrastructure.

```python
"""
AEGIS WebSocket Chat Handler
Manages WebSocket connections for real-time streaming responses.

Architecture:
- WebSocket stays open after initial response (for vision_complete signals)
- Subscribes to stream:{session_id} and vision_complete:{session_id} channels
- Forwards tokens from generation pipeline to browser
- Proactively sends refined response when vision processing completes
"""
import json
import uuid
import logging
import asyncio
import os
from datetime import datetime
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.websockets import WebSocketState

logger = logging.getLogger(__name__)


async def chat_websocket_handler(websocket: WebSocket, session_id: Optional[str] = None):
    """
    Main WebSocket handler for employee chat.
    Called when employee connects to /ws/chat.
    """
    await websocket.accept()

    from app.infrastructure.redis_client import redis_session
    from app.models.session import SessionState

    # Create or load session
    if not session_id:
        session_id = str(uuid.uuid4())

    # Get user from WebSocket connection state (set by auth middleware)
    # For WebSocket, auth is handled via cookie on the upgrade request
    user_id = getattr(websocket.state, "user_id", "demo_user")

    # Load or create session
    session_data = await redis_session.get_session(session_id)
    if session_data:
        session = SessionState.from_redis_hash(session_data)
    else:
        import hashlib
        session = SessionState(
            user_id_hash=hashlib.sha256(user_id.encode()).hexdigest(),
            created_at=datetime.utcnow().isoformat() + "Z",
        )
        await redis_session.create_session(session_id, user_id)

    # Send session confirmation to client
    await websocket.send_json({
        "type": "session_ready",
        "session_id": session_id,
    })

    # Subscribe to vision_complete channel for proactive push
    pubsub = await redis_session.get_pubsub()
    await pubsub.subscribe(f"vision_complete:{session_id}")

    try:
        while websocket.client_state == WebSocketState.CONNECTED:
            # Wait for either a client message or a vision_complete signal
            try:
                # Non-blocking check for incoming client message (timeout 1s)
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=1.0
                )
                await _handle_client_message(websocket, session_id, session, data)

            except asyncio.TimeoutError:
                # No client message — check for vision_complete signal
                message = await pubsub.get_message(ignore_subscribe_messages=True)
                if message and message["type"] == "message":
                    await _handle_vision_complete(websocket, session_id)

            except WebSocketDisconnect:
                break

    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        await pubsub.unsubscribe(f"vision_complete:{session_id}")
        await pubsub.close()
        logger.info(f"WebSocket closed for session {session_id}")


async def _handle_client_message(
    websocket: WebSocket,
    session_id: str,
    session: SessionState,
    data: dict,
):
    """Handle an incoming chat message from the employee."""
    message_type = data.get("type")

    if message_type == "message":
        query_text = data.get("message", "").strip()
        if not query_text:
            return

        # Check for screenshot attachment (sent as separate message after main query)
        screenshot_path = data.get("screenshot_path")  # Set by upload handler
        if screenshot_path:
            await _queue_vision_task(session_id, screenshot_path)

        # Pipeline stages (implemented progressively in Sessions 12-17)
        # For now: send placeholder response
        await websocket.send_json({
            "type": "token",
            "token": "[Pipeline being implemented in Sessions 12-17] ",
            "session_id": session_id,
        })
        await websocket.send_json({
            "type": "stream_complete",
            "session_id": session_id,
        })
        await websocket.send_json({
            "type": "validation_result",
            "validation_score": 0.90,
            "confidence_badge": "green",
            "attribution_panel": {
                "primary_document_id": "pending",
                "primary_document_name": "Pipeline under construction",
                "verified_by": "system",
                "verified_date": "2024-01-01",
                "secondary_sources": [],
                "confidence_badge": "green",
            },
            "session_id": session_id,
        })

    elif message_type == "feedback":
        await _handle_feedback(session_id, data)

    elif message_type == "ping":
        await websocket.send_json({"type": "pong"})


async def _handle_vision_complete(websocket: WebSocket, session_id: str):
    """Handle vision_complete signal — send proactive refined response."""
    from app.infrastructure.redis_client import redis_session

    diagnostic_obj = await redis_session.get_diagnostic_object(session_id)
    if not diagnostic_obj:
        return

    # Send proactive vision-enhanced message to employee
    await websocket.send_json({
        "type": "vision_refined_answer",
        "message": "Screenshot processed — here is more specific information based on your screen:",
        "diagnostic_summary": _format_diagnostic_summary(diagnostic_obj),
        "session_id": session_id,
    })
    logger.info(f"Proactive vision push sent for session {session_id}")


def _format_diagnostic_summary(diagnostic_obj: dict) -> str:
    """Format DiagnosticObject as human-readable summary."""
    parts = []
    if diagnostic_obj.get("error_code"):
        parts.append(f"Error: {diagnostic_obj['error_code']}")
    if diagnostic_obj.get("error_message_text"):
        parts.append(f"Message: {diagnostic_obj['error_message_text'][:100]}")
    if diagnostic_obj.get("material_number"):
        parts.append(f"Material: {diagnostic_obj['material_number']}")
    if diagnostic_obj.get("plant_code"):
        parts.append(f"Plant: {diagnostic_obj['plant_code']}")
    return " | ".join(parts) if parts else "Screenshot analysed"


async def _queue_vision_task(session_id: str, file_path: str):
    """Queue vision processing ARQ task."""
    from app.infrastructure.redis_client import redis_queue
    import json
    task_id = str(uuid.uuid4())
    task_payload = json.dumps({
        "task_type": "vision",
        "task_id": task_id,
        "session_id": session_id,
        "file_path": file_path,
        "created_at": datetime.utcnow().isoformat(),
    })
    await redis_queue.redis.rpush("arq:queue:vision", task_payload)


async def _handle_feedback(session_id: str, data: dict):
    """Queue feedback diagnosis task."""
    from app.infrastructure.redis_client import redis_queue
    import json
    task_payload = json.dumps({
        "task_type": "feedback_diagnosis",
        "task_id": str(uuid.uuid4()),
        "feedback_event_id": data.get("feedback_event_id", ""),
        "session_id": session_id,
        "query_text": data.get("query_text", ""),
        "answer_text": data.get("answer_text", ""),
        "created_at": datetime.utcnow().isoformat(),
    })
    await redis_queue.redis.rpush("arq:queue:feedback_diagnosis", task_payload)
```

---

## UPDATE: Add WebSocket Route to main.py

Add this to `backend/app/main.py`:

```python
# Add this import
from fastapi import WebSocket

# Add this route (after existing routes)
@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, session_id: str = None):
    from app.handlers.chat_handler import chat_websocket_handler
    await chat_websocket_handler(websocket, session_id)

# Add file upload endpoint for screenshots
@app.post("/api/upload/screenshot")
async def upload_screenshot(request: Request):
    """Save screenshot to temp dir and return file path."""
    import os
    from app.config import TEMP_UPLOAD_DIR
    form = await request.form()
    file = form.get("screenshot")
    if not file:
        return {"error": "No screenshot provided"}
    session_id = getattr(request.state, "session_id", "unknown")
    import time
    timestamp = int(time.time() * 1000)
    ext = ".jpg"
    filename = f"{session_id}_{timestamp}{ext}"
    filepath = os.path.join(TEMP_UPLOAD_DIR, filename)
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    return {"file_path": filepath, "session_id": session_id}
```

---

## VERIFICATION STEPS

### Step 1: Verify ARQ worker starts correctly
```bash
cd backend && source venv/bin/activate
python -m arq app.workers.arq_worker.WorkerSettings &
sleep 3
# Should see: "ARQ worker ready" in logs
```

### Step 2: Test circuit breakers
```bash
python3 -c "
import asyncio
from app.infrastructure.circuit_breaker import circuit_registry

cb = circuit_registry.get('qdrant')
print('Initial state:', cb.state.value)
for _ in range(6):  # 6 failures > 50% of 10-call window
    cb.record_failure()
print('After 6 failures:', cb.state.value)  # Should be OPEN
cb.record_success()  # Can't close from OPEN
print('After success attempt:', cb.state.value)  # Still OPEN
print('All stats:', circuit_registry.get_all_stats()['qdrant'])
"
```
Expected: State transitions correctly: CLOSED → OPEN after 6 failures.

### Step 3: Test session state serialization
```bash
python3 -c "
from app.models.session import SessionState, EntityObject, ConversationTurn
state = SessionState(user_id_hash='abc123', created_at='2024-01-01T00:00:00Z')
state.last_entities = [EntityObject(type='error_code', value='VL150')]
state.active_retrieval_mode = 'A'
label = state.generate_intent_label('ERROR_RESOLUTION', state.last_entities[0])
print('Intent label:', label)
redis_hash = state.to_redis_hash()
restored = SessionState.from_redis_hash(redis_hash)
print('Round-trip OK:', restored.last_entities[0].value == 'VL150')
print('Intent label generated:', label == 'ERROR_RESOLUTION:VL150')
"
```
Expected: Both assertions True, intent label is `ERROR_RESOLUTION:VL150`.

### Step 4: Test WebSocket connection
```bash
# Start FastAPI first
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
sleep 3

# Test WebSocket (requires websockets package)
python3 -c "
import asyncio, websockets, json

async def test():
    async with websockets.connect('ws://localhost:8000/ws/chat') as ws:
        msg = await ws.recv()
        data = json.loads(msg)
        print('Received:', data)
        assert data['type'] == 'session_ready'
        print('WebSocket connection: PASSED')

asyncio.run(test())
"
```

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-11: Zone B Orchestration - ARQ, session state, circuit breakers verified"
```

---

*Document version: 1.0 | AEGIS Specification Set*
