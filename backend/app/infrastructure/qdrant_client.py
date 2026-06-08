"""
AEGIS Qdrant Client
Wrapper around the qdrant-client library for AEGIS retrieval operations.
All search calls specify hnsw_ef=128 for content collections and hnsw_ef=64
for the cache collection, as specified in AEGIS_CONFIGURATION_CONSTANTS.md.
"""
from typing import List, Optional, Dict, Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue,
    SearchParams, NamedVector,
    PointStruct, PointIdsList
)

from app.config import (
    QDRANT_HOST, QDRANT_PORT,
    QDRANT_COLLECTION_ERRORS, QDRANT_COLLECTION_PROCEDURES,
    QDRANT_COLLECTION_CONFIGS, QDRANT_COLLECTION_CACHE,
    QDRANT_VECTOR_CONTENT, QDRANT_VECTOR_IDENTITY,
    QDRANT_SEARCH_LIMIT, QDRANT_HNSW_EF, QDRANT_CACHE_HNSW_EF,
    SEMANTIC_CACHE_THRESHOLD,
)

# Map content_type to collection name
CONTENT_TYPE_TO_COLLECTION = {
    "error_guide": QDRANT_COLLECTION_ERRORS,
    "procedure": QDRANT_COLLECTION_PROCEDURES,
    "config": QDRANT_COLLECTION_CONFIGS,
}


class AegisQdrantClient:
    """Application-level Qdrant client for AEGIS operations."""

    def __init__(self):
        self._client: Optional[AsyncQdrantClient] = None

    async def connect(self):
        """Initialize async connection to Qdrant."""
        self._client = AsyncQdrantClient(
            host=QDRANT_HOST,
            port=QDRANT_PORT,
            timeout=30,
        )

    async def close(self):
        if self._client:
            await self._client.close()

    @property
    def client(self) -> AsyncQdrantClient:
        if not self._client:
            raise RuntimeError("Qdrant client not connected. Call connect() first.")
        return self._client

    # ============================================================
    # Content Collection Operations (meridian_errors/procedures/configs)
    # ============================================================

    async def search_content(
        self,
        collection_name: str,
        query_vector: List[float],
        vector_name: str = QDRANT_VECTOR_CONTENT,
        limit: int = QDRANT_SEARCH_LIMIT,
        filter_conditions: Optional[Dict[str, Any]] = None,
    ) -> List[Dict]:
        """
        Search a content collection using a named vector.
        Returns list of dicts with id, score, and payload.
        """
        search_filter = None
        if filter_conditions:
            conditions = []
            for field, value in filter_conditions.items():
                conditions.append(FieldCondition(key=field, match=MatchValue(value=value)))
            search_filter = Filter(must=conditions)

        results = await self.client.search(
            collection_name=collection_name,
            query_vector=NamedVector(name=vector_name, vector=query_vector),
            limit=limit,
            query_filter=search_filter,
            search_params=SearchParams(hnsw_ef=QDRANT_HNSW_EF),
            with_payload=True,
        )

        return [
            {
                "id": str(r.id),
                "score": r.score,
                "payload": r.payload,
            }
            for r in results
        ]

    async def search_by_document_id(
        self,
        collection_name: str,
        document_id: str,
        query_vector: List[float],
        chunk_types: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Mode A retrieval: Search filtered to a specific document_id.
        Optionally filter by chunk_type list.
        """
        conditions = [FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        if chunk_types:
            # MatchAny for multiple chunk types
            from qdrant_client.models import MatchAny
            conditions.append(FieldCondition(key="chunk_type", match=MatchAny(any=chunk_types)))

        results = await self.client.search(
            collection_name=collection_name,
            query_vector=NamedVector(name=QDRANT_VECTOR_CONTENT, vector=query_vector),
            limit=20,  # Get all chunks for a single document
            query_filter=Filter(must=conditions),
            search_params=SearchParams(hnsw_ef=QDRANT_HNSW_EF),
            with_payload=True,
        )

        return [{"id": str(r.id), "score": r.score, "payload": r.payload} for r in results]

    async def upsert_point(
        self,
        collection_name: str,
        point_id: str,
        content_vector: List[float],
        identity_vector: List[float],
        payload: Dict,
    ) -> bool:
        """Insert or update a document chunk point."""
        await self.client.upsert(
            collection_name=collection_name,
            points=[
                PointStruct(
                    id=point_id,
                    vector={
                        QDRANT_VECTOR_CONTENT: content_vector,
                        QDRANT_VECTOR_IDENTITY: identity_vector,
                    },
                    payload=payload,
                )
            ],
        )
        return True

    async def delete_by_document_id(self, collection_name: str, document_id: str) -> bool:
        """Delete all points belonging to a specific document_id (for update flow)."""
        from qdrant_client.models import FilterSelector
        await self.client.delete(
            collection_name=collection_name,
            points_selector=FilterSelector(
                filter=Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))])
            ),
        )
        return True

    # ============================================================
    # Cache Collection Operations (cache_queries)
    # ============================================================

    async def search_cache(self, query_vector: List[float]) -> Optional[Dict]:
        """
        Search the semantic cache. Returns the best match if score >= SEMANTIC_CACHE_THRESHOLD.
        The nightly cleanup job removes entries older than 24 hours.
        """
        results = await self.client.search(
            collection_name=QDRANT_COLLECTION_CACHE,
            query_vector=NamedVector(name=QDRANT_VECTOR_CONTENT, vector=query_vector),
            limit=1,
            search_params=SearchParams(hnsw_ef=QDRANT_CACHE_HNSW_EF),
            with_payload=True,
        )

        if results and results[0].score >= SEMANTIC_CACHE_THRESHOLD:
            return {"score": results[0].score, "payload": results[0].payload}
        return None

    async def upsert_cache_entry(
        self,
        point_id: str,
        query_vector: List[float],
        payload: Dict,
    ) -> bool:
        """Store a new cache entry."""
        await self.client.upsert(
            collection_name=QDRANT_COLLECTION_CACHE,
            points=[PointStruct(id=point_id, vector={QDRANT_VECTOR_CONTENT: query_vector}, payload=payload)],
        )
        return True

    async def cleanup_stale_cache(self, cutoff_datetime_str: str) -> int:
        """
        Delete cache entries older than cutoff_datetime_str.
        Called by the ARQ nightly_cleanup task.
        Returns number of deleted points.
        """
        from qdrant_client.models import DatetimeRange, FilterSelector

        # Scroll to find stale points, then delete
        stale_ids = []
        offset = None

        while True:
            results, offset = await self.client.scroll(
                collection_name=QDRANT_COLLECTION_CACHE,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="created_at",
                            range=DatetimeRange(lt=cutoff_datetime_str),
                        )
                    ]
                ),
                limit=100,
                offset=offset,
                with_payload=False,
            )

            for point in results:
                stale_ids.append(point.id)

            if offset is None:
                break

        if stale_ids:
            await self.client.delete(
                collection_name=QDRANT_COLLECTION_CACHE,
                points_selector=PointIdsList(points=stale_ids),
            )

        return len(stale_ids)

    # ============================================================
    # Health Check
    # ============================================================

    async def health_check(self) -> Dict:
        """Check all collections exist and have correct configuration."""
        try:
            collections = await self.client.get_collections()
            collection_names = [c.name for c in collections.collections]

            required = [
                QDRANT_COLLECTION_ERRORS,
                QDRANT_COLLECTION_PROCEDURES,
                QDRANT_COLLECTION_CONFIGS,
                QDRANT_COLLECTION_CACHE,
            ]

            missing = [c for c in required if c not in collection_names]
            return {
                "status": "healthy" if not missing else "unhealthy",
                "collections": collection_names,
                "missing": missing,
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


# Singleton instance (initialised in FastAPI startup)
qdrant_client = AegisQdrantClient()
