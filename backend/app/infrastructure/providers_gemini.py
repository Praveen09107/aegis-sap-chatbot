"""
AEGIS Google Gemini Adapter
Gemini's generateContent REST shape is not OpenAI-compatible — a separate
module from inference_providers.py, per
INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §4.2.

Used for the vision role's 5th and final tier only (gemini-3.5-flash,
break-glass, 5 requests/minute — see config_inference_chains.py). Never
used for main reasoning or judge, and never streamed — vision calls in
this codebase are always non-streaming.

Confirmed live during inference-model research (2026-07-19):
  request:  POST {base_url}/models/{model}:generateContent?key={api_key}
            {"contents": [{"parts": [{"text": ...}, {"inline_data": {...}}]}]}
  response: {"candidates": [{"content": {"parts": [{"text": "..."}]}}]}
  429 body: {"error": {..., "details": [{"violations": [{"quotaValue": "5", ...}]}]}}

No rate-limit response headers exist on success responses (confirmed —
this is why Gemini uses the sliding-window quota tracker, not header
parsing, unlike Groq/Cerebras).
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _extract_content(payload: dict) -> str:
    candidates = payload.get("candidates", [])
    if not candidates:
        raise ValueError(f"Gemini response had no candidates: {payload}")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts if "text" in part)
    if not text:
        raise ValueError(f"Gemini response had candidates but no text parts: {payload}")
    return text.strip()


def parse_quota_value(response: httpx.Response) -> Optional[int]:
    """
    On a 429, Gemini's error body carries the real per-minute quota value
    that was exceeded — confirmed live: {"quotaValue": "5"}. Informational
    only (the quota tracker's own sliding-window ceiling is the source of
    truth for gating future calls); parsed defensively, never raises.
    """
    try:
        body = response.json()
        for detail in body.get("error", {}).get("details", []):
            for violation in detail.get("violations", []):
                if "quotaValue" in violation:
                    return int(violation["quotaValue"])
    except (ValueError, KeyError, TypeError):
        pass
    return None


async def call_vision_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    image_b64: str,
    mime_type: str,
    timeout: int,
) -> str:
    """Non-streaming Gemini vision call. Auth is a query-string API key,
    not a Bearer header — Gemini's own convention, not this codebase's."""
    url = f"{base_url}/models/{model}:generateContent?key={api_key}"
    body = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type, "data": image_b64}},
            ],
        }],
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=body)
        if resp.status_code == 429:
            quota_value = parse_quota_value(resp)
            logger.warning(f"Gemini 429 for {model}, confirmed quota ceiling: {quota_value}")
        resp.raise_for_status()
        return _extract_content(resp.json())
