"""
AEGIS Inference Providers
Raw HTTP clients for Cerebras and Groq — both OpenAI-compatible chat
completions APIs. Streaming uses Server-Sent Events (SSE): each line is
prefixed "data: " and contains a JSON chunk with
choices[0].delta.content, terminated by a literal "data: [DONE]" line.
This is a different wire format from Ollama's raw JSON-lines-per-token
protocol (no "data: " prefix, no [DONE] sentinel, {"done": true} instead) —
do not reuse Ollama's parsing logic for these providers.
"""
import json
import logging
from typing import AsyncIterator, Callable, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


async def stream_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    max_tokens: int,
    temperature: float,
    timeout: int,
    on_headers: Optional[Callable[[httpx.Headers], None]] = None,
) -> AsyncIterator[str]:
    """
    Streams tokens from an OpenAI-compatible /chat/completions endpoint.
    Yields token strings as they arrive. Raises on HTTP or connection error —
    caller (model_gateway.py) is responsible for circuit breaker bookkeeping.

    on_headers, if supplied, is called once with the response headers as
    soon as they're available (before the body starts streaming) — used by
    model_gateway.py's walk_chain/generate_streaming to cache Groq's/
    Cerebras's real rate-limit-remaining headers for the quota tracker,
    without changing this function's return shape for every other caller.
    """
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    request_body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
        "stop": ["Employee Question:", "---EMPLOYEE"],
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST", f"{base_url}/chat/completions", json=request_body, headers=headers
        ) as response:
            response.raise_for_status()
            if on_headers:
                on_headers(response.headers)
            async for line in response.aiter_lines():
                if not line.strip() or not line.startswith("data: "):
                    continue
                payload = line[len("data: "):]
                if payload.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    token = delta.get("content", "")
                    if token:
                        yield token
                except (json.JSONDecodeError, IndexError):
                    continue


async def call_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    max_tokens: int,
    temperature: float,
    timeout: int,
) -> Tuple[str, httpx.Headers]:
    """
    Non-streaming call — used for judge/CRAG evaluation. Returns
    (response_text, response_headers) — headers are exposed so callers can
    parse Groq's/Cerebras's real rate-limit-remaining values for the quota
    tracker (app/infrastructure/redis_client.py). Callers that don't need
    the headers can simply discard the second element.
    """
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    request_body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{base_url}/chat/completions", json=request_body, headers=headers)
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"].strip(), resp.headers


async def call_vision_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    image_b64: str,
    mime_type: str,
    timeout: int,
) -> Tuple[str, httpx.Headers]:
    """
    Non-streaming vision call. Both Groq and Cerebras use the standard
    OpenAI vision content-array format: content is a list mixing a text
    block and an image_url block, NOT Ollama's separate top-level
    "images" array — this is the key translation this function performs.
    Returns (response_text, response_headers), same reasoning as
    call_chat_completion above.
    """
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    request_body = {
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
            ],
        }],
        "stream": False,
        "temperature": 0.0,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{base_url}/chat/completions", json=request_body, headers=headers)
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"].strip(), resp.headers
