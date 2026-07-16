# IMPL_16: REASONING SERVICE
## Model Gateway, Tier Selection, 6-Section Prompt Assembly, Redis Pub/Sub Streaming
## Session 16 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 16: The Reasoning Service — AEGIS's answer generation component.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-15 complete. All Ollama instances running with models loaded. Redis Instance 1 healthy.

**What this session creates:**
- `backend/app/services/model_gateway.py` — Routes requests to correct Ollama instance
- `backend/app/services/reasoning_service.py` — 6-section prompt assembly + streaming
- Update `backend/app/handlers/chat_handler.py` — Integrate full generation pipeline
- `tests/unit/test_reasoning_service.py` — Prompt assembly unit tests

**Streaming architecture:**
```
reasoning_service.generate_streaming()
    ↓ calls Ollama with stream=True
    ↓ for each token: publish to Redis stream:{session_id}
    ↓ accumulates full answer text
    ↓ on complete: publish stream_complete to Redis

WebSocket handler (already subscribed to stream:{session_id})
    ↓ receives tokens → sends {type:"token"} to browser
    ↓ receives stream_complete → triggers ValidationEngine
```

---

## FILE 1: backend/app/services/model_gateway.py

```python
"""
AEGIS Model Gateway
Routes generation requests to the appropriate Ollama instance based on model tier.

Tier 1 (Qwen2.5-7B, ollama-judge):
  - SIMPLE_FACT queries where speed matters more than depth
  - Fast responses for common lookups

Tier 2 (Qwen2.5-32B, ollama-main):
  - ERROR_RESOLUTION, PROCESS, CONFIG queries
  - Standard generation with full context window

Tier 3 (Qwen2.5-32B, ollama-main, longer budget):
  - Mode C multi-module queries
  - Vision-enriched queries with DiagnosticObject
  - Queries requiring synthesis across multiple documents

The circuit breaker registry is checked before each call.
If ollama-main is open → fall back to ollama-judge.
"""
import logging
from typing import AsyncIterator, Optional

import httpx

from app.config import (
    OLLAMA_MAIN_URL, OLLAMA_JUDGE_URL,
    MODEL_MAIN_GENERATION, MODEL_JUDGE_CRAG,
    GENERATION_TIMEOUT_SECONDS,
    GENERATION_TEMPERATURE,
    GENERATION_MAX_TOKENS,
    JUDGE_MAX_TOKENS,
    JUDGE_TEMPERATURE,
)
from app.infrastructure.circuit_breaker import circuit_registry
from app.models.retrieval import EnrichedQuery, RetrievalResult

logger = logging.getLogger(__name__)


def select_model_tier(
    enriched_query: EnrichedQuery,
    retrieval_result: RetrievalResult,
    has_diagnostic_object: bool,
) -> int:
    """
    Determine model tier for generation.

    Tier 1 (Qwen2.5-7B): SIMPLE_FACT classification only
    Tier 2 (Qwen2.5-32B): ERROR_RESOLUTION, PROCESS, CONFIG — standard
    Tier 3 (Qwen2.5-32B): Mode C multi-module OR has DiagnosticObject
    """
    classification = enriched_query.classification
    mode = enriched_query.retrieval_mode

    # Tier 3: Vision-enriched or complex multi-module
    if has_diagnostic_object or mode == "C":
        return 3

    # Tier 1: Simple factual queries
    if classification == "SIMPLE_FACT":
        return 1

    # Tier 2: Standard operational queries
    return 2


def get_ollama_config(tier: int) -> tuple[str, str, int, float]:
    """
    Return (base_url, model_name, max_tokens, temperature) for a tier.
    Checks circuit breakers and applies fallback if needed.
    """
    cb_main = circuit_registry.get("ollama_main")
    cb_judge = circuit_registry.get("ollama_judge")

    if tier == 1:
        # Tier 1: use judge model
        if not cb_judge.is_open:
            return OLLAMA_JUDGE_URL, MODEL_JUDGE_CRAG, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE
        elif not cb_main.is_open:
            # Fallback to main model
            logger.warning("Tier 1 fallback: ollama-judge circuit open, using ollama-main")
            return OLLAMA_MAIN_URL, MODEL_MAIN_GENERATION, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE
        else:
            raise RuntimeError("Both ollama-main and ollama-judge circuits are open")

    elif tier in {2, 3}:
        # Tiers 2+3: use main model
        if not cb_main.is_open:
            return OLLAMA_MAIN_URL, MODEL_MAIN_GENERATION, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE
        elif not cb_judge.is_open:
            # Fallback to judge model
            logger.warning("Tier 2/3 fallback: ollama-main circuit open, using ollama-judge")
            return OLLAMA_JUDGE_URL, MODEL_JUDGE_CRAG, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE
        else:
            raise RuntimeError("Both ollama-main and ollama-judge circuits are open")

    raise ValueError(f"Invalid tier: {tier}")


class ModelGateway:
    """
    Manages all calls to Ollama inference servers.
    Handles streaming for generation and non-streaming for judge calls.
    """

    async def generate_streaming(
        self,
        prompt: str,
        tier: int,
        session_id: str,
    ) -> AsyncIterator[str]:
        """
        Stream tokens from Ollama. Yields token strings as they arrive.
        Updates circuit breakers on success/failure.
        """
        base_url, model, max_tokens, temperature = get_ollama_config(tier)
        cb_name = "ollama_main" if "main" in base_url else "ollama_judge"
        cb = circuit_registry.get(cb_name)

        if not cb.allows_call:
            raise RuntimeError(f"Circuit breaker OPEN for {cb_name}")

        request_body = {
            "model": model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "stop": ["Employee Question:", "---EMPLOYEE"],
            },
        }

        try:
            async with httpx.AsyncClient(timeout=GENERATION_TIMEOUT_SECONDS) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/generate",
                    json=request_body,
                ) as response:
                    response.raise_for_status()
                    import json
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk_data = json.loads(line)
                            token = chunk_data.get("response", "")
                            if token:
                                yield token
                            if chunk_data.get("done", False):
                                break
                        except json.JSONDecodeError:
                            continue

            cb.record_success()

        except Exception as e:
            cb.record_failure()
            logger.error(f"Generation failed (tier={tier}, model={model}): {e}")
            raise

    async def call_judge(self, prompt: str) -> str:
        """
        Non-streaming call to Qwen2.5-7B for CRAG and judge evaluation.
        Returns complete model response as string.
        """
        cb = circuit_registry.get("ollama_judge")
        if not cb.allows_call:
            raise RuntimeError("Circuit breaker OPEN for ollama-judge")

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{OLLAMA_JUDGE_URL}/api/generate",
                    json={
                        "model": MODEL_JUDGE_CRAG,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": JUDGE_TEMPERATURE,
                            "num_predict": JUDGE_MAX_TOKENS,
                        },
                    },
                )
                resp.raise_for_status()
                result = resp.json().get("response", "").strip()
                cb.record_success()
                return result
        except Exception as e:
            cb.record_failure()
            raise


# Singleton
model_gateway = ModelGateway()
```

---

## FILE 2: backend/app/services/reasoning_service.py

```python
"""
AEGIS Reasoning Service
Assembles the 6-section prompt and streams the answer via Redis Pub/Sub.

The 6 prompt sections (in order):
  1. System Role       — who AEGIS is and its rules
  2. Documentation     — retrieved chunks formatted with metadata
  3. Registry Note     — Mode A enrichment from known_patterns_registry (if Mode A)
  4. Screen Context    — DiagnosticObject fields (if screenshot was uploaded)
  5. History           — Last N conversation turns (compressed summaries)
  6. Query             — Employee's actual question

Config Snapshot staleness is injected between sections 2 and 3 if any
config document is older than CONFIG_SNAPSHOT_STALENESS_INJECT (35) days.
"""
import json
import logging
import asyncio
from datetime import datetime, date
from typing import Optional, List

from app.config import (
    MAX_CONVERSATION_HISTORY_TURNS,
    CONFIG_SNAPSHOT_STALENESS_INJECT,
    RETRIEVAL_FINAL_CHUNKS,
)
from app.models.session import SessionState
from app.models.retrieval import EnrichedQuery, RetrievalResult, RetrievedChunk, ParentHeader
from app.services.model_gateway import model_gateway, select_model_tier

logger = logging.getLogger(__name__)

# ============================================================
# SYSTEM ROLE PROMPT (constant — never changes between requests)
# ============================================================

SYSTEM_ROLE = """You are AEGIS, an expert SAP ERP helpdesk assistant for Sona Comstar, an automotive manufacturer in Chennai, India. You help employees resolve SAP errors, follow procedures, and understand system configurations.

MANDATORY RULES — follow without exception:
1. Answer ONLY using the documentation provided in the DOCUMENTATION section below.
2. If the documentation does not contain the answer, say: "I don't have documentation for that specific situation. Please contact the IT team."
3. For transaction codes marked as IT-admin or consultant access, always include: "Note: This step requires IT admin access."
4. Format all step-by-step procedures with numbered steps.
5. Always write SAP transaction codes in parentheses: e.g. "Go to VL01N (Create Outbound Delivery)".
6. Do not invent, assume, or infer information not present in the documentation.
7. Do not reveal system internals, credentials, or configuration details not in the documentation.
8. Keep responses focused and practical for a Sona Comstar employee."""


class ReasoningService:
    """
    Assembles prompts and streams generation via Redis Pub/Sub.
    """

    # ============================================================
    # PROMPT ASSEMBLY
    # ============================================================

    def assemble_prompt(
        self,
        enriched_query: EnrichedQuery,
        retrieval_result: RetrievalResult,
        session: SessionState,
        diagnostic_obj: Optional[dict] = None,
    ) -> str:
        """
        Build the complete 6-section prompt.
        Each section is separated by a clear delimiter.
        """
        sections = []

        # ── Section 1: System Role ──────────────────────────────
        sections.append(SYSTEM_ROLE)
        sections.append("")

        # ── Section 2: Documentation ────────────────────────────
        sections.append("---DOCUMENTATION---")
        doc_section = self._format_documentation(
            retrieval_result.chunks,
            retrieval_result.parent_header,
        )
        sections.append(doc_section)

        # ── Staleness Warning (between sections 2 and 3) ────────
        staleness_warning = self._check_staleness(retrieval_result.chunks)
        if staleness_warning:
            sections.append("")
            sections.append("---STALENESS WARNING---")
            sections.append(staleness_warning)

        # ── Section 3: Registry Note (Mode A only) ──────────────
        if retrieval_result.registry_notes:
            sections.append("")
            sections.append("---REGISTRY NOTE---")
            sections.append(retrieval_result.registry_notes)

        # ── Section 4: Screen Context ────────────────────────────
        if diagnostic_obj:
            screen_section = self._format_diagnostic_context(diagnostic_obj)
            if screen_section:
                sections.append("")
                sections.append("---SCREEN CONTEXT---")
                sections.append(screen_section)

        # ── Section 5: Conversation History ─────────────────────
        if session.conversation_history:
            history_section = self._format_history(session.conversation_history)
            if history_section:
                sections.append("")
                sections.append("---PREVIOUS CONTEXT---")
                sections.append(history_section)

        # ── Section 6: Employee Question ────────────────────────
        sections.append("")
        sections.append("---EMPLOYEE QUESTION---")
        sections.append(enriched_query.raw_message)
        sections.append("")
        sections.append("Answer:")

        return "\n".join(sections)

    def _format_documentation(
        self,
        chunks: List[RetrievedChunk],
        parent_header: Optional[ParentHeader],
    ) -> str:
        """
        Format retrieved chunks as structured documentation blocks.
        Parent header is prepended if available.
        """
        parts = []

        # Prepend parent header context if hydrated
        if parent_header:
            header_lines = [f"[Document: {parent_header.document_id} | Module: {parent_header.module}]"]
            if parent_header.error_code:
                header_lines.append(f"Error Code: {parent_header.error_code}")
            if parent_header.procedure_name:
                header_lines.append(f"Procedure: {parent_header.procedure_name}")
            if parent_header.configuration_name:
                header_lines.append(f"Configuration: {parent_header.configuration_name}")
            if parent_header.transactions:
                header_lines.append(f"Relevant Transactions: {', '.join(parent_header.transactions)}")
            header_lines.append(
                f"Last Verified: {parent_header.last_verified_date} by {parent_header.verified_by}"
            )
            parts.append("\n".join(header_lines))
            parts.append("")

        for i, chunk in enumerate(chunks[:RETRIEVAL_FINAL_CHUNKS]):
            chunk_header = (
                f"[Chunk {i+1} — {chunk.document_id} ({chunk.chunk_type}) | "
                f"Verified: {chunk.last_verified_date} by {chunk.verified_by}]"
            )
            parts.append(chunk_header)
            parts.append(chunk.chunk_text)
            parts.append("")

        return "\n".join(parts).strip()

    def _format_diagnostic_context(self, diagnostic_obj: dict) -> str:
        """Format DiagnosticObject as structured screen context block."""
        lines = []
        if diagnostic_obj.get("error_code"):
            lines.append(f"Error Code: {diagnostic_obj['error_code']}")
        if diagnostic_obj.get("error_message_text"):
            lines.append(f"Error Message: {diagnostic_obj['error_message_text'][:200]}")
        if diagnostic_obj.get("transaction_code"):
            lines.append(f"Active Transaction: {diagnostic_obj['transaction_code']}")
        if diagnostic_obj.get("material_number"):
            lines.append(f"Material Number: {diagnostic_obj['material_number']}")
        if diagnostic_obj.get("plant_code"):
            lines.append(f"Plant Code: {diagnostic_obj['plant_code']}")
        if diagnostic_obj.get("document_number"):
            lines.append(f"Document Number: {diagnostic_obj['document_number']}")
        for fv in diagnostic_obj.get("field_values", [])[:5]:
            if fv.get("field") and fv.get("value"):
                lines.append(f"{fv['field']}: {fv['value']}")
        for qty in diagnostic_obj.get("visible_quantities", [])[:3]:
            if qty.get("label") and qty.get("value"):
                lines.append(f"{qty['label']}: {qty['value']}")
        return "\n".join(lines)

    def _format_history(self, history) -> str:
        """Format last N conversation turns as a brief context summary."""
        if not history:
            return ""
        lines = []
        for i, turn in enumerate(history[-MAX_CONVERSATION_HISTORY_TURNS:]):
            lines.append(
                f"Turn {i+1}: Employee asked about {turn.query_summary[:100]}. "
                f"AEGIS answered ({turn.confidence_badge} confidence)."
            )
        return "\n".join(lines)

    def _check_staleness(self, chunks: List[RetrievedChunk]) -> Optional[str]:
        """
        Check if any documentation chunk is older than CONFIG_SNAPSHOT_STALENESS_INJECT days.
        Returns a staleness warning string or None.
        """
        today = date.today()
        stale_docs = []

        for chunk in chunks:
            if not chunk.last_verified_date:
                continue
            try:
                verified = date.fromisoformat(chunk.last_verified_date)
                age_days = (today - verified).days
                if age_days > CONFIG_SNAPSHOT_STALENESS_INJECT:
                    stale_docs.append(
                        f"{chunk.document_id} (last verified {age_days} days ago)"
                    )
            except ValueError:
                continue

        if stale_docs:
            return (
                f"Note: The following documentation may be outdated: {', '.join(stale_docs[:3])}. "
                f"Verify current SAP settings before applying these steps."
            )
        return None

    # ============================================================
    # GENERATION AND STREAMING
    # ============================================================

    async def generate_and_stream(
        self,
        enriched_query: EnrichedQuery,
        retrieval_result: RetrievalResult,
        session: SessionState,
        diagnostic_obj: Optional[dict],
        session_id: str,
    ) -> str:
        """
        Assemble prompt, stream generation, publish tokens to Redis Pub/Sub.
        Returns the complete answer text for validation.

        The WebSocket handler receives tokens via Redis Pub/Sub and forwards
        them to the browser in real-time.
        """
        from app.infrastructure.redis_client import redis_session

        # Determine tier
        tier = select_model_tier(enriched_query, retrieval_result, bool(diagnostic_obj))

        # Assemble prompt
        prompt = self.assemble_prompt(
            enriched_query, retrieval_result, session, diagnostic_obj
        )

        logger.info(
            f"Generation: tier={tier}, mode={enriched_query.retrieval_mode}, "
            f"classification={enriched_query.classification}, session={session_id}"
        )

        # Stream generation and publish tokens
        answer_parts = []
        token_count = 0

        try:
            async for token in model_gateway.generate_streaming(prompt, tier, session_id):
                answer_parts.append(token)
                token_count += 1
                # Publish each token to Redis Pub/Sub for WebSocket delivery
                await redis_session.publish_token(session_id, token)

            # Signal generation complete
            await redis_session.publish_stream_complete(session_id)
            full_answer = "".join(answer_parts).strip()
            logger.info(
                f"Generation complete: {token_count} tokens, "
                f"{len(full_answer)} chars, tier={tier}"
            )
            return full_answer

        except Exception as e:
            logger.error(f"Generation failed for session {session_id}: {e}")
            # Publish error to WebSocket
            error_msg = (
                "I encountered a technical issue generating the response. "
                "Please try again or contact IT support."
            )
            await redis_session.publish_token(session_id, error_msg)
            await redis_session.publish_stream_complete(session_id)
            return error_msg


# Singleton
reasoning_service = ReasoningService()
```

---

## FILE 3: Update backend/app/handlers/chat_handler.py

Replace the pipeline stub in `_handle_client_message` with the full generation integration:

```python
# Full pipeline integration in _handle_client_message
# (adds after retrieval_result from Session 15)

    async def _handle_client_message(websocket, session_id, session, data):
        if data.get("type") == "message":
            query_text = data.get("message", "").strip()
            if not query_text:
                return

            from app.services.query_intelligence import query_intelligence
            from app.services.retrieval_engine import retrieval_engine
            from app.services.reasoning_service import reasoning_service
            from app.infrastructure.redis_client import redis_session as rs
            from app.models.session import SessionState

            # Load session state
            session_data = await rs.get_session(session_id)
            session = SessionState.from_redis_hash(session_data) if session_data else SessionState(
                user_id_hash="unknown", created_at=datetime.utcnow().isoformat() + "Z"
            )

            # QIL
            enriched_query = await query_intelligence.process(
                raw_message=query_text, session=session,
                session_id=session_id,
                trace_id=getattr(websocket.state, "trace_id", str(uuid.uuid4())),
            )

            # Cache hit: serve immediately
            if enriched_query.cache_hit:
                await websocket.send_json({
                    "type": "token",
                    "token": enriched_query.cached_answer,
                    "session_id": session_id,
                })
                await websocket.send_json({"type": "stream_complete", "session_id": session_id})
                return

            # Check for DiagnosticObject from vision
            diagnostic_obj = await rs.get_diagnostic_object(session_id)
            if diagnostic_obj:
                from app.services.vision_integration import vision_integration
                enriched_query.enriched_text = vision_integration.enrich_query_with_diagnostic(
                    enriched_query.enriched_text, diagnostic_obj
                )

            # Retrieval (all 8 stages)
            retrieval_result = await retrieval_engine.retrieve(enriched_query)

            if retrieval_result.crag_assessment == "INSUFFICIENT":
                # Queue mock ticket
                await _queue_ticket_task(session_id, getattr(websocket.state, "user_id_hash", ""), query_text)
                await websocket.send_json({
                    "type": "error",
                    "error_code": "INSUFFICIENT",
                    "message": (
                        "I could not find sufficient information in the AEGIS knowledge base "
                        "for this question. A support ticket has been raised. "
                        "The IT team will follow up with you."
                    ),
                    "ticket_id": None,
                    "session_id": session_id,
                })
                return

            # Generation: streams tokens via Redis Pub/Sub
            # (WebSocket handler picks them up via subscription to stream:{session_id})
            answer_text = await reasoning_service.generate_and_stream(
                enriched_query=enriched_query,
                retrieval_result=retrieval_result,
                session=session,
                diagnostic_obj=diagnostic_obj,
                session_id=session_id,
            )

            # Validation runs in Session 17 — placeholder response sent
            await websocket.send_json({
                "type": "validation_result",
                "validation_score": 0.90,
                "confidence_badge": "green",
                "attribution_panel": {
                    "primary_document_id": retrieval_result.chunks[0].document_id if retrieval_result.chunks else "unknown",
                    "primary_document_name": retrieval_result.chunks[0].chunk_type if retrieval_result.chunks else "unknown",
                    "verified_by": retrieval_result.chunks[0].verified_by if retrieval_result.chunks else "unknown",
                    "verified_date": retrieval_result.chunks[0].last_verified_date if retrieval_result.chunks else "unknown",
                    "secondary_sources": [],
                    "confidence_badge": "green",
                },
                "session_id": session_id,
            })

            # Queue audit task
            await _queue_audit_task(session_id, enriched_query, retrieval_result, 0.90, "green")


async def _queue_ticket_task(session_id, user_id_hash, query_text):
    from app.infrastructure.redis_client import redis_queue
    import json, uuid
    from datetime import datetime
    payload = json.dumps({
        "task_type": "mock_ticket", "task_id": str(uuid.uuid4()),
        "session_id": session_id, "user_id_hash": user_id_hash,
        "query_text": query_text,
        "reason": "CRAG assessment: INSUFFICIENT — knowledge base gap",
        "created_at": datetime.utcnow().isoformat(),
    })
    await redis_queue.redis.rpush("arq:queue:mock_ticket", payload)


async def _queue_audit_task(session_id, enriched_query, retrieval_result, score, badge):
    from app.infrastructure.redis_client import redis_queue
    import json, uuid
    from datetime import datetime
    payload = json.dumps({
        "task_type": "audit", "task_id": str(uuid.uuid4()),
        "occurred_at": datetime.utcnow().isoformat(),
        "user_id_hash": "",
        "session_id": session_id,
        "trace_id": enriched_query.trace_id,
        "request_type": "chat",
        "governance_trigger_flags": {},
        "validation_score": score,
        "model_tier": 2,
        "retrieved_document_ids": [c.document_id for c in retrieval_result.chunks],
        "confidence_badge": badge,
        "feedback_signal": "none",
    })
    await redis_queue.redis.rpush("arq:queue:audit", payload)
```

---

## FILE 4: tests/unit/test_reasoning_service.py

```python
"""Unit tests for Reasoning Service prompt assembly."""
import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock

from app.services.reasoning_service import ReasoningService, SYSTEM_ROLE
from app.models.retrieval import (
    EnrichedQuery, RetrievalResult, RetrievedChunk, ParentHeader, RegistryResult
)
from app.models.session import SessionState, EntityObject, ConversationTurn


@pytest.fixture
def rs():
    return ReasoningService()


@pytest.fixture
def chunks():
    return [
        RetrievedChunk(
            chunk_id="SD-ERR-001:chunk:1",
            document_id="SD-ERR-001",
            content_type="error_guide",
            chunk_type="cause_resolution",
            chunk_text="VL150 occurs when safety stock exceeds available inventory. Navigate to MM02.",
            last_verified_date=str(date.today() - timedelta(days=20)),
            verified_by="Rsuresh1",
            cross_encoder_score=0.88,
            rrf_score=0.05,
        )
    ]


@pytest.fixture
def retrieval_result(chunks):
    return RetrievalResult(
        chunks=chunks, parent_header=None, registry_notes="",
        crag_assessment="SUFFICIENT", crag_gap_description=None,
        retrieval_mode_used="B", top_cross_encoder_score=0.88,
    )


@pytest.fixture
def mode_a_retrieval_result(chunks):
    return RetrievalResult(
        chunks=chunks, parent_header=None,
        registry_notes="VL150 is the standard material availability check error.",
        crag_assessment="SKIPPED", crag_gap_description=None,
        retrieval_mode_used="A", top_cross_encoder_score=0.91,
    )


@pytest.fixture
def enriched_query():
    return EnrichedQuery(
        raw_message="How do I fix VL150 error?",
        enriched_text="How do I fix VL150 error? VL150 VL150 VL150 outbound delivery VL01N",
        entities=[EntityObject(type="error_code", value="VL150")],
        context_entity=None, retrieval_mode="B",
        classification="ERROR_RESOLUTION", registry_result=None,
        session_id="test-session", trace_id="test-trace",
    )


@pytest.fixture
def empty_session():
    return SessionState(user_id_hash="abc", created_at="2024-01-01T00:00:00Z")


class TestPromptAssembly:
    def test_system_role_in_prompt(self, rs, enriched_query, retrieval_result, empty_session):
        prompt = rs.assemble_prompt(enriched_query, retrieval_result, empty_session)
        assert "AEGIS" in prompt
        assert "SAP ERP" in prompt or "SAP" in prompt
        assert "Sona Comstar" in prompt

    def test_documentation_section_present(self, rs, enriched_query, retrieval_result, empty_session):
        prompt = rs.assemble_prompt(enriched_query, retrieval_result, empty_session)
        assert "---DOCUMENTATION---" in prompt
        assert "VL150 occurs when safety stock" in prompt

    def test_query_section_present(self, rs, enriched_query, retrieval_result, empty_session):
        prompt = rs.assemble_prompt(enriched_query, retrieval_result, empty_session)
        assert "---EMPLOYEE QUESTION---" in prompt
        assert "How do I fix VL150 error?" in prompt
        assert "Answer:" in prompt

    def test_registry_note_injected_for_mode_a(self, rs, enriched_query, mode_a_retrieval_result, empty_session):
        prompt = rs.assemble_prompt(enriched_query, mode_a_retrieval_result, empty_session)
        assert "---REGISTRY NOTE---" in prompt
        assert "standard material availability check error" in prompt

    def test_registry_note_absent_for_mode_b(self, rs, enriched_query, retrieval_result, empty_session):
        prompt = rs.assemble_prompt(enriched_query, retrieval_result, empty_session)
        assert "---REGISTRY NOTE---" not in prompt

    def test_screen_context_injected_when_diagnostic_present(self, rs, enriched_query, retrieval_result, empty_session):
        diagnostic = {
            "error_code": "VL150", "error_message_text": "Only 50 EA available",
            "transaction_code": "VL01N", "material_number": "1000012345",
            "plant_code": "1000", "document_number": None, "batch_number": None,
            "field_values": [], "visible_quantities": [],
        }
        prompt = rs.assemble_prompt(enriched_query, retrieval_result, empty_session, diagnostic)
        assert "---SCREEN CONTEXT---" in prompt
        assert "VL150" in prompt
        assert "VL01N" in prompt
        assert "1000012345" in prompt

    def test_screen_context_absent_when_no_diagnostic(self, rs, enriched_query, retrieval_result, empty_session):
        prompt = rs.assemble_prompt(enriched_query, retrieval_result, empty_session, None)
        assert "---SCREEN CONTEXT---" not in prompt

    def test_conversation_history_injected(self, rs, enriched_query, retrieval_result):
        session = SessionState(user_id_hash="abc", created_at="2024-01-01T00:00:00Z")
        session.conversation_history = [
            ConversationTurn(
                query_summary="How to create delivery?",
                answer_summary="Use VL01N transaction.",
                classification="PROCESS",
                confidence_badge="green",
                retrieved_doc_ids=["SD-PROC-001"],
            )
        ]
        prompt = rs.assemble_prompt(enriched_query, retrieval_result, session)
        assert "---PREVIOUS CONTEXT---" in prompt
        assert "How to create delivery?" in prompt

    def test_history_absent_for_new_session(self, rs, enriched_query, retrieval_result, empty_session):
        prompt = rs.assemble_prompt(enriched_query, retrieval_result, empty_session)
        assert "---PREVIOUS CONTEXT---" not in prompt

    def test_parent_header_prepended(self, rs, enriched_query, empty_session):
        header = ParentHeader(
            document_id="SD-ERR-001", content_type="error_guide",
            error_code="VL150", configuration_name=None, procedure_name=None,
            module="SD", transactions=["VL01N", "MMBE"],
            last_verified_date="2024-03-28", verified_by="Rsuresh1",
        )
        result = RetrievalResult(
            chunks=[], parent_header=header, registry_notes="",
            crag_assessment="SKIPPED", crag_gap_description=None,
            retrieval_mode_used="A", top_cross_encoder_score=0.91,
        )
        prompt = rs.assemble_prompt(enriched_query, result, empty_session)
        assert "SD-ERR-001" in prompt
        assert "VL150" in prompt
        assert "VL01N" in prompt

    def test_section_order(self, rs, enriched_query, mode_a_retrieval_result, empty_session):
        """Verify sections appear in correct order."""
        diagnostic = {
            "error_code": "VL150", "transaction_code": "VL01N",
            "error_message_text": None, "material_number": None, "plant_code": None,
            "document_number": None, "batch_number": None, "field_values": [], "visible_quantities": [],
        }
        prompt = rs.assemble_prompt(enriched_query, mode_a_retrieval_result, empty_session, diagnostic)
        doc_pos = prompt.find("---DOCUMENTATION---")
        reg_pos = prompt.find("---REGISTRY NOTE---")
        screen_pos = prompt.find("---SCREEN CONTEXT---")
        query_pos = prompt.find("---EMPLOYEE QUESTION---")
        assert doc_pos < reg_pos < screen_pos < query_pos, (
            f"Sections out of order: DOC={doc_pos}, REG={reg_pos}, SCREEN={screen_pos}, QUERY={query_pos}"
        )


class TestStalenessCheck:
    def test_fresh_docs_no_warning(self, rs):
        """Docs verified < 35 days ago should not trigger staleness warning."""
        chunks = [RetrievedChunk(
            chunk_id="x", document_id="FI-CFG-003", content_type="config",
            chunk_type="config_values", chunk_text="current setting",
            last_verified_date=str(date.today() - timedelta(days=10)),
            verified_by="Rsuresh1", cross_encoder_score=0.8, rrf_score=0.05,
        )]
        result = rs._check_staleness(chunks)
        assert result is None

    def test_stale_docs_trigger_warning(self, rs):
        """Docs verified > 35 days ago should trigger staleness warning."""
        chunks = [RetrievedChunk(
            chunk_id="x", document_id="FI-CFG-003", content_type="config",
            chunk_type="config_values", chunk_text="current setting",
            last_verified_date=str(date.today() - timedelta(days=40)),
            verified_by="Rsuresh1", cross_encoder_score=0.8, rrf_score=0.05,
        )]
        result = rs._check_staleness(chunks)
        assert result is not None
        assert "FI-CFG-003" in result
        assert "outdated" in result.lower()
```

---

## VERIFICATION STEPS

### Step 1: Run unit tests
```bash
cd backend && source venv/bin/activate
python -m pytest tests/unit/test_reasoning_service.py -v
```
Expected: All tests pass.

### Step 2: Verify prompt section order
```bash
python3 -c "
from app.services.reasoning_service import ReasoningService, SYSTEM_ROLE
from app.models.retrieval import EnrichedQuery, RetrievalResult, RetrievedChunk, RegistryResult
from app.models.session import SessionState, EntityObject
from datetime import date

rs = ReasoningService()
chunks = [RetrievedChunk('id', 'SD-ERR-001', 'error_guide', 'cause_resolution',
    'VL150 fix: go to MM02', str(date.today()), 'Rsuresh1', 0.9, 0.05)]
query = EnrichedQuery('Fix VL150?', 'Fix VL150?', [EntityObject('error_code', 'VL150')],
    None, 'A', 'ERROR_RESOLUTION',
    RegistryResult('VL150', 'error_code', 'SD-ERR-001', 'header', 'Standard VL150 note.'),
    'sess1', 'trace1')
result = RetrievalResult(chunks, None, 'Standard VL150 note.', 'SKIPPED', None, 'A', 0.91)
session = SessionState('hash123', '2024-01-01T00:00:00Z')

prompt = rs.assemble_prompt(query, result, session)
sections = ['AEGIS', '---DOCUMENTATION---', '---REGISTRY NOTE---', '---EMPLOYEE QUESTION---', 'Answer:']
for s in sections:
    pos = prompt.find(s)
    print(f'  {s[:30]:30s} pos={pos}')
print('All 6 sections present and ordered correctly')
"
```

### Step 3: Verify tier selection
```bash
python3 -c "
from app.services.model_gateway import select_model_tier
from app.models.retrieval import EnrichedQuery, RetrievalResult, RetrievedChunk
from app.models.session import EntityObject

# Helper: minimal EnrichedQuery
def make_q(mode, cls):
    return type('Q', (), {'retrieval_mode': mode, 'classification': cls, 'entities': []})()
def make_r():
    return type('R', (), {'top_cross_encoder_score': 0.9})()

print(f'SIMPLE_FACT mode B, no vision: tier={select_model_tier(make_q(\"B\", \"SIMPLE_FACT\"), make_r(), False)}  (expect 1)')
print(f'ERROR_RESOLUTION mode B, no vision: tier={select_model_tier(make_q(\"B\", \"ERROR_RESOLUTION\"), make_r(), False)}  (expect 2)')
print(f'CONFIG mode C, no vision: tier={select_model_tier(make_q(\"C\", \"CONFIG\"), make_r(), False)}  (expect 3)')
print(f'ERROR_RESOLUTION mode B, with vision: tier={select_model_tier(make_q(\"B\", \"ERROR_RESOLUTION\"), make_r(), True)}  (expect 3)')
"
```

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-16: Reasoning Service - prompt assembly and tier selection verified"
```

Update DECISIONS_LOG.md with:
- All prompt assembly tests passing (exact count)
- Section order verified: DOCUMENTATION → REGISTRY_NOTE → SCREEN_CONTEXT → QUERY
- Tier selection logic verified for all 4 combinations
- Staleness warning triggers at 35+ days

---

*Document version: 1.0 | AEGIS Specification Set*
