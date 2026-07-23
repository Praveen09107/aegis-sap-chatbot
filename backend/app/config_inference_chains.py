"""
AEGIS Inference Chain Registry
Declarative N-tier provider chains for the three inference roles (main
reasoning, judge, vision), per INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md
§4.1 and the finalized model selection in
specs/tier1_amendments/INFERENCE_MODEL_RESEARCH_UPDATE_2026-07-18_v3_FINAL.md.

Data only — this module has zero behavior of its own. `walk_chain()` in
app/services/model_gateway.py is the only consumer.

Each tier entry:
  provider     — short provider name, matches the tag used elsewhere in this codebase
  model        — the exact model identifier that provider's API expects
  base_url     — provider API base URL
  api_key      — provider credential (empty string if unset — walk_chain
                 treats an empty key the same as an always-open circuit)
  cb_name      — canonical circuit-breaker key. MUST be shared across every
                 call site that hits the same underlying provider dependency
                 (e.g. "groq_vision" is used by both app/clients/ollama_vision.py
                 and app/tasks/vision_task.py — never derive this from
                 call-site identity, see Design Principle 7 in the plan doc).
  wire_format  — "openai" (Cerebras/Groq/SambaNova, all /chat/completions-
                 compatible), "cloudflare" (Workers AI REST shape), or
                 "gemini" (generateContent REST shape) — selects which
                 adapter module handles this tier's HTTP call.
  quota_kind   — which quota-tracking mechanism applies (see
                 app/infrastructure/redis_client.py's quota tracker methods):
                   "header_groq"     — parse Groq's real rate-limit response headers
                   "header_cerebras" — parse Cerebras's real rate-limit response headers
                   "sliding_window"  — atomic Redis ZSET, for providers with no headers
                                       (SambaNova: per-model; Gemini: per-project+model)
                   "neuron_pool"     — Cloudflare's shared account-wide daily cost pool
  min_max_tokens — optional. If present, walk_chain() uses max(caller's
                 max_tokens, this value) for this tier only, instead of the
                 caller's value directly. For reasoning models whose visible
                 answer is preceded by hidden reasoning tokens counted
                 against the same budget (confirmed live 2026-07-19,
                 benchmark investigation into DEC-060's judge-tier-2 empty-
                 content finding — Groq's openai/gpt-oss-20b needs ~112
                 reasoning tokens before it reaches SUFFICIENT/INSUFFICIENT,
                 and reasoning_effort cannot be lowered below what already
                 exceeds CRAG_MAX_TOKENS=64 for this model), the caller's
                 budget can be genuinely too small for this specific tier
                 even though it's correct for every other tier in the same
                 chain. Does not change the caller's own constant (e.g.
                 CRAG_MAX_TOKENS stays 64 everywhere else) — this is a
                 per-tier floor, not a global widening.
"""
import asyncio
import logging

from app.config import (
    INFERENCE_MODE,
    GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL_MAIN, GROQ_MODEL_JUDGE, GROQ_MODEL_JUDGE_CAPABILITY, GROQ_MODEL_VISION,
    CEREBRAS_API_KEY, CEREBRAS_BASE_URL, CEREBRAS_MODEL_MAIN, CEREBRAS_MODEL_VISION,
    SAMBANOVA_API_KEY, SAMBANOVA_BASE_URL, SAMBANOVA_MODEL_MAIN, SAMBANOVA_MODEL_JUDGE,
    CLOUDFLARE_API_TOKEN, CLOUDFLARE_BASE_URL, CLOUDFLARE_MODEL_MAIN, CLOUDFLARE_MODEL_JUDGE,
    CLOUDFLARE_MODEL_VISION, CLOUDFLARE_MODEL_VISION_2,
    GEMINI_API_KEY, GEMINI_BASE_URL, GEMINI_MODEL_VISION,
    VAULT_PROVIDER_KEYS_PATH, VAULT_KEY_REFRESH_INTERVAL_SECONDS,
)

logger = logging.getLogger(__name__)

INFERENCE_CHAINS: dict[str, list[dict]] = {
    # Identical weights (gpt-oss-120b) across all 4 tiers — deliberate
    # zero-drift design, per DEC-019 and the orchestration plan's Principle 1.
    "main": [
        {"provider": "groq", "model": GROQ_MODEL_MAIN, "base_url": GROQ_BASE_URL,
         "api_key": GROQ_API_KEY, "cb_name": "groq_main", "wire_format": "openai", "quota_kind": "header_groq"},
        {"provider": "cloudflare", "model": CLOUDFLARE_MODEL_MAIN, "base_url": CLOUDFLARE_BASE_URL,
         "api_key": CLOUDFLARE_API_TOKEN, "cb_name": "cloudflare_main", "wire_format": "cloudflare", "quota_kind": "neuron_pool"},
        {"provider": "cerebras", "model": CEREBRAS_MODEL_MAIN, "base_url": CEREBRAS_BASE_URL,
         "api_key": CEREBRAS_API_KEY, "cb_name": "cerebras_main", "wire_format": "openai", "quota_kind": "header_cerebras"},
        {"provider": "sambanova", "model": SAMBANOVA_MODEL_MAIN, "base_url": SAMBANOVA_BASE_URL,
         "api_key": SAMBANOVA_API_KEY, "cb_name": "sambanova_main", "wire_format": "openai", "quota_kind": "sliding_window"},
    ],
    # Primary optimizes for daily request volume (llama-3.1-8b-instant:
    # 14,400/day vs gpt-oss-20b's 1,000/day on the same account) since judge/
    # CRAG fires on nearly every query. Fallback 1 is a genuine capability
    # upgrade for when that budget is tight or a harder call needs it.
    "judge": [
        {"provider": "groq", "model": GROQ_MODEL_JUDGE, "base_url": GROQ_BASE_URL,
         "api_key": GROQ_API_KEY, "cb_name": "groq_judge", "wire_format": "openai", "quota_kind": "header_groq"},
        {"provider": "groq", "model": GROQ_MODEL_JUDGE_CAPABILITY, "base_url": GROQ_BASE_URL,
         "api_key": GROQ_API_KEY, "cb_name": "groq_judge_capability", "wire_format": "openai", "quota_kind": "header_groq",
         "min_max_tokens": 128},
        {"provider": "cloudflare", "model": CLOUDFLARE_MODEL_JUDGE, "base_url": CLOUDFLARE_BASE_URL,
         "api_key": CLOUDFLARE_API_TOKEN, "cb_name": "cloudflare_judge", "wire_format": "cloudflare", "quota_kind": "neuron_pool"},
        {"provider": "sambanova", "model": SAMBANOVA_MODEL_JUDGE, "base_url": SAMBANOVA_BASE_URL,
         "api_key": SAMBANOVA_API_KEY, "cb_name": "sambanova_judge", "wire_format": "openai", "quota_kind": "sliding_window"},
    ],
    # 5 tiers, 4 distinct models. Tier 5 (Gemini) is a deliberate break-glass
    # last resort — 5 RPM, expected to fail often when actually reached; kept
    # anyway on explicit instruction, see the orchestration plan §7 addendum.
    "vision": [
        {"provider": "groq", "model": GROQ_MODEL_VISION, "base_url": GROQ_BASE_URL,
         "api_key": GROQ_API_KEY, "cb_name": "groq_vision", "wire_format": "openai", "quota_kind": "header_groq"},
        {"provider": "cloudflare", "model": CLOUDFLARE_MODEL_VISION, "base_url": CLOUDFLARE_BASE_URL,
         "api_key": CLOUDFLARE_API_TOKEN, "cb_name": "cloudflare_vision", "wire_format": "cloudflare", "quota_kind": "neuron_pool"},
        {"provider": "cloudflare", "model": CLOUDFLARE_MODEL_VISION_2, "base_url": CLOUDFLARE_BASE_URL,
         "api_key": CLOUDFLARE_API_TOKEN, "cb_name": "cloudflare_vision_2", "wire_format": "cloudflare", "quota_kind": "neuron_pool"},
        {"provider": "cerebras", "model": CEREBRAS_MODEL_VISION, "base_url": CEREBRAS_BASE_URL,
         "api_key": CEREBRAS_API_KEY, "cb_name": "cerebras_vision", "wire_format": "openai", "quota_kind": "header_cerebras"},
        {"provider": "gemini", "model": GEMINI_MODEL_VISION, "base_url": GEMINI_BASE_URL,
         "api_key": GEMINI_API_KEY, "cb_name": "gemini_vision", "wire_format": "gemini", "quota_kind": "sliding_window"},
    ],
}


# ============================================================
# Vault-backed provider-key rotation (DEC-060/DEC-061/OPEN-14 — repurposed
# Vault KV v2, this session).
#
# INFERENCE_CHAINS above is built once, at import time, from config.py's
# flat os.getenv() constants — the same value for the life of the process.
# Genuine zero-restart rotation needs the *value actually used at dispatch
# time* to be able to change without re-importing this module, which a
# frozen dict entry can't do on its own. The fix: keep every tier dict's
# "api_key" field exactly as every existing consumer already reads it
# (model_gateway.py, check_inference_provider_health.py,
# inference_health_handler.py — none of them need to change), but
# periodically REFRESH those same dict objects' "api_key" values in place
# from Vault, falling back to the original .env-sourced constant if Vault
# is unreachable. A background loop (started from both FastAPI's lifespan
# and the ARQ worker's startup — model_gateway.py's streaming main-
# reasoning path and the async vision/feedback tasks run in different
# processes, each with its own process-local copy of this module) drives
# the refresh; Vault is never a hard dependency for inference itself.
_ENV_FALLBACK: dict[str, str] = {
    "GROQ_API_KEY": GROQ_API_KEY,
    "CEREBRAS_API_KEY": CEREBRAS_API_KEY,
    "SAMBANOVA_API_KEY": SAMBANOVA_API_KEY,
    "CLOUDFLARE_API_TOKEN": CLOUDFLARE_API_TOKEN,
    "GEMINI_API_KEY": GEMINI_API_KEY,
}

_PROVIDER_TO_ENV_VAR: dict[str, str] = {
    "groq": "GROQ_API_KEY",
    "cerebras": "CEREBRAS_API_KEY",
    "sambanova": "SAMBANOVA_API_KEY",
    "cloudflare": "CLOUDFLARE_API_TOKEN",
    "gemini": "GEMINI_API_KEY",
}

# Seeded from the .env-sourced constants so get_provider_key() is correct
# from the very first call, before any refresh has ever run.
_CURRENT_KEYS: dict[str, str] = dict(_ENV_FALLBACK)


def get_provider_key(provider: str) -> str:
    """
    Current best-known API key/token for a provider — used by
    model_gateway.py's streaming main-reasoning path, which (unlike
    walk_chain()'s tier-dict dispatch) references provider keys directly
    rather than through an INFERENCE_CHAINS entry.
    """
    env_var = _PROVIDER_TO_ENV_VAR.get(provider)
    if env_var is None:
        return ""
    return _CURRENT_KEYS.get(env_var, "")


async def refresh_provider_keys() -> None:
    """
    Re-fetch the 5 provider keys from Vault and update both _CURRENT_KEYS
    and every INFERENCE_CHAINS tier dict's "api_key" field in place. Falls
    back to the original .env-sourced value per-key if Vault is
    unreachable or a key is missing from the secret — Vault is an
    enhancement (rotation without a restart), never a hard dependency: a
    Vault outage must never be able to take inference down.
    """
    if INFERENCE_MODE != "external":
        return  # local mode (Ollama) needs none of these keys

    from app.infrastructure.vault_client import vault_client

    try:
        secret = await vault_client.get_secret(VAULT_PROVIDER_KEYS_PATH)
    except Exception as e:
        logger.warning(f"Provider-key refresh: Vault unreachable, keeping current values ({e})")
        return

    for env_var in _ENV_FALLBACK:
        new_value = secret.get(env_var) or _ENV_FALLBACK[env_var]
        if new_value != _CURRENT_KEYS.get(env_var):
            logger.info(f"Provider-key refresh: {env_var} updated from Vault")
        _CURRENT_KEYS[env_var] = new_value

    for chain in INFERENCE_CHAINS.values():
        for tier in chain:
            env_var = _PROVIDER_TO_ENV_VAR.get(tier["provider"])
            if env_var:
                tier["api_key"] = _CURRENT_KEYS[env_var]


async def start_provider_key_refresh_loop() -> None:
    """
    Runs refresh_provider_keys() once immediately, then every
    VAULT_KEY_REFRESH_INTERVAL_SECONDS — started as a background asyncio
    task from both app/main.py's lifespan and app/workers/arq_worker.py's
    startup hook, so a Vault-side key rotation reaches both the
    synchronous chat-serving process and the async task-worker process
    within one interval, no container restart needed.
    """
    while True:
        await refresh_provider_keys()
        await asyncio.sleep(VAULT_KEY_REFRESH_INTERVAL_SECONDS)
