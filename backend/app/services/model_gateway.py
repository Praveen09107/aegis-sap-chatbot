"""
AEGIS Model Gateway
Routes generation requests to the appropriate Ollama instance based on model tier.

Tier 1 (Qwen2.5-7B, ollama-judge):
  - SIMPLE_FACT queries where speed matters more than depth
  - Fast responses for common lookups

Tier 2 (Qwen2.5-32B, ollama-main):
  - ERROR_RESOLUTION, PROCESS, CONFIG queries
  - Standard generation with full context window

Tier 3 (Qwen2.5-32B, ollama-main, longer budget):
  - Mode C multi-module queries
  - Vision-enriched queries with DiagnosticObject
  - Queries requiring synthesis across multiple documents

Tier 3 condition is checked FIRST, then Tier 1, else Tier 2.

Circuit breaker fallback:
  Tier 1: ollama-judge → fallback ollama-main → raise RuntimeError
  Tier 2/3: ollama-main → fallback ollama-judge → raise RuntimeError
"""
import json
import logging
from typing import AsyncIterator

import httpx

from app.config import (
    OLLAMA_MAIN_URL,
    OLLAMA_JUDGE_URL,
    MODEL_MAIN_GENERATION,
    MODEL_JUDGE_CRAG,
    GENERATION_TIMEOUT_SECONDS,
    GENERATION_TEMPERATURE,
    GENERATION_MAX_TOKENS,
    JUDGE_MAX_TOKENS,
    JUDGE_TEMPERATURE,
)
from app.infrastructure.circuit_breaker import circuit_registry

logger = logging.getLogger(__name__)


def select_model_tier(
    enriched_query,
    retrieval_result,
    has_diagnostic_object: bool,
) -> int:
    """
    Determine model tier for generation.

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


def get_ollama_config(tier: int) -> tuple:
    """
    Return (base_url, model_name, max_tokens, temperature) for a tier.
    Checks circuit breakers and applies fallback if needed.
    """
    cb_main = circuit_registry.get("ollama_main")
    cb_judge = circuit_registry.get("ollama_judge")

    if tier == 1:
        # Tier 1: prefer ollama-judge (fast 7B model)
        if not cb_judge.is_open:
            return OLLAMA_JUDGE_URL, MODEL_JUDGE_CRAG, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE
        elif not cb_main.is_open:
            logger.warning("Tier 1 fallback: ollama-judge circuit open, using ollama-main")
            return OLLAMA_MAIN_URL, MODEL_MAIN_GENERATION, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE
        else:
            raise RuntimeError("Both ollama-main and ollama-judge circuits are open")

    elif tier in {2, 3}:
        # Tiers 2+3: prefer ollama-main (32B model)
        if not cb_main.is_open:
            return OLLAMA_MAIN_URL, MODEL_MAIN_GENERATION, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE
        elif not cb_judge.is_open:
            logger.warning("Tier 2/3 fallback: ollama-main circuit open, using ollama-judge")
            return OLLAMA_JUDGE_URL, MODEL_JUDGE_CRAG, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE
        else:
            raise RuntimeError("Both ollama-main and ollama-judge circuits are open")

    raise ValueError(f"Invalid tier: {tier}")


class ModelGateway:
    """
    Manages all calls to Ollama inference servers.
    Handles streaming for generation and non-streaming for judge calls.
    """

    async def generate_streaming(
        self,
        prompt: str,
        tier: int,
        session_id: str,
    ) -> AsyncIterator[str]:
        """
        Stream tokens from Ollama. Yields token strings as they arrive.
        Updates circuit breakers on success/failure.

        Stop sequences: ["Employee Question:", "---EMPLOYEE"]
        """
        base_url, model, max_tokens, temperature = get_ollama_config(tier)
        cb_name = "ollama_main" if base_url == OLLAMA_MAIN_URL else "ollama_judge"
        cb = circuit_registry.get(cb_name)

        request_body = {
            "model": model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "stop": ["Employee Question:", "---EMPLOYEE"],
            },
        }

        try:
            async with httpx.AsyncClient(timeout=GENERATION_TIMEOUT_SECONDS) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/generate",
                    json=request_body,
                ) as response:
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

            cb.record_success()

        except Exception as e:
            cb.record_failure()
            logger.error(f"Generation failed (tier={tier}, model={model}): {e}")
            raise

    async def call_judge(self, prompt: str) -> str:
        """
        Non-streaming call to Qwen2.5-7B for CRAG and judge evaluation.
        Returns complete model response as string.
        Always targets ollama-judge with JUDGE_MAX_TOKENS/JUDGE_TEMPERATURE.
        """
        cb = circuit_registry.get("ollama_judge")
        if not cb.allows_call:
            raise RuntimeError("Circuit breaker OPEN for ollama-judge")

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{OLLAMA_JUDGE_URL}/api/generate",
                    json={
                        "model": MODEL_JUDGE_CRAG,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": JUDGE_TEMPERATURE,
                            "num_predict": JUDGE_MAX_TOKENS,
                        },
                    },
                )
                resp.raise_for_status()
                result = resp.json().get("response", "").strip()
                cb.record_success()
                return result
        except Exception as e:
            cb.record_failure()
            raise


# Singleton
model_gateway = ModelGateway()
