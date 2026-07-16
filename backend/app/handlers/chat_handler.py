"""
AEGIS WebSocket Chat Handler
Manages WebSocket connections for real-time streaming responses.

Architecture:
- WebSocket stays open after initial response (for vision_complete signals)
- In-process AsyncGenerator for streaming (no Redis Pub/Sub in demo)
- Forwards tokens from generation pipeline to browser
- Proactively sends refined response when vision processing completes
"""
import json
import uuid
import logging
import asyncio
import os
import time
from datetime import datetime
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from app.models.session import SessionState

logger = logging.getLogger(__name__)


async def chat_websocket_handler(websocket: WebSocket, session_id: Optional[str] = None):
    """
    Main WebSocket handler for employee chat.
    Called when employee connects to /ws/chat.
    """
    await websocket.accept()

    from app.middleware.authentication import ws_authenticate
    payload = await ws_authenticate(websocket)
    if payload is None:
        return  # ws_authenticate already closed the connection

    from app.observability import ACTIVE_SESSIONS
    ACTIVE_SESSIONS.inc()

    from app.infrastructure.redis_client import redis_session

    if not session_id:
        session_id = str(uuid.uuid4())

    user_id = getattr(websocket.state, "user_id", "demo_user") or "demo_user"

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

    await websocket.send_json({
        "type": "session_ready",
        "session_id": session_id,
    })

    try:
        while websocket.client_state == WebSocketState.CONNECTED:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=180.0
                )
                await _handle_client_message(websocket, session_id, session, data)

            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})

            except WebSocketDisconnect:
                break

    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        ACTIVE_SESSIONS.dec()
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

        screenshot_path = data.get("screenshot_path")
        if screenshot_path:
            await _queue_vision_task(session_id, screenshot_path)

        trace_id = str(uuid.uuid4())

        from app.services.query_intelligence import query_intelligence
        from app.services.retrieval_engine import retrieval_engine
        enriched = await query_intelligence.process(
            raw_message=query_text,
            session=session,
            session_id=session_id,
            trace_id=trace_id,
        )

        from app.infrastructure.redis_client import redis_session as _rs
        diag_obj = await _rs.get_diagnostic_object(session_id)
        if diag_obj:
            from app.services.vision_integration import vision_integration
            enriched.enriched_text = vision_integration.enrich_query_with_diagnostic(
                enriched.enriched_text, diag_obj
            )

        from app.observability import (
            REQUEST_COUNTER, RETRIEVAL_MODE, CRAG_ASSESSMENT, CROSS_ENCODER_SCORE,
            ESCALATIONS, KNOWLEDGE_GAPS, GENERATION_TIER, record_pipeline_metrics,
        )

        if enriched.cache_hit and enriched.cached_answer:
            await websocket.send_json({
                "type": "token",
                "token": enriched.cached_answer,
                "session_id": session_id,
            })
            await websocket.send_json({
                "type": "stream_complete",
                "session_id": session_id,
            })
            record_pipeline_metrics(None, None, None, 0.0, cache_hit=True)
            REQUEST_COUNTER.labels(endpoint="/ws/chat", status="success").inc()
            return

        # Stage B: Retrieval Engine (all 8 stages)
        retrieval_result = await retrieval_engine.retrieve(enriched)

        if retrieval_result.crag_assessment == "INSUFFICIENT":
            await _queue_ticket_task(
                session_id,
                getattr(websocket.state, "user_id_hash", ""),
                query_text,
            )
            await websocket.send_json({
                "type": "error",
                "error_code": "INSUFFICIENT",
                "message": (
                    "I could not find sufficient documentation in the AEGIS knowledge base "
                    "to answer your question. A support ticket has been raised for the IT team. "
                    "Ticket reference will appear shortly."
                ),
                "ticket_id": None,
                "session_id": session_id,
            })
            # record_pipeline_metrics is called after validation, which this
            # path never reaches — record the retrieval-stage outcome here
            # directly, or CRAG_ASSESSMENT/ESCALATIONS never fire for the one
            # case they exist to measure.
            RETRIEVAL_MODE.labels(mode=retrieval_result.retrieval_mode_used).inc()
            CRAG_ASSESSMENT.labels(assessment="INSUFFICIENT").inc()
            CROSS_ENCODER_SCORE.observe(retrieval_result.top_cross_encoder_score)
            ESCALATIONS.inc()
            KNOWLEDGE_GAPS.inc()
            REQUEST_COUNTER.labels(endpoint="/ws/chat", status="error").inc()
            return

        # Stage C: Reasoning — streams tokens via Redis Pub/Sub
        from app.services.reasoning_service import reasoning_service
        session_data_current = await _rs.get_session(session_id)
        session_current = (
            SessionState.from_redis_hash(session_data_current)
            if session_data_current
            else session
        )

        generation_started_at = time.monotonic()
        answer_text = await reasoning_service.generate_and_stream(
            enriched_query=enriched,
            retrieval_result=retrieval_result,
            session=session_current,
            diagnostic_obj=diag_obj,
            session_id=session_id,
        )
        generation_seconds = time.monotonic() - generation_started_at

        # Validation (Session 17): Tier 1 governance + Tier 2 NLI + Tier 3 judge,
        # with one targeted regeneration attempt if the score lands below amber.
        from app.services.validation_engine import validation_engine
        validation_result = await validation_engine.validate_with_regeneration(
            answer_text=answer_text,
            enriched_query=enriched,
            retrieval_result=retrieval_result,
            user_role=getattr(websocket.state, "role", "employee"),
        )

        # Queue audit task (fire-and-forget) with the real validation outcome
        await _queue_audit_task(
            session_id, getattr(websocket.state, "user_id_hash", ""), enriched, retrieval_result,
            validation_result.validation_score, validation_result.confidence_badge,
        )

        await websocket.send_json({
            "type": "validation_result",
            "validation_score": validation_result.validation_score,
            "confidence_badge": validation_result.confidence_badge,
            "attribution_panel": validation_result.attribution_panel,
            "session_id": session_id,
        })

        record_pipeline_metrics(
            enriched_query=enriched,
            retrieval_result=retrieval_result,
            validation_result=validation_result,
            generation_seconds=generation_seconds,
            cache_hit=False,
        )
        GENERATION_TIER.labels(tier="2").inc()
        REQUEST_COUNTER.labels(endpoint="/ws/chat", status="success").inc()

        # High-confidence answers get queued for the semantic cache
        if validation_result.confidence_badge == "green":
            from app.infrastructure.redis_client import arq_client
            await arq_client.enqueue_cache_write(cache_data={
                "query_text": enriched.enriched_text,
                "answer_text": validation_result.answer_text,
                "validation_score": validation_result.validation_score,
                "document_ids": [c.document_id for c in retrieval_result.chunks],
                "created_at": datetime.utcnow().isoformat(),
            })

        # Update session state with this turn's outcome
        session_current.add_conversation_turn(
            query=enriched.raw_message,
            answer=validation_result.answer_text[:300],
            classification=enriched.classification,
            confidence_badge=validation_result.confidence_badge,
            doc_ids=[c.document_id for c in retrieval_result.chunks],
        )
        session_current.add_confidence_score(validation_result.validation_score)
        session_current.last_entities = enriched.entities
        session_current.last_document_ids = [c.document_id for c in retrieval_result.chunks]
        session_current.model_tier_last = 2
        if validation_result.confidence_badge == "none":
            session_current.unresolved_count += 1
        else:
            session_current.unresolved_count = 0

        await _rs.update_session(session_id, session_current.to_redis_hash())

    elif message_type == "feedback":
        await _handle_feedback(session_id, data)

    elif message_type == "ping":
        await websocket.send_json({"type": "pong"})


async def _handle_vision_complete(websocket: WebSocket, session_id: str):
    """
    Handle vision_complete signal — generate and send proactive refined answer.
    Called automatically when Qwen2.5-VL-7B finishes processing the screenshot.
    The WebSocket connection must stay open to receive this.
    """
    from app.infrastructure.redis_client import redis_session
    from app.services.vision_integration import vision_integration

    diagnostic_obj = await redis_session.get_diagnostic_object(session_id)
    if not diagnostic_obj:
        logger.warning(f"vision_complete received but no DiagnosticObject found: {session_id}")
        return

    session_data = await redis_session.get_session(session_id)
    if not session_data:
        return

    last_query = ""
    history_raw = session_data.get("conversation_history", "[]")
    history = json.loads(history_raw)
    if history:
        last_query = history[-1].get("query_summary", "")

    diagnostic_summary = vision_integration.format_diagnostic_for_prompt(diagnostic_obj)

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


async def _queue_vision_task(session_id: str, file_path: str):
    """Queue vision processing ARQ task."""
    from app.infrastructure.redis_client import arq_client
    await arq_client.enqueue_vision(session_id=session_id, file_path=file_path)


async def _handle_feedback(session_id: str, data: dict):
    """Queue feedback diagnosis task."""
    from app.infrastructure.redis_client import arq_client
    await arq_client.enqueue_feedback_diagnosis(feedback_data={
        "feedback_event_id": data.get("feedback_event_id", ""),
        "session_id": session_id,
        "query_text": data.get("query_text", ""),
        "answer_text": data.get("answer_text", ""),
        "created_at": datetime.utcnow().isoformat(),
    })


async def _queue_ticket_task(session_id: str, user_id_hash: str, query_text: str):
    """Queue mock IT support ticket ARQ task when CRAG returns INSUFFICIENT."""
    from app.infrastructure.redis_client import arq_client
    await arq_client.enqueue_ticket(ticket_data={
        "session_id": session_id,
        "user_id_hash": user_id_hash,
        "query_text": query_text,
        "reason": "CRAG assessment: INSUFFICIENT — knowledge base gap",
        "created_at": datetime.utcnow().isoformat(),
    })


async def _queue_audit_task(
    session_id: str,
    user_id_hash: str,
    enriched_query,
    retrieval_result,
    validation_score: float,
    confidence_badge: str,
):
    """Queue audit log ARQ task after every successful answer generation."""
    from app.infrastructure.redis_client import arq_client
    await arq_client.enqueue_audit(audit_data={
        "occurred_at": datetime.utcnow().isoformat(),
        "user_id_hash": user_id_hash,
        "session_id": session_id,
        "trace_id": enriched_query.trace_id,
        "request_type": "chat",
        "governance_trigger_flags": {},
        "validation_score": validation_score,
        "model_tier": 2,
        "retrieved_document_ids": [c.document_id for c in retrieval_result.chunks],
        "confidence_badge": confidence_badge,
        "feedback_signal": "none",
    })
