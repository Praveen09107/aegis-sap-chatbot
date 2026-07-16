"""Unit tests for Ollama Vision Client."""
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock

from app.clients.ollama_vision import (
    classify_sap, extract_sap_content,
    SAPScreenshotType, ExtractedSAPData,
    _parse_extraction_response,
)


class TestClassifySap:
    @pytest.mark.asyncio
    async def test_classifies_error_dialog(self):
        with patch(
            "app.clients.ollama_vision.call_vision_completion",
            new=AsyncMock(return_value="error_dialog"),
        ):
            result = await classify_sap("base64data")

        assert result == SAPScreenshotType.ERROR_DIALOG

    @pytest.mark.asyncio
    async def test_classifies_transaction_screen(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {"response": "transaction_screen"}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            result = await classify_sap("base64data")

        assert result == SAPScreenshotType.TRANSACTION_SCREEN

    @pytest.mark.asyncio
    async def test_unknown_response_defaults_to_transaction(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {"response": "some_random_text"}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            result = await classify_sap("base64data")

        assert result == SAPScreenshotType.TRANSACTION_SCREEN


class TestExtractSapContent:
    @pytest.mark.asyncio
    async def test_extracts_json_data(self):
        json_response = json.dumps({
            "error_codes": ["VL150"],
            "t_codes": ["VL01N"],
            "field_names": ["Delivery Qty"],
            "field_values": {"Delivery Qty": "100 EA"},
            "screen_title": "Create Outbound Delivery",
            "message_text": "Only 50 EA available",
        })

        with patch(
            "app.clients.ollama_vision.call_vision_completion",
            new=AsyncMock(return_value=json_response),
        ):
            result = await extract_sap_content("base64data", SAPScreenshotType.ERROR_DIALOG)

        assert isinstance(result, ExtractedSAPData)
        assert "VL150" in result.error_codes
        assert "VL01N" in result.t_codes
        assert result.screen_title == "Create Outbound Delivery"


class TestParseExtractionResponse:
    def test_valid_json_parsed(self):
        raw = '{"error_codes": ["VL150"], "t_codes": [], "field_names": [], "field_values": {}, "screen_title": "Test", "message_text": ""}'
        result = _parse_extraction_response(raw)
        assert result.error_codes == ["VL150"]
        assert result.screen_title == "Test"

    def test_json_embedded_in_text(self):
        raw = 'Here is the result: {"error_codes": ["F5263"], "t_codes": ["FB50"], "field_names": [], "field_values": {}, "screen_title": "", "message_text": "Posting error"} end'
        result = _parse_extraction_response(raw)
        assert result.error_codes == ["F5263"]
        assert result.message_text == "Posting error"

    def test_invalid_json_returns_empty(self):
        raw = "This is not valid JSON at all"
        result = _parse_extraction_response(raw)
        assert result.error_codes == []
        assert result.screen_title == ""

    def test_empty_string_returns_empty(self):
        result = _parse_extraction_response("")
        assert isinstance(result, ExtractedSAPData)
