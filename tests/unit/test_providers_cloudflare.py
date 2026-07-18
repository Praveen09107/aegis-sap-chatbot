"""
Unit tests for the Cloudflare Workers AI adapter (Phase 1). Fixture
responses are the REAL shapes captured during live inference-model
research (2026-07-18/19), not invented — see providers_cloudflare.py's
module docstring for the raw examples these are drawn from. No live HTTP
calls anywhere in this file, per INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md
§6's testing constraint.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.infrastructure.providers_cloudflare import (
    call_chat_completion, call_vision_completion, _extract_content_from_result, _is_openai_namespace,
)


class TestIsOpenAINamespace:
    def test_openai_model_detected(self):
        assert _is_openai_namespace("@cf/openai/gpt-oss-120b") is True

    def test_non_openai_model_detected(self):
        assert _is_openai_namespace("@cf/meta/llama-4-scout-17b-16e-instruct") is False


class TestExtractContentFromResult:
    def test_responses_api_shape(self):
        # Real shape captured for @cf/openai/gpt-oss-120b
        result = {
            "output": [
                {"type": "reasoning", "content": [{"text": "thinking...", "type": "reasoning_text"}]},
                {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "Hello"}]},
            ],
        }
        assert _extract_content_from_result(result, "@cf/openai/gpt-oss-120b") == "Hello"

    def test_flat_response_shape(self):
        # Real shape captured for @cf/meta/llama-4-scout-17b-16e-instruct
        result = {"response": "Hello!", "tool_calls": [], "usage": {}}
        assert _extract_content_from_result(result, "@cf/meta/llama-4-scout-17b-16e-instruct") == "Hello!"

    def test_choices_shape(self):
        # Real shape captured for @cf/google/gemma-4-26b-a4b-it
        result = {"choices": [{"message": {"content": "Green", "role": "assistant"}}]}
        assert _extract_content_from_result(result, "@cf/google/gemma-4-26b-a4b-it") == "Green"

    def test_unrecognized_shape_raises(self):
        with pytest.raises(ValueError):
            _extract_content_from_result({"something_else": True}, "some-model")

    def test_responses_shape_with_no_message_item_raises(self):
        with pytest.raises(ValueError):
            _extract_content_from_result({"output": [{"type": "reasoning", "content": []}]}, "@cf/openai/gpt-oss-120b")


def _mock_response(json_body: dict, neuron_header: str = "5.78", status: int = 200):
    resp = MagicMock()
    resp.status_code = status
    resp.headers = {"cf-ai-neurons": neuron_header}
    resp.json.return_value = json_body
    resp.raise_for_status = MagicMock()
    return resp


class TestCallChatCompletion:
    @pytest.mark.asyncio
    async def test_openai_namespace_uses_input_body_and_parses_responses_shape(self):
        mock_resp = _mock_response({
            "success": True,
            "result": {"output": [{"type": "message", "content": [{"type": "output_text", "text": "Hi"}]}]},
        }, neuron_header="0.00")

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            content, neuron_cost = await call_chat_completion(
                base_url="https://api.cloudflare.com/client/v4/accounts/x/ai/run",
                api_key="tok", model="@cf/openai/gpt-oss-120b", prompt="say hi", timeout=30,
            )

        assert content == "Hi"
        assert neuron_cost == 0.0
        call_kwargs = mock_client.post.call_args
        assert "input" in call_kwargs.kwargs["json"]

    @pytest.mark.asyncio
    async def test_non_openai_namespace_uses_messages_body(self):
        mock_resp = _mock_response({"success": True, "result": {"response": "Hello!"}}, neuron_header="5.78")

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            content, neuron_cost = await call_chat_completion(
                base_url="https://api.cloudflare.com/client/v4/accounts/x/ai/run",
                api_key="tok", model="@cf/meta/llama-4-scout-17b-16e-instruct", prompt="say hi", timeout=30,
            )

        assert content == "Hello!"
        assert neuron_cost == 5.78
        call_kwargs = mock_client.post.call_args
        assert "messages" in call_kwargs.kwargs["json"]

    @pytest.mark.asyncio
    async def test_cloudflare_success_false_raises(self):
        mock_resp = _mock_response({"success": False, "errors": [{"message": "model not on free plan"}]})

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            with pytest.raises(RuntimeError):
                await call_chat_completion(
                    base_url="https://api.cloudflare.com/client/v4/accounts/x/ai/run",
                    api_key="tok", model="@cf/zai-org/glm-5.2", prompt="say hi", timeout=30,
                )

    @pytest.mark.asyncio
    async def test_missing_neuron_header_defaults_to_zero(self):
        resp = MagicMock()
        resp.headers = {}
        resp.json.return_value = {"success": True, "result": {"response": "ok"}}
        resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            _, neuron_cost = await call_chat_completion(
                base_url="https://api.cloudflare.com/client/v4/accounts/x/ai/run",
                api_key="tok", model="@cf/meta/llama-4-scout-17b-16e-instruct", prompt="hi", timeout=30,
            )
        assert neuron_cost == 0.0


class TestCallVisionCompletion:
    @pytest.mark.asyncio
    async def test_vision_call_sends_content_array_with_image(self):
        mock_resp = _mock_response({"success": True, "result": {"response": "Blue"}}, neuron_header="5.78")

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            content, neuron_cost = await call_vision_completion(
                base_url="https://api.cloudflare.com/client/v4/accounts/x/ai/run",
                api_key="tok", model="@cf/meta/llama-4-scout-17b-16e-instruct",
                prompt="what color", image_b64="ZmFrZQ==", mime_type="image/png", timeout=30,
            )

        assert content == "Blue"
        assert neuron_cost == 5.78
        sent_body = mock_client.post.call_args.kwargs["json"]
        content_blocks = sent_body["messages"][0]["content"]
        assert any(b.get("type") == "image_url" for b in content_blocks)
        assert any(b.get("type") == "text" for b in content_blocks)
