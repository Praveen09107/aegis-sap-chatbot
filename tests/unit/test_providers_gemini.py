"""
Unit tests for the Gemini adapter (Phase 1). Fixture responses are the
real shapes captured during live inference-model research (2026-07-19).
No live HTTP calls, per INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §6.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.infrastructure.providers_gemini import call_vision_completion, _extract_content, parse_quota_value


class TestExtractContent:
    def test_extracts_text_from_real_shape(self):
        # Real shape captured for gemini-3.5-flash, including the
        # thoughtSignature key a "thinking" model attaches to the same part.
        payload = {
            "candidates": [{
                "content": {"parts": [{"text": "Blue", "thoughtSignature": "abc123"}], "role": "model"},
                "finishReason": "STOP",
            }],
            "usageMetadata": {"promptTokenCount": 5},
        }
        assert _extract_content(payload) == "Blue"

    def test_joins_multiple_text_parts(self):
        payload = {"candidates": [{"content": {"parts": [{"text": "Hello "}, {"text": "world"}]}}]}
        assert _extract_content(payload) == "Hello world"

    def test_no_candidates_raises(self):
        with pytest.raises(ValueError):
            _extract_content({"candidates": []})

    def test_candidates_with_no_text_parts_raises(self):
        with pytest.raises(ValueError):
            _extract_content({"candidates": [{"content": {"parts": [{"thoughtSignature": "only-this"}]}}]})


class TestParseQuotaValue:
    def test_parses_real_429_body(self):
        # Real 429 body captured during burst testing.
        resp = MagicMock()
        resp.json.return_value = {
            "error": {
                "code": 429,
                "details": [
                    {"@type": "type.googleapis.com/google.rpc.QuotaFailure",
                     "violations": [{"quotaMetric": "...", "quotaValue": "5"}]},
                ],
            },
        }
        assert parse_quota_value(resp) == 5

    def test_malformed_body_returns_none_not_raises(self):
        resp = MagicMock()
        resp.json.side_effect = ValueError("not json")
        assert parse_quota_value(resp) is None

    def test_no_quota_value_present_returns_none(self):
        resp = MagicMock()
        resp.json.return_value = {"error": {"details": []}}
        assert parse_quota_value(resp) is None


class TestCallVisionCompletion:
    @pytest.mark.asyncio
    async def test_success_returns_content(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"candidates": [{"content": {"parts": [{"text": "Green"}]}}]}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            result = await call_vision_completion(
                base_url="https://generativelanguage.googleapis.com/v1beta",
                api_key="fake-key", model="gemini-3.5-flash",
                prompt="what color", image_b64="ZmFrZQ==", mime_type="image/png", timeout=30,
            )

        assert result == "Green"
        # Auth is a query-string key, not a Bearer header — Gemini's own convention.
        called_url = mock_client.post.call_args.args[0]
        assert "key=fake-key" in called_url

    @pytest.mark.asyncio
    async def test_429_logs_quota_then_raises(self):
        import httpx as _httpx

        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.json.return_value = {
            "error": {"details": [{"violations": [{"quotaValue": "5"}]}]},
        }
        mock_resp.raise_for_status = MagicMock(side_effect=_httpx.HTTPStatusError("429", request=MagicMock(), response=mock_resp))

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            with pytest.raises(_httpx.HTTPStatusError):
                await call_vision_completion(
                    base_url="https://generativelanguage.googleapis.com/v1beta",
                    api_key="fake-key", model="gemini-3.5-flash",
                    prompt="x", image_b64="ZmFrZQ==", mime_type="image/png", timeout=30,
                )
