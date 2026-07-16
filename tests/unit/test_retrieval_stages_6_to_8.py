"""Unit tests for Retrieval Engine stages 6-8: CRAG, reranking, and hydration."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.retrieval_engine import RetrievalEngine
from app.models.retrieval import EnrichedQuery, RetrievedChunk
from app.models.session import EntityObject
from app.config import (
    CRAG_SKIP_THRESHOLD_MODE_A,
    CRAG_SKIP_THRESHOLD_MODE_B,
    RETRIEVAL_FINAL_CHUNKS,
)


@pytest.fixture
def engine():
    return RetrievalEngine()


def make_chunk(chunk_id, doc_id, score=0.0, chunk_type="cause_resolution"):
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id=doc_id,
        content_type="error_guide",
        chunk_type=chunk_type,
        chunk_text=f"SAP documentation for {chunk_id}",
        last_verified_date="2024-03-28",
        verified_by="rsarkar1",
        cross_encoder_score=score,
        rrf_score=0.05,
    )


def make_query(mode="B", classification="ERROR_RESOLUTION"):
    return EnrichedQuery(
        raw_message="VL150 error when creating delivery",
        enriched_text="VL150 error when creating delivery VL150 VL150 VL150",
        entities=[EntityObject(type="error_code", value="VL150")],
        context_entity=None,
        retrieval_mode=mode,
        classification=classification,
        registry_result=None,
        session_id="test-session",
        trace_id="test-trace",
        query_embedding=[0.1] * 768,
    )


# ============================================================
# CRAG SKIP LOGIC TESTS
# ============================================================

class TestCRAGSkipLogic:
    def test_mode_a_high_score_skips_crag(self, engine):
        """Mode A with score > 0.82 → SKIP immediately."""
        import asyncio
        query = make_query(mode="A")
        chunks = [make_chunk("chunk-A", "SD-ERR-001")]
        high_score = CRAG_SKIP_THRESHOLD_MODE_A + 0.01

        result = asyncio.run(engine._stage6_crag(query, chunks, high_score))
        assert result[0] == "SKIPPED"
        assert result[1] is None

    def test_mode_a_exact_threshold_does_not_skip(self, engine):
        """Mode A with score == threshold → run CRAG (must be strictly greater to skip)."""
        import asyncio
        query = make_query(mode="A")
        chunks = [make_chunk("chunk-A", "SD-ERR-001")]
        exact_score = CRAG_SKIP_THRESHOLD_MODE_A

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="SUFFICIENT"),
        ):
            result = asyncio.run(engine._stage6_crag(query, chunks, exact_score))

        assert result[0] != "SKIPPED"

    def test_mode_b_high_score_skips_crag(self, engine):
        """Mode B with score > 0.80 → SKIP."""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-B", "SD-ERR-001")]
        high_score = CRAG_SKIP_THRESHOLD_MODE_B + 0.01

        result = asyncio.run(engine._stage6_crag(query, chunks, high_score))
        assert result[0] == "SKIPPED"
        assert result[1] is None

    def test_mode_b_exact_threshold_does_not_skip(self, engine):
        """Mode B with score == threshold → run CRAG."""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-B", "SD-ERR-001")]
        exact_score = CRAG_SKIP_THRESHOLD_MODE_B

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="SUFFICIENT"),
        ):
            result = asyncio.run(engine._stage6_crag(query, chunks, exact_score))

        assert result[0] != "SKIPPED"

    def test_mode_b_low_score_runs_crag(self, engine):
        """Mode B with score well below threshold → runs CRAG."""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-C", "SD-ERR-001")]
        low_score = CRAG_SKIP_THRESHOLD_MODE_B - 0.05

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="SUFFICIENT"),
        ):
            result = asyncio.run(engine._stage6_crag(query, chunks, low_score))

        assert result[0] in {"SUFFICIENT", "INSUFFICIENT"}

    def test_mode_c_never_skips_even_with_very_high_score(self, engine):
        """Mode C always runs CRAG regardless of score."""
        import asyncio
        query = make_query(mode="C")
        chunks = [make_chunk("chunk-D", "SD-ERR-001")]
        very_high_score = 0.99

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="SUFFICIENT"),
        ):
            result = asyncio.run(engine._stage6_crag(query, chunks, very_high_score))

        assert result[0] != "SKIPPED"

    def test_mode_c_score_zero_runs_crag(self, engine):
        """Mode C with score 0.0 also always runs CRAG."""
        import asyncio
        query = make_query(mode="C")
        chunks = [make_chunk("chunk-D", "SD-ERR-001")]

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="SUFFICIENT"),
        ):
            result = asyncio.run(engine._stage6_crag(query, chunks, 0.0))

        assert result[0] != "SKIPPED"

    def test_crag_sufficient_response_parsed(self, engine):
        """SUFFICIENT model response → ("SUFFICIENT", None)."""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-E", "SD-ERR-001")]

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="SUFFICIENT"),
        ):
            assessment, gap = asyncio.run(engine._stage6_crag(query, chunks, 0.50))

        assert assessment == "SUFFICIENT"
        assert gap is None

    def test_crag_insufficient_parsed_with_description(self, engine):
        """INSUFFICIENT response correctly parsed with gap description."""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-F", "SD-ERR-001")]

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="INSUFFICIENT: The documentation does not cover plant 9000 specifics"),
        ):
            assessment, gap_desc = asyncio.run(engine._stage6_crag(query, chunks, 0.50))

        assert assessment == "INSUFFICIENT"
        assert "plant 9000" in gap_desc.lower()

    def test_crag_insufficient_no_colon_uses_generic_message(self, engine):
        """INSUFFICIENT response without colon → generic gap description."""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-G", "SD-ERR-001")]

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="INSUFFICIENT"),
        ):
            assessment, gap_desc = asyncio.run(engine._stage6_crag(query, chunks, 0.50))

        assert assessment == "INSUFFICIENT"
        assert gap_desc is not None
        assert len(gap_desc) > 0

    def test_crag_ambiguous_response_defaults_to_sufficient(self, engine):
        """Ambiguous model output (neither SUFFICIENT nor INSUFFICIENT) → SUFFICIENT."""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-H", "SD-ERR-001")]

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(return_value="I cannot determine this."),
        ):
            assessment, gap = asyncio.run(engine._stage6_crag(query, chunks, 0.50))

        assert assessment == "SUFFICIENT"
        assert gap is None

    def test_crag_exception_defaults_to_sufficient(self, engine):
        """If model call throws exception, return (SUFFICIENT, None) — non-blocking."""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-I", "SD-ERR-001")]

        with patch(
            "app.services.model_gateway.model_gateway.call_judge",
            new=AsyncMock(side_effect=Exception("Network error")),
        ):
            assessment, gap = asyncio.run(engine._stage6_crag(query, chunks, 0.50))

        assert assessment == "SUFFICIENT"
        assert gap is None


# ============================================================
# CROSS-ENCODER RERANKING TESTS
# ============================================================

class TestCrossEncoderReranking:
    def test_highest_scoring_chunk_comes_first(self, engine):
        """After reranking, chunk with highest cross-encoder score is first."""
        import asyncio
        query = make_query()
        chunks = [
            make_chunk("chunk-1", "SD-ERR-001"),
            make_chunk("chunk-2", "SD-ERR-002"),
            make_chunk("chunk-3", "SD-ERR-003"),
        ]

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = {"scores": [0.3, 0.9, 0.5]}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            result_chunks, top_score = asyncio.run(engine._stage7_rerank(query, chunks))

        assert result_chunks[0].chunk_id == "chunk-2"
        assert abs(top_score - 0.9) < 0.001

    def test_top_score_equals_first_chunk_score(self, engine):
        """top_score must equal the first chunk's cross_encoder_score."""
        import asyncio
        query = make_query()
        chunks = [make_chunk(f"chunk-{i}", f"doc-{i}") for i in range(5)]

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = {"scores": [0.1, 0.4, 0.7, 0.2, 0.9]}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            result_chunks, top_score = asyncio.run(engine._stage7_rerank(query, chunks))

        assert abs(top_score - result_chunks[0].cross_encoder_score) < 0.001
        assert abs(top_score - 0.9) < 0.001

    def test_returns_at_most_retrieval_final_chunks(self, engine):
        """Should return at most RETRIEVAL_FINAL_CHUNKS (5) results."""
        import asyncio
        query = make_query()
        chunks = [make_chunk(f"chunk-{i}", f"doc-{i}") for i in range(8)]
        mock_scores = [float(i) * 0.1 for i in range(8)]

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = {"scores": mock_scores}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            result_chunks, _ = asyncio.run(engine._stage7_rerank(query, chunks))

        assert len(result_chunks) <= RETRIEVAL_FINAL_CHUNKS

    def test_rerank_failure_returns_original_order(self, engine):
        """Reranker HTTP failure falls back to original RRF order, score=0.0."""
        import asyncio
        query = make_query()
        chunks = [make_chunk(f"chunk-{i}", "SD-ERR-001") for i in range(3)]

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(side_effect=Exception("Service down"))

            result_chunks, top_score = asyncio.run(engine._stage7_rerank(query, chunks))

        assert len(result_chunks) > 0
        assert top_score == 0.0
        for chunk in result_chunks:
            assert chunk.cross_encoder_score == 0.0

    def test_empty_candidates_returns_empty(self, engine):
        """Empty input → ([], 0.0)."""
        import asyncio
        query = make_query()
        result_chunks, top_score = asyncio.run(engine._stage7_rerank(query, []))
        assert result_chunks == []
        assert top_score == 0.0

    def test_scores_are_assigned_to_chunks(self, engine):
        """cross_encoder_score is set on each returned chunk."""
        import asyncio
        query = make_query()
        chunks = [make_chunk(f"chunk-{i}", f"doc-{i}") for i in range(3)]

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = {"scores": [0.6, 0.3, 0.8]}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            result_chunks, _ = asyncio.run(engine._stage7_rerank(query, chunks))

        for chunk in result_chunks:
            assert chunk.cross_encoder_score > 0.0


# ============================================================
# PARENT HEADER HYDRATION TESTS
# ============================================================

class TestParentHeaderHydration:
    def test_no_chunks_returns_none(self, engine):
        """Empty input → None."""
        import asyncio
        result = asyncio.run(engine._stage8_hydration([]))
        assert result is None

    def test_header_chunk_type_recognized(self, engine):
        """If 'header' chunk_type is present, return None (no hydration needed)."""
        import asyncio
        chunks = [make_chunk("chunk-1", "SD-ERR-001", chunk_type="header")]
        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None

    def test_procedure_header_recognized(self, engine):
        """procedure_header chunk_type counts as header."""
        import asyncio
        chunks = [make_chunk("chunk-1", "SD-PROC-001", chunk_type="procedure_header")]
        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None

    def test_config_overview_recognized(self, engine):
        """config_overview chunk_type counts as header."""
        import asyncio
        chunks = [make_chunk("chunk-1", "FI-CFG-003", chunk_type="config_overview")]
        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None

    def test_error_header_recognized(self, engine):
        """error_header chunk_type counts as header."""
        import asyncio
        chunks = [make_chunk("chunk-1", "SD-ERR-001", chunk_type="error_header")]
        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None

    def test_proc_header_recognized(self, engine):
        """proc_header chunk_type counts as header."""
        import asyncio
        chunks = [make_chunk("chunk-1", "SD-PROC-001", chunk_type="proc_header")]
        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None

    def test_cfg_header_recognized(self, engine):
        """cfg_header chunk_type counts as header."""
        import asyncio
        chunks = [make_chunk("chunk-1", "FI-CFG-001", chunk_type="cfg_header")]
        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None

    def test_non_header_chunk_attempts_qdrant_fetch(self, engine):
        """When no header chunk present, Qdrant is queried for one."""
        import asyncio
        chunks = [make_chunk("chunk-1", "SD-ERR-001", chunk_type="cause_resolution")]

        mock_qdrant = AsyncMock()
        mock_qdrant.search_by_document_id = AsyncMock(return_value=[
            {
                "id": "header-id",
                "score": 1.0,
                "payload": {
                    "content_type": "error_guide",
                    "error_code": "VL150",
                    "configuration_name": None,
                    "procedure_name": None,
                    "module": "SD",
                    "transactions": ["VL01N"],
                    "last_verified_date": "2024-03-28",
                    "verified_by": "rsarkar1",
                },
            }
        ])

        with patch.object(engine, "_get_qdrant", return_value=mock_qdrant):
            result = asyncio.run(engine._stage8_hydration(chunks))

        assert result is not None
        assert result.document_id == "SD-ERR-001"
        assert result.module == "SD"

    def test_hydration_qdrant_failure_returns_none(self, engine):
        """Qdrant failure during hydration → return None, do not raise."""
        import asyncio
        chunks = [make_chunk("chunk-1", "SD-ERR-001", chunk_type="cause_resolution")]

        mock_qdrant = AsyncMock()
        mock_qdrant.search_by_document_id = AsyncMock(side_effect=Exception("Qdrant error"))

        with patch.object(engine, "_get_qdrant", return_value=mock_qdrant):
            result = asyncio.run(engine._stage8_hydration(chunks))

        assert result is None
