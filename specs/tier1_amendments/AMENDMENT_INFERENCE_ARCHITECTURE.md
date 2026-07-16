# AMENDMENT: INFERENCE ARCHITECTURE (CEREBRAS/GROQ MULTI-PROVIDER ROUTING)
## Cross-Cutting Retrofit — Attach Alongside Sessions 11, 16, and Any Session Calling model_gateway
## Place in: specs/tier1_amendments/AMENDMENT_INFERENCE_ARCHITECTURE.md
## Governing decisions: DECISIONS_LOG.md DEC-014 through DEC-023 (rationale, alternatives considered, and full verified rate-limit data — not repeated here)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

This document is not a standalone session. It replaces self-hosted Ollama inference with dual-homed Cerebras/Groq API routing for the three model roles (main reasoning, judge/CRAG, vision), while preserving a configurable local/Ollama path for future air-gapped deployments.

**Attach:** `AEGIS_MASTER_REFERENCE.md`, `AEGIS_DATA_CONTRACTS.md`, `AEGIS_CONFIGURATION_CONSTANTS.md`, this document, `AEGIS_INFERENCE_MODEL_SELECTION.md` (the verified model/rate-limit reference), and whichever of `IMPL_16`, `IMPL_11` you are retrofitting.

**Read this document completely, including `AEGIS_INFERENCE_MODEL_SELECTION.md`, before modifying any file.**

**Before touching `model_gateway.py`, run this diagnostic to confirm its current state matches what this document assumes:**

```bash
grep -n "def select_model_tier\|def get_ollama_config\|class ModelGateway\|def generate_streaming\|def call_judge" backend/app/services/model_gateway.py
```

Expected output: all five match `IMPL_16`'s original spec exactly (5 functions/methods, in this order). If the output differs — additional functions, missing functions, or different signatures — stop and reconcile the difference before proceeding; the FILE 3 replacement below assumes this exact starting state.

**Also run this diagnostic before touching `retrieval_engine.py` or `ollama_vision.py` — both were found, during verification of this amendment, to bypass `model_gateway.py` entirely with their own direct Ollama calls. (An earlier version of this diagnostic incorrectly pointed at `vision_task.py` — corrected after direct inspection of the real repository confirmed the actual client lives in `backend/app/clients/ollama_vision.py`, built by `IMPL_13`, not `IMPL_11`.)**

```bash
grep -n "OLLAMA_JUDGE_URL\|httpx.AsyncClient" backend/app/services/retrieval_engine.py
grep -n "OLLAMA_VISION_URL\|httpx.AsyncClient" backend/app/clients/ollama_vision.py
```

Expected: both show direct Ollama calls matching `IMPL_15`'s `_stage6_crag` and `IMPL_13`'s `ollama_vision.py` respectively. If either file already routes through the new interfaces, the FILE 4/7 retrofits below are unnecessary — verify before applying them.

**A third instance of this same pattern was found in `IMPL_28` (Quick Entry, not yet built) — its `classify_sap()` and `extract_sap_content()` functions hardcode `VISION_SERVICE_URL`/`VISION_MODEL = "llava:13b"`, a genuinely different vision model than the rest of the architecture uses. This resolves `DECISIONS_LOG.md` OPEN-04 (Quick Entry's exact touchpoints) — see FILE 8 below for the full finding and the reasoning for unifying rather than preserving it.**

**Files created or modified by this amendment:**
- `backend/app/config.py` — adds `INFERENCE_MODE` and 9 provider-specific constants
- `backend/app/infrastructure/inference_providers.py` — NEW (raw Cerebras/Groq HTTP call functions)
- `backend/app/services/model_gateway.py` — full replacement (structure preserved, provider logic added)
- `backend/app/clients/ollama_vision.py` — retrofit of `classify_sap()` and `extract_sap_content()` (`vision_task.py` itself needs no changes — see FILE 4b)
- `backend/app/services/retrieval_engine.py` — retrofit of `_stage6_crag`'s direct Ollama call
- Quick Entry's vision module (`IMPL_28`, not yet built) — unifies `classify_sap`/`extract_sap_content` onto the same Groq/Cerebras vision pair
- `.env.example` — adds 9 environment variables
- `docker-compose.yml` — marks the 3 Ollama services as an opt-in profile, not default

---

## FILE 1: backend/app/config.py (ADD CONSTANTS)

Open the existing `backend/app/config.py` and add these lines to the Model Constants section (the file was created in Session 2, extended in Sessions 10 and 21 — do not replace it, just add these constants):

```python
# ADD TO: Model Constants section (alongside MODEL_MAIN_GENERATION, MODEL_JUDGE_CRAG)

INFERENCE_MODE = os.getenv("INFERENCE_MODE", "external")  # "external" | "local"

# External provider — Cerebras (primary for main reasoning + vision fallback)
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY", "")
CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"
CEREBRAS_MODEL_MAIN = "gpt-oss-120b"
CEREBRAS_MODEL_VISION = "gemma-4-31b"

# External provider — Groq (fallback for main reasoning, primary for judge + vision)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODEL_MAIN = "openai/gpt-oss-120b"       # same weights as CEREBRAS_MODEL_MAIN — note the "openai/" prefix Groq requires that Cerebras does not
GROQ_MODEL_JUDGE = "llama-3.1-8b-instant"
GROQ_MODEL_VISION = "meta-llama/llama-4-scout-17b-16e-instruct"  # prefix required — omitting it returns 404

EXTERNAL_INFERENCE_TIMEOUT_SECONDS = 30   # Cerebras/Groq are fast; GENERATION_TIMEOUT_SECONDS (120) remains for the local/Ollama path
```

**Do not remove `MODEL_MAIN_GENERATION`, `MODEL_JUDGE_CRAG`, `OLLAMA_MAIN_URL`, `OLLAMA_JUDGE_URL`, `OLLAMA_VISION_URL`, `MODEL_VISION`, or `VISION_PROCESSING_TIMEOUT`** — these remain in force for `INFERENCE_MODE=local`.

After adding, verify:
```bash
cd backend && source venv/bin/activate
python -c "from app.config import INFERENCE_MODE, CEREBRAS_API_KEY, GROQ_API_KEY, GROQ_MODEL_VISION; print('All constants OK')"
```

---

## FILE 2: backend/app/infrastructure/inference_providers.py (NEW)

Raw HTTP call functions for Cerebras and Groq's OpenAI-compatible chat completions APIs. Both providers share the same request/response shape (confirmed against official documentation for both), so one pair of functions serves both — the only difference between providers is `base_url`, `api_key`, and `model` name, all passed as parameters.

**Why this is a separate file from `model_gateway.py`:** `model_gateway.py`'s job is tier selection and circuit-breaker routing; the actual "how do I speak to this specific provider's API" mechanics belong in their own module, following the same separation already used for `postgres_client.py`, `qdrant_client.py`, etc.

```python
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
from typing import AsyncIterator

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
) -> AsyncIterator[str]:
    """
    Streams tokens from an OpenAI-compatible /chat/completions endpoint.
    Yields token strings as they arrive. Raises on HTTP or connection error —
    caller (model_gateway.py) is responsible for circuit breaker bookkeeping.
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
) -> str:
    """Non-streaming call — used for judge/CRAG evaluation. Returns complete response text."""
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
        return result["choices"][0]["message"]["content"].strip()


async def call_vision_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    image_b64: str,
    mime_type: str,
    timeout: int,
) -> str:
    """
    Non-streaming vision call. Both Groq and Cerebras use the standard
    OpenAI vision content-array format: content is a list mixing a text
    block and an image_url block, NOT Ollama's separate top-level
    "images" array — this is the key translation this function performs.
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
        return result["choices"][0]["message"]["content"].strip()
```

After creating, verify:
```bash
python -c "from app.infrastructure.inference_providers import stream_chat_completion, call_chat_completion, call_vision_completion; print('OK')"
```

---

## FILE 3: backend/app/services/model_gateway.py (FULL REPLACEMENT)

**This file is fully replaced, not diffed** — the diagnostic in AGENT INSTRUCTIONS confirmed the exact starting state, and enough of the internal structure changes (return types, circuit breaker keys, provider branching) that a surgical diff would be harder to follow correctly than a complete replacement. `select_model_tier()` is preserved verbatim — it is provider-agnostic and needed no change.

```python
"""
AEGIS Model Gateway
Routes generation requests to the appropriate inference provider based on
model tier and INFERENCE_MODE. Supports two modes:

  external (default): Cerebras + Groq, dual-homed per role where possible.
    Tier 1 (judge/fast):    Groq (llama-3.1-8b-instant) primary,
                            degrades to the Tier 2/3 pair on exhaustion.
    Tier 2/3 (main):        Cerebras (gpt-oss-120b) primary,
                            Groq (openai/gpt-oss-120b) fallback — same
                            weights, zero output drift on failover.

  local: Ollama, single-provider per role, preserving the original
    demo-era behavior exactly (ollama-judge <-> ollama-main cross-fallback).

Tier 3 condition is checked FIRST, then Tier 1, else Tier 2 — unchanged
from the original spec.
"""
import json
import logging
from typing import AsyncIterator

import httpx

from app.config import (
    INFERENCE_MODE,
    OLLAMA_MAIN_URL, OLLAMA_JUDGE_URL,
    MODEL_MAIN_GENERATION, MODEL_JUDGE_CRAG,
    CEREBRAS_API_KEY, CEREBRAS_BASE_URL, CEREBRAS_MODEL_MAIN,
    GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL_MAIN, GROQ_MODEL_JUDGE,
    GENERATION_TIMEOUT_SECONDS, EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
    GENERATION_TEMPERATURE, GENERATION_MAX_TOKENS,
    JUDGE_MAX_TOKENS, JUDGE_TEMPERATURE,
)
from app.infrastructure.circuit_breaker import circuit_registry
from app.infrastructure.inference_providers import stream_chat_completion, call_chat_completion

logger = logging.getLogger(__name__)


def select_model_tier(classification: str, mode: str, has_diagnostic_object: bool) -> int:
    """UNCHANGED from the original spec — provider-agnostic tier selection."""
    if has_diagnostic_object or mode == "C":
        return 3
    if classification == "SIMPLE_FACT":
        return 1
    return 2


def get_provider_config(tier: int) -> dict:
    """
    Returns a dict describing which provider/model to use for this tier,
    given the current INFERENCE_MODE and circuit breaker states.
    Keys: provider, base_url, model, api_key, max_tokens, temperature,
    timeout, cb_name.
    """
    if INFERENCE_MODE == "local":
        cb_main = circuit_registry.get("ollama_main")
        cb_judge = circuit_registry.get("ollama_judge")
        if tier == 1:
            if not cb_judge.is_open:
                return dict(provider="ollama", base_url=OLLAMA_JUDGE_URL, model=MODEL_JUDGE_CRAG,
                            api_key="", max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                            timeout=GENERATION_TIMEOUT_SECONDS, cb_name="ollama_judge")
            elif not cb_main.is_open:
                logger.warning("Tier 1 fallback: ollama-judge circuit open, using ollama-main")
                return dict(provider="ollama", base_url=OLLAMA_MAIN_URL, model=MODEL_MAIN_GENERATION,
                            api_key="", max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                            timeout=GENERATION_TIMEOUT_SECONDS, cb_name="ollama_main")
            raise RuntimeError("Both ollama-main and ollama-judge circuits are open")
        else:  # tier in {2, 3}
            if not cb_main.is_open:
                return dict(provider="ollama", base_url=OLLAMA_MAIN_URL, model=MODEL_MAIN_GENERATION,
                            api_key="", max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                            timeout=GENERATION_TIMEOUT_SECONDS, cb_name="ollama_main")
            elif not cb_judge.is_open:
                logger.warning("Tier 2/3 fallback: ollama-main circuit open, using ollama-judge")
                return dict(provider="ollama", base_url=OLLAMA_JUDGE_URL, model=MODEL_JUDGE_CRAG,
                            api_key="", max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                            timeout=GENERATION_TIMEOUT_SECONDS, cb_name="ollama_judge")
            raise RuntimeError("Both ollama-main and ollama-judge circuits are open")

    # INFERENCE_MODE == "external"
    cb_cerebras_main = circuit_registry.get("cerebras_main")
    cb_groq_main = circuit_registry.get("groq_main")
    cb_groq_judge = circuit_registry.get("groq_judge")

    if tier == 1:
        if not cb_groq_judge.is_open:
            return dict(provider="groq", base_url=GROQ_BASE_URL, model=GROQ_MODEL_JUDGE,
                        api_key=GROQ_API_KEY, max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="groq_judge")
        # Degrade to the Tier 2/3 pair per DEC-020 — judge output is short/
        # structured, less sensitive to this capability step-up than main
        # answer generation would be.
        logger.warning("Tier 1 degraded: groq_judge circuit open, falling back to main-reasoning pair")
        if not cb_cerebras_main.is_open:
            return dict(provider="cerebras", base_url=CEREBRAS_BASE_URL, model=CEREBRAS_MODEL_MAIN,
                        api_key=CEREBRAS_API_KEY, max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="cerebras_main")
        elif not cb_groq_main.is_open:
            return dict(provider="groq", base_url=GROQ_BASE_URL, model=GROQ_MODEL_MAIN,
                        api_key=GROQ_API_KEY, max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="groq_main")
        raise RuntimeError("groq_judge, cerebras_main, and groq_main circuits are all open")

    else:  # tier in {2, 3}
        if not cb_cerebras_main.is_open:
            return dict(provider="cerebras", base_url=CEREBRAS_BASE_URL, model=CEREBRAS_MODEL_MAIN,
                        api_key=CEREBRAS_API_KEY, max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="cerebras_main")
        elif not cb_groq_main.is_open:
            logger.warning("Tier 2/3 fallback: cerebras_main circuit open, using groq_main (same weights)")
            return dict(provider="groq", base_url=GROQ_BASE_URL, model=GROQ_MODEL_MAIN,
                        api_key=GROQ_API_KEY, max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="groq_main")
        raise RuntimeError("Both cerebras_main and groq_main circuits are open")


class ModelGateway:
    """Manages all calls to inference providers. Handles streaming for
    generation and non-streaming for judge calls, dispatching to Ollama's
    native format or the OpenAI-compatible format depending on provider."""

    async def generate_streaming(self, prompt: str, tier: int, session_id: str) -> AsyncIterator[str]:
        cfg = get_provider_config(tier)
        cb = circuit_registry.get(cfg["cb_name"])
        if not cb.allows_call:
            raise RuntimeError(f"Circuit breaker OPEN for {cfg['cb_name']}")

        try:
            if cfg["provider"] == "ollama":
                # UNCHANGED — original Ollama /api/generate + JSON-lines logic
                request_body = {
                    "model": cfg["model"], "prompt": prompt, "stream": True,
                    "options": {"temperature": cfg["temperature"], "num_predict": cfg["max_tokens"],
                                "stop": ["Employee Question:", "---EMPLOYEE"]},
                }
                async with httpx.AsyncClient(timeout=cfg["timeout"]) as client:
                    async with client.stream("POST", f"{cfg['base_url']}/api/generate", json=request_body) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if not line.strip():
                                continue
                            try:
                                chunk_data = json.loads(line)
                                token = chunk_data.get("response", "")
                                if token:
                                    yield token
                                if chunk_data.get("done", False):
                                    break
                            except json.JSONDecodeError:
                                continue
            else:
                # cerebras / groq — OpenAI-compatible SSE streaming
                async for token in stream_chat_completion(
                    base_url=cfg["base_url"], api_key=cfg["api_key"], model=cfg["model"],
                    prompt=prompt, max_tokens=cfg["max_tokens"], temperature=cfg["temperature"],
                    timeout=cfg["timeout"],
                ):
                    yield token

            cb.record_success()

        except Exception as e:
            cb.record_failure()
            logger.error(f"Generation failed (tier={tier}, provider={cfg['provider']}, model={cfg['model']}): {e}")
            raise

    async def call_judge(self, prompt: str, max_tokens: int = None, temperature: float = None) -> str:
        """
        Non-streaming call for CRAG and judge evaluation. Always targets
        Tier 1's provider. max_tokens/temperature default to JUDGE_MAX_TOKENS/
        JUDGE_TEMPERATURE if not supplied — CRAG (see FILE 7) passes its own
        CRAG_MAX_TOKENS explicitly, since CRAG's budget is intentionally
        smaller than the general judge budget and must not be silently
        widened by routing through this shared method.
        """
        cfg = get_provider_config(1)
        cb = circuit_registry.get(cfg["cb_name"])
        if not cb.allows_call:
            raise RuntimeError(f"Circuit breaker OPEN for {cfg['cb_name']}")

        effective_max_tokens = max_tokens if max_tokens is not None else JUDGE_MAX_TOKENS
        effective_temperature = temperature if temperature is not None else JUDGE_TEMPERATURE

        try:
            if cfg["provider"] == "ollama":
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(
                        f"{cfg['base_url']}/api/generate",
                        json={"model": cfg["model"], "prompt": prompt, "stream": False,
                              "options": {"temperature": effective_temperature, "num_predict": effective_max_tokens}},
                    )
                    resp.raise_for_status()
                    result = resp.json().get("response", "").strip()
            else:
                result = await call_chat_completion(
                    base_url=cfg["base_url"], api_key=cfg["api_key"], model=cfg["model"],
                    prompt=prompt, max_tokens=effective_max_tokens, temperature=effective_temperature,
                    timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
                )
            cb.record_success()
            return result
        except Exception as e:
            cb.record_failure()
            raise


# Singleton
model_gateway = ModelGateway()
```

After replacing, verify:
```bash
python -c "from app.services.model_gateway import model_gateway, select_model_tier, get_provider_config; print('OK')"
```

---

## FILE 4: backend/app/clients/ollama_vision.py (RETROFIT — CORRECTS AN EARLIER VERSION OF THIS AMENDMENT)

**This section previously targeted `backend/app/tasks/vision_task.py`, based on an incorrect trace through `IMPL_11`'s spec text. Confirmed wrong by direct inspection of the real repository.** The actual Ollama vision calls live in `backend/app/clients/ollama_vision.py`, built by `IMPL_13` (not `IMPL_11`) — `vision_task.py` calls into this client rather than making its own request. This is a smaller, cleaner retrofit than originally designed: one file fix here covers the main employee vision pipeline *and*, per FILE 8 below, Quick Entry — `vision_task.py` itself needs no changes at all.

The real file has two functions, each with its own hardcoded timeout (15s classify, 30s extract) — preserve this distinction, don't collapse it into one shared timeout.

```python
# FIND, in classify_sap():
#
#     try:
#         async with httpx.AsyncClient(timeout=15) as client:
#             response = await client.post(
#                 f"{OLLAMA_VISION_URL}/api/generate",
#                 json={
#                     "model": MODEL_VISION,
#                     "prompt": CLASSIFY_PROMPT,
#                     "images": [image_base64],
#                     "stream": False,
#                 },
#             )
#             response.raise_for_status()
#             result_text = response.json().get("response", "").strip().lower()
#
# REPLACE WITH:

result_text = (await _run_vision_prompt(CLASSIFY_PROMPT, image_base64, timeout=15)).strip().lower()
```

```python
# FIND, in extract_sap_content():
#
#     try:
#         async with httpx.AsyncClient(timeout=30) as client:
#             response = await client.post(
#                 f"{OLLAMA_VISION_URL}/api/generate",
#                 json={
#                     "model": MODEL_VISION,
#                     "prompt": prompt,
#                     "images": [image_base64],
#                     "stream": False,
#                 },
#             )
#             response.raise_for_status()
#             result_text = response.json().get("response", "").strip()
#
# REPLACE WITH:

result_text = (await _run_vision_prompt(prompt, image_base64, timeout=30)).strip()
```

**Both functions' existing `try/except httpx.TimeoutException` / `except Exception` blocks stay exactly as they are** — they already return sensible fallback defaults (`TRANSACTION_SCREEN` on classify failure, empty `ExtractedSAPData` on extract failure) and require no change; `_run_vision_prompt()` (added below) raises on failure the same way the original `httpx` call did, so the existing exception handling catches it identically.

Add the shared helper and new imports at the top of the file:

```python
# ADD near the top of the file, alongside the existing imports:

from app.config import (
    INFERENCE_MODE, OLLAMA_VISION_URL, MODEL_VISION,
    CEREBRAS_API_KEY, CEREBRAS_BASE_URL, CEREBRAS_MODEL_VISION,
    GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL_VISION, EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
)
from app.infrastructure.circuit_breaker import circuit_registry
from app.infrastructure.inference_providers import call_vision_completion

# ADD this helper — both classify_sap and extract_sap_content now call it,
# each still passing their own distinct timeout (15 / 30) via the local
# variable, not a shared constant:

async def _run_vision_prompt(prompt: str, image_base64: str, timeout: int) -> str:
    """Shared provider routing for both vision functions in this file.
    image_base64 has no data:image/...;base64, prefix — mime_type is
    assumed image/png for the external providers, since the original
    Ollama-only design never distinguished JPEG/PNG at this layer."""
    if INFERENCE_MODE == "local":
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{OLLAMA_VISION_URL}/api/generate",
                json={"model": MODEL_VISION, "prompt": prompt,
                      "images": [image_base64], "stream": False},
            )
            response.raise_for_status()
            return response.json().get("response", "")

    cb_groq = circuit_registry.get("groq_vision")
    cb_cerebras = circuit_registry.get("cerebras_vision")
    if cb_groq.allows_call:
        try:
            result = await call_vision_completion(
                base_url=GROQ_BASE_URL, api_key=GROQ_API_KEY, model=GROQ_MODEL_VISION,
                prompt=prompt, image_b64=image_base64, mime_type="image/png",
                timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
            )
            cb_groq.record_success()
            return result
        except Exception:
            cb_groq.record_failure()
    if cb_cerebras.allows_call:
        result = await call_vision_completion(
            base_url=CEREBRAS_BASE_URL, api_key=CEREBRAS_API_KEY, model=CEREBRAS_MODEL_VISION,
            prompt=prompt, image_b64=image_base64, mime_type="image/png",
            timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
        )
        cb_cerebras.record_success()
        return result
    raise RuntimeError("Both groq_vision and cerebras_vision circuits are open")
```

**`store_diagnostic_object()` and the `OllamaVisionClient` convenience class need zero changes** — pure Redis storage and a thin wrapper, unrelated to inference routing.

After modifying, verify:
```bash
grep -n "_run_vision_prompt\|call_vision_completion" backend/app/clients/ollama_vision.py
python -c "
import asyncio
from app.clients.ollama_vision import classify_sap
# requires a real base64 test image and CEREBRAS_API_KEY/GROQ_API_KEY set
"
```

---

## FILE 4b: backend/app/tasks/vision_task.py — NO CHANGE REQUIRED

Confirmed by inspecting the real client above: `vision_task.py` calls `classify_sap()`/`extract_sap_content()` from `app.clients.ollama_vision`, which now transparently route through Cerebras/Groq. **Do not modify this file** — the earlier version of this amendment incorrectly targeted it; this entry exists only to record that it was checked and requires nothing.

---

## FILE 5: .env.example (ADD VARIABLES)

```bash
# ADD TO: AI Models section

INFERENCE_MODE=external

CEREBRAS_API_KEY=REPLACE_your_cerebras_api_key
GROQ_API_KEY=REPLACE_your_groq_api_key

# The following are hardcoded in config.py (not environment-driven) since
# they are architectural choices, not per-deployment secrets — listed here
# for reference only, do not duplicate as env vars:
#   CEREBRAS_BASE_URL, CEREBRAS_MODEL_MAIN, CEREBRAS_MODEL_VISION
#   GROQ_BASE_URL, GROQ_MODEL_MAIN, GROQ_MODEL_JUDGE, GROQ_MODEL_VISION
```

---

## FILE 6: docker-compose.yml (MODIFY — Ollama becomes opt-in)

Find the three existing Ollama service definitions (or the single consolidated `aegis-ollama` service, if the laptop-adaptation override was applied) and add a `profiles:` key so they do not start by default under `INFERENCE_MODE=external`:

```yaml
# ADD to each Ollama service definition:
  profiles:
    - local-inference
```

Default `docker compose up -d` no longer starts Ollama. To run in local/air-gapped mode: `docker compose --profile local-inference up -d`.

After modifying, verify:
```bash
docker compose config --services  # Ollama service(s) absent from default output
docker compose --profile local-inference config --services  # Ollama service(s) present
```

---

## FILE 7: backend/app/services/retrieval_engine.py (RETROFIT — apply to the existing IMPL_15 implementation)

**A note on `IMPL_17` (Validation Engine) before this section — no action required there.** `IMPL_17`'s `run_judge_evaluation()` function already calls `model_gateway.call_judge(prompt)` directly, exactly the pattern this amendment's FILE 3 redesigns — unlike `retrieval_engine.py`'s CRAG stage and `vision_task.py`, `IMPL_17` was already correctly delegating to `model_gateway` rather than making its own direct Ollama call. It requires zero retrofit and automatically inherits Cerebras/Groq routing once FILE 3 is applied. Its call passes no explicit `max_tokens` override, which is correct here (unlike CRAG) — its response is a compact 3-value JSON object, well within the default `JUDGE_MAX_TOKENS` budget, with no smaller dedicated budget constant of its own to preserve.

**Found during verification, not assumed:** `retrieval_engine.py`'s Stage 6 (CRAG) makes its own direct `httpx` call to `OLLAMA_JUDGE_URL/api/generate`, exactly like `vision_task.py` did — it does not go through `model_gateway.py` at all in the original spec. Confirmed directly against `IMPL_15_RETRIEVAL_STAGES_6_TO_8.md`'s actual `_stage6_crag` content.

Open the existing `retrieval_engine.py` (created in Session 15 — do not replace it).

```python
# FIND this block inside _stage6_crag():
#
#     from app.config import (
#         CRAG_SKIP_THRESHOLD_MODE_A, CRAG_SKIP_THRESHOLD_MODE_B,
#         OLLAMA_JUDGE_URL, MODEL_JUDGE_CRAG, CRAG_MAX_TOKENS, JUDGE_TEMPERATURE,
#     )
#     ...
#     try:
#         async with httpx.AsyncClient(timeout=60) as client:
#             resp = await client.post(
#                 f"{OLLAMA_JUDGE_URL}/api/generate",
#                 json={
#                     "model": MODEL_JUDGE_CRAG,
#                     "prompt": crag_prompt,
#                     "stream": False,
#                     "options": {"temperature": JUDGE_TEMPERATURE, "num_predict": CRAG_MAX_TOKENS},
#                 },
#             )
#             resp.raise_for_status()
#             model_response = resp.json().get("response", "").strip()
#
# REPLACE WITH:

from app.config import CRAG_SKIP_THRESHOLD_MODE_A, CRAG_SKIP_THRESHOLD_MODE_B, CRAG_MAX_TOKENS, JUDGE_TEMPERATURE
from app.services.model_gateway import model_gateway

try:
    model_response = await model_gateway.call_judge(
        crag_prompt, max_tokens=CRAG_MAX_TOKENS, temperature=JUDGE_TEMPERATURE
    )

# The rest of the try block — parsing SUFFICIENT/INSUFFICIENT, the
# ambiguous-response fallback, and the except Exception handler below it —
# is entirely unchanged. model_response is a plain string in both the old
# and new versions, so no downstream parsing logic differs.
```

**Why `CRAG_MAX_TOKENS` is passed explicitly:** CRAG's token budget (200) is intentionally smaller than the general judge budget (`JUDGE_MAX_TOKENS`, 300) — `call_judge()`'s optional override parameters (FILE 3) exist specifically to preserve this distinction rather than silently widening CRAG's budget by routing it through the shared method with defaults.

**Remove the now-unused `httpx` import from this file's CRAG-related code path** if `httpx` was only imported for this call — check whether other stages in the same file still use `httpx` directly before removing the import entirely.

After modifying, verify:
```bash
grep -n "model_gateway.call_judge" backend/app/services/retrieval_engine.py
grep -n "OLLAMA_JUDGE_URL" backend/app/services/retrieval_engine.py
# second command expected to return nothing if the import was cleaned up
```

---

## FILE 8: Quick Entry Vision — REUSE THE EXISTING CLIENT, DO NOT DUPLICATE IT (apply when building IMPL_28)

**Substantially simpler than an earlier version of this section, now that `backend/app/clients/ollama_vision.py`'s real content is confirmed.** `IMPL_28_QUICK_ENTRY_SCREENSHOT_PIPELINE.md`'s own spec text describes building a *separate* vision client hardcoding `VISION_MODEL = "llava:13b"` — a different model than the rest of the architecture, with no rationale found anywhere (`DECISIONS_LOG.md` DEC-034). Now that the real `ollama_vision.py` is known to already export exactly the generic, reusable functions Quick Entry needs — `classify_sap(image_base64: str) -> SAPScreenshotType` and `extract_sap_content(image_base64: str, screen_type) -> ExtractedSAPData`, both already retrofitted to Cerebras/Groq by FILE 4 above — the correct fix is not a parallel retrofit. **It's reuse.**

```python
# When building IMPL_28's screenshot-enrichment ARQ task (enrich_entry_screenshots),
# DO NOT create a separate app/clients/ollama_vision.py-style client hardcoding
# VISION_SERVICE_URL / VISION_MODEL = "llava:13b". INSTEAD:

from app.clients.ollama_vision import classify_sap, extract_sap_content

# ... inside the task, after reading and base64-encoding the screenshot:
screen_type = await classify_sap(image_base64)
extracted = await extract_sap_content(image_base64, screen_type)

# extracted.error_codes, extracted.t_codes, extracted.field_values, etc.
# are already exactly the structured data Quick Entry's own processing
# pipeline needs — map these into whatever Quick Entry-specific storage
# IMPL_28 defines (the knowledge_form_screenshots table, per
# AMENDMENT_OBJECT_STORAGE_MINIO.md), rather than parsing a second,
# differently-shaped response format from a duplicate client.
```

**This means Quick Entry automatically inherits Cerebras/Groq routing with zero additional retrofit work**, the same "already correctly delegates" pattern already established for `IMPL_17`'s validation judge call (see FILE 7's note above) — the only difference is `IMPL_28` hasn't been built yet, so this is guidance for how to build it correctly the first time, not a retrofit of existing code.

**Do not call `store_diagnostic_object()`** from `ollama_vision.py` — that function's Redis key format (`diagnostic:{session_id}:{screenshot_id}`, 600s TTL) is specific to the live employee chat session flow. Quick Entry's own storage (the `knowledge_form_screenshots` table and its MinIO integration) is separate and already correctly specified in `IMPL_28`'s own spec — only the *vision inference calls* are being reused here, not the storage layer.

After building, verify:
```bash
grep -n "from app.clients.ollama_vision import\|VISION_SERVICE_URL\|llava" backend/app/tasks/quick_entry_screenshot_task.py  # or wherever IMPL_28 lands
# Expect the import present; VISION_SERVICE_URL and llava absent entirely
```

---

## VERIFICATION STEPS

```bash
# Constants and modules load
python -c "from app.config import INFERENCE_MODE, CEREBRAS_API_KEY, GROQ_API_KEY; print(INFERENCE_MODE)"
python -c "from app.infrastructure.inference_providers import stream_chat_completion, call_chat_completion, call_vision_completion; print('OK')"
python -c "from app.services.model_gateway import model_gateway, get_provider_config; print('OK')"

# Circuit breaker keys are generic — confirm the registry accepts the new names
python -c "
from app.infrastructure.circuit_breaker import circuit_registry
for name in ['cerebras_main', 'groq_main', 'groq_judge', 'groq_vision', 'cerebras_vision']:
    cb = circuit_registry.get(name)
    print(name, cb.allows_call)
"

# End-to-end: a real Tier 2/3 query should route to Cerebras first
# (requires CEREBRAS_API_KEY and GROQ_API_KEY set in .env)
python3 -c "
import asyncio
from app.services.model_gateway import model_gateway

async def test():
    tokens = []
    async for token in model_gateway.generate_streaming('Say hello in one sentence.', tier=2, session_id='test'):
        tokens.append(token)
    print(''.join(tokens))

asyncio.run(test())
"

# Confirm Ollama is NOT running by default
docker ps --format "{{.Names}}" | grep -i ollama
# expect empty output under INFERENCE_MODE=external

# Run the benchmark script for a fuller check across all three roles
python aegis_inference_benchmark.py
```

---

## WHEN ALL VERIFICATIONS PASS

Update `DECISIONS_LOG.md` DEC-023's status from OPEN to CONFIRMED once the benchmark script has been run with real API keys and Section 6 of `AEGIS_INFERENCE_MODEL_SELECTION.md` has been filled in with actual latency figures. Run the full existing test suite for `model_gateway.py` and `ollama_vision.py` to confirm no regression:

```bash
python -m pytest tests/unit/test_model_gateway.py tests/unit/test_ollama_vision.py tests/unit/test_retrieval_stages_6_to_8.py -v
```

If retrofitting already-implemented `IMPL_16`/`IMPL_11` output, proceed to whichever session in the backlog is next (per `BACKEND_AGENT_SESSION_GUIDE.md` v4's ordering). If this amendment was applied as part of a fresh session build, continue with that session's own remaining steps.
