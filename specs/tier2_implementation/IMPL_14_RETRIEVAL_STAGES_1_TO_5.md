# IMPL_14: RETRIEVAL ENGINE — STAGES 1 TO 5
## Registry Lookup, Qdrant Dual-Vector, OpenSearch BM25, Knowledge Graph, RRF Fusion
## Session 14 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 14: The first five stages of the Retrieval Engine.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-13 complete. Qdrant, OpenSearch, and PostgreSQL all healthy with data loaded.

**What this session creates:**
- `backend/app/services/retrieval_engine.py` — Stages 1-5 (stages 6-8 added in Session 15)
- `tests/unit/test_retrieval_engine.py` — Unit tests for RRF formula and mode routing

**RRF Formula (authoritative from AEGIS_CONFIGURATION_CONSTANTS.md):**
```
score(chunk, source) = 1 / (rank_in_source + K)    where K = 60
final_score(chunk)   = sum of score(chunk, source) across all sources
```
Mode C diversity bonus: +0.15 applied to chunks from documents NOT in the top-2 most-represented documents.

---

## FILE: backend/app/services/retrieval_engine.py (Stages 1-5)

```python
"""
AEGIS Retrieval Engine — Stages 1 through 5
Gathers, merges, and fuses candidates from multiple retrieval sources.

Stage 1: Registry lookup       — Mode A only, direct document fetch via Qdrant filter
Stage 2: Qdrant dual-vector    — Semantic search using 'content' and 'identity' vectors
Stage 3: OpenSearch BM25       — Keyword search with entity boosting (triple repetition)
Stage 4: Knowledge Graph       — Expand via PostgreSQL document_relationships edges
Stage 5: RRF Fusion            — Merge all sources using Reciprocal Rank Fusion (K=60)

Stages 6-8 (CRAG, Reranking, Hydration) added in Session 15.
"""
import logging
import asyncio
from typing import List, Optional, Dict, Tuple, Set
from collections import defaultdict

import asyncpg
import httpx

from app.config import (
    QDRANT_HOST, QDRANT_PORT,
    QDRANT_COLLECTION_ERRORS, QDRANT_COLLECTION_PROCEDURES, QDRANT_COLLECTION_CONFIGS,
    QDRANT_VECTOR_CONTENT, QDRANT_VECTOR_IDENTITY,
    QDRANT_SEARCH_LIMIT, QDRANT_HNSW_EF,
    OPENSEARCH_SEARCH_LIMIT,
    BGE_SERVICE_URL,
    RRF_K, MODE_C_DIVERSITY_BONUS,
    RETRIEVAL_CRAG_INPUT_CHUNKS, RETRIEVAL_FINAL_CHUNKS,
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
)
from app.models.retrieval import EnrichedQuery, RetrievedChunk, RegistryResult
from app.models.session import EntityObject

logger = logging.getLogger(__name__)

# Map query classification to primary Qdrant collection
CLASSIFICATION_TO_COLLECTION = {
    "ERROR_RESOLUTION": QDRANT_COLLECTION_ERRORS,
    "PROCESS": QDRANT_COLLECTION_PROCEDURES,
    "CONFIG": QDRANT_COLLECTION_CONFIGS,
    "SIMPLE_FACT": QDRANT_COLLECTION_ERRORS,  # Default to errors for simple facts
}

# All three content collections
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
        from app.infrastructure.qdrant_client import qdrant_client
        return qdrant_client

    async def _get_opensearch(self):
        from app.infrastructure.opensearch_client import opensearch_client
        return opensearch_client

    # ============================================================
    # STAGE 1: REGISTRY DIRECT FETCH (Mode A only)
    # ============================================================

    async def _stage1_registry(
        self,
        enriched_query: EnrichedQuery,
    ) -> List[Dict]:
        """
        Mode A stage 1: Fetch chunks directly from Qdrant filtered by linked_document_id.
        Uses the document_id from the RegistryResult found by QIL.
        Returns ranked list of chunk dicts.
        """
        registry = enriched_query.registry_result
        if not registry:
            return []

        document_id = registry.linked_document_id
        logger.debug(f"Stage 1 (Registry): fetching document_id={document_id}")

        try:
            qdrant = await self._get_qdrant()

            # Embed the enriched query for similarity scoring within the document
            query_vector = await self._embed_text(enriched_query.enriched_text)

            # Determine which collection holds this document
            collection = await self._find_document_collection(document_id)
            if not collection:
                logger.warning(f"Stage 1: document {document_id} not found in any collection")
                return []

            # Search within the specific document (filter by document_id)
            results = await qdrant.search_by_document_id(
                collection_name=collection,
                document_id=document_id,
                query_vector=query_vector,
            )

            logger.debug(f"Stage 1: {len(results)} chunks fetched for {document_id}")
            return [{"source": "registry", "rank": i + 1, **r} for i, r in enumerate(results)]

        except Exception as e:
            logger.error(f"Stage 1 failed: {e}")
            return []

    async def _find_document_collection(self, document_id: str) -> Optional[str]:
        """
        Determine which Qdrant collection contains a given document_id.
        Uses the document_id prefix convention (SD-ERR → errors, SD-PROC → procedures, etc.)
        """
        if "-ERR-" in document_id:
            return QDRANT_COLLECTION_ERRORS
        elif "-PROC-" in document_id:
            return QDRANT_COLLECTION_PROCEDURES
        elif "-CFG-" in document_id:
            return QDRANT_COLLECTION_CONFIGS
        # Fallback: check PostgreSQL documents_registry
        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            )
            try:
                row = await conn.fetchrow(
                    "SELECT content_type FROM documents_registry WHERE document_id = $1",
                    document_id
                )
                if row:
                    return CLASSIFICATION_TO_COLLECTION.get(
                        {"error_guide": "ERROR_RESOLUTION",
                         "procedure": "PROCESS",
                         "config": "CONFIG"}.get(row["content_type"], "SIMPLE_FACT")
                    )
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Failed to find collection for {document_id}: {e}")
        return None

    # ============================================================
    # STAGE 2: QDRANT DUAL-VECTOR SEARCH
    # ============================================================

    async def _stage2_qdrant(
        self,
        enriched_query: EnrichedQuery,
    ) -> List[Dict]:
        """
        Semantic search using two named vectors per collection:
        - 'content' vector: embedding of enriched_text (captures semantic meaning)
        - 'identity' vector: embedding of entity identity string (captures entity focus)

        For Mode C: searches all three collections in parallel.
        For Modes A/B: searches primary collection only (based on classification).
        Returns flat list of chunk dicts with source and rank.
        """
        # Build query vectors
        content_vector = await self._embed_text(enriched_query.enriched_text)
        identity_vector = await self._embed_entity_identity(enriched_query)

        # Determine which collections to search
        if enriched_query.retrieval_mode == "C":
            collections_to_search = ALL_COLLECTIONS
        else:
            primary = CLASSIFICATION_TO_COLLECTION.get(
                enriched_query.classification,
                QDRANT_COLLECTION_ERRORS
            )
            collections_to_search = [primary]

        qdrant = await self._get_qdrant()
        all_results = []

        # Search each collection concurrently
        search_tasks = []
        for collection in collections_to_search:
            # Content vector search
            search_tasks.append(
                qdrant.search_content(
                    collection_name=collection,
                    query_vector=content_vector,
                    vector_name=QDRANT_VECTOR_CONTENT,
                    limit=QDRANT_SEARCH_LIMIT,
                )
            )
            # Identity vector search
            search_tasks.append(
                qdrant.search_content(
                    collection_name=collection,
                    query_vector=identity_vector,
                    vector_name=QDRANT_VECTOR_IDENTITY,
                    limit=QDRANT_SEARCH_LIMIT,
                )
            )

        try:
            search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        except Exception as e:
            logger.error(f"Stage 2 parallel search failed: {e}")
            return []

        # Process results into ranked lists per source
        task_idx = 0
        for collection in collections_to_search:
            # Content vector results
            content_results = search_results[task_idx]
            if not isinstance(content_results, Exception):
                for rank, chunk in enumerate(content_results):
                    all_results.append({
                        "source": f"qdrant_content_{collection}",
                        "rank": rank + 1,
                        **chunk,
                    })
            task_idx += 1

            # Identity vector results
            identity_results = search_results[task_idx]
            if not isinstance(identity_results, Exception):
                for rank, chunk in enumerate(identity_results):
                    all_results.append({
                        "source": f"qdrant_identity_{collection}",
                        "rank": rank + 1,
                        **chunk,
                    })
            task_idx += 1

        logger.debug(f"Stage 2: {len(all_results)} total Qdrant results across {len(collections_to_search)} collection(s)")
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
        Build the identity string for the 'identity' vector search.
        This captures the document's entity focus rather than its semantic content.
        """
        entities = enriched_query.entities
        if not entities:
            return await self._embed_text(enriched_query.enriched_text)

        # Build identity string: "{entity_value} SAP {entity_type}"
        primary = entities[0]
        entity_context = {
            "error_code": f"{primary.value} SAP error message",
            "tcode": f"{primary.value} SAP transaction code procedure",
            "document_number": f"SAP document {primary.value}",
            "module": f"SAP {primary.value} module configuration",
        }.get(primary.type, enriched_query.enriched_text)

        return await self._embed_text(entity_context)

    # ============================================================
    # STAGE 3: OPENSEARCH BM25 SEARCH
    # ============================================================

    async def _stage3_opensearch(
        self,
        enriched_query: EnrichedQuery,
    ) -> List[Dict]:
        """
        BM25 keyword search with entity boosting.
        Entity boosting is applied at query time: entity tokens repeated 3x.
        Mode C searches without collection filter (all content types).
        """
        entities = enriched_query.entities
        entity_values = [e.value for e in entities if e.type in {"error_code", "tcode"}]

        # Determine content_type filter (None for Mode C = search everything)
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

            logger.debug(f"Stage 3: {len(results)} OpenSearch BM25 results")
            return [{"source": "opensearch_bm25", "rank": i + 1, **r} for i, r in enumerate(results)]

        except Exception as e:
            logger.error(f"Stage 3 OpenSearch failed: {e}")
            return []

    # ============================================================
    # STAGE 4: KNOWLEDGE GRAPH EXPANSION
    # ============================================================

    async def _stage4_knowledge_graph(
        self,
        enriched_query: EnrichedQuery,
        qdrant_results: List[Dict],
    ) -> List[Dict]:
        """
        Expand retrieved set using document relationship edges from PostgreSQL.
        For each unique document_id in current results, find related document_ids.
        Fetch the primary chunks of related documents (not already in result set).
        Assigns a base rank equivalent to rank 15 (KG_BASE_RANK_EQUIVALENT = 15).
        """
        from app.config import KG_BASE_RANK_EQUIVALENT

        # Collect unique document_ids from current results
        current_doc_ids: Set[str] = set()
        for r in qdrant_results:
            if r.get("payload", {}).get("document_id"):
                current_doc_ids.add(r["payload"]["document_id"])

        if not current_doc_ids:
            return []

        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            )
            try:
                # Find all related document_ids
                rows = await conn.fetch(
                    """
                    SELECT to_document_id, relationship_type
                    FROM document_relationships
                    WHERE from_document_id = ANY($1)
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

            # Fetch primary chunk from each related document
            qdrant = await self._get_qdrant()
            query_vector = await self._embed_text(enriched_query.enriched_text)
            kg_results = []

            for doc_id in list(related_doc_ids)[:5]:  # Limit to 5 related docs
                collection = await self._find_document_collection(doc_id)
                if not collection:
                    continue

                chunks = await qdrant.search_by_document_id(
                    collection_name=collection,
                    document_id=doc_id,
                    query_vector=query_vector,
                )

                if chunks:
                    # Take top chunk only, assign KG base rank
                    kg_results.append({
                        "source": "knowledge_graph",
                        "rank": KG_BASE_RANK_EQUIVALENT,
                        **chunks[0],
                    })

            logger.debug(f"Stage 4 (KG): {len(kg_results)} related document chunks added")
            return kg_results

        except Exception as e:
            logger.error(f"Stage 4 Knowledge Graph failed: {e}")
            return []

    # ============================================================
    # STAGE 5: RRF FUSION
    # ============================================================

    def _stage5_rrf_fusion(
        self,
        retrieval_mode: str,
        registry_results: List[Dict],
        qdrant_results: List[Dict],
        opensearch_results: List[Dict],
        kg_results: List[Dict],
    ) -> List[RetrievedChunk]:
        """
        Reciprocal Rank Fusion across all sources.
        Formula: score = 1 / (rank + K) where K = RRF_K (60)
        Mode C diversity bonus: +0.15 to chunks from underrepresented documents.

        Returns top RETRIEVAL_CRAG_INPUT_CHUNKS (8) chunks sorted by RRF score descending.
        """
        # Aggregate scores per chunk_id
        chunk_scores: Dict[str, float] = defaultdict(float)
        chunk_data: Dict[str, Dict] = {}  # chunk_id → payload

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

        # Mode A: registry results get 2x weight (high confidence direct match)
        if retrieval_mode == "A" and registry_results:
            add_source_scores(registry_results, source_weight=2.0)

        # All modes use Qdrant and OpenSearch
        add_source_scores(qdrant_results, source_weight=1.0)
        add_source_scores(opensearch_results, source_weight=1.0)

        # Knowledge Graph: lower weight (supporting context, not primary answer)
        add_source_scores(kg_results, source_weight=0.5)

        if not chunk_scores:
            logger.warning("Stage 5 RRF: no chunks to fuse")
            return []

        # Mode C: apply diversity bonus to underrepresented documents
        if retrieval_mode == "C":
            chunk_scores = self._apply_diversity_bonus(chunk_scores, chunk_data)

        # Sort by RRF score descending
        sorted_chunk_ids = sorted(
            chunk_scores.keys(),
            key=lambda cid: chunk_scores[cid],
            reverse=True,
        )

        # Take top RETRIEVAL_CRAG_INPUT_CHUNKS candidates (8 for CRAG + reranking)
        top_chunk_ids = sorted_chunk_ids[:RETRIEVAL_CRAG_INPUT_CHUNKS]

        # Build RetrievedChunk objects (cross_encoder_score=0 until Stage 7)
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
                    cross_encoder_score=0.0,  # Set in Stage 7
                    rrf_score=chunk_scores[chunk_id],
                )
            )

        logger.debug(
            f"Stage 5 RRF: {len(chunk_scores)} unique chunks fused → "
            f"top {len(result_chunks)} selected"
        )
        return result_chunks

    def _apply_diversity_bonus(
        self,
        chunk_scores: Dict[str, float],
        chunk_data: Dict[str, Dict],
    ) -> Dict[str, float]:
        """
        Mode C diversity bonus: boost chunks from underrepresented documents.
        Find top-2 most-represented document_ids in current ranking.
        Apply +0.15 bonus to all chunks from other documents.
        """
        # Count how many chunks each document contributes to top results
        doc_chunk_counts: Dict[str, int] = defaultdict(int)
        for chunk_id in chunk_scores:
            doc_id = chunk_data.get(chunk_id, {}).get("document_id", "")
            if doc_id:
                doc_chunk_counts[doc_id] += 1

        # Find top-2 most represented documents
        top_2_docs = set(
            sorted(doc_chunk_counts.keys(), key=lambda d: doc_chunk_counts[d], reverse=True)[:2]
        )

        # Apply diversity bonus to all other documents
        boosted = dict(chunk_scores)
        boosted_count = 0
        for chunk_id, score in boosted.items():
            doc_id = chunk_data.get(chunk_id, {}).get("document_id", "")
            if doc_id and doc_id not in top_2_docs:
                boosted[chunk_id] = score + MODE_C_DIVERSITY_BONUS
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
        Runs stages 1-5 in this session.
        Stages 6-8 appended in Session 15.
        """
        logger.info(
            f"Retrieval: mode={enriched_query.retrieval_mode}, "
            f"classification={enriched_query.classification}, "
            f"entities={[e.value for e in enriched_query.entities]}"
        )

        # Stage 1: Registry (Mode A only)
        registry_chunks = []
        if enriched_query.retrieval_mode == "A":
            registry_chunks = await self._stage1_registry(enriched_query)

        # Stages 2-4 run in parallel where possible
        stage2_task = asyncio.create_task(self._stage2_qdrant(enriched_query))
        stage3_task = asyncio.create_task(self._stage3_opensearch(enriched_query))

        qdrant_results, opensearch_results = await asyncio.gather(
            stage2_task, stage3_task, return_exceptions=True
        )

        if isinstance(qdrant_results, Exception):
            logger.error(f"Stage 2 failed: {qdrant_results}")
            qdrant_results = []
        if isinstance(opensearch_results, Exception):
            logger.error(f"Stage 3 failed: {opensearch_results}")
            opensearch_results = []

        # Stage 4: KG expansion (uses qdrant_results to know which docs are already found)
        kg_results = await self._stage4_knowledge_graph(enriched_query, qdrant_results)

        # Stage 5: RRF Fusion
        fused_candidates = self._stage5_rrf_fusion(
            retrieval_mode=enriched_query.retrieval_mode,
            registry_results=registry_chunks,
            qdrant_results=qdrant_results,
            opensearch_results=opensearch_results,
            kg_results=kg_results,
        )

        # Stages 6-8 appended in Session 15
        return fused_candidates  # Temporary return — replaced in Session 15


# Singleton instance
retrieval_engine = RetrievalEngine()
```

---

## FILE 2: tests/unit/test_retrieval_engine.py (Stages 1-5)

```python
"""Unit tests for Retrieval Engine stages 1-5."""
import pytest
from collections import defaultdict
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.retrieval_engine import RetrievalEngine
from app.models.retrieval import EnrichedQuery, RegistryResult, RetrievedChunk
from app.models.session import EntityObject
from app.config import RRF_K, MODE_C_DIVERSITY_BONUS


@pytest.fixture
def engine():
    return RetrievalEngine()


@pytest.fixture
def mode_b_query():
    return EnrichedQuery(
        raw_message="VL150 error in delivery creation",
        enriched_text="VL150 error in delivery creation VL150 VL150 VL150 outbound delivery VL01N",
        entities=[EntityObject(type="error_code", value="VL150")],
        context_entity=None,
        retrieval_mode="B",
        classification="ERROR_RESOLUTION",
        registry_result=None,
        session_id="test-session",
        trace_id="test-trace",
    )


@pytest.fixture
def mode_a_query():
    return EnrichedQuery(
        raw_message="VL150 error in delivery creation",
        enriched_text="VL150 error in delivery creation",
        entities=[EntityObject(type="error_code", value="VL150")],
        context_entity=None,
        retrieval_mode="A",
        classification="ERROR_RESOLUTION",
        registry_result=RegistryResult(
            pattern_string="VL150",
            pattern_type="error_code",
            linked_document_id="SD-ERR-001",
            linked_chunk_type="cause_resolution",
            registry_notes="VL150 is the material availability check error for outbound delivery.",
        ),
        session_id="test-session",
        trace_id="test-trace",
    )


@pytest.fixture
def mode_c_query():
    return EnrichedQuery(
        raw_message="Compare how FI and SD handle account determination for billing documents",
        enriched_text="Compare how FI and SD handle account determination for billing documents",
        entities=[
            EntityObject(type="module", value="FI"),
            EntityObject(type="module", value="SD"),
        ],
        context_entity=None,
        retrieval_mode="C",
        classification="CONFIG",
        registry_result=None,
        session_id="test-session",
        trace_id="test-trace",
    )


class TestDocumentCollectionMapping:
    def test_error_doc_maps_to_errors_collection(self, engine):
        import asyncio
        result = asyncio.run(engine._find_document_collection("SD-ERR-001"))
        from app.config import QDRANT_COLLECTION_ERRORS
        assert result == QDRANT_COLLECTION_ERRORS

    def test_proc_doc_maps_to_procedures_collection(self, engine):
        import asyncio
        result = asyncio.run(engine._find_document_collection("SD-PROC-001"))
        from app.config import QDRANT_COLLECTION_PROCEDURES
        assert result == QDRANT_COLLECTION_PROCEDURES

    def test_cfg_doc_maps_to_configs_collection(self, engine):
        import asyncio
        result = asyncio.run(engine._find_document_collection("FI-CFG-003"))
        from app.config import QDRANT_COLLECTION_CONFIGS
        assert result == QDRANT_COLLECTION_CONFIGS


class TestRRFFusion:
    def _make_chunks(self, chunk_ids_and_payloads):
        """Helper to create chunk dicts for RRF testing."""
        return [
            {
                "source": "qdrant_content",
                "rank": i + 1,
                "payload": {"chunk_id": cid, "document_id": doc_id, "chunk_text": "test"},
            }
            for i, (cid, doc_id) in enumerate(chunk_ids_and_payloads)
        ]

    def test_rrf_formula_correct(self, engine):
        """Score = 1/(rank + K). Rank 1 with K=60 → 1/61 ≈ 0.01639"""
        chunks = self._make_chunks([("SD-ERR-001:chunk:0", "SD-ERR-001")])
        result = engine._stage5_rrf_fusion("B", [], chunks, [], [])
        assert len(result) == 1
        expected_score = 1 / (1 + RRF_K)
        assert abs(result[0].rrf_score - expected_score) < 0.0001

    def test_higher_rank_scores_more(self, engine):
        """Rank 1 chunk should score higher than rank 5 chunk."""
        chunks = self._make_chunks([
            ("SD-ERR-001:chunk:0", "SD-ERR-001"),  # rank 1
            ("SD-ERR-001:chunk:1", "SD-ERR-001"),  # rank 2
            ("SD-ERR-002:chunk:0", "SD-ERR-002"),  # rank 3 in another source
        ])
        result = engine._stage5_rrf_fusion("B", [], chunks, [], [])
        assert result[0].rrf_score >= result[-1].rrf_score

    def test_multi_source_scores_accumulate(self, engine):
        """Chunk appearing in both Qdrant and OpenSearch gets combined score."""
        qdrant_chunks = self._make_chunks([("chunk-A", "SD-ERR-001")])  # rank 1
        opensearch_chunks = self._make_chunks([("chunk-A", "SD-ERR-001")])  # rank 1

        result_both = engine._stage5_rrf_fusion("B", [], qdrant_chunks, opensearch_chunks, [])
        result_one = engine._stage5_rrf_fusion("B", [], qdrant_chunks, [], [])

        assert result_both[0].rrf_score > result_one[0].rrf_score

    def test_mode_a_registry_gets_double_weight(self, engine):
        """Mode A registry chunks get 2x weight in RRF."""
        registry = self._make_chunks([("chunk-REG", "SD-ERR-001")])
        regular = self._make_chunks([("chunk-REG", "SD-ERR-001")])  # Same chunk for comparison

        result_with_registry = engine._stage5_rrf_fusion("A", registry, [], [], [])
        result_without_registry = engine._stage5_rrf_fusion("B", [], regular, [], [])

        assert result_with_registry[0].rrf_score > result_without_registry[0].rrf_score

    def test_returns_max_crag_input_chunks(self, engine):
        """Should return at most RETRIEVAL_CRAG_INPUT_CHUNKS (8) results."""
        from app.config import RETRIEVAL_CRAG_INPUT_CHUNKS
        many_chunks = self._make_chunks(
            [(f"chunk-{i}", f"doc-{i}") for i in range(20)]
        )
        result = engine._stage5_rrf_fusion("B", [], many_chunks, [], [])
        assert len(result) <= RETRIEVAL_CRAG_INPUT_CHUNKS

    def test_empty_sources_returns_empty(self, engine):
        result = engine._stage5_rrf_fusion("B", [], [], [], [])
        assert result == []


class TestModeCDiversityBonus:
    def test_diversity_bonus_applied(self, engine):
        """Chunks from underrepresented documents get +0.15 bonus."""
        # 4 chunks from doc A, 1 chunk from doc B
        chunk_scores = {
            "A:chunk:0": 0.050, "A:chunk:1": 0.045,
            "A:chunk:2": 0.040, "A:chunk:3": 0.035,
            "B:chunk:0": 0.030,  # This should get boosted
        }
        chunk_data = {
            "A:chunk:0": {"document_id": "DOC-A"},
            "A:chunk:1": {"document_id": "DOC-A"},
            "A:chunk:2": {"document_id": "DOC-A"},
            "A:chunk:3": {"document_id": "DOC-A"},
            "B:chunk:0": {"document_id": "DOC-B"},
        }

        boosted = engine._apply_diversity_bonus(chunk_scores, chunk_data)

        # DOC-A is the top document → no bonus
        assert boosted["A:chunk:0"] == 0.050
        # DOC-B is underrepresented → gets bonus
        assert abs(boosted["B:chunk:0"] - (0.030 + MODE_C_DIVERSITY_BONUS)) < 0.0001

    def test_top_2_docs_not_boosted(self, engine):
        """Top-2 documents should NOT receive diversity bonus."""
        chunk_scores = {
            "A:chunk:0": 0.050, "B:chunk:0": 0.040, "C:chunk:0": 0.030
        }
        chunk_data = {
            "A:chunk:0": {"document_id": "DOC-A"},
            "B:chunk:0": {"document_id": "DOC-B"},  # Top-2 → no bonus
            "C:chunk:0": {"document_id": "DOC-C"},  # Not top-2 → bonus
        }

        boosted = engine._apply_diversity_bonus(chunk_scores, chunk_data)

        assert boosted["A:chunk:0"] == 0.050  # Top 1 → no bonus
        assert boosted["B:chunk:0"] == 0.040  # Top 2 → no bonus
        assert abs(boosted["C:chunk:0"] - (0.030 + MODE_C_DIVERSITY_BONUS)) < 0.0001
```

---

## VERIFICATION STEPS

### Step 1: Run unit tests
```bash
cd backend && source venv/bin/activate
python -m pytest tests/unit/test_retrieval_engine.py -v
```
Expected: All tests pass.

### Step 2: Verify RRF formula manually
```bash
python3 -c "
K = 60
# Rank 1 should score ~0.01639
rank1_score = 1 / (1 + K)
# Rank 5 should score ~0.01538
rank5_score = 1 / (5 + K)
print(f'Rank 1: {rank1_score:.5f}')
print(f'Rank 5: {rank5_score:.5f}')
print(f'Rank 1 scores more: {rank1_score > rank5_score}')

# A chunk appearing in both Qdrant (rank 1) and OpenSearch (rank 1)
combined = rank1_score + rank1_score
single = rank1_score
print(f'Combined (both sources): {combined:.5f}')
print(f'Combined > single source: {combined > single}')
"
```

### Step 3: Verify classification-to-collection mapping
```bash
python3 -c "
from app.services.retrieval_engine import CLASSIFICATION_TO_COLLECTION, ALL_COLLECTIONS
print('Classification mapping:')
for cls, col in CLASSIFICATION_TO_COLLECTION.items():
    print(f'  {cls} → {col}')
print('All collections:', ALL_COLLECTIONS)
"
```

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-14: Retrieval stages 1-5 - RRF fusion and diversity bonus verified"
```

Update DECISIONS_LOG.md with:
- All RRF formula tests passing
- Diversity bonus correctly applied to underrepresented documents
- Collection routing by classification confirmed
- Knowledge Graph PostgreSQL query confirmed

---

*Document version: 1.0 | AEGIS Specification Set*
