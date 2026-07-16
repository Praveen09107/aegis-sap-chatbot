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


def select_model_tier(
    enriched_query,
    retrieval_result,
    has_diagnostic_object: bool,
) -> int:
    """
    UNCHANGED from the original spec — provider-agnostic tier selection.

    Check order:
      Tier 3 FIRST: has_diagnostic_object OR retrieval_mode == "C"
      Tier 1: classification == "SIMPLE_FACT" (and not Tier 3)
      Tier 2: everything else
    """
    classification = enriched_query.classification
    mode = enriched_query.retrieval_mode

    # Tier 3: Vision-enriched or complex multi-module (check FIRST)
    if has_diagnostic_object or mode == "C":
        return 3

    # Tier 1: Simple factual queries (fast path)
    if classification == "SIMPLE_FACT":
        return 1

    # Tier 2: Standard operational queries
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
