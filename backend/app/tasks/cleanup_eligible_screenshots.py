"""
AEGIS Quick Entry Screenshot Lifecycle Cleanup
Per IMPL_28_QUICK_ENTRY_SCREENSHOT_PIPELINE.md Section 7. NOT a simple
age-based delete — a screenshot is eligible for MinIO removal only when its
version has genuinely been superseded (per Section 7.2's real SQL, not just
its simplified Section 7.1 prose): at least SCREENSHOT_CLEANUP_MIN_VERSIONS_OLD
(2) versions old, AND either the entry has been archived for at least
SCREENSHOT_CLEANUP_MIN_ARCHIVED_DAYS (90) days, or the version gap has grown
to 5+ even on a still-active entry (no named constant for this "5" exists
anywhere in specs/ — used as IMPL_28's own literal value).
"""
import logging
from typing import Dict

import asyncpg

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    MINIO_BUCKET_SCREENSHOTS, SCREENSHOT_CLEANUP_MIN_VERSIONS_OLD, SCREENSHOT_CLEANUP_MIN_ARCHIVED_DAYS,
)
from app.infrastructure.minio_client import minio_client

logger = logging.getLogger(__name__)

_OLD_VERSION_GAP_ON_ACTIVE = 5


async def cleanup_eligible_screenshots(ctx: Dict) -> dict:
    conn = await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )
    try:
        eligible = await conn.fetch(
            f"""SELECT kfs.id, kfs.minio_object_key
                FROM knowledge_form_screenshots kfs
                JOIN knowledge_form_entries kfe ON kfe.id = kfs.entry_id
                WHERE kfs.eligible_for_cleanup = FALSE
                  AND (kfe.version - kfs.version) >= $1
                  AND (
                       (kfe.status = 'archived' AND (NOW() - kfe.updated_at) > ($2 || ' days')::interval)
                       OR (kfe.version - kfs.version) >= $3
                  )""",
            SCREENSHOT_CLEANUP_MIN_VERSIONS_OLD, SCREENSHOT_CLEANUP_MIN_ARCHIVED_DAYS, _OLD_VERSION_GAP_ON_ACTIVE,
        )

        deleted_count = 0
        failed_count = 0

        for row in eligible:
            try:
                await minio_client.remove_object(MINIO_BUCKET_SCREENSHOTS, row["minio_object_key"])
                await conn.execute(
                    "UPDATE knowledge_form_screenshots SET eligible_for_cleanup = TRUE WHERE id = $1",
                    row["id"],
                )
                deleted_count += 1
                logger.info(f"cleanup_eligible_screenshots: deleted {row['minio_object_key']}")
            except Exception as e:
                failed_count += 1
                logger.error(f"cleanup_eligible_screenshots: failed to delete {row['minio_object_key']}: {e}")

        logger.info(f"cleanup_eligible_screenshots: completed. deleted={deleted_count}, failed={failed_count}")
        return {"deleted": deleted_count, "failed": failed_count}
    finally:
        await conn.close()
