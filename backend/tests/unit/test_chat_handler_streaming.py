"""
Regression tests for the chat_handler Redis Pub/Sub -> WebSocket relay.

Real bug this covers (found 2026-07-19, first real end-to-end inference
run in this project's history): reasoning_service.generate_and_stream()
has always published every token to the "stream:{session_id}" Redis
Pub/Sub channel, but nothing in the codebase ever subscribed to it, so no
employee ever saw a streamed answer arrive in their browser. Fixed by
_relay_pubsub_stream_to_websocket, run concurrently with generation via
asyncio.create_task(). These tests mock Redis and the WebSocket — no real
server involved — and exist to catch a regression back to that state.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.websockets import WebSocketState

from app.handlers.chat_handler import _relay_pubsub_stream_to_websocket


def _pubsub_message(payload: dict):
    return {"type": "message", "data": json.dumps(payload)}


def _fake_pubsub(messages):
    """A fake aioredis PubSub object yielding `messages` in order, then None."""
    pubsub = MagicMock()
    pubsub.subscribe = AsyncMock()
    pubsub.unsubscribe = AsyncMock()
    pubsub.close = AsyncMock()

    queue = list(messages)

    async def get_message(ignore_subscribe_messages=True, timeout=30.0):
        if queue:
            return queue.pop(0)
        return None

    pubsub.get_message = AsyncMock(side_effect=get_message)
    return pubsub


def _fake_websocket():
    ws = MagicMock()
    ws.client_state = WebSocketState.CONNECTED
    ws.send_json = AsyncMock()
    return ws


@pytest.mark.asyncio
async def test_relay_forwards_tokens_and_stops_at_stream_complete():
    messages = [
        _pubsub_message({"type": "token", "token": "Hello"}),
        _pubsub_message({"type": "token", "token": " world"}),
        _pubsub_message({"type": "stream_complete"}),
    ]
    pubsub = _fake_pubsub(messages)
    ws = _fake_websocket()

    fake_redis_session = MagicMock()
    fake_redis_session.redis.pubsub = MagicMock(return_value=pubsub)

    with patch("app.infrastructure.redis_client.redis_session", fake_redis_session):
        await _relay_pubsub_stream_to_websocket(ws, "session-123")

    pubsub.subscribe.assert_awaited_once_with("stream:session-123")
    assert ws.send_json.await_count == 3
    sent = [call.args[0] for call in ws.send_json.await_args_list]
    assert sent[0] == {"type": "token", "token": "Hello", "session_id": "session-123"}
    assert sent[1] == {"type": "token", "token": " world", "session_id": "session-123"}
    assert sent[2] == {"type": "stream_complete", "session_id": "session-123"}
    pubsub.unsubscribe.assert_awaited_once_with("stream:session-123")
    pubsub.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_relay_stops_when_websocket_disconnects_mid_stream():
    messages = [
        _pubsub_message({"type": "token", "token": "Hello"}),
        _pubsub_message({"type": "token", "token": " world"}),
        _pubsub_message({"type": "stream_complete"}),
    ]
    pubsub = _fake_pubsub(messages)
    ws = _fake_websocket()

    async def disconnect_after_first_send(*args, **kwargs):
        ws.client_state = WebSocketState.DISCONNECTED

    ws.send_json = AsyncMock(side_effect=disconnect_after_first_send)

    fake_redis_session = MagicMock()
    fake_redis_session.redis.pubsub = MagicMock(return_value=pubsub)

    with patch("app.infrastructure.redis_client.redis_session", fake_redis_session):
        await _relay_pubsub_stream_to_websocket(ws, "session-123")

    # Only the first message is sent — the loop must check client_state
    # before every send, not just once at the top.
    assert ws.send_json.await_count == 1
    pubsub.unsubscribe.assert_awaited_once()


@pytest.mark.asyncio
async def test_relay_skips_malformed_json_without_crashing():
    messages = [
        {"type": "message", "data": "not-valid-json"},
        _pubsub_message({"type": "stream_complete"}),
    ]
    pubsub = _fake_pubsub(messages)
    ws = _fake_websocket()

    fake_redis_session = MagicMock()
    fake_redis_session.redis.pubsub = MagicMock(return_value=pubsub)

    with patch("app.infrastructure.redis_client.redis_session", fake_redis_session):
        await _relay_pubsub_stream_to_websocket(ws, "session-123")

    # Malformed message is silently skipped; only stream_complete is forwarded.
    assert ws.send_json.await_count == 1
    assert ws.send_json.await_args_list[0].args[0]["type"] == "stream_complete"


@pytest.mark.asyncio
async def test_relay_always_unsubscribes_even_on_get_message_error():
    pubsub = _fake_pubsub([])
    pubsub.get_message = AsyncMock(side_effect=RuntimeError("connection lost"))
    ws = _fake_websocket()

    fake_redis_session = MagicMock()
    fake_redis_session.redis.pubsub = MagicMock(return_value=pubsub)

    with patch("app.infrastructure.redis_client.redis_session", fake_redis_session):
        await _relay_pubsub_stream_to_websocket(ws, "session-123")

    pubsub.unsubscribe.assert_awaited_once()
    pubsub.close.assert_awaited_once()
