"""
Unit tests for AEGIS Query Intelligence Layer.
All database and HTTP calls are mocked.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import sys

from app.models.session import SessionState, EntityObject
from app.models.retrieval import EnrichedQuery, RegistryResult
from app.services.query_intelligence import QueryIntelligenceLayer


@pytest.fixture
def qil():
    """Fresh QIL instance with synonym map pre-loaded (empty)."""
    layer = QueryIntelligenceLayer()
    layer._synonym_loaded = True
    layer._synonym_map = {}
    return layer


@pytest.fixture
def empty_session():
    """Empty session with no history."""
    return SessionState(
        user_id_hash="abc123",
        created_at="2024-01-01T00:00:00Z",
    )


@pytest.fixture
def session_with_entity():
    """Session with a previous entity."""
    return SessionState(
        user_id_hash="abc123",
        created_at="2024-01-01T00:00:00Z",
        last_entities=[EntityObject(type="error_code", value="FI1234")],
    )


# ============================================================
# STAGE 1: ENTITY EXTRACTION
# ============================================================

class TestEntityExtraction:

    def test_extracts_error_code(self, qil):
        entities = qil._extract_entities("I got error FI1234 in SAP")
        error_codes = [e for e in entities if e.type == "error_code"]
        assert len(error_codes) == 1
        assert error_codes[0].value == "FI1234"

    def test_extracts_tcode(self, qil):
        entities = qil._extract_entities("Go to transaction VA01 in SAP")
        tcodes = [e for e in entities if e.type == "tcode"]
        assert any(t.value == "VA01" for t in tcodes)

    def test_extracts_document_number(self, qil):
        entities = qil._extract_entities("Check PO 4500012345 status")
        doc_nums = [e for e in entities if e.type == "document_number"]
        assert len(doc_nums) == 1
        assert doc_nums[0].value == "4500012345"

    def test_extracts_module(self, qil):
        entities = qil._extract_entities("This is a FI module issue")
        modules = [e for e in entities if e.type == "module"]
        assert len(modules) == 1
        assert modules[0].value == "FI"

    def test_excludes_common_words(self, qil):
        entities = qil._extract_entities("SAP ERP system is NOT working")
        types = {e.type for e in entities}
        assert "error_code" not in types or all(
            e.value not in {"SAP", "ERP", "NOT"} for e in entities
        )

    def test_tcode_distinguished_from_error_code(self, qil):
        """T-codes have trailing letter (e.g. VA01 matches ^[A-Z]{2,5}\\d{1,4}[A-Z]$)."""
        entities = qil._extract_entities("Run ME21N")
        tcodes = [e for e in entities if e.type == "tcode"]
        error_codes = [e for e in entities if e.type == "error_code"]
        assert any(t.value == "ME21N" for t in tcodes)
        assert not any(e.value == "ME21N" for e in error_codes)

    def test_no_entities_in_plain_text(self, qil):
        entities = qil._extract_entities("how do I reset my password")
        assert len(entities) == 0


# ============================================================
# STAGE 2: CONTEXT RESOLVER
# ============================================================

class TestContextResolver:

    def test_resolves_reference_from_session(self, qil, session_with_entity):
        entity = qil._resolve_context(
            "what if that error happens again?",
            [],
            session_with_entity,
        )
        assert entity is not None
        assert entity.value == "FI1234"

    def test_no_resolution_if_entities_present(self, qil, session_with_entity):
        current = [EntityObject(type="error_code", value="MM5678")]
        entity = qil._resolve_context(
            "what if that error happens again?",
            current,
            session_with_entity,
        )
        assert entity is None

    def test_no_resolution_without_reference_signal(self, qil, session_with_entity):
        entity = qil._resolve_context(
            "how do I create a purchase order?",
            [],
            session_with_entity,
        )
        assert entity is None

    def test_no_resolution_empty_session(self, qil, empty_session):
        entity = qil._resolve_context(
            "what if that error happens again?",
            [],
            empty_session,
        )
        assert entity is None


# ============================================================
# STAGE 3: SYNONYM EXPANSION
# ============================================================

class TestSynonymExpansion:

    def test_expands_synonym(self, qil):
        qil._synonym_map = {"migo": "goods receipt goods issue movement type"}
        result = qil._expand_synonyms("How to use MIGO")
        assert "goods receipt" in result
        assert result.startswith("How to use MIGO")

    def test_no_expansion_when_no_match(self, qil):
        qil._synonym_map = {"migo": "goods receipt"}
        result = qil._expand_synonyms("How do I reset password")
        assert result == "How do I reset password"


# ============================================================
# STAGE 4: INTENT CLASSIFICATION
# ============================================================

class TestIntentClassification:

    def test_error_code_forces_error_resolution(self, qil):
        entities = [EntityObject(type="error_code", value="FI1234")]
        result = qil._classify_intent("what does FI1234 mean?", entities)
        assert result == "ERROR_RESOLUTION"

    def test_error_keyword_signals(self, qil):
        result = qil._classify_intent("I am getting an error in SAP", [])
        assert result == "ERROR_RESOLUTION"

    def test_process_signal(self, qil):
        result = qil._classify_intent("How to create a purchase order?", [])
        assert result == "PROCESS"

    def test_config_signal(self, qil):
        result = qil._classify_intent("What is the current configuration for company code?", [])
        assert result == "CONFIG"

    def test_simple_fact_fallback(self, qil):
        result = qil._classify_intent("What is SAP?", [])
        assert result == "SIMPLE_FACT"


# ============================================================
# STAGE 5: MODE ASSIGNMENT
# ============================================================

class TestModeAssignment:

    @pytest.mark.asyncio
    async def test_mode_a_on_registry_hit(self, qil):
        mock_registry = RegistryResult(
            pattern_string="FI1234",
            pattern_type="error_code",
            linked_document_id="doc-001",
            linked_chunk_type="error_guide",
            registry_notes="Known payroll error",
        )
        with patch.object(qil, "_check_registry", new_callable=AsyncMock, return_value=mock_registry):
            entities = [EntityObject(type="error_code", value="FI1234")]
            result, mode = await qil._assign_mode("error FI1234", entities, "error FI1234")
            assert mode == "A"
            assert result.pattern_string == "FI1234"

    @pytest.mark.asyncio
    async def test_mode_b_default(self, qil):
        with patch.object(qil, "_check_registry", new_callable=AsyncMock, return_value=None):
            entities = [EntityObject(type="error_code", value="FI1234")]
            result, mode = await qil._assign_mode("error FI1234", entities, "error FI1234")
            assert mode == "B"
            assert result is None

    def test_mode_c_long_query(self, qil):
        long_query = "x" * 201
        assert qil._is_mode_c(long_query, [], long_query) is True

    def test_mode_c_many_modules(self, qil):
        entities = [
            EntityObject(type="module", value="FI"),
            EntityObject(type="module", value="MM"),
            EntityObject(type="module", value="SD"),
        ]
        assert qil._is_mode_c("query about FI MM SD", entities, "query") is True

    def test_mode_c_complexity_signal(self, qil):
        assert qil._is_mode_c("compare FI and MM posting", [], "compare") is True


# ============================================================
# STAGE 7: SEMANTIC CACHE CHECK
# ============================================================

class TestSemanticCacheCheck:

    @pytest.mark.asyncio
    async def test_cache_hit_returns_answer(self, qil):
        mock_embed_response = MagicMock()
        mock_embed_response.json.return_value = {"embedding": [0.1] * 768}
        mock_embed_response.raise_for_status = MagicMock()

        cache_result = {"score": 0.95, "payload": {"answer_text": "Cached answer"}}

        mock_qdrant = MagicMock()
        mock_qdrant.search_cache = AsyncMock(return_value=cache_result)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_embed_response
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            with patch.dict("sys.modules", {"app.infrastructure.qdrant_client": MagicMock(qdrant_client=mock_qdrant)}):
                hit, answer = await qil._check_semantic_cache("test query")

        assert hit is True
        assert answer == "Cached answer"

    @pytest.mark.asyncio
    async def test_cache_miss(self, qil):
        mock_embed_response = MagicMock()
        mock_embed_response.json.return_value = {"embedding": [0.1] * 768}
        mock_embed_response.raise_for_status = MagicMock()

        mock_qdrant = MagicMock()
        mock_qdrant.search_cache = AsyncMock(return_value=None)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_embed_response
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            with patch.dict("sys.modules", {"app.infrastructure.qdrant_client": MagicMock(qdrant_client=mock_qdrant)}):
                hit, answer = await qil._check_semantic_cache("test query")

        assert hit is False
        assert answer is None


# ============================================================
# FULL PIPELINE (process)
# ============================================================

class TestFullPipeline:

    @pytest.mark.asyncio
    async def test_process_returns_enriched_query(self, qil, empty_session):
        with patch.object(qil, "_check_registry", new_callable=AsyncMock, return_value=None):
            with patch.object(qil, "_check_semantic_cache", new_callable=AsyncMock, return_value=(False, None)):
                result = await qil.process(
                    raw_message="How do I create a purchase order in MM?",
                    session=empty_session,
                    session_id="test-session",
                    trace_id="test-trace",
                )
        assert isinstance(result, EnrichedQuery)
        assert result.raw_message == "How do I create a purchase order in MM?"
        assert result.classification == "PROCESS"
        assert result.retrieval_mode == "B"
        assert result.cache_hit is False

    @pytest.mark.asyncio
    async def test_process_error_code_mode_a(self, qil, empty_session):
        mock_registry = RegistryResult(
            pattern_string="FI1234",
            pattern_type="error_code",
            linked_document_id="doc-001",
            linked_chunk_type="error_guide",
            registry_notes="Known payroll error",
        )
        with patch.object(qil, "_check_registry", new_callable=AsyncMock, return_value=mock_registry):
            with patch.object(qil, "_check_semantic_cache", new_callable=AsyncMock, return_value=(False, None)):
                result = await qil.process(
                    raw_message="Error FI1234 when posting journal entry",
                    session=empty_session,
                    session_id="test-session",
                    trace_id="test-trace",
                )
        assert result.classification == "ERROR_RESOLUTION"
        assert result.retrieval_mode == "A"
        assert result.registry_result is not None


# ============================================================
# UTILITY
# ============================================================

class TestUtility:

    def test_get_primary_entity_priority(self, qil):
        entities = [
            EntityObject(type="module", value="FI"),
            EntityObject(type="tcode", value="VA01"),
            EntityObject(type="error_code", value="FI1234"),
        ]
        primary = qil.get_primary_entity(entities)
        assert primary.type == "error_code"

    def test_get_primary_entity_empty(self, qil):
        assert qil.get_primary_entity([]) is None
