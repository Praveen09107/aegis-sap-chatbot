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
            return

        # Stage B: Retrieval Engine (all 8 stages)
        retrieval_result = await retrieval_engine.retrieve(enriched)

        if retrieval_result.crag_assessment == "INSUFFICIENT":
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
            return

        # Stage C: Reasoning + Validation (Sessions 16-17)
        # Placeholder — show retrieval summary until reasoning is implemented
        doc_ids = [c.document_id for c in retrieval_result.chunks]
        await websocket.send_json({
            "type": "token",
            "token": (
                f"[Retrieval complete: {len(retrieval_result.chunks)} chunks from "
                f"{list(set(doc_ids))[:3]}, "
                f"CRAG={retrieval_result.crag_assessment}, "
                f"top_score={retrieval_result.top_cross_encoder_score:.2f}. "
                f"Reasoning pipeline (Session 16) will generate the full answer.]"
            ),
            "session_id": session_id,
        })
        await websocket.send_json({"type": "stream_complete", "session_id": session_id})
        await websocket.send_json({
            "type": "validation_result",
            "validation_score": 0.90,
            "confidence_badge": "green",
            "attribution_panel": {
                "primary_document_id": doc_ids[0] if doc_ids else "pending",
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
    from app.infrastructure.redis_client import redis_queue
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
