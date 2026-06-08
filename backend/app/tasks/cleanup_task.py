"""AEGIS Nightly Cleanup Task — Removes stale semantic cache entries."""
import logging
from datetime import datetime, timedelta
from typing import Dict

logger = logging.getLogger(__name__)


async def nightly_cleanup(ctx: Dict):
    """
    Scheduled ARQ task — runs nightly.
    Deletes semantic cache entries older than 24 hours.
    """
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import PointIdsList
        from app.config import QDRANT_HOST, QDRANT_PORT

        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        qclient = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

        collection_info = qclient.get_collection("cache_queries")
        count_before = collection_info.points_count

        deleted = 0
        offset = None
        while True:
            results, offset = qclient.scroll(
                collection_name="cache_queries",
                limit=100,
                offset=offset,
                with_payload=["created_at"],
            )
            stale_ids = [
                r.id for r in results
                if r.payload and r.payload.get("created_at", "9999") < cutoff
            ]
            if stale_ids:
                qclient.delete(
                    collection_name="cache_queries",
                    points_selector=PointIdsList(points=stale_ids)
                )
                deleted += len(stale_ids)
            if offset is None:
                break

        logger.info(f"Nightly cleanup: deleted {deleted} stale cache entries (before: {count_before})")
        return {"deleted": deleted, "cutoff": cutoff}

    except Exception as e:
        logger.error(f"Nightly cleanup failed: {e}")
        raise
