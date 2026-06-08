"""Unit tests for Vision Integration Service."""
import pytest
from app.services.vision_integration import VisionIntegrationService


@pytest.fixture
def vis():
    return VisionIntegrationService()


@pytest.fixture
def full_diagnostic():
    return {
        "error_code": "VL150",
        "error_message_text": "Only 50 EA of material 1000012345 available",
        "transaction_code": "VL01N",
        "screen_title": "Create Outbound Delivery",
        "material_number": "1000012345",
        "plant_code": "1000",
        "document_number": None,
        "batch_number": None,
        "field_values": [
            {"field": "Delivery Qty", "value": "100 EA"},
            {"field": "Avail. Stock", "value": "50 EA"},
        ],
        "visible_quantities": [
            {"label": "Requested", "value": "100 EA"}
        ],
    }


@pytest.fixture
def empty_diagnostic():
    return {
        "error_code": None,
        "error_message_text": None,
        "transaction_code": None,
        "screen_title": None,
        "material_number": None,
        "plant_code": None,
        "document_number": None,
        "batch_number": None,
        "field_values": [],
        "visible_quantities": [],
    }


class TestEnrichQueryWithDiagnostic:
    def test_error_code_appended(self, vis, full_diagnostic):
        result = vis.enrich_query_with_diagnostic("Why is delivery failing?", full_diagnostic)
        assert "VL150" in result
        assert "Why is delivery failing?" in result

    def test_transaction_code_appended(self, vis, full_diagnostic):
        result = vis.enrich_query_with_diagnostic("Help me", full_diagnostic)
        assert "VL01N" in result

    def test_material_number_appended(self, vis, full_diagnostic):
        result = vis.enrich_query_with_diagnostic("Help me", full_diagnostic)
        assert "1000012345" in result

    def test_empty_diagnostic_returns_original(self, vis, empty_diagnostic):
        original = "Why is delivery failing?"
        result = vis.enrich_query_with_diagnostic(original, empty_diagnostic)
        assert result == original

    def test_null_fields_not_included(self, vis, full_diagnostic):
        full_diagnostic["document_number"] = None
        result = vis.enrich_query_with_diagnostic("Help", full_diagnostic)
        assert "None" not in result
        assert "null" not in result.lower()

    def test_field_values_included(self, vis, full_diagnostic):
        result = vis.enrich_query_with_diagnostic("Help", full_diagnostic)
        assert "Delivery Qty" in result or "Avail. Stock" in result


class TestExtractEntitiesFromDiagnostic:
    def test_error_code_extracted(self, vis, full_diagnostic):
        entities = vis.extract_entities_from_diagnostic(full_diagnostic)
        error_entities = [e for e in entities if e["type"] == "error_code"]
        assert any(e["value"] == "VL150" for e in error_entities)

    def test_tcode_extracted(self, vis, full_diagnostic):
        entities = vis.extract_entities_from_diagnostic(full_diagnostic)
        tcode_entities = [e for e in entities if e["type"] == "tcode"]
        assert any(e["value"] == "VL01N" for e in tcode_entities)

    def test_empty_diagnostic_returns_empty(self, vis, empty_diagnostic):
        entities = vis.extract_entities_from_diagnostic(empty_diagnostic)
        assert entities == []


class TestFormatDiagnosticForPrompt:
    def test_format_contains_all_fields(self, vis, full_diagnostic):
        formatted = vis.format_diagnostic_for_prompt(full_diagnostic)
        assert "VL150" in formatted
        assert "VL01N" in formatted
        assert "1000012345" in formatted
        assert "1000" in formatted
        assert "[Screen Analysis]" in formatted

    def test_null_fields_excluded(self, vis, full_diagnostic):
        full_diagnostic["document_number"] = None
        formatted = vis.format_diagnostic_for_prompt(full_diagnostic)
        assert "Document: None" not in formatted

    def test_field_values_included(self, vis, full_diagnostic):
        formatted = vis.format_diagnostic_for_prompt(full_diagnostic)
        assert "Delivery Qty" in formatted or "Avail. Stock" in formatted

    def test_visible_quantities_included(self, vis, full_diagnostic):
        formatted = vis.format_diagnostic_for_prompt(full_diagnostic)
        assert "Requested" in formatted


class TestBuildProactiveQuery:
    def test_proactive_query_includes_screen_context(self, vis, full_diagnostic):
        result = vis.build_proactive_query("Why is delivery failing?", full_diagnostic)
        assert "Based on the SAP screen captured:" in result
        assert "VL150" in result
        assert "Why is delivery failing?" in result
