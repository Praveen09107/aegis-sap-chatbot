"""AEGIS Mock Ticket Task — Creates support ticket when AEGIS cannot answer."""
import uuid
import logging
from datetime import datetime
from typing import Dict

logger = logging.getLogger(__name__)


async def create_mock_ticket(ctx: Dict, *, ticket_data: Dict):
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
            database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            statement_cache_size=0,
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
