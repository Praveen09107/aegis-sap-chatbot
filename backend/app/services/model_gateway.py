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
import re
import time
from typing import AsyncIterator, List, Optional

import httpx

from app.config import (
    INFERENCE_MODE,
    OLLAMA_MAIN_URL, OLLAMA_JUDGE_URL,
    MODEL_MAIN_GENERATION, MODEL_JUDGE_CRAG,
    CEREBRAS_BASE_URL, CEREBRAS_MODEL_MAIN,
    GROQ_BASE_URL, GROQ_MODEL_MAIN, GROQ_MODEL_JUDGE,
    GENERATION_TIMEOUT_SECONDS, EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
    GENERATION_TEMPERATURE, GENERATION_MAX_TOKENS,
    JUDGE_MAX_TOKENS, JUDGE_TEMPERATURE,
    MAIN_CASCADE_BUDGET_SECONDS, JUDGE_CASCADE_BUDGET_SECONDS, VISION_CASCADE_BUDGET_SECONDS,
    CLOUDFLARE_NEURON_DAILY_CEILING, SAMBANOVA_RPD_CEILING, GEMINI_RPM_CEILING,
)
from app.config_inference_chains import INFERENCE_CHAINS, get_provider_key
from app.infrastructure.circuit_breaker import circuit_registry
from app.infrastructure.inference_providers import (
    stream_chat_completion, call_chat_completion, call_vision_completion,
)
from app.infrastructure import providers_cloudflare, providers_gemini

logger = logging.getLogger(__name__)


class InferenceChainExhausted(Exception):
    """Raised by walk_chain() / generate_streaming() when every tier in a
    role's chain was either skipped (circuit open or quota exhausted) or
    attempted-and-failed. Carries which tiers were actually attempted
    (HTTP calls made), distinct from tiers merely skipped, for logging."""

    def __init__(self, role: str, attempted: List[str]):
        self.role = role
        self.attempted = attempted
        super().__init__(f"Inference chain exhausted for role={role}, attempted tiers: {attempted}")


# ============================================================
# N-tier chain orchestration (INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md).
# Everything below this line is new; select_model_tier() and
# get_provider_config() (further down) are UNCHANGED and remain the only
# routing path for INFERENCE_MODE=local — this orchestration layer exists
# purely for INFERENCE_MODE=external's multi-provider chains.
# ============================================================

_DURATION_PATTERN = re.compile(r"(?:(\d+)m)?(?:([\d.]+)s)?(?:([\d.]+)ms)?$")


def _parse_groq_duration_to_seconds(raw: str) -> int:
    """
    Groq's reset-time headers use a human-readable duration string
    (confirmed live: "1m26.4s", "4m19.2s", "585ms", "17.189s") rather than
    a plain integer — no standard library parses this format. Defensive:
    an unparseable string returns a safe 60s default rather than raising,
    since this value only sets a cache TTL, never gates a call directly.
    """
    try:
        match = _DURATION_PATTERN.match(raw.strip())
        if not match:
            return 60
        minutes, seconds, millis = match.groups()
        total = 0.0
        if minutes:
            total += int(minutes) * 60
        if seconds:
            total += float(seconds)
        if millis:
            total += float(millis) / 1000
        return max(int(total), 1)
    except (ValueError, AttributeError):
        return 60


async def _record_quota_from_headers(tier: dict, headers: httpx.Headers) -> None:
    """
    Parses and caches Groq's/Cerebras's real rate-limit-remaining headers.
    Defensive per Design Principle: a missing or malformed header logs a
    warning and simply doesn't update the cache — it never writes a false
    "zero remaining" value that could block a healthy tier. Only called for
    quota_kind in {"header_groq", "header_cerebras"}.
    """
    from app.infrastructure.redis_client import redis_session

    try:
        if tier["quota_kind"] == "header_groq":
            remaining = headers.get("x-ratelimit-remaining-requests")
            reset_raw = headers.get("x-ratelimit-reset-requests", "60s")
            if remaining is None:
                return
            reset_seconds = _parse_groq_duration_to_seconds(reset_raw)
            await redis_session.cache_header_quota(tier["provider"], tier["model"], int(remaining), reset_seconds)
            _set_quota_gauge(tier["provider"], tier["model"], int(remaining))
        elif tier["quota_kind"] == "header_cerebras":
            remaining = headers.get("x-ratelimit-remaining-requests-day")
            if remaining is None:
                return
            # Cerebras's day-scoped header has no per-response reset-duration
            # field — cache for 5 minutes, short enough to stay reasonably
            # fresh, long enough to avoid re-parsing headers on every call.
            await redis_session.cache_header_quota(tier["provider"], tier["model"], int(remaining), 300)
            _set_quota_gauge(tier["provider"], tier["model"], int(remaining))
    except (ValueError, TypeError) as e:
        logger.warning(f"Malformed rate-limit header for {tier['provider']}/{tier['model']}, not caching: {e}")


def _set_quota_gauge(provider: str, model: str, remaining: int) -> None:
    """
    Live-updates the quota-remaining Gauge at the same call site the Redis
    cache is written, per INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §4.4
    — this is what makes quota exhaustion something Grafana can alert on as
    it happens, not just something visible up to 6 hours late via the
    health-check cron's snapshot. Scoped to the two header-based providers
    (Groq, Cerebras) in this implementation pass, where an exact remaining
    count is already available for free by the time this is called — the
    sliding-window (SambaNova/Gemini) and neuron-pool (Cloudflare) quota
    kinds don't set this gauge yet, a deliberate, disclosed scope cut, not
    an oversight; their state is still fully visible via the health-check
    cron's periodic snapshot (§4.6) and the admin endpoint (§4.8).
    """
    from app.observability import INFERENCE_QUOTA_REMAINING
    INFERENCE_QUOTA_REMAINING.labels(provider=provider, model=model).set(remaining)


async def _check_tier_quota(tier: dict) -> bool:
    """
    Uniform quota-check dispatch by quota_kind — walk_chain() and
    generate_streaming() never special-case a provider inline (Design
    Principle: keep the routing engine provider-agnostic). Order matters:
    called BEFORE the circuit-breaker check in both callers, per Design
    Principle 4 — a tight-quota provider like Gemini should be skipped
    before ever generating a failure for the circuit breaker to react to.
    """
    from app.infrastructure.redis_client import redis_session

    kind = tier["quota_kind"]
    if kind in ("header_groq", "header_cerebras"):
        return await redis_session.has_header_quota(tier["provider"], tier["model"])
    if kind == "sliding_window":
        if tier["provider"] == "sambanova":
            return await redis_session.reserve_sliding_window_quota(
                tier["provider"], tier["model"], window_seconds=86400, max_requests=SAMBANOVA_RPD_CEILING)
        if tier["provider"] == "gemini":
            return await redis_session.reserve_sliding_window_quota(
                tier["provider"], tier["model"], window_seconds=60, max_requests=GEMINI_RPM_CEILING)
        return True
    if kind == "neuron_pool":
        return await redis_session.cloudflare_quota_available(CLOUDFLARE_NEURON_DAILY_CEILING)
    return True


async def _dispatch_tier_nonstreaming(
    tier: dict, prompt: str, max_tokens: int, temperature: float,
    image_b64: Optional[str] = None, mime_type: str = "image/png",
) -> str:
    """Single non-streaming HTTP call for one chain tier — used by
    walk_chain() (judge, all 3 vision call sites). Dispatches on
    wire_format; records quota-tracker state as a side effect where
    applicable, never raises for a quota-recording failure (only for the
    actual inference call failing, which the caller's circuit breaker
    bookkeeping depends on)."""
    from app.infrastructure.redis_client import redis_session

    wire_format = tier["wire_format"]

    if image_b64 is not None:
        if wire_format == "openai":
            content, headers = await call_vision_completion(
                base_url=tier["base_url"], api_key=tier["api_key"], model=tier["model"],
                prompt=prompt, image_b64=image_b64, mime_type=mime_type,
                timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
            )
            await _record_quota_from_headers(tier, headers)
            return content
        if wire_format == "cloudflare":
            content, neuron_cost = await providers_cloudflare.call_vision_completion(
                base_url=tier["base_url"], api_key=tier["api_key"], model=tier["model"],
                prompt=prompt, image_b64=image_b64, mime_type=mime_type,
                timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
            )
            await redis_session.record_cloudflare_neuron_cost(neuron_cost)
            return content
        if wire_format == "gemini":
            return await providers_gemini.call_vision_completion(
                base_url=tier["base_url"], api_key=tier["api_key"], model=tier["model"],
                prompt=prompt, image_b64=image_b64, mime_type=mime_type,
                timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
            )
        raise RuntimeError(f"No vision dispatch for wire_format={wire_format}")

    if wire_format == "openai":
        content, headers = await call_chat_completion(
            base_url=tier["base_url"], api_key=tier["api_key"], model=tier["model"],
            prompt=prompt, max_tokens=max_tokens, temperature=temperature,
            timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
        )
        await _record_quota_from_headers(tier, headers)
        return content
    if wire_format == "cloudflare":
        content, neuron_cost = await providers_cloudflare.call_chat_completion(
            base_url=tier["base_url"], api_key=tier["api_key"], model=tier["model"],
            prompt=prompt, timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
        )
        await redis_session.record_cloudflare_neuron_cost(neuron_cost)
        return content
    raise RuntimeError(f"No text dispatch for wire_format={wire_format} (Gemini is vision-only in this chain design)")


async def _stream_tier(tier: dict, prompt: str, max_tokens: int, temperature: float) -> AsyncIterator[str]:
    """Streaming HTTP call for one chain tier — used only by
    generate_streaming()'s bounded pre-first-byte fallback (Phase 4b),
    never by walk_chain(). Quota-header recording happens via the
    on_headers callback since streaming responses don't return a
    conventional (content, headers) tuple."""
    from app.infrastructure.redis_client import redis_session

    wire_format = tier["wire_format"]
    headers_holder: dict = {}

    def _capture(h: httpx.Headers) -> None:
        headers_holder["value"] = h

    if wire_format == "openai":
        async for token in stream_chat_completion(
            base_url=tier["base_url"], api_key=tier["api_key"], model=tier["model"],
            prompt=prompt, max_tokens=max_tokens, temperature=temperature,
            timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, on_headers=_capture,
        ):
            yield token
        if "value" in headers_holder:
            await _record_quota_from_headers(tier, headers_holder["value"])
        return

    if wire_format == "cloudflare":
        async for token in providers_cloudflare.stream_chat_completion(
            base_url=tier["base_url"], api_key=tier["api_key"], model=tier["model"],
            prompt=prompt, timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
        ):
            yield token
        return

    raise RuntimeError(f"No streaming dispatch for wire_format={wire_format}")


async def walk_chain(
    role: str, prompt: str, max_tokens: int = 0, temperature: float = 0.0,
    budget_seconds: float = 30.0, image_b64: Optional[str] = None, mime_type: str = "image/png",
) -> str:
    """
    Walks INFERENCE_CHAINS[role] in order for non-streaming calls (judge,
    all 3 vision call sites). For each tier: quota check, then circuit
    breaker check — skip without an HTTP call if either says no. On
    success: records success, increments the tier-usage metric, returns.
    On failure: records failure, moves to the next tier — bounded by
    budget_seconds as TOTAL elapsed wall-clock time across the whole walk,
    not reset per tier. Raises InferenceChainExhausted if every tier is
    either skipped or fails.
    """
    start_time = time.monotonic()
    attempted: List[str] = []
    last_error: Optional[Exception] = None

    for tier_index, tier in enumerate(INFERENCE_CHAINS[role]):
        if time.monotonic() - start_time >= budget_seconds:
            logger.warning(f"walk_chain({role}): cascade budget ({budget_seconds}s) exhausted, stopping before tier {tier_index}")
            break

        cb = circuit_registry.get(tier["cb_name"])
        if not cb.allows_call:
            continue
        if not await _check_tier_quota(tier):
            continue

        attempted.append(tier["cb_name"])
        # min_max_tokens (see config_inference_chains.py's docstring) is a
        # per-tier floor, not a global widening — a smaller caller budget
        # (e.g. CRAG_MAX_TOKENS=64) still applies to every tier that
        # doesn't set this, only this specific tier gets bumped up.
        tier_max_tokens = max(max_tokens, tier["min_max_tokens"]) if "min_max_tokens" in tier else max_tokens
        try:
            result = await _dispatch_tier_nonstreaming(tier, prompt, tier_max_tokens, temperature, image_b64, mime_type)
            cb.record_success()
            from app.observability import INFERENCE_TIER_USED
            INFERENCE_TIER_USED.labels(role=role, tier=str(tier_index + 1), provider=tier["provider"]).inc()
            return result
        except Exception as e:
            cb.record_failure()
            last_error = e
            logger.error(f"walk_chain({role}): tier {tier_index} ({tier['provider']}/{tier['model']}) failed: {e}")
            continue

    from app.observability import INFERENCE_CHAIN_EXHAUSTED
    INFERENCE_CHAIN_EXHAUSTED.labels(role=role).inc()
    raise InferenceChainExhausted(role, attempted) from last_error


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
                        api_key=get_provider_key("groq"), max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="groq_judge")
        # Degrade to the Tier 2/3 pair per DEC-020 — judge output is short/
        # structured, less sensitive to this capability step-up than main
        # answer generation would be.
        logger.warning("Tier 1 degraded: groq_judge circuit open, falling back to main-reasoning pair")
        if not cb_cerebras_main.is_open:
            return dict(provider="cerebras", base_url=CEREBRAS_BASE_URL, model=CEREBRAS_MODEL_MAIN,
                        api_key=get_provider_key("cerebras"), max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="cerebras_main")
        elif not cb_groq_main.is_open:
            return dict(provider="groq", base_url=GROQ_BASE_URL, model=GROQ_MODEL_MAIN,
                        api_key=get_provider_key("groq"), max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="groq_main")
        raise RuntimeError("groq_judge, cerebras_main, and groq_main circuits are all open")

    else:  # tier in {2, 3}
        if not cb_cerebras_main.is_open:
            return dict(provider="cerebras", base_url=CEREBRAS_BASE_URL, model=CEREBRAS_MODEL_MAIN,
                        api_key=get_provider_key("cerebras"), max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="cerebras_main")
        elif not cb_groq_main.is_open:
            logger.warning("Tier 2/3 fallback: cerebras_main circuit open, using groq_main (same weights)")
            return dict(provider="groq", base_url=GROQ_BASE_URL, model=GROQ_MODEL_MAIN,
                        api_key=get_provider_key("groq"), max_tokens=GENERATION_MAX_TOKENS, temperature=GENERATION_TEMPERATURE,
                        timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS, cb_name="groq_main")
        raise RuntimeError("Both cerebras_main and groq_main circuits are open")


class ModelGateway:
    """Manages all calls to inference providers. Handles streaming for
    generation and non-streaming for judge calls, dispatching to Ollama's
    native format or the OpenAI-compatible format depending on provider."""

    async def generate_streaming(self, prompt: str, tier: int, session_id: str) -> AsyncIterator[str]:
        if INFERENCE_MODE == "local":
            # UNCHANGED — original Ollama /api/generate + JSON-lines logic.
            # The N-tier orchestration layer below is external-mode only.
            cfg = get_provider_config(tier)
            cb = circuit_registry.get(cfg["cb_name"])
            if not cb.allows_call:
                raise RuntimeError(f"Circuit breaker OPEN for {cfg['cb_name']}")
            try:
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
                cb.record_success()
            except Exception as e:
                cb.record_failure()
                logger.error(f"Generation failed (tier={tier}, provider={cfg['provider']}, model={cfg['model']}): {e}")
                raise
            return

        # External mode — Phase 4b bounded pre-first-byte fallback.
        # Tier 1 = "judge" chain (same fast model call_judge uses — matches
        # this file's original tier-1 semantics), tier 2/3 = "main" chain.
        # At most 2 real HTTP attempts, never a full N-tier cascade — once a
        # token has reached the caller, falling back would duplicate output
        # or require buffering the whole response (see
        # INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §3 Principle 2). The
        # 2-attempt cap is on ATTEMPTS made, not list position, so a tier
        # skipped via circuit/quota check doesn't count against it — e.g. if
        # tiers 1-2 are both unhealthy, tier 3 still gets a real attempt.
        role = "judge" if tier == 1 else "main"
        chain = INFERENCE_CHAINS[role]
        start_time = time.monotonic()
        attempts_made = 0
        last_error: Optional[Exception] = None
        attempted: List[str] = []

        for tier_index, tier_cfg in enumerate(chain):
            if attempts_made >= 2:
                break
            if time.monotonic() - start_time >= MAIN_CASCADE_BUDGET_SECONDS:
                logger.warning(f"generate_streaming({role}): cascade budget exhausted before tier {tier_index}")
                break

            cb = circuit_registry.get(tier_cfg["cb_name"])
            if not cb.allows_call:
                continue
            if not await _check_tier_quota(tier_cfg):
                continue

            attempts_made += 1
            attempted.append(tier_cfg["cb_name"])
            first_token_yielded = False
            try:
                async for token in _stream_tier(tier_cfg, prompt, GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE):
                    first_token_yielded = True
                    yield token
                cb.record_success()
                from app.observability import INFERENCE_TIER_USED
                INFERENCE_TIER_USED.labels(role=role, tier=str(tier_index + 1), provider=tier_cfg["provider"]).inc()
                return
            except Exception as e:
                cb.record_failure()
                last_error = e
                logger.error(f"generate_streaming({role}): tier {tier_index} ({tier_cfg['provider']}/{tier_cfg['model']}) failed: {e}")
                if first_token_yielded:
                    # Already sent real output to the caller — cannot safely
                    # retry against another tier without duplicating or
                    # corrupting what the user already saw. Propagate.
                    raise
                continue  # failed before first byte — safe to try the next tier

        from app.observability import INFERENCE_CHAIN_EXHAUSTED
        INFERENCE_CHAIN_EXHAUSTED.labels(role=role).inc()
        raise InferenceChainExhausted(role, attempted) from last_error

    async def call_judge(self, prompt: str, max_tokens: int = None, temperature: float = None) -> str:
        """
        Non-streaming call for CRAG and judge evaluation. max_tokens/
        temperature default to JUDGE_MAX_TOKENS/JUDGE_TEMPERATURE if not
        supplied — CRAG (see FILE 7) passes its own CRAG_MAX_TOKENS
        explicitly, since CRAG's budget is intentionally smaller than the
        general judge budget and must not be silently widened by routing
        through this shared method.
        """
        effective_max_tokens = max_tokens if max_tokens is not None else JUDGE_MAX_TOKENS
        effective_temperature = temperature if temperature is not None else JUDGE_TEMPERATURE

        if INFERENCE_MODE == "local":
            # UNCHANGED — original Ollama pick-once logic. walk_chain()
            # below is external-mode only.
            cfg = get_provider_config(1)
            cb = circuit_registry.get(cfg["cb_name"])
            if not cb.allows_call:
                raise RuntimeError(f"Circuit breaker OPEN for {cfg['cb_name']}")
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(
                        f"{cfg['base_url']}/api/generate",
                        json={"model": cfg["model"], "prompt": prompt, "stream": False,
                              "options": {"temperature": effective_temperature, "num_predict": effective_max_tokens}},
                    )
                    resp.raise_for_status()
                    result = resp.json().get("response", "").strip()
                cb.record_success()
                return result
            except Exception:
                cb.record_failure()
                raise

        return await walk_chain(
            role="judge", prompt=prompt, max_tokens=effective_max_tokens,
            temperature=effective_temperature, budget_seconds=JUDGE_CASCADE_BUDGET_SECONDS,
        )


# Singleton
model_gateway = ModelGateway()
