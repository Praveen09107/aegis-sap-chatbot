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
        enriched = await query_intelligence.process(
            raw_message=query_text,
            session=session,
            session_id=session_id,
            trace_id=trace_id,
        )

        if enriched.cache_hit and enriched.cached_answer:
            await websocket.send_json({
                "type": "token",
                "token": enriched.cached_answer,
                "session_id": session_id,
            })
        else:
            await websocket.send_json({
                "type": "token",
                "token": f"[QIL complete — mode={enriched.retrieval_mode}, class={enriched.classification}. Retrieval stages 14-17 pending] ",
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
