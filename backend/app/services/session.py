"""
AEGIS Session Service
High-level session management operations over RedisSessionClient.
Provides create/get/update/delete + conversation history + unresolved tracking.
"""
import hashlib
import json
import logging
from datetime import datetime
from typing import Optional

from app.infrastructure.redis_client import redis_session
from app.models.session import SessionState, ConversationTurn
from app.config import (
    SESSION_TTL_SECONDS,
    MAX_CONVERSATION_HISTORY_TURNS,
    QUERY_SUMMARY_MAX_CHARS,
    ANSWER_SUMMARY_MAX_CHARS,
)

logger = logging.getLogger(__name__)


class ConversationState:
    """Alias dataclass matching verification protocol field expectations."""
    pass


# Build ConversationState dynamically from SessionState fields
import dataclasses

ConversationState = dataclasses.make_dataclass(
    "ConversationState",
    [
        ("session_id", str, dataclasses.field(default="")),
        ("user_id_hash", str, dataclasses.field(default="")),
        ("conversation_history", list, dataclasses.field(default_factory=list)),
        ("unresolved_count", int, dataclasses.field(default=0)),
        ("active_retrieval_mode", str, dataclasses.field(default="B")),
        ("last_entities", list, dataclasses.field(default_factory=list)),
    ],
)


class SessionService:
    """High-level session operations for Zone B orchestration."""

    async def create_session(self, session_id: str, user_id_hash: str) -> ConversationState:
        """Create a new session in Redis and return ConversationState."""
        await redis_session.create_session(session_id, user_id_hash)
        return ConversationState(
            session_id=session_id,
            user_id_hash=user_id_hash,
            conversation_history=[],
            unresolved_count=0,
            active_retrieval_mode="B",
            last_entities=[],
        )

    async def get_session(self, session_id: str) -> Optional[ConversationState]:
        """Load session from Redis and return ConversationState."""
        data = await redis_session.get_session(session_id)
        if not data:
            return None
        state = SessionState.from_redis_hash(data)
        return ConversationState(
            session_id=session_id,
            user_id_hash=state.user_id_hash,
            conversation_history=state.conversation_history,
            unresolved_count=state.unresolved_count,
            active_retrieval_mode=state.active_retrieval_mode,
            last_entities=state.last_entities,
        )

    async def add_turn(
        self,
        session_id: str,
        query: str,
        answer: str,
        classification: str,
        confidence: float,
    ) -> None:
        """Add a conversation turn with sliding window enforcement."""
        data = await redis_session.get_session(session_id)
        if not data:
            return
        state = SessionState.from_redis_hash(data)
        state.add_conversation_turn(
            query=query[:QUERY_SUMMARY_MAX_CHARS],
            answer=answer[:ANSWER_SUMMARY_MAX_CHARS],
            classification=classification,
            confidence_badge="green" if confidence >= 0.85 else "amber" if confidence >= 0.70 else "none",
            doc_ids=[],
        )
        await redis_session.update_session(session_id, {
            "conversation_history": json.dumps([
                {
                    "query_summary": t.query_summary,
                    "answer_summary": t.answer_summary,
                    "classification": t.classification,
                    "confidence_badge": t.confidence_badge,
                    "retrieved_doc_ids": t.retrieved_doc_ids,
                }
                for t in state.conversation_history
            ]),
        })

    async def increment_unresolved(self, session_id: str) -> int:
        """Increment unresolved count (never decrements)."""
        return await redis_session.increment_unresolved_count(session_id)

    async def delete_session(self, session_id: str) -> None:
        """Delete a session from Redis."""
        await redis_session.delete_session(session_id)
