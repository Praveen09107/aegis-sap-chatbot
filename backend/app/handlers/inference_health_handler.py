"""
AEGIS Inference Provider Health Admin Endpoint
Per INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md §4.8. Modeled directly on
knowledge_entries_handler.py's pipeline-health endpoint (badge + structured
sub-objects, locally-duplicated auth dependency and DB helper — this
codebase's established per-handler-file convention, not shared modules).

Finally gives circuit_registry.get_all_stats() (built in Session-era
circuit_breaker.py, confirmed called from zero places before this) a real
caller, joined with live quota state and the latest catalog/health
snapshot per role and tier.
"""
import logging

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
from app.config_inference_chains import INFERENCE_CHAINS
from app.infrastructure.circuit_breaker import circuit_registry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/inference-health", tags=["inference-orchestration"])


def require_it_admin(request: Request):
    role = getattr(request.state, "role", "employee")
    if role != "it-admin":
        raise HTTPException(status_code=403, detail="IT admin role required")
    return role


async def _db():
    return await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )


@router.get("")
async def get_inference_health(_admin: str = Depends(require_it_admin)):
    from app.infrastructure.redis_client import redis_session

    all_stats = circuit_registry.get_all_stats()

    # Latest health-check row per (role, provider, model) — DISTINCT ON
    # picks the most recent run's row for each tier, giving the "as of the
    # last cron tick" catalog/live-call state without scanning full history.
    conn = await _db()
    try:
        latest_rows = await conn.fetch(
            """SELECT DISTINCT ON (role, provider, model)
                      role, provider, model, in_catalog, live_call_ok, live_call_error, created_at
               FROM inference_provider_health_log
               ORDER BY role, provider, model, created_at DESC"""
        )
        last_run = await conn.fetchrow(
            """SELECT run_id, created_at, COUNT(*) FILTER (WHERE in_catalog = FALSE) AS drift_found
               FROM inference_provider_health_log
               WHERE created_at = (SELECT MAX(created_at) FROM inference_provider_health_log)
               GROUP BY run_id, created_at"""
        )
    finally:
        await conn.close()

    latest_by_tier = {(r["role"], r["provider"], r["model"]): r for r in latest_rows}

    chains_out = {}
    any_catalog_drift = False
    any_chain_fully_open = False

    for role, chain in INFERENCE_CHAINS.items():
        tiers_out = []
        open_count = 0
        for tier_position, tier in enumerate(chain):
            cb_stats = all_stats.get(tier["cb_name"], {})
            health_row = latest_by_tier.get((role, tier["provider"], tier["model"]))

            quota_remaining = None
            if tier["quota_kind"] in ("header_groq", "header_cerebras"):
                quota_remaining = await redis_session.get_cached_header_quota(tier["provider"], tier["model"])

            if cb_stats.get("state") == "open":
                open_count += 1
            if health_row is not None and health_row["in_catalog"] is False:
                any_catalog_drift = True

            tiers_out.append({
                "tier_position": tier_position + 1,
                "provider": tier["provider"],
                "model": tier["model"],
                "circuit_state": cb_stats.get("state"),
                "circuit_total_calls": cb_stats.get("total_calls", 0),
                "circuit_total_failures": cb_stats.get("total_failures", 0),
                "quota_remaining": quota_remaining,
                "last_known_in_catalog": health_row["in_catalog"] if health_row else None,
                "last_known_live_call_ok": health_row["live_call_ok"] if health_row else None,
                "last_checked_at": health_row["created_at"].isoformat() if health_row else None,
            })

        if open_count == len(chain):
            any_chain_fully_open = True

        chains_out[role] = tiers_out

    if any_chain_fully_open:
        badge = "red"
    elif any_catalog_drift:
        badge = "amber"
    else:
        badge = "green"

    return {
        "badge": badge,
        "chains": chains_out,
        "circuits_raw": all_stats,
        "last_health_check": {
            "run_id": str(last_run["run_id"]) if last_run else None,
            "checked_at": last_run["created_at"].isoformat() if last_run else None,
            "drift_found": last_run["drift_found"] if last_run else None,
        } if last_run else None,
    }
