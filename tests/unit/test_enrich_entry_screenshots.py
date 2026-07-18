"""Unit tests for the screenshot-enrichment text formatting/rejection heuristic (Session 28)."""
from app.clients.ollama_vision import SAPScreenshotType, ExtractedSAPData
from app.tasks.enrich_entry_screenshots import format_extracted_text, is_extraction_empty


class TestIsExtractionEmpty:
    def test_fully_empty_extraction_is_empty(self):
        assert is_extraction_empty(ExtractedSAPData()) is True

    def test_extraction_with_error_code_is_not_empty(self):
        data = ExtractedSAPData(error_codes=["VL150"])
        assert is_extraction_empty(data) is False

    def test_extraction_with_only_screen_title_is_not_empty(self):
        data = ExtractedSAPData(screen_title="Display Material")
        assert is_extraction_empty(data) is False

    def test_extraction_with_only_field_values_is_not_empty(self):
        data = ExtractedSAPData(field_values={"Plant": "1000"})
        assert is_extraction_empty(data) is False


class TestFormatExtractedText:
    def test_includes_screen_type(self):
        text = format_extracted_text(SAPScreenshotType.ERROR_DIALOG, ExtractedSAPData())
        assert "SCREEN TYPE: error_dialog" in text

    def test_includes_all_populated_fields(self):
        data = ExtractedSAPData(
            error_codes=["VL150"], t_codes=["VA01"], screen_title="Create Outbound Delivery",
            message_text="Not enough stock available", field_values={"Plant": "1000", "Material": "1000123"},
        )
        text = format_extracted_text(SAPScreenshotType.ERROR_DIALOG, data)
        assert "ERROR CODE(S): VL150" in text
        assert "TRANSACTION CODE(S): VA01" in text
        assert "SCREEN TITLE: Create Outbound Delivery" in text
        assert "MESSAGE: Not enough stock available" in text
        assert "Plant: 1000" in text
        assert "Material: 1000123" in text

    def test_field_names_used_when_no_field_values(self):
        data = ExtractedSAPData(field_names=["Plant", "Material"])
        text = format_extracted_text(SAPScreenshotType.TRANSACTION_SCREEN, data)
        assert "FIELDS VISIBLE: Plant, Material" in text

    def test_empty_extraction_still_produces_screen_type_only(self):
        text = format_extracted_text(SAPScreenshotType.LIST_DISPLAY, ExtractedSAPData())
        assert text == "SCREEN TYPE: list_display"
