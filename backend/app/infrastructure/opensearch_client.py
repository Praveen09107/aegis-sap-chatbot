"""
AEGIS OpenSearch Client
Wrapper for BM25 keyword search with SAP entity boosting.
Entity boosting is applied at indexing time (entity repeated 3x in chunk_text).
"""
from typing import List, Optional, Dict, Any

from opensearchpy import AsyncOpenSearch

from app.config import (
    OPENSEARCH_HOST, OPENSEARCH_PORT,
    OPENSEARCH_INDEX_NAME, OPENSEARCH_SEARCH_LIMIT,
    ENTITY_BOOST_REPETITIONS,
)


class AegisOpenSearchClient:
    """Application-level OpenSearch client."""

    def __init__(self):
        self._client: Optional[AsyncOpenSearch] = None

    async def connect(self):
        self._client = AsyncOpenSearch(
            hosts=[{"host": OPENSEARCH_HOST, "port": OPENSEARCH_PORT}],
            http_compress=True,
            use_ssl=False,
            verify_certs=False,
            timeout=30,
        )

    async def close(self):
        if self._client:
            await self._client.close()

    @property
    def client(self) -> AsyncOpenSearch:
        if not self._client:
            raise RuntimeError("OpenSearch client not connected.")
        return self._client

    async def search_bm25(
        self,
        query_text: str,
        entities: List[str],
        content_type_filter: Optional[str] = None,
        module_filter: Optional[str] = None,
        document_id_filter: Optional[str] = None,
        limit: int = OPENSEARCH_SEARCH_LIMIT,
    ) -> List[Dict]:
        """
        BM25 search with entity boosting.
        Entities are repeated ENTITY_BOOST_REPETITIONS times (3x) in the query
        to increase their BM25 term frequency weight.
        """
        # Build boosted query: append entity tokens 3x for BM25 term frequency boost
        boosted_query = query_text
        for entity in entities:
            boost_tokens = " ".join([entity] * ENTITY_BOOST_REPETITIONS)
            boosted_query = f"{boosted_query} {boost_tokens}"

        # Build query body
        must_clauses = [
            {
                "multi_match": {
                    "query": boosted_query,
                    "fields": ["chunk_text", "error_code^2", "configuration_name^1.5", "procedure_name^1.5"],
                    "type": "best_fields",
                    "operator": "or",
                }
            }
        ]

        filter_clauses = []
        if content_type_filter:
            filter_clauses.append({"term": {"content_type": content_type_filter}})
        if module_filter:
            filter_clauses.append({"term": {"module": module_filter}})
        if document_id_filter:
            filter_clauses.append({"term": {"document_id": document_id_filter}})

        search_body = {
            "query": {
                "bool": {
                    "must": must_clauses,
                    "filter": filter_clauses if filter_clauses else [],
                }
            },
            "size": limit,
            "_source": True,
        }

        results = await self.client.search(
            index=OPENSEARCH_INDEX_NAME,
            body=search_body,
        )

        return [
            {
                "chunk_id": hit["_source"].get("chunk_id"),
                "document_id": hit["_source"].get("document_id"),
                "score": hit["_score"],
                "payload": hit["_source"],
            }
            for hit in results["hits"]["hits"]
        ]

    async def index_document(self, chunk_id: str, document: Dict) -> bool:
        """
        Index a document chunk. Entity boosting is applied here:
        The error_code/configuration_name/procedure_name is repeated
        ENTITY_BOOST_REPETITIONS times in the chunk_text field.
        """
        # Apply entity boosting to chunk_text
        doc_to_index = document.copy()
        entity_value = (
            document.get("error_code") or
            document.get("configuration_name") or
            document.get("procedure_name") or ""
        )

        if entity_value:
            boost_prefix = " ".join([entity_value] * ENTITY_BOOST_REPETITIONS)
            doc_to_index["chunk_text"] = f"{boost_prefix} {document.get('chunk_text', '')}"

        await self.client.index(
            index=OPENSEARCH_INDEX_NAME,
            id=chunk_id,
            body=doc_to_index,
        )
        return True

    async def delete_by_document_id(self, document_id: str) -> bool:
        """Delete all chunks for a document_id (used in update flow)."""
        await self.client.delete_by_query(
            index=OPENSEARCH_INDEX_NAME,
            body={"query": {"term": {"document_id": document_id}}},
        )
        return True

    async def health_check(self) -> Dict:
        try:
            health = await self.client.cluster.health()
            # AEGIS_DATA_CONTRACTS.md Section 12: services report "healthy | unhealthy".
            # OpenSearch's native cluster colors: green (all shards allocated) and
            # yellow (primaries allocated, replicas not — normal for single-node)
            # both mean the service is usable; only red means data is unavailable.
            cluster_color = health["status"]
            status = "healthy" if cluster_color in {"green", "yellow"} else "unhealthy"
            return {"status": status, "cluster": health["cluster_name"], "cluster_color": cluster_color}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


# Singleton instance
opensearch_client = AegisOpenSearchClient()
