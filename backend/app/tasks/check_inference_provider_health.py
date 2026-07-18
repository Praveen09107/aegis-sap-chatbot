"""
AEGIS Inference Provider Health Monitor
Per INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §4.6. Scheduled via ARQ's
native cron, following the same pattern as check_config_staleness.py.

Each run, for every (role, provider, model) tier in INFERENCE_CHAINS:
  1. Checks whether the model still appears in that provider's live model
     catalog — this is the check that would have caught Llama 4 Scout
     disappearing from Groq's catalog mid-project, before a real user did.
  2. For PRIMARY tiers only (never every fallback — deliberately conserves
     real quota rather than spending it on health-checking), makes exactly
     one cheap live test call to confirm actual callability, not just
     catalog presence. Gemini is explicitly, unconditionally excluded from
     this step — not an implicit consequence of "primary only" (it never
     is primary today), a hard-coded skip so a future edit to chain order
     can't silently start burning 20% of its 5-req/minute budget on health
     checks.
  3. Writes one row per tier to inference_provider_health_log (migration
     011) and updates Prometheus gauges/counters for catalog drift.
"""
import logging
import time
import uuid
from typing import Dict, Optional

import asyncpg
import httpx

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    GROQ_BASE_URL, GROQ_API_KEY, CEREBRAS_BASE_URL, CEREBRAS_API_KEY,
    SAMBANOVA_BASE_URL, SAMBANOVA_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN,
    GEMINI_BASE_URL, GEMINI_API_KEY, EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
)
from app.config_inference_chains import INFERENCE_CHAINS
from app.infrastructure.circuit_breaker import circuit_registry

logger = logging.getLogger(__name__)

CATALOG_CHECK_TIMEOUT = 15


async def _groq_catalog(client: httpx.AsyncClient) -> set:
    resp = await client.get(f"{GROQ_BASE_URL}/models", headers={"Authorization": f"Bearer {GROQ_API_KEY}"}, timeout=CATALOG_CHECK_TIMEOUT)
    resp.raise_for_status()
    return {m["id"] for m in resp.json().get("data", [])}


async def _cerebras_catalog(client: httpx.AsyncClient) -> set:
    resp = await client.get(f"{CEREBRAS_BASE_URL}/models", headers={"Authorization": f"Bearer {CEREBRAS_API_KEY}"}, timeout=CATALOG_CHECK_TIMEOUT)
    resp.raise_for_status()
    return {m["id"] for m in resp.json().get("data", [])}


async def _sambanova_catalog(client: httpx.AsyncClient) -> set:
    resp = await client.get(f"{SAMBANOVA_BASE_URL}/models", headers={"Authorization": f"Bearer {SAMBANOVA_API_KEY}"}, timeout=CATALOG_CHECK_TIMEOUT)
    resp.raise_for_status()
    return {m["id"] for m in resp.json().get("data", [])}


async def _cloudflare_catalog(client: httpx.AsyncClient, model: str) -> set:
    # Cloudflare's catalog is large (274+ models at last check) — search by
    # the specific model name rather than listing everything every run.
    search_term = model.split("/")[-1]
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/models/search"
    resp = await client.get(url, params={"search": search_term}, headers={"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"}, timeout=CATALOG_CHECK_TIMEOUT)
    resp.raise_for_status()
    payload = resp.json()
    if not payload.get("success", True):
        return set()
    return {m["name"] for m in payload.get("result", [])}


async def _gemini_catalog(client: httpx.AsyncClient) -> set:
    resp = await client.get(f"{GEMINI_BASE_URL}/models", params={"key": GEMINI_API_KEY}, timeout=CATALOG_CHECK_TIMEOUT)
    resp.raise_for_status()
    return {m["name"].removeprefix("models/") for m in resp.json().get("models", [])}


_CATALOG_CHECKERS = {
    "groq": _groq_catalog,
    "cerebras": _cerebras_catalog,
    "sambanova": _sambanova_catalog,
    "gemini": _gemini_catalog,
}


async def _is_in_catalog(client: httpx.AsyncClient, provider: str, model: str, catalog_cache: Dict[str, set]) -> Optional[bool]:
    """Returns None (not True/False) if the catalog check itself failed —
    distinct from a confirmed-absent model, so a transient network error
    during health-checking doesn't get logged as a false catalog-drift
    alert."""
    try:
        if provider == "cloudflare":
            catalog = await _cloudflare_catalog(client, model)
            return model in catalog
        if provider not in catalog_cache:
            catalog_cache[provider] = await _CATALOG_CHECKERS[provider](client)
        return model in catalog_cache[provider]
    except Exception as e:
        logger.warning(f"Catalog check failed for {provider}/{model}: {e}")
        return None


async def _live_test_call(provider: str, model: str, base_url: str, api_key: str, wire_format: str) -> tuple:
    """One minimal live call for a primary tier only. Returns (ok, error_str)."""
    try:
        if wire_format == "openai":
            from app.infrastructure.inference_providers import call_chat_completion
            await call_chat_completion(
                base_url=base_url, api_key=api_key, model=model, prompt="Reply with just the word OK.",
                max_tokens=5, temperature=0.0, timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
            )
            return True, None
        if wire_format == "cloudflare":
            from app.infrastructure import providers_cloudflare
            await providers_cloudflare.call_chat_completion(
                base_url=base_url, api_key=api_key, model=model, prompt="Reply with just the word OK.",
                timeout=EXTERNAL_INFERENCE_TIMEOUT_SECONDS,
            )
            return True, None
        # gemini deliberately never reaches here — see the hard-coded skip below.
        return None, "no live-test dispatch for this wire_format"
    except Exception as e:
        return False, str(e)[:500]


async def check_inference_provider_health(ctx: Dict) -> dict:
    conn = await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )
    run_id = uuid.uuid4()
    catalog_cache: Dict[str, set] = {}
    drift_found = 0
    rows_written = 0

    try:
        async with httpx.AsyncClient() as client:
            for role, chain in INFERENCE_CHAINS.items():
                for tier_position, tier in enumerate(chain):
                    is_primary = tier_position == 0
                    in_catalog = await _is_in_catalog(client, tier["provider"], tier["model"], catalog_cache)

                    if in_catalog is False:
                        drift_found += 1
                        logger.warning(f"check_inference_provider_health: DRIFT — {tier['provider']}/{tier['model']} (role={role}) no longer in live catalog")
                        from app.observability import INFERENCE_CATALOG_DRIFT
                        INFERENCE_CATALOG_DRIFT.labels(provider=tier["provider"], model=tier["model"]).inc()

                    live_call_ok, live_call_error = None, None
                    # Gemini is explicitly, unconditionally excluded from live
                    # testing — see module docstring point 2.
                    if is_primary and tier["provider"] != "gemini":
                        live_call_ok, live_call_error = await _live_test_call(
                            tier["provider"], tier["model"], tier["base_url"], tier["api_key"], tier["wire_format"],
                        )

                    cb = circuit_registry.get(tier["cb_name"])

                    await conn.execute(
                        """INSERT INTO inference_provider_health_log
                           (run_id, role, provider, model, tier_position, in_catalog, is_primary_tier,
                            live_call_ok, live_call_error, circuit_state)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
                        run_id, role, tier["provider"], tier["model"], tier_position,
                        bool(in_catalog) if in_catalog is not None else False, is_primary,
                        live_call_ok, live_call_error, cb.state.value,
                    )
                    rows_written += 1

        logger.info(f"check_inference_provider_health: completed. run_id={run_id}, rows={rows_written}, drift_found={drift_found}")
        return {"run_id": str(run_id), "rows_written": rows_written, "drift_found": drift_found}
    finally:
        await conn.close()
