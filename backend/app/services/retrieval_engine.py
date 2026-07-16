"""
AEGIS Retrieval Engine — Stages 1 through 8
Gathers, merges, fuses, reranks, and validates candidates from multiple retrieval sources.

Stage 1: Dense vector search    — Qdrant "content" vector, top_k=10 per collection
Stage 2: Identity vector search — Qdrant "identity" vector, entity fingerprint embedding
Stage 3: BM25 keyword search    — OpenSearch with entity boosting (3x repetition)
Stage 4: Knowledge Graph        — Single-hop SQL JOIN via document_relationships
Stage 5: RRF Fusion             — Merge all sources using Reciprocal Rank Fusion (K=60)
Stage 6: CRAG Self-Reflection   — Assess whether retrieved chunks are sufficient (runs AFTER Stage 7)
Stage 7: Cross-Encoder Reranking — Score query-chunk pairs, keep top 5
Stage 8: Parent Header Hydration — Fetch document header if not already in top 5

Pipeline execution order: 1 → 2+3 (parallel) → 4 → 5 → 7 → 6 → 8
Stage 7 runs before Stage 6 because CRAG skip logic needs the top cross-encoder score.
"""
import json
import logging
import asyncio
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Set, Tuple
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
    # STAGE 6: CRAG SELF-REFLECTION
    # Must run AFTER Stage 7 (cross-encoder) to know the top score.
    # ============================================================

    async def _stage6_crag(
        self,
        enriched_query: EnrichedQuery,
        chunks: List[RetrievedChunk],
        top_cross_encoder_score: float,
    ) -> Tuple[str, Optional[str]]:
        """
        CRAG self-reflection: assess whether retrieved chunks are sufficient.

        Skip conditions:
          Mode A AND score > CRAG_SKIP_THRESHOLD_MODE_A (0.82) → SKIP
          Mode B AND score > CRAG_SKIP_THRESHOLD_MODE_B (0.80) → SKIP
          Mode C → ALWAYS run (never skip regardless of score)

        Returns (assessment, gap_description):
          assessment: "SUFFICIENT" | "INSUFFICIENT" | "SKIPPED"
          gap_description: populated only when INSUFFICIENT, else None
        """
        from app.config import (
            CRAG_SKIP_THRESHOLD_MODE_A,
            CRAG_SKIP_THRESHOLD_MODE_B,
            CRAG_MAX_TOKENS,
            JUDGE_TEMPERATURE,
        )
        from app.services.model_gateway import model_gateway

        mode = enriched_query.retrieval_mode

        if mode == "A" and top_cross_encoder_score > CRAG_SKIP_THRESHOLD_MODE_A:
            logger.debug(
                f"CRAG SKIP: Mode A, score {top_cross_encoder_score:.4f} > {CRAG_SKIP_THRESHOLD_MODE_A}"
            )
            return "SKIPPED", None

        if mode == "B" and top_cross_encoder_score > CRAG_SKIP_THRESHOLD_MODE_B:
            logger.debug(
                f"CRAG SKIP: Mode B, score {top_cross_encoder_score:.4f} > {CRAG_SKIP_THRESHOLD_MODE_B}"
            )
            return "SKIPPED", None

        if mode == "C":
            logger.debug("CRAG RUNNING: Mode C always runs CRAG")
        else:
            logger.debug(
                f"CRAG RUNNING: Mode {mode}, score {top_cross_encoder_score:.4f} below threshold"
            )

        context_blocks = []
        for i, chunk in enumerate(chunks[:RETRIEVAL_CRAG_INPUT_CHUNKS]):
            context_blocks.append(
                f"[Chunk {i + 1} — {chunk.document_id} ({chunk.chunk_type})]\n"
                f"{chunk.chunk_text[:500]}"
            )
        context_text = "\n\n".join(context_blocks)

        crag_prompt = (
            f"You are evaluating whether SAP documentation is sufficient to answer an employee question.\n\n"
            f"Employee Question: {enriched_query.raw_message}\n\n"
            f"Retrieved SAP Documentation:\n{context_text}\n\n"
            f"Task: Assess whether the documentation above contains enough specific information to give a "
            f"complete, accurate answer to this exact question.\n\n"
            f"Respond with EXACTLY one of these two formats:\n"
            f"- If sufficient: SUFFICIENT\n"
            f"- If insufficient: INSUFFICIENT: [one sentence describing what specific information is missing]\n\n"
            f"Your assessment:"
        )

        try:
            model_response = await model_gateway.call_judge(
                crag_prompt, max_tokens=CRAG_MAX_TOKENS, temperature=JUDGE_TEMPERATURE
            )

            if model_response.upper().startswith("SUFFICIENT"):
                return "SUFFICIENT", None
            elif model_response.upper().startswith("INSUFFICIENT"):
                parts = model_response.split(":", 1)
                gap_description = parts[1].strip() if len(parts) > 1 else "Knowledge base gap detected"
                logger.info(f"CRAG INSUFFICIENT: {gap_description[:100]}")
                return "INSUFFICIENT", gap_description
            else:
                logger.warning(f"CRAG response ambiguous: '{model_response[:50]}' — defaulting to SUFFICIENT")
                return "SUFFICIENT", None

        except Exception as e:
            logger.error(f"CRAG model call failed: {e} — defaulting to SUFFICIENT")
            return "SUFFICIENT", None

    # ============================================================
    # STAGE 7: CROSS-ENCODER RERANKING
    # Runs on top RETRIEVAL_CRAG_INPUT_CHUNKS (8) candidates from RRF.
    # Returns top RETRIEVAL_FINAL_CHUNKS (5) chunks sorted by score.
    # ============================================================

    async def _stage7_rerank(
        self,
        enriched_query: EnrichedQuery,
        candidates: List[RetrievedChunk],
    ) -> Tuple[List[RetrievedChunk], float]:
        """
        Cross-encoder reranking using ms-marco-MiniLM-L-12-v2 via aegis-deberta:8001/rerank.
        Scores (query, passage) pairs and returns top RETRIEVAL_FINAL_CHUNKS (5) chunks.

        Returns (reranked_chunks, top_cross_encoder_score).
        On failure: returns original RRF order (first 5), all scores 0.0 — non-blocking.
        """
        from app.config import DEBERTA_SERVICE_URL, RETRIEVAL_FINAL_CHUNKS

        if not candidates:
            return [], 0.0

        passages = [chunk.chunk_text[:512] for chunk in candidates]
        query_text = enriched_query.enriched_text[:200]

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{DEBERTA_SERVICE_URL}/rerank",
                    json={
                        "query": query_text,
                        "passages": passages,
                    },
                )
                resp.raise_for_status()
                scores = resp.json()["scores"]

        except Exception as e:
            logger.error(f"Stage 7 reranking failed: {e} — returning original RRF order")
            top_chunks = candidates[:RETRIEVAL_FINAL_CHUNKS]
            for chunk in top_chunks:
                chunk.cross_encoder_score = 0.0
            return top_chunks, 0.0

        for chunk, score in zip(candidates, scores):
            chunk.cross_encoder_score = score

        ranked = sorted(candidates, key=lambda c: c.cross_encoder_score, reverse=True)
        top_chunks = ranked[:RETRIEVAL_FINAL_CHUNKS]
        top_score = top_chunks[0].cross_encoder_score if top_chunks else 0.0

        logger.debug(
            f"Stage 7 reranking: top score={top_score:.4f}, "
            f"kept {len(top_chunks)} of {len(candidates)} chunks"
        )
        return top_chunks, top_score

    # ============================================================
    # STAGE 8: PARENT HEADER HYDRATION
    # ============================================================

    async def _stage8_hydration(
        self,
        chunks: List[RetrievedChunk],
    ) -> Optional[object]:
        """
        Ensure the parent header chunk is available for the primary retrieved document.
        Queries Qdrant for a header chunk if none is already present in the top 5.

        Returns a ParentHeader object, or None if header is already present or not found.
        """
        from app.models.retrieval import ParentHeader

        if not chunks:
            return None

        HEADER_CHUNK_TYPES = {
            "header", "procedure_header", "config_overview",
            "error_header", "proc_header", "cfg_header",
        }

        for chunk in chunks:
            if chunk.chunk_type in HEADER_CHUNK_TYPES:
                logger.debug("Stage 8: header chunk already in top results — no hydration needed")
                return None

        primary_doc_id = chunks[0].document_id
        if not primary_doc_id:
            return None

        try:
            qdrant = await self._get_qdrant()
            collection = self._find_document_collection_sync(primary_doc_id)
            if not collection:
                return None

            dummy_vector = [0.0] * 768
            all_doc_chunks = await qdrant.search_by_document_id(
                collection_name=collection,
                document_id=primary_doc_id,
                query_vector=dummy_vector,
                chunk_types=list(HEADER_CHUNK_TYPES),
            )

            if not all_doc_chunks:
                logger.debug(f"Stage 8: no header chunk found for {primary_doc_id}")
                return None

            header_payload = all_doc_chunks[0]["payload"]

            parent = ParentHeader(
                document_id=primary_doc_id,
                content_type=header_payload.get("content_type", ""),
                error_code=header_payload.get("error_code"),
                configuration_name=header_payload.get("configuration_name"),
                procedure_name=header_payload.get("procedure_name"),
                module=header_payload.get("module", ""),
                transactions=header_payload.get("transactions", []),
                last_verified_date=header_payload.get("last_verified_date", ""),
                verified_by=header_payload.get("verified_by", ""),
            )

            logger.debug(f"Stage 8: parent header hydrated for {primary_doc_id}")
            return parent

        except Exception as e:
            logger.error(f"Stage 8 hydration failed: {e}")
            return None

    # ============================================================
    # COMPLETE 8-STAGE retrieve() (replaces temporary Session 14 stub)
    # Pipeline execution order: 1 → 2+3 (parallel) → 4 → 5 → 7 → 6 → 8
    # ============================================================

    async def retrieve(self, enriched_query: EnrichedQuery):
        """
        Complete 8-stage retrieval pipeline.

        Execution order:
          1. Dense vector search         — Qdrant "content" vector
          2+3. Identity + BM25           — Qdrant "identity" + OpenSearch (parallel)
          4. Knowledge Graph             — single-hop SQL via document_relationships
          5. RRF Fusion                  — merge all sources (k=60)
          7. Cross-Encoder Reranking     — score query-chunk pairs, keep top 5
          6. CRAG Self-Reflection        — assess sufficiency (needs top score from Stage 7)
          8. Parent Header Hydration     — fetch document header if missing from top 5

        Note: Stage 7 runs before Stage 6 — CRAG skip logic requires the cross-encoder score.
        """
        from app.models.retrieval import RetrievalResult

        logger.info(
            f"Retrieval pipeline: session={enriched_query.session_id}, "
            f"mode={enriched_query.retrieval_mode}, "
            f"classification={enriched_query.classification}"
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

        if not fused_candidates:
            logger.warning("Retrieval pipeline: no candidates after RRF fusion")
            return RetrievalResult(
                chunks=[],
                parent_header=None,
                registry_notes="",
                crag_assessment="INSUFFICIENT",
                crag_gap_description="No documentation found for this query.",
                retrieval_mode_used=enriched_query.retrieval_mode,
                top_cross_encoder_score=0.0,
            )

        # Stage 7: Reranking FIRST (provides top_cross_encoder_score for CRAG skip decision)
        reranked_chunks, top_cross_encoder_score = await self._stage7_rerank(
            enriched_query, fused_candidates
        )

        # Stage 6: CRAG self-reflection (uses top_cross_encoder_score from Stage 7)
        crag_assessment, crag_gap_description = await self._stage6_crag(
            enriched_query, reranked_chunks, top_cross_encoder_score
        )

        if crag_assessment == "INSUFFICIENT":
            from app.infrastructure.redis_client import redis_queue
            gap_payload = json.dumps({
                "task_type": "knowledge_gap",
                "task_id": str(uuid.uuid4()),
                "session_id": enriched_query.session_id,
                "query_text": enriched_query.raw_message,
                "extracted_entities": [
                    {"type": e.type, "value": e.value}
                    for e in enriched_query.entities
                ],
                "gap_description": crag_gap_description or "CRAG assessment: INSUFFICIENT",
                "occurred_at": datetime.utcnow().isoformat(),
            })
            try:
                await redis_queue.redis.rpush("arq:queue:knowledge_gap", gap_payload)
            except Exception as e:
                logger.error(f"Failed to queue knowledge gap task: {e}")

        # Stage 8: Parent header hydration
        parent_header = await self._stage8_hydration(reranked_chunks)

        registry_notes = ""
        if enriched_query.registry_result:
            registry_notes = enriched_query.registry_result.registry_notes

        result = RetrievalResult(
            chunks=reranked_chunks,
            parent_header=parent_header,
            registry_notes=registry_notes,
            crag_assessment=crag_assessment,
            crag_gap_description=crag_gap_description,
            retrieval_mode_used=enriched_query.retrieval_mode,
            top_cross_encoder_score=top_cross_encoder_score,
        )

        logger.info(
            f"Retrieval complete: {len(reranked_chunks)} chunks, "
            f"CRAG={crag_assessment}, top_score={top_cross_encoder_score:.4f}"
        )
        return result


retrieval_engine = RetrievalEngine()
