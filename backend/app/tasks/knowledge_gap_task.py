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
        from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB
        from app.infrastructure.vault_client import vault_client

        pg_user, pg_password = await vault_client.get_postgres_credentials()
        conn = await asyncpg.connect(
            host=POSTGRES_HOST, port=POSTGRES_PORT,
            database=POSTGRES_DB, user=pg_user, password=pg_password
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
