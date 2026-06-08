"""
AEGIS Retrieval Engine — Stages 1 through 5
Gathers, merges, and fuses candidates from multiple retrieval sources.

Stage 1: Dense vector search    — Qdrant "content" vector, top_k=10 per collection
Stage 2: Identity vector search — Qdrant "identity" vector, entity fingerprint embedding
Stage 3: BM25 keyword search    — OpenSearch with entity boosting (3x repetition)
Stage 4: Knowledge Graph        — Single-hop SQL JOIN via document_relationships
Stage 5: RRF Fusion             — Merge all sources using Reciprocal Rank Fusion (K=60)

Stages 6-8 (CRAG, Reranking, Hydration) added in Session 15.
"""
import logging
import asyncio
from typing import List, Optional, Dict, Set
from collections import defaultdict

import asyncpg
import httpx

from app.config import (
    QDRANT_COLLECTION_ERRORS, QDRANT_COLLECTION_PROCEDURES, QDRANT_COLLECTION_CONFIGS,
    QDRANT_VECTOR_CONTENT, QDRANT_VECTOR_IDENTITY,
    QDRANT_SEARCH_LIMIT,
    OPENSEARCH_SEARCH_LIMIT,
    BGE_SERVICE_URL,
    RRF_K, MODE_C_DIVERSITY_BONUS,
    RETRIEVAL_CRAG_INPUT_CHUNKS,
    KG_BASE_RANK_EQUIVALENT,
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
)
from app.models.retrieval import EnrichedQuery, RetrievedChunk, RegistryResult

logger = logging.getLogger(__name__)

CLASSIFICATION_TO_COLLECTION = {
    "ERROR_RESOLUTION": QDRANT_COLLECTION_ERRORS,
    "PROCESS": QDRANT_COLLECTION_PROCEDURES,
    "CONFIG": QDRANT_COLLECTION_CONFIGS,
    "SIMPLE_FACT": QDRANT_COLLECTION_ERRORS,
}

ALL_COLLECTIONS = [
    QDRANT_COLLECTION_ERRORS,
    QDRANT_COLLECTION_PROCEDURES,
    QDRANT_COLLECTION_CONFIGS,
]


class RetrievalEngine:
    """
    8-stage retrieval pipeline.
    Stages 1-5 gather and fuse candidates (this file).
    Stages 6-8 assess, rerank, and hydrate (added in Session 15).
    """

    def __init__(self):
        self._qdrant = None
        self._opensearch = None

    async def _get_qdrant(self):
        """Lazy-load Qdrant client to avoid circular imports."""
        from app.infrastructure.qdrant_client import qdrant_client
        return qdrant_client

    async def _get_opensearch(self):
        """Lazy-load OpenSearch client to avoid circular imports."""
        from app.infrastructure.opensearch_client import opensearch_client
        return opensearch_client

    # ============================================================
    # STAGE 1: DENSE VECTOR SEARCH (Qdrant "content" vector)
    # ============================================================

    async def _stage1_dense(
        self,
        enriched_query: EnrichedQuery,
    ) -> List[Dict]:
        """
        Dense vector search using the pre-computed query_embedding from EnrichedQuery.
        Searches the "content" named vector in Qdrant.
        Mode A/B: searches primary collection only.
        Mode C: searches all three collections in parallel.
        Returns flat list of chunk dicts with source and rank.
        """
        query_vector = enriched_query.query_embedding
        if not query_vector:
            logger.warning("Stage 1 (Dense): no query_embedding available, skipping")
            return []

        if enriched_query.retrieval_mode == "C":
            collections_to_search = ALL_COLLECTIONS
        else:
            primary = CLASSIFICATION_TO_COLLECTION.get(
                enriched_query.classification,
                QDRANT_COLLECTION_ERRORS,
            )
            collections_to_search = [primary]

        qdrant = await self._get_qdrant()
        search_tasks = [
            qdrant.search_content(
                collection_name=collection,
                query_vector=query_vector,
                vector_name=QDRANT_VECTOR_CONTENT,
                limit=QDRANT_SEARCH_LIMIT,
            )
            for collection in collections_to_search
        ]

        try:
            search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        except Exception as e:
            logger.error(f"Stage 1 (Dense) parallel search failed: {e}")
            return []

        all_results = []
        for idx, result in enumerate(search_results):
            if isinstance(result, Exception):
                logger.error(f"Stage 1 (Dense) collection {collections_to_search[idx]} failed: {result}")
                continue
            for rank, chunk in enumerate(result):
                all_results.append({
                    "source": f"dense_{collections_to_search[idx]}",
                    "rank": rank + 1,
                    **chunk,
                })

        logger.debug(f"Stage 1 (Dense): {len(all_results)} results across {len(collections_to_search)} collection(s)")
        return all_results

    # ============================================================
    # STAGE 2: IDENTITY VECTOR SEARCH (Qdrant "identity" vector)
    # ============================================================

    async def _stage2_identity(
        self,
        enriched_query: EnrichedQuery,
    ) -> List[Dict]:
        """
        Entity-specific search using the "identity" named vector.
        Builds an entity fingerprint string from error_code + module + t_codes,
        embeds it via BGE, and searches the "identity" vector in Qdrant.
        """
        identity_vector = await self._embed_entity_identity(enriched_query)

        if enriched_query.retrieval_mode == "C":
            collections_to_search = ALL_COLLECTIONS
        else:
            primary = CLASSIFICATION_TO_COLLECTION.get(
                enriched_query.classification,
                QDRANT_COLLECTION_ERRORS,
            )
            collections_to_search = [primary]

        qdrant = await self._get_qdrant()
        search_tasks = [
            qdrant.search_content(
                collection_name=collection,
                query_vector=identity_vector,
                vector_name=QDRANT_VECTOR_IDENTITY,
                limit=QDRANT_SEARCH_LIMIT,
            )
            for collection in collections_to_search
        ]

        try:
            search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        except Exception as e:
            logger.error(f"Stage 2 (Identity) parallel search failed: {e}")
            return []

        all_results = []
        for idx, result in enumerate(search_results):
            if isinstance(result, Exception):
                logger.error(f"Stage 2 (Identity) collection {collections_to_search[idx]} failed: {result}")
                continue
            for rank, chunk in enumerate(result):
                all_results.append({
                    "source": f"identity_{collections_to_search[idx]}",
                    "rank": rank + 1,
                    **chunk,
                })

        logger.debug(f"Stage 2 (Identity): {len(all_results)} results across {len(collections_to_search)} collection(s)")
        return all_results

    async def _embed_text(self, text: str) -> List[float]:
        """Embed text using BGE service. Returns 768-dim vector."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{BGE_SERVICE_URL}/embed-single",
                json={"text": text},
            )
            resp.raise_for_status()
            return resp.json()["embedding"]

    async def _embed_entity_identity(self, enriched_query: EnrichedQuery) -> List[float]:
        """
        Build the entity fingerprint string and embed it via BGE.
        Fingerprint: error_code + module + t_codes concatenated.
        Falls back to enriched_text if no entities present.
        """
        entities = enriched_query.entities
        if not entities:
            return await self._embed_text(enriched_query.enriched_text)

        parts = []
        for entity in entities:
            if entity.type == "error_code":
                parts.append(f"{entity.value} SAP error message")
            elif entity.type == "tcode":
                parts.append(f"{entity.value} SAP transaction code procedure")
            elif entity.type == "document_number":
                parts.append(f"SAP document {entity.value}")
            elif entity.type == "module":
                parts.append(f"SAP {entity.value} module configuration")
            else:
                parts.append(entity.value)

        fingerprint = " ".join(parts)
        return await self._embed_text(fingerprint)

    # ============================================================
    # STAGE 3: OPENSEARCH BM25 SEARCH
    # ============================================================

    async def _stage3_bm25(
        self,
        enriched_query: EnrichedQuery,
    ) -> List[Dict]:
        """
        BM25 keyword search with entity boosting.
        Extracted entities are duplicated 3x before sending to boost precision.
        Mode C searches without content_type filter (all content types).
        """
        entities = enriched_query.entities
        entity_values = [e.value for e in entities if e.type in {"error_code", "tcode"}]

        content_type_filter = None
        if enriched_query.retrieval_mode != "C":
            content_type_map = {
                "ERROR_RESOLUTION": "error_guide",
                "PROCESS": "procedure",
                "CONFIG": "config",
            }
            content_type_filter = content_type_map.get(enriched_query.classification)

        try:
            opensearch = await self._get_opensearch()
            results = await opensearch.search_bm25(
                query_text=enriched_query.enriched_text,
                entities=entity_values,
                content_type_filter=content_type_filter,
                limit=OPENSEARCH_SEARCH_LIMIT,
            )

            logger.debug(f"Stage 3 (BM25): {len(results)} OpenSearch results")
            return [{"source": "opensearch_bm25", "rank": i + 1, **r} for i, r in enumerate(results)]

        except Exception as e:
            logger.error(f"Stage 3 (BM25) failed: {e}")
            return []

    # ============================================================
    # STAGE 4: KNOWLEDGE GRAPH EXPANSION
    # ============================================================

    async def _stage4_knowledge_graph(
        self,
        enriched_query: EnrichedQuery,
        prior_results: List[Dict],
    ) -> List[Dict]:
        """
        Single-hop SQL JOIN via document_relationships table.
        For each unique document_id in prior results, find related chunk_ids
        WHERE weight >= 0.5, LIMIT 10.
        Assigns KG_BASE_RANK_EQUIVALENT (15) as the rank for RRF scoring.
        """
        current_chunk_ids: Set[str] = set()
        current_doc_ids: Set[str] = set()
        for r in prior_results:
            payload = r.get("payload", {})
            if payload.get("document_id"):
                current_doc_ids.add(payload["document_id"])
            if payload.get("chunk_id"):
                current_chunk_ids.add(payload["chunk_id"])

        if not current_doc_ids:
            return []

        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            )
            try:
                rows = await conn.fetch(
                    """
                    SELECT DISTINCT dr.to_document_id, dr.relationship_type
                    FROM document_relationships dr
                    WHERE dr.from_document_id = ANY($1)
                      AND dr.weight >= 0.5
                    LIMIT 10
                    """,
                    list(current_doc_ids),
                )
                related_doc_ids = {
                    row["to_document_id"]
                    for row in rows
                    if row["to_document_id"] not in current_doc_ids
                }
            finally:
                await conn.close()

            if not related_doc_ids:
                return []

            qdrant = await self._get_qdrant()
            query_vector = enriched_query.query_embedding
            if not query_vector:
                query_vector = await self._embed_text(enriched_query.enriched_text)

            kg_results = []
            for doc_id in list(related_doc_ids)[:5]:
                collection = self._find_document_collection_sync(doc_id)
                if not collection:
                    continue

                chunks = await qdrant.search_by_document_id(
                    collection_name=collection,
                    document_id=doc_id,
                    query_vector=query_vector,
                )

                if chunks:
                    top_chunk = chunks[0]
                    if top_chunk.get("payload", {}).get("chunk_id") not in current_chunk_ids:
                        kg_results.append({
                            "source": "knowledge_graph",
                            "rank": KG_BASE_RANK_EQUIVALENT,
                            **top_chunk,
                        })

            logger.debug(f"Stage 4 (KG): {len(kg_results)} related document chunks added")
            return kg_results

        except Exception as e:
            logger.error(f"Stage 4 (KG) failed: {e}")
            return []

    def _find_document_collection_sync(self, document_id: str) -> Optional[str]:
        """
        Determine which Qdrant collection contains a given document_id.
        Uses the document_id prefix convention (ERR/PROC/CFG).
        """
        if "-ERR-" in document_id:
            return QDRANT_COLLECTION_ERRORS
        elif "-PROC-" in document_id:
            return QDRANT_COLLECTION_PROCEDURES
        elif "-CFG-" in document_id:
            return QDRANT_COLLECTION_CONFIGS
        return None

    # ============================================================
    # STAGE 5: RRF FUSION
    # ============================================================

    def _stage5_rrf_fusion(
        self,
        retrieval_mode: str,
        dense_results: List[Dict],
        identity_results: List[Dict],
        bm25_results: List[Dict],
        kg_results: List[Dict],
    ) -> List[RetrievedChunk]:
        """
        Reciprocal Rank Fusion across 4 input lists.
        Formula: score = 1 / (rank + K) where K = RRF_K (60)
        Scores accumulate when a chunk appears in multiple lists.
        Mode C diversity bonus: multiplicative score * 1.15 for underrepresented docs.
        Returns top RETRIEVAL_CRAG_INPUT_CHUNKS (8) chunks sorted by RRF score descending.
        """
        chunk_scores: Dict[str, float] = defaultdict(float)
        chunk_data: Dict[str, Dict] = {}

        def add_source_scores(results: List[Dict], source_weight: float = 1.0):
            for result in results:
                payload = result.get("payload", {})
                chunk_id = payload.get("chunk_id")
                if not chunk_id:
                    continue

                rank = result.get("rank", 99)
                rrf_score = source_weight / (rank + RRF_K)
                chunk_scores[chunk_id] += rrf_score

                if chunk_id not in chunk_data:
                    chunk_data[chunk_id] = payload

        add_source_scores(dense_results, source_weight=1.0)
        add_source_scores(identity_results, source_weight=1.0)
        add_source_scores(bm25_results, source_weight=1.0)
        add_source_scores(kg_results, source_weight=0.5)

        if not chunk_scores:
            logger.warning("Stage 5 (RRF): no chunks to fuse")
            return []

        if retrieval_mode == "C":
            chunk_scores = self._apply_diversity_bonus(chunk_scores, chunk_data)

        sorted_chunk_ids = sorted(
            chunk_scores.keys(),
            key=lambda cid: chunk_scores[cid],
            reverse=True,
        )

        top_chunk_ids = sorted_chunk_ids[:RETRIEVAL_CRAG_INPUT_CHUNKS]

        result_chunks = []
        for chunk_id in top_chunk_ids:
            payload = chunk_data[chunk_id]
            result_chunks.append(
                RetrievedChunk(
                    chunk_id=chunk_id,
                    document_id=payload.get("document_id", ""),
                    content_type=payload.get("content_type", ""),
                    chunk_type=payload.get("chunk_type", ""),
                    chunk_text=payload.get("chunk_text", ""),
                    last_verified_date=payload.get("last_verified_date", ""),
                    verified_by=payload.get("verified_by", ""),
                    cross_encoder_score=0.0,
                    rrf_score=chunk_scores[chunk_id],
                )
            )

        logger.debug(
            f"Stage 5 (RRF): {len(chunk_scores)} unique chunks fused → "
            f"top {len(result_chunks)} selected"
        )
        return result_chunks

    def _apply_diversity_bonus(
        self,
        chunk_scores: Dict[str, float],
        chunk_data: Dict[str, Dict],
    ) -> Dict[str, float]:
        """
        Mode C diversity bonus: multiplicative boost for underrepresented documents.
        Find top-2 most-represented document_ids in current ranking.
        Apply score * (1 + MODE_C_DIVERSITY_BONUS) = score * 1.15 to all chunks
        from documents NOT in the top-2.
        """
        doc_chunk_counts: Dict[str, int] = defaultdict(int)
        for chunk_id in chunk_scores:
            doc_id = chunk_data.get(chunk_id, {}).get("document_id", "")
            if doc_id:
                doc_chunk_counts[doc_id] += 1

        top_2_docs = set(
            sorted(doc_chunk_counts.keys(), key=lambda d: doc_chunk_counts[d], reverse=True)[:2]
        )

        boosted = dict(chunk_scores)
        boosted_count = 0
        for chunk_id, score in boosted.items():
            doc_id = chunk_data.get(chunk_id, {}).get("document_id", "")
            if doc_id and doc_id not in top_2_docs:
                boosted[chunk_id] = score * (1 + MODE_C_DIVERSITY_BONUS)
                boosted_count += 1

        if boosted_count > 0:
            logger.debug(f"Mode C diversity bonus: applied to {boosted_count} chunks from underrepresented docs")

        return boosted

    # ============================================================
    # ORCHESTRATION (stages 6-8 added in Session 15)
    # ============================================================

    async def retrieve(self, enriched_query: EnrichedQuery):
        """
        Main retrieval pipeline entry point.
        Runs stages 1-5 in this session. All searches use asyncio.gather.
        Stages 6-8 appended in Session 15.
        """
        logger.info(
            f"Retrieval: mode={enriched_query.retrieval_mode}, "
            f"classification={enriched_query.classification}, "
            f"entities={[e.value for e in enriched_query.entities]}"
        )

        stage1_task = self._stage1_dense(enriched_query)
        stage2_task = self._stage2_identity(enriched_query)
        stage3_task = self._stage3_bm25(enriched_query)

        results = await asyncio.gather(
            stage1_task, stage2_task, stage3_task,
            return_exceptions=True,
        )

        dense_results = results[0] if not isinstance(results[0], Exception) else []
        identity_results = results[1] if not isinstance(results[1], Exception) else []
        bm25_results = results[2] if not isinstance(results[2], Exception) else []

        if isinstance(results[0], Exception):
            logger.error(f"Stage 1 (Dense) failed: {results[0]}")
        if isinstance(results[1], Exception):
            logger.error(f"Stage 2 (Identity) failed: {results[1]}")
        if isinstance(results[2], Exception):
            logger.error(f"Stage 3 (BM25) failed: {results[2]}")

        all_prior = dense_results + identity_results + bm25_results
        kg_results = await self._stage4_knowledge_graph(enriched_query, all_prior)

        fused_candidates = self._stage5_rrf_fusion(
            retrieval_mode=enriched_query.retrieval_mode,
            dense_results=dense_results,
            identity_results=identity_results,
            bm25_results=bm25_results,
            kg_results=kg_results,
        )

        return fused_candidates


retrieval_engine = RetrievalEngine()
