"""Unit tests for Retrieval Engine stages 1-5."""
import pytest
from collections import defaultdict
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.retrieval_engine import RetrievalEngine
from app.models.retrieval import EnrichedQuery, RegistryResult, RetrievedChunk
from app.models.session import EntityObject
from app.config import RRF_K, MODE_C_DIVERSITY_BONUS, RETRIEVAL_CRAG_INPUT_CHUNKS


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
        query_embedding=[0.1] * 768,
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
        query_embedding=[0.1] * 768,
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
        query_embedding=[0.2] * 768,
    )


class TestDocumentCollectionMapping:
    def test_error_doc_maps_to_errors_collection(self, engine):
        from app.config import QDRANT_COLLECTION_ERRORS
        result = engine._find_document_collection_sync("SD-ERR-001")
        assert result == QDRANT_COLLECTION_ERRORS

    def test_proc_doc_maps_to_procedures_collection(self, engine):
        from app.config import QDRANT_COLLECTION_PROCEDURES
        result = engine._find_document_collection_sync("SD-PROC-001")
        assert result == QDRANT_COLLECTION_PROCEDURES

    def test_cfg_doc_maps_to_configs_collection(self, engine):
        from app.config import QDRANT_COLLECTION_CONFIGS
        result = engine._find_document_collection_sync("FI-CFG-003")
        assert result == QDRANT_COLLECTION_CONFIGS

    def test_unknown_prefix_returns_none(self, engine):
        result = engine._find_document_collection_sync("UNKNOWN-DOC-001")
        assert result is None


class TestRRFFusion:
    def _make_chunks(self, chunk_ids_and_payloads):
        """Helper to create chunk dicts for RRF testing."""
        return [
            {
                "source": "dense_meridian_errors",
                "rank": i + 1,
                "payload": {"chunk_id": cid, "document_id": doc_id, "chunk_text": "test"},
            }
            for i, (cid, doc_id) in enumerate(chunk_ids_and_payloads)
        ]

    def test_rrf_formula_correct(self, engine):
        """Score = 1/(rank + K). Rank 1 with K=60 → 1/61 ≈ 0.01639"""
        chunks = self._make_chunks([("SD-ERR-001:chunk:0", "SD-ERR-001")])
        result = engine._stage5_rrf_fusion("B", chunks, [], [], [])
        assert len(result) == 1
        expected_score = 1 / (1 + RRF_K)
        assert abs(result[0].rrf_score - expected_score) < 0.0001

    def test_higher_rank_scores_more(self, engine):
        """Rank 1 chunk should score higher than rank 5 chunk."""
        chunks = self._make_chunks([
            ("SD-ERR-001:chunk:0", "SD-ERR-001"),
            ("SD-ERR-001:chunk:1", "SD-ERR-001"),
            ("SD-ERR-002:chunk:0", "SD-ERR-002"),
        ])
        result = engine._stage5_rrf_fusion("B", chunks, [], [], [])
        assert result[0].rrf_score >= result[-1].rrf_score

    def test_multi_source_scores_accumulate(self, engine):
        """Chunk appearing in both dense and BM25 gets combined score."""
        dense_chunks = self._make_chunks([("chunk-A", "SD-ERR-001")])
        bm25_chunks = self._make_chunks([("chunk-A", "SD-ERR-001")])

        result_both = engine._stage5_rrf_fusion("B", dense_chunks, [], bm25_chunks, [])
        result_one = engine._stage5_rrf_fusion("B", dense_chunks, [], [], [])

        assert result_both[0].rrf_score > result_one[0].rrf_score

    def test_four_source_accumulation(self, engine):
        """Chunk appearing in all 4 lists scores higher than in 1 list."""
        chunk = [("chunk-X", "SD-ERR-001")]
        dense = self._make_chunks(chunk)
        identity = self._make_chunks(chunk)
        bm25 = self._make_chunks(chunk)
        kg = self._make_chunks(chunk)

        result_all_4 = engine._stage5_rrf_fusion("B", dense, identity, bm25, kg)
        result_one = engine._stage5_rrf_fusion("B", dense, [], [], [])

        assert result_all_4[0].rrf_score > result_one[0].rrf_score

    def test_kg_gets_half_weight(self, engine):
        """KG source has weight 0.5 — lower contribution than dense (1.0)."""
        chunk = [("chunk-K", "SD-ERR-001")]
        kg_only = self._make_chunks(chunk)
        dense_only = self._make_chunks(chunk)

        result_kg = engine._stage5_rrf_fusion("B", [], [], [], kg_only)
        result_dense = engine._stage5_rrf_fusion("B", dense_only, [], [], [])

        assert result_dense[0].rrf_score > result_kg[0].rrf_score
        expected_ratio = 0.5
        assert abs(result_kg[0].rrf_score / result_dense[0].rrf_score - expected_ratio) < 0.001

    def test_returns_max_crag_input_chunks(self, engine):
        """Should return at most RETRIEVAL_CRAG_INPUT_CHUNKS (8) results."""
        many_chunks = self._make_chunks(
            [(f"chunk-{i}", f"doc-{i}") for i in range(20)]
        )
        result = engine._stage5_rrf_fusion("B", many_chunks, [], [], [])
        assert len(result) <= RETRIEVAL_CRAG_INPUT_CHUNKS

    def test_empty_sources_returns_empty(self, engine):
        result = engine._stage5_rrf_fusion("B", [], [], [], [])
        assert result == []

    def test_cross_encoder_score_initialized_zero(self, engine):
        """Cross-encoder score should be 0.0 (set in Stage 7, Session 15)."""
        chunks = self._make_chunks([("chunk-Z", "SD-ERR-001")])
        result = engine._stage5_rrf_fusion("B", chunks, [], [], [])
        assert result[0].cross_encoder_score == 0.0


class TestModeCDiversityBonus:
    def test_diversity_bonus_multiplicative(self, engine):
        """Chunks from underrepresented documents get score * 1.15 (multiplicative)."""
        chunk_scores = {
            "A:chunk:0": 0.050, "A:chunk:1": 0.045,
            "A:chunk:2": 0.040, "A:chunk:3": 0.035,
            "B:chunk:0": 0.032, "B:chunk:1": 0.031,
            "C:chunk:0": 0.030,
        }
        chunk_data = {
            "A:chunk:0": {"document_id": "DOC-A"},
            "A:chunk:1": {"document_id": "DOC-A"},
            "A:chunk:2": {"document_id": "DOC-A"},
            "A:chunk:3": {"document_id": "DOC-A"},
            "B:chunk:0": {"document_id": "DOC-B"},
            "B:chunk:1": {"document_id": "DOC-B"},
            "C:chunk:0": {"document_id": "DOC-C"},
        }

        boosted = engine._apply_diversity_bonus(chunk_scores, chunk_data)

        assert boosted["A:chunk:0"] == 0.050
        assert boosted["B:chunk:0"] == 0.032
        expected_boosted = 0.030 * (1 + MODE_C_DIVERSITY_BONUS)
        assert abs(boosted["C:chunk:0"] - expected_boosted) < 0.0001

    def test_top_2_docs_not_boosted(self, engine):
        """Top-2 documents should NOT receive diversity bonus."""
        chunk_scores = {
            "A:chunk:0": 0.050, "B:chunk:0": 0.040, "C:chunk:0": 0.030
        }
        chunk_data = {
            "A:chunk:0": {"document_id": "DOC-A"},
            "B:chunk:0": {"document_id": "DOC-B"},
            "C:chunk:0": {"document_id": "DOC-C"},
        }

        boosted = engine._apply_diversity_bonus(chunk_scores, chunk_data)

        assert boosted["A:chunk:0"] == 0.050
        assert boosted["B:chunk:0"] == 0.040
        expected_boosted = 0.030 * (1 + MODE_C_DIVERSITY_BONUS)
        assert abs(boosted["C:chunk:0"] - expected_boosted) < 0.0001

    def test_diversity_bonus_not_applied_in_mode_b(self, engine):
        """Diversity bonus should NOT be applied in Mode B."""
        chunks = [
            {"source": "dense", "rank": 1, "payload": {"chunk_id": "c1", "document_id": "D1", "chunk_text": "t"}},
            {"source": "dense", "rank": 2, "payload": {"chunk_id": "c2", "document_id": "D1", "chunk_text": "t"}},
            {"source": "dense", "rank": 3, "payload": {"chunk_id": "c3", "document_id": "D2", "chunk_text": "t"}},
            {"source": "dense", "rank": 4, "payload": {"chunk_id": "c4", "document_id": "D2", "chunk_text": "t"}},
            {"source": "dense", "rank": 5, "payload": {"chunk_id": "c5", "document_id": "D3", "chunk_text": "t"}},
        ]
        result_b = engine._stage5_rrf_fusion("B", chunks, [], [], [])
        result_c = engine._stage5_rrf_fusion("C", chunks, [], [], [])

        b_score_c5 = next(r for r in result_b if r.chunk_id == "c5").rrf_score
        c_score_c5 = next(r for r in result_c if r.chunk_id == "c5").rrf_score
        assert c_score_c5 > b_score_c5

    def test_diversity_bonus_is_multiplicative_not_additive(self, engine):
        """Verify bonus is score * 1.15, NOT score + 0.15."""
        chunk_scores = {
            "a:0": 0.050, "a:1": 0.045,
            "b:0": 0.040, "b:1": 0.038,
            "x:0": 0.010,
        }
        chunk_data = {
            "a:0": {"document_id": "DOC-A"},
            "a:1": {"document_id": "DOC-A"},
            "b:0": {"document_id": "DOC-B"},
            "b:1": {"document_id": "DOC-B"},
            "x:0": {"document_id": "DOC-X"},
        }

        boosted = engine._apply_diversity_bonus(chunk_scores, chunk_data)

        multiplicative = 0.010 * (1 + MODE_C_DIVERSITY_BONUS)
        additive = 0.010 + MODE_C_DIVERSITY_BONUS
        assert abs(boosted["x:0"] - multiplicative) < 0.0001
        assert abs(boosted["x:0"] - additive) > 0.01


class TestClassificationRouting:
    def test_error_routes_to_errors_collection(self):
        from app.services.retrieval_engine import CLASSIFICATION_TO_COLLECTION, QDRANT_COLLECTION_ERRORS
        assert CLASSIFICATION_TO_COLLECTION["ERROR_RESOLUTION"] == QDRANT_COLLECTION_ERRORS

    def test_process_routes_to_procedures_collection(self):
        from app.services.retrieval_engine import CLASSIFICATION_TO_COLLECTION, QDRANT_COLLECTION_PROCEDURES
        assert CLASSIFICATION_TO_COLLECTION["PROCESS"] == QDRANT_COLLECTION_PROCEDURES

    def test_config_routes_to_configs_collection(self):
        from app.services.retrieval_engine import CLASSIFICATION_TO_COLLECTION, QDRANT_COLLECTION_CONFIGS
        assert CLASSIFICATION_TO_COLLECTION["CONFIG"] == QDRANT_COLLECTION_CONFIGS

    def test_simple_fact_defaults_to_errors(self):
        from app.services.retrieval_engine import CLASSIFICATION_TO_COLLECTION, QDRANT_COLLECTION_ERRORS
        assert CLASSIFICATION_TO_COLLECTION["SIMPLE_FACT"] == QDRANT_COLLECTION_ERRORS

    def test_all_collections_has_three(self):
        from app.services.retrieval_engine import ALL_COLLECTIONS
        assert len(ALL_COLLECTIONS) == 3
