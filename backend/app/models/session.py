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
    type: str
    value: str


@dataclass
class ConversationTurn:
    """One turn in the conversation history (compressed form for session state)."""
    query_summary: str
    answer_summary: str
    classification: str
    confidence_badge: str
    retrieved_doc_ids: List[str]


@dataclass
class SessionState:
    """
    Complete session state object.
    Serialized to Redis hash with all values as strings.
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
            query_summary=query[:QUERY_SUMMARY_MAX_CHARS],
            answer_summary=answer[:ANSWER_SUMMARY_MAX_CHARS],
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
