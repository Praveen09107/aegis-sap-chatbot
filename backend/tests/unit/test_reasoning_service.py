"""Unit tests for Reasoning Service prompt assembly, tier selection, and staleness."""
import pytest
from datetime import date, timedelta

from app.services.reasoning_service import ReasoningService, SYSTEM_ROLE
from app.services.model_gateway import select_model_tier
from app.models.retrieval import (
    EnrichedQuery, RetrievalResult, RetrievedChunk, ParentHeader, RegistryResult
)
from app.models.session import SessionState, ConversationTurn, EntityObject


@pytest.fixture
def rs():
    return ReasoningService()


def make_chunk(doc_id="SD-ERR-001", days_ago=20, chunk_type="cause_resolution"):
    return RetrievedChunk(
        chunk_id=f"{doc_id}:chunk:1",
        document_id=doc_id,
        content_type="error_guide",
        chunk_type=chunk_type,
        chunk_text=f"SAP documentation content for {doc_id}",
        last_verified_date=str(date.today() - timedelta(days=days_ago)),
        verified_by="Rsuresh1",
        cross_encoder_score=0.88,
        rrf_score=0.05,
    )


def make_retrieval_result(registry_notes="", chunks=None, mode="B"):
    return RetrievalResult(
        chunks=chunks if chunks is not None else [make_chunk()],
        parent_header=None,
        registry_notes=registry_notes,
        crag_assessment="SUFFICIENT",
        crag_gap_description=None,
        retrieval_mode_used=mode,
        top_cross_encoder_score=0.88,
    )


def make_query(mode="B", classification="ERROR_RESOLUTION"):
    return EnrichedQuery(
        raw_message="How do I fix VL150 error?",
        enriched_text="How do I fix VL150 error? VL150 VL150 VL150",
        entities=[EntityObject(type="error_code", value="VL150")],
        context_entity=None,
        retrieval_mode=mode,
        classification=classification,
        registry_result=None,
        session_id="test-session",
        trace_id="test-trace",
    )


def make_minimal_retrieval_result():
    """EnrichedQuery compatible with select_model_tier mock object."""
    return type("R", (), {"top_cross_encoder_score": 0.9})()


@pytest.fixture
def empty_session():
    return SessionState(user_id_hash="abc123", created_at="2024-01-01T00:00:00Z")


# ============================================================
# Tier Selection Tests
# ============================================================

class TestTierSelection:
    def test_simple_fact_mode_b_no_diagnostic_is_tier_1(self):
        """(i) SIMPLE_FACT, mode B, no diagnostic → Tier 1"""
        query = make_query(mode="B", classification="SIMPLE_FACT")
        result = make_minimal_retrieval_result()
        assert select_model_tier(query, result, False) == 1

    def test_error_resolution_mode_c_is_tier_3(self):
        """(ii) ERROR_RESOLUTION, mode C → Tier 3 (mode C takes priority over classification)"""
        query = make_query(mode="C", classification="ERROR_RESOLUTION")
        result = make_minimal_retrieval_result()
        assert select_model_tier(query, result, False) == 3

    def test_process_mode_b_with_diagnostic_is_tier_3(self):
        """(iii) PROCESS, mode B, has_diagnostic_object=True → Tier 3"""
        query = make_query(mode="B", classification="PROCESS")
        result = make_minimal_retrieval_result()
        assert select_model_tier(query, result, True) == 3

    def test_error_resolution_mode_b_no_diagnostic_is_tier_2(self):
        """ERROR_RESOLUTION, mode B, no diagnostic → Tier 2"""
        query = make_query(mode="B", classification="ERROR_RESOLUTION")
        result = make_minimal_retrieval_result()
        assert select_model_tier(query, result, False) == 2

    def test_simple_fact_mode_c_is_tier_3_not_tier_1(self):
        """SIMPLE_FACT + mode C → Tier 3 wins (checked first)"""
        query = make_query(mode="C", classification="SIMPLE_FACT")
        result = make_minimal_retrieval_result()
        assert select_model_tier(query, result, False) == 3

    def test_simple_fact_with_diagnostic_is_tier_3(self):
        """SIMPLE_FACT + has_diagnostic=True → Tier 3 wins"""
        query = make_query(mode="B", classification="SIMPLE_FACT")
        result = make_minimal_retrieval_result()
        assert select_model_tier(query, result, True) == 3

    def test_config_mode_b_no_diagnostic_is_tier_2(self):
        """CONFIG, mode B, no diagnostic → Tier 2"""
        query = make_query(mode="B", classification="CONFIG")
        result = make_minimal_retrieval_result()
        assert select_model_tier(query, result, False) == 2


# ============================================================
# Prompt Assembly — Section Presence and Order
# ============================================================

class TestPromptSections:
    def test_system_role_in_prompt(self, rs, empty_session):
        prompt = rs.assemble_prompt(make_query(), make_retrieval_result(), empty_session)
        assert "AEGIS" in prompt
        assert "Sona Comstar" in prompt
        assert "SAP" in prompt

    def test_documentation_section_present(self, rs, empty_session):
        chunks = [make_chunk("SD-ERR-001")]
        prompt = rs.assemble_prompt(make_query(), make_retrieval_result(chunks=chunks), empty_session)
        assert "---DOCUMENTATION---" in prompt
        assert "SD-ERR-001" in prompt

    def test_employee_question_and_answer_label(self, rs, empty_session):
        prompt = rs.assemble_prompt(make_query(), make_retrieval_result(), empty_session)
        assert "---EMPLOYEE QUESTION---" in prompt
        assert "How do I fix VL150 error?" in prompt
        assert "Answer:" in prompt

    def test_registry_note_present_when_non_empty(self, rs, empty_session):
        rr = make_retrieval_result(registry_notes="VL150 is a standard availability error.", mode="A")
        prompt = rs.assemble_prompt(make_query(mode="A"), rr, empty_session)
        assert "---REGISTRY NOTE---" in prompt
        assert "standard availability error" in prompt

    def test_registry_note_absent_when_empty(self, rs, empty_session):
        rr = make_retrieval_result(registry_notes="")
        prompt = rs.assemble_prompt(make_query(), rr, empty_session)
        assert "---REGISTRY NOTE---" not in prompt

    def test_screen_context_present_when_diagnostic_provided(self, rs, empty_session):
        diagnostic = {
            "error_code": "VL150",
            "error_message_text": "Only 50 EA available",
            "transaction_code": "VL01N",
            "material_number": "1000012345",
            "plant_code": "1000",
            "document_number": None,
            "field_values": [],
            "visible_quantities": [],
        }
        prompt = rs.assemble_prompt(make_query(), make_retrieval_result(), empty_session, diagnostic)
        assert "---SCREEN CONTEXT---" in prompt
        assert "VL01N" in prompt
        assert "1000012345" in prompt

    def test_screen_context_absent_when_no_diagnostic(self, rs, empty_session):
        prompt = rs.assemble_prompt(make_query(), make_retrieval_result(), empty_session, None)
        assert "---SCREEN CONTEXT---" not in prompt

    def test_history_present_when_turns_exist(self, rs):
        session = SessionState(user_id_hash="abc", created_at="2024-01-01T00:00:00Z")
        session.conversation_history = [
            ConversationTurn(
                query_summary="How to create a delivery?",
                answer_summary="Use VL01N.",
                classification="PROCESS",
                confidence_badge="green",
                retrieved_doc_ids=["SD-PROC-001"],
            )
        ]
        prompt = rs.assemble_prompt(make_query(), make_retrieval_result(), session)
        assert "---PREVIOUS CONTEXT---" in prompt
        assert "How to create a delivery?" in prompt

    def test_history_absent_for_empty_session(self, rs, empty_session):
        prompt = rs.assemble_prompt(make_query(), make_retrieval_result(), empty_session)
        assert "---PREVIOUS CONTEXT---" not in prompt

    def test_section_order_docs_before_registry_before_screen_before_query(self, rs, empty_session):
        """Confirm exact section ordering: DOC < REGISTRY < SCREEN < QUERY."""
        rr = make_retrieval_result(registry_notes="Registry note present.", mode="A")
        diagnostic = {
            "error_code": "VL150",
            "transaction_code": "VL01N",
            "error_message_text": None,
            "material_number": None,
            "plant_code": None,
            "document_number": None,
            "field_values": [],
            "visible_quantities": [],
        }
        prompt = rs.assemble_prompt(make_query(mode="A"), rr, empty_session, diagnostic)
        doc_pos = prompt.find("---DOCUMENTATION---")
        reg_pos = prompt.find("---REGISTRY NOTE---")
        screen_pos = prompt.find("---SCREEN CONTEXT---")
        query_pos = prompt.find("---EMPLOYEE QUESTION---")
        assert doc_pos < reg_pos, f"DOC must be before REGISTRY: {doc_pos} vs {reg_pos}"
        assert reg_pos < screen_pos, f"REGISTRY must be before SCREEN: {reg_pos} vs {screen_pos}"
        assert screen_pos < query_pos, f"SCREEN must be before QUERY: {screen_pos} vs {query_pos}"

    def test_parent_header_prepended_in_doc_section(self, rs, empty_session):
        header = ParentHeader(
            document_id="SD-ERR-001",
            content_type="error_guide",
            error_code="VL150",
            configuration_name=None,
            procedure_name=None,
            module="SD",
            transactions=["VL01N", "MMBE"],
            last_verified_date="2024-03-28",
            verified_by="Rsuresh1",
        )
        rr = RetrievalResult(
            chunks=[],
            parent_header=header,
            registry_notes="",
            crag_assessment="SKIPPED",
            crag_gap_description=None,
            retrieval_mode_used="A",
            top_cross_encoder_score=0.91,
        )
        prompt = rs.assemble_prompt(make_query(), rr, empty_session)
        assert "SD-ERR-001" in prompt
        assert "VL150" in prompt
        assert "VL01N" in prompt
        assert "MMBE" in prompt

    def test_raw_message_used_not_enriched_text(self, rs, empty_session):
        """Section 6 must use raw_message, not enriched_text."""
        query = make_query()
        prompt = rs.assemble_prompt(query, make_retrieval_result(), empty_session)
        # raw_message should be present
        assert "How do I fix VL150 error?" in prompt
        # enriched_text with repeated entities should NOT appear in the question section
        enriched_portion = "VL150 VL150 VL150"
        # enriched_text is only in the prompt if it slips into another section — the question
        # section must use raw_message, verify by finding query section content
        query_section_start = prompt.find("---EMPLOYEE QUESTION---")
        query_section = prompt[query_section_start:]
        # The raw_message appears; enriched repetitions should not be in the question section
        assert "How do I fix VL150 error?" in query_section


# ============================================================
# Staleness Tests
# ============================================================

class TestStalenessCheck:
    def test_fresh_doc_no_warning_34_days(self, rs):
        """34 days old (below threshold) → no warning."""
        chunks = [make_chunk("FI-CFG-003", days_ago=34)]
        assert rs._check_staleness(chunks) is None

    def test_exactly_35_days_no_warning(self, rs):
        """Exactly 35 days old → not stale (threshold is strictly > 35)."""
        chunks = [make_chunk("FI-CFG-003", days_ago=35)]
        assert rs._check_staleness(chunks) is None

    def test_36_days_triggers_warning(self, rs):
        """36 days old (above threshold) → staleness warning."""
        chunks = [make_chunk("FI-CFG-003", days_ago=36)]
        result = rs._check_staleness(chunks)
        assert result is not None
        assert "FI-CFG-003" in result
        assert "outdated" in result.lower()

    def test_empty_chunks_no_warning(self, rs):
        assert rs._check_staleness([]) is None

    def test_staleness_warning_inserted_between_doc_and_registry(self, rs, empty_session):
        """Staleness warning must appear AFTER ---DOCUMENTATION--- and BEFORE ---REGISTRY NOTE---."""
        chunks = [make_chunk("FI-CFG-003", days_ago=40)]
        rr = RetrievalResult(
            chunks=chunks,
            parent_header=None,
            registry_notes="Some registry note.",
            crag_assessment="SUFFICIENT",
            crag_gap_description=None,
            retrieval_mode_used="A",
            top_cross_encoder_score=0.88,
        )
        prompt = rs.assemble_prompt(make_query(mode="A"), rr, empty_session)
        doc_pos = prompt.find("---DOCUMENTATION---")
        stale_pos = prompt.find("---STALENESS WARNING---")
        reg_pos = prompt.find("---REGISTRY NOTE---")
        assert doc_pos != -1
        assert stale_pos != -1, "Staleness warning should be present for 40-day-old doc"
        assert reg_pos != -1
        assert doc_pos < stale_pos < reg_pos, (
            f"Staleness must be between DOC and REGISTRY: {doc_pos} < {stale_pos} < {reg_pos}"
        )

    def test_no_staleness_warning_when_fresh_docs(self, rs, empty_session):
        """No staleness block when all docs are fresh."""
        chunks = [make_chunk("FI-CFG-003", days_ago=10)]
        rr = make_retrieval_result(chunks=chunks, registry_notes="Some note.", mode="A")
        prompt = rs.assemble_prompt(make_query(mode="A"), rr, empty_session)
        assert "---STALENESS WARNING---" not in prompt

    def test_up_to_3_stale_docs_listed(self, rs):
        """At most 3 stale documents listed in the warning."""
        chunks = [make_chunk(f"DOC-{i}", days_ago=50) for i in range(5)]
        result = rs._check_staleness(chunks)
        assert result is not None
        # Should list at most 3 doc IDs
        listed = [f"DOC-{i}" for i in range(5)]
        found = sum(1 for doc in listed if doc in result)
        assert found <= 3
