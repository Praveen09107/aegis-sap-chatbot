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
