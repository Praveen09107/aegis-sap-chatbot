"""AEGIS Cache Task — Writes high-confidence answers to semantic cache."""
import logging
import uuid
from datetime import datetime
from typing import Dict

logger = logging.getLogger(__name__)


async def write_semantic_cache(ctx: Dict, *, cache_data: Dict):
    """
    ARQ cache write task. Embeds query and stores in Qdrant cache_queries.
    No retry (cache miss is acceptable).
    """
    try:
        import httpx
        from qdrant_client import QdrantClient
        from qdrant_client.models import PointStruct
        from app.config import QDRANT_HOST, QDRANT_PORT, BGE_SERVICE_URL, EMBEDDING_MODEL_VERSION

        query_text = cache_data["query_text"]

        async with httpx.AsyncClient(timeout=30) as client:
            embed_resp = await client.post(
                f"{BGE_SERVICE_URL}/embed-single",
                json={"text": query_text}
            )
            embedding = embed_resp.json()["embedding"]

        qclient = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        point_id = str(uuid.uuid4())

        qclient.upsert(
            collection_name="cache_queries",
            points=[PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "query_text": query_text,
                    "answer_text": cache_data["answer_text"],
                    "validation_score": cache_data["validation_score"],
                    "document_ids": cache_data["document_ids"],
                    "created_at": datetime.utcnow().isoformat(),
                    "embedding_model_version": EMBEDDING_MODEL_VERSION,
                }
            )]
        )
        logger.info(f"Cache entry written: {point_id[:8]}...")
    except Exception as e:
        logger.warning(f"Cache write failed (non-critical): {e}")
