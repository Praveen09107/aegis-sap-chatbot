"""
AEGIS Cloudflare Workers AI Adapter
Cloudflare's /ai/run/{model} REST shape is NOT OpenAI-/chat/completions-
compatible — this is a separate module from inference_providers.py rather
than a fourth branch bolted onto it, per
INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §4.2.

Confirmed live during inference-model research (2026-07-18/19) that
different Cloudflare-hosted model families return genuinely different
response shapes on the same /ai/run endpoint — this is not a guess, each
shape below was directly observed:
  - "@cf/openai/*" models (Responses API style):
        request:  {"input": [{"role": "user", "content": ...}]}
        response: {"result": {"output": [{"type": "reasoning", ...},
                                          {"type": "message", "content":
                                              [{"type": "output_text", "text": "..."}]}]}}
  - "@cf/meta/*" models (flat shape):
        request:  {"messages": [...]}
        response: {"result": {"response": "..."}}
  - "@cf/google/*" and other chat-style models:
        request:  {"messages": [...]}
        response: {"result": {"choices": [{"message": {"content": "..."}}]}}

All three response shapes are parsed defensively in
_extract_content_from_result — a model returning an unrecognized shape
raises rather than silently returning an empty string, since a silent
empty answer is worse than a visible failure the caller's circuit breaker
can react to.

Every response is also checked for the `cf-ai-neurons` header — Cloudflare's
real per-call cost signal, consumed by the quota tracker
(app/infrastructure/redis_client.py's neuron-pool methods), never discarded.
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _is_openai_namespace(model: str) -> bool:
    return model.startswith("@cf/openai/")


def _extract_neuron_cost(response: httpx.Response) -> float:
    raw = response.headers.get("cf-ai-neurons")
    if raw is None:
        return 0.0
    try:
        return float(raw)
    except ValueError:
        logger.warning(f"Cloudflare: unparseable cf-ai-neurons header value: {raw!r}")
        return 0.0


def _extract_content_from_result(result: dict, model: str) -> str:
    """Parse whichever of the three real, confirmed Cloudflare response
    shapes is present. Raises ValueError on an unrecognized shape rather
    than returning an empty string — see module docstring."""
    if "output" in result:
        for item in result["output"]:
            if item.get("type") == "message":
                for part in item.get("content", []):
                    if part.get("type") == "output_text":
                        return part.get("text", "").strip()
        raise ValueError(f"Cloudflare Responses-API shape had no message/output_text item (model={model})")

    if "response" in result:
        return result["response"].strip()

    if "choices" in result:
        return result["choices"][0]["message"]["content"].strip()

    raise ValueError(f"Unrecognized Cloudflare response shape for model={model}: keys={list(result.keys())}")


async def call_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    timeout: int,
) -> tuple[str, float]:
    """
    Non-streaming Cloudflare Workers AI call. Returns (content, neuron_cost).
    base_url is CLOUDFLARE_BASE_URL (already includes the account ID) —
    the model name is appended as the final path segment.
    """
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"input": [{"role": "user", "content": prompt}]} if _is_openai_namespace(model) \
        else {"messages": [{"role": "user", "content": prompt}]}

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{base_url}/{model}", json=body, headers=headers)
        resp.raise_for_status()
        neuron_cost = _extract_neuron_cost(resp)
        payload = resp.json()
        if not payload.get("success", True):
            raise RuntimeError(f"Cloudflare call failed for {model}: {payload.get('errors')}")
        content = _extract_content_from_result(payload["result"], model)
        return content, neuron_cost


async def call_vision_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    image_b64: str,
    mime_type: str,
    timeout: int,
) -> tuple[str, float]:
    """
    Non-streaming Cloudflare vision call. Confirmed live for
    "@cf/meta/llama-4-scout-17b-16e-instruct" and "@cf/google/gemma-4-26b-a4b-it" —
    both accept the OpenAI-style content-array shape via /ai/run's "messages" body.
    """
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
            ],
        }],
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{base_url}/{model}", json=body, headers=headers)
        resp.raise_for_status()
        neuron_cost = _extract_neuron_cost(resp)
        payload = resp.json()
        if not payload.get("success", True):
            raise RuntimeError(f"Cloudflare vision call failed for {model}: {payload.get('errors')}")
        content = _extract_content_from_result(payload["result"], model)
        return content, neuron_cost


async def stream_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    timeout: int,
):
    """
    Streaming Cloudflare call for the main-reasoning role's bounded
    pre-first-byte fallback (Phase 4b). Cloudflare documents SSE streaming
    via "stream": true using the same "data: " framing as OpenAI-compatible
    APIs for text-generation models.

    NOT live-tested against a real Cloudflare account in this implementation
    pass — every other function in this module was verified live during
    inference-model research; this one was not, since the research phase
    only exercised non-streaming calls. Verify against a real account before
    relying on this in production (see INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md
    §6's testing section) — flagged explicitly rather than silently assumed correct.
    """
    import json as _json

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"input": [{"role": "user", "content": prompt}], "stream": True} if _is_openai_namespace(model) \
        else {"messages": [{"role": "user", "content": prompt}], "stream": True}

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", f"{base_url}/{model}", json=body, headers=headers) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip() or not line.startswith("data: "):
                    continue
                payload = line[len("data: "):]
                if payload.strip() == "[DONE]":
                    break
                try:
                    chunk = _json.loads(payload)
                    token = (
                        chunk.get("response")
                        or (chunk.get("choices", [{}])[0].get("delta", {}).get("content"))
                        or ""
                    )
                    if token:
                        yield token
                except (_json.JSONDecodeError, IndexError):
                    continue
