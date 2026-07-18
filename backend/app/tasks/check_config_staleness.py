"""
AEGIS Quick Entry Config Staleness Job
Per IMPL_29_QUICK_ENTRY_OPERATIONAL_SYSTEMS.md Section 2.2. Scheduled via
ARQ's native cron (IMPL_29 assumes an APScheduler this project doesn't have
installed — same adaptation as Session 28's screenshot cleanup job).

Finds active config entries whose next_review_date has passed, marks them
review_required, and reduces their chunks' quality_score in Qdrant/OpenSearch
(floored, original_quality_score never touched — restored exactly by
confirm-current).
"""
import logging
from datetime import date
from typing import Dict

import asyncpg

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    QDRANT_COLLECTION_CONFIGS, QUICK_ENTRY_STALENESS_SCORE_DEDUCTION, QUICK_ENTRY_QUALITY_FLOOR,
)
from app.infrastructure.qdrant_client import qdrant_client
from app.infrastructure.opensearch_client import opensearch_client

logger = logging.getLogger(__name__)


async def check_config_staleness(ctx: Dict) -> dict:
    conn = await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )
    try:
        today = date.today()
        newly_stale = await conn.fetch(
            """SELECT id, document_id FROM knowledge_form_entries
               WHERE content_type = 'config' AND status = 'active'
                 AND next_review_date IS NOT NULL AND next_review_date <= $1""",
            today,
        )

        for entry_row in newly_stale:
            entry_id = entry_row["id"]

            chunks = await conn.fetch(
                "SELECT qdrant_point_id, quality_score FROM knowledge_form_entry_chunks WHERE entry_id = $1 AND is_current = TRUE",
                entry_id,
            )
            for chunk_row in chunks:
                point_id = str(chunk_row["qdrant_point_id"])
                reduced_score = max(chunk_row["quality_score"] - QUICK_ENTRY_STALENESS_SCORE_DEDUCTION, QUICK_ENTRY_QUALITY_FLOOR)

                try:
                    await qdrant_client.set_payload(QDRANT_COLLECTION_CONFIGS, point_id, {"is_stale": True, "quality_score": reduced_score})
                except Exception as e:
                    logger.error(f"Staleness update failed for point {point_id}: {e}")
                    continue

                try:
                    await opensearch_client.update_document(point_id, {"is_stale": True, "quality_score": reduced_score})
                except Exception as e:
                    logger.warning(f"OpenSearch staleness update failed for {point_id}: {e}")

                await conn.execute(
                    "UPDATE knowledge_form_entry_chunks SET quality_score = $1 WHERE qdrant_point_id = $2",
                    reduced_score, chunk_row["qdrant_point_id"],
                )

            await conn.execute(
                "UPDATE knowledge_form_entries SET status = 'review_required', updated_at = NOW() WHERE id = $1",
                entry_id,
            )
            logger.info(f"check_config_staleness: marked {entry_row['document_id']} (id={entry_id}) as review_required")

        logger.info(f"check_config_staleness: completed. entries_marked_stale={len(newly_stale)}")
        return {"entries_marked_stale": len(newly_stale)}
    finally:
        await conn.close()
