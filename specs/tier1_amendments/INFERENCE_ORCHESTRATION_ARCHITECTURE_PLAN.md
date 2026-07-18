# AEGIS — Inference Orchestration Architecture Plan
## Production-grade design for N-tier, multi-platform inference routing, quota awareness, and continuous health monitoring

**Status: PLAN — approved for review, not yet implemented.** Nothing described here exists in code yet except the `config.py`/`.env.example` scaffolding added earlier in this same research thread (the `SAMBANOVA_*`/`CLOUDFLARE_*`/`GEMINI_*` constants). This document is the "how we build it" companion to `INFERENCE_MODEL_RESEARCH_UPDATE_2026-07-18_v3_FINAL.md` (the "what models we use" decision).

**How this plan was produced:** three parallel codebase-exploration passes (verified against real files, not assumed) established exactly what exists today, followed by a dedicated design-review pass that stress-tested the first draft of this plan and found real problems in it — a race condition in the proposed quota tracker, an unsafe blanket-cascade idea for the streaming main-reasoning path, and a better phase ordering. Those findings are incorporated below, not left as a separate critique document.

---

## 1. Why this exists

Sessions 25-29's verification pass and the subsequent model research (this same day) established two things that don't fit together yet:

1. **The finalized inference chains are 3-5 tiers deep, across 5 platforms** (Groq, Cerebras, SambaNova, Cloudflare, Google) — a deliberate design decision, made because free-tier quotas are real, tight, and platforms have already been observed changing them mid-research (Cerebras's public catalog shrank from ~12 models to 3 during this project's own history; Groq quietly removed Llama 4 Scout/Maverick from its live catalog while still showing docs pages for them; Cloudflare repriced the Kimi K2.5→K2.6 model family within the last three months).
2. **The code that would route across those tiers doesn't support more than 2**, and what does exist is split across two incompatible patterns that were never meant to generalize this far.

This plan closes that gap — not by bolting a naive "just add more fallback tiers" patch onto the existing code, but by giving inference routing a real architecture: a declarative chain registry, a routing engine that understands the real difference between a streaming and non-streaming call, quota awareness that prevents hitting a wall instead of just reacting to it, and continuous monitoring that catches a platform pulling a model or changing a quota before a real user does.

**A deliberate note on scale, stated honestly rather than left implicit.** AEGIS's real target traffic is 10-30 users, irregular, 1-3 simultaneous generations at peak (`DEC-018`) — at that volume, most of these free-tier quotas (Groq's 1,000-14,400/day, Cerebras's 2,400/day) will rarely if ever be exhausted in practice, so this system's day-to-day *practical* payoff may be modest. It is built anyway, to this level of rigor, for two reasons that both already exist in this project's own decision history rather than being invented here: first, `DEC-015` already established that the multi-provider dual-homed gateway itself is meant to demonstrate genuine distributed-systems engineering, not just solve a narrow capacity problem — this plan is a direct continuation of that same reasoning, not a new one; second, the actual free-tier landscape has already been observed changing mid-project (Cerebras's catalog shrinking, Groq quietly dropping models, Cloudflare repricing) — the monitoring half of this plan earns its cost even at low traffic, because it is watching for *provider-side* change, not just AEGIS's own load.

---

## 2. What exists today — verified, not assumed

| Component | File | Real state |
|---|---|---|
| Tier classification | `backend/app/services/model_gateway.py` — `select_model_tier()` | Pure, provider-agnostic. Not touched by this plan. |
| Provider selection | `model_gateway.py` — `get_provider_config(tier)` | **Pick-once-then-fail.** Checks circuit-breaker state *before* the call, picks one provider via a fixed if/elif chain. If the chosen provider's HTTP call then fails, there is no fallback within that request — the exception just propagates. Only 2 providers per role exist today. |
| Vision routing | `backend/app/clients/ollama_vision.py`, `backend/app/tasks/vision_task.py` | **Different pattern** — a real in-request try/except cascade (try Groq, on exception try Cerebras), duplicated inline in both files, hardcoded to 2 tiers. Three call sites depend on this behavior: `ollama_vision.py`'s two functions (used by `knowledge_screenshots_handler.py` and `enrich_entry_screenshots.py`) and `vision_task.py`'s own independent cascade. |
| HTTP transport | `backend/app/infrastructure/inference_providers.py` | 3 stateless functions, OpenAI-`/chat/completions`-compatible only. No circuit-breaker awareness (caller's job). **Cannot serve Cloudflare or Gemini as-is** — both have structurally different wire formats. |
| Circuit breaking | `backend/app/infrastructure/circuit_breaker.py` | `circuit_registry` singleton exists and works. Circuits are lazily created per-name on first `.get()`. `CircuitBreaker.__init__` already accepts per-service `failure_threshold`/`cooldown` overrides — `CircuitBreakerRegistry._initialize()` just never passes any, so every provider uses one uniform global threshold. `get_all_stats()`/`any_open()` exist and are called from **zero places** in the codebase — ready to wire up, not built from scratch. |
| Quota awareness | — | **Does not exist anywhere for inference providers.** No response-header parsing, no request counters. The closest in-repo precedent is Quick Entry's `check_qe_rate_limit()` (Redis sorted-set sliding window) — but its check-then-act shape is not atomic, which matters more here than it does there (see §4.3). |
| Config scaffolding | `backend/app/config.py` | `SAMBANOVA_*`/`CLOUDFLARE_*`/`GEMINI_*` constants exist, confirmed unused anywhere else in the codebase (added ahead of this plan, during the model-research phase). |

---

## 3. Design principles

These are the load-bearing decisions this plan is built on, each justified by something found during exploration or the design-review pass — not defaults picked for their own sake.

1. **The chain registry is code, not a database table.** Chain composition (which models, which order, which platform) changes only when real research like the prior sessions happens — rarely, and deliberately. This matches `config.py`'s existing role as the single source of architectural constants in this codebase, and a DB-backed registry would need its own admin CRUD surface for zero real benefit at this scale.

2. **Provider *selection* generalizes to N tiers for every role. Post-failure HTTP *retry* does not, uniformly.** These are different problems. Selecting which provider to try first (based on current circuit/quota state) is safe to generalize everywhere. Retrying a failed HTTP call against tier 2 within the same request is only safe for call shapes with a single, bufferable response — non-streaming judge and vision calls. The main-reasoning role streams tokens live to the browser (`generate_streaming`); once a token has been yielded, falling back to another tier would either duplicate output the user already saw or require buffering the entire response before forwarding anything, which defeats streaming for every request, not just failing ones. Main reasoning therefore gets a narrower rule: one bounded fallback attempt, only if it happens *before the first token is yielded*.

3. **Every cascade has a wall-clock budget, not just a per-attempt timeout.** Four sequential 30-second timeouts is two minutes before a request finally fails — unacceptable for a system whose own architecture doc already treats speed as a design constraint. Each role gets its own total cascade budget (main: 45s, judge: 20s, vision: 60s — vision tolerates more because one of its three call sites is an async ARQ task, not a live user request).

4. **Quota checks happen before circuit-breaker checks, and both happen before any HTTP call is attempted.** For a provider like Gemini (5 requests/minute, confirmed live), the quota tracker should refuse the call before it's ever sent — the circuit breaker becomes a secondary safety net against a stale or wrong quota count, not the primary defense.

5. **The quota tracker must be atomic, not check-then-act.** Quick Entry's `check_qe_rate_limit()` pattern (`ZCARD` then `ZADD`, not wrapped in a transaction) is fine there because the worst case is a form submission slipping through a soft limit. Here, the worst case is genuinely exceeding an external provider's documented rate limit under concurrent load — a materially worse failure mode. This plan uses an atomic Lua `EVAL` (check-and-increment in one round trip) instead.

6. **Retiring the duplicated vision cascade code must not touch the error-handling policy layered on top of it.** The asymmetry between `ollama_vision.py` (swallows exceptions, returns safe defaults) and `vision_task.py` (raises, lets ARQ retry) lives entirely in the three call sites' own try/except blocks, not in the cascade logic itself. The new shared cascade function does exactly one thing — try tiers in order, respecting circuit/quota/budget state, and raise one well-defined exception on total exhaustion. The three call sites keep their existing try/except wrapping unchanged; only what's inside changes.

7. **Circuit-breaker names are canonical per (role, tier), never derived from call-site identity.** `vision_task.py`'s existing code deliberately shares circuit-breaker keys (`groq_vision`, `cerebras_vision`) with `ollama_vision.py`'s two call sites, because both hit the same underlying provider dependency. The new chain registry must preserve this — a `groq_vision_task` vs `groq_vision_classify` split would silently break a real, documented design decision already in the codebase.

8. **The quota tracker fails open, matching the philosophy already established twice elsewhere in this codebase.** Both `RateLimitingMiddleware` and `check_qe_rate_limit()` explicitly proceed rather than block when Redis itself is unavailable — the reasoning stated in the existing code is that Redis being down should not block a legitimate request. This plan applies the identical rule to the new quota tracker: if Redis cannot be reached for a quota check, `walk_chain()` treats that tier as *available* (not as exhausted) and lets the circuit breaker be the real backstop against a genuinely unhealthy provider. The alternative — failing closed — would mean a Redis blip takes down all inference for every role simultaneously, which is a strictly worse outage than occasionally exceeding a free-tier quota by a handful of requests.

9. **No API key, bearer token, or full request header ever appears in a log line, exception message, or metric label.** Every new adapter and the routing engine itself log and report failures using only provider name, model name, and HTTP status — never headers or payloads. This is not a new policy invented for this plan; it's made explicit here because the new Cloudflare/Gemini adapters are the first code in this project to construct auth headers for providers whose credentials were, earlier in this same work, briefly and by accident written into a file meant to be committed (`.env.example`) — worth being deliberate about this exact failure mode recurring in a log line instead.

---

## 4. Component design

### 4.1 Chain registry — `backend/app/config_inference_chains.py` (new file)

A declarative structure, built from the constants already in `config.py`, encoding exactly the three finalized chains:

```python
INFERENCE_CHAINS: dict[str, list[dict]] = {
    "main": [
        {"provider": "groq", "model": GROQ_MODEL_MAIN, "cb_name": "groq_main", "wire_format": "openai", ...},
        {"provider": "cloudflare", "model": CLOUDFLARE_MODEL_MAIN, "cb_name": "cloudflare_main", "wire_format": "cloudflare", ...},
        {"provider": "cerebras", "model": CEREBRAS_MODEL_MAIN, "cb_name": "cerebras_main", "wire_format": "openai", ...},
        {"provider": "sambanova", "model": SAMBANOVA_MODEL_MAIN, "cb_name": "sambanova_main", "wire_format": "openai", ...},
    ],
    "judge": [ ... 4 tiers, cb_name "groq_judge", "groq_judge_capability", "cloudflare_judge", "sambanova_judge" ... ],
    "vision": [ ... 5 tiers, cb_name "groq_vision", "cloudflare_vision", "cloudflare_vision_2", "cerebras_vision", "gemini_vision" ... ],
}
```

Each tier entry also carries a `quota_check_fn` reference (§4.4) — kept uniform in shape across providers even though the underlying quota mechanics differ (request-count vs. token-count vs. cost-pool), so the routing engine never special-cases a provider inline. This is a data-only change: no behavior changes when this file lands, nothing calls it yet.

### 4.2 Wire-format adapters — `backend/app/infrastructure/providers_cloudflare.py`, `providers_gemini.py` (new files)

`inference_providers.py`'s three existing functions stay as-is (they're correct for Groq/Cerebras/SambaNova, which are all OpenAI-`/chat/completions`-compatible). Two new sibling modules handle the two structurally different providers:

- **Cloudflare**: POST to `{CLOUDFLARE_BASE_URL}/{model}`, request/response shape per Workers AI's own REST API (confirmed live during research — `{"messages": [...]}` for text, `{"messages": [{"role": "user", "content": [{"type": "text", ...}, {"type": "image_url", "image_url": {"url": "data:..."}}]}]}` for vision). Every response is parsed for the `cf-ai-neurons` header — this is the real, measured per-call cost signal the quota tracker needs (§4.4), not something to discard.
- **Gemini**: POST to `{GEMINI_BASE_URL}/models/{model}:generateContent?key={api_key}`, `{"contents": [{"parts": [{"text": ...}, {"inline_data": {"mime_type": ..., "data": base64}}]}]}` shape. No useful rate-limit headers — confirmed live, the only signal available is the `429` body's `quotaValue` field on failure, which is exactly the thing the quota tracker should prevent from ever being hit rather than parse after the fact.

Both are pure, stateless, unit-testable against mocked HTTP responses matching the real shapes captured during live testing. No circuit-breaker or quota logic lives here — same separation of concerns as the existing `inference_providers.py`.

### 4.3 Circuit-breaker per-provider overrides — `backend/app/infrastructure/circuit_breaker.py`

`CircuitBreakerRegistry._initialize()` gets a small, targeted change: pass explicit `failure_threshold`/`cooldown` overrides for the two tightest-quota providers, using the constructor parameter that already exists and is already unused:

- `gemini_vision`: `failure_threshold=2, cooldown=90` — at 5 RPM, the default 10-window/50%-threshold would let several more calls through to an already-429ing provider before the circuit trips, and the default 30s cooldown reopens inside the same still-exhausted 60-second window.
- `sambanova_main`, `sambanova_judge`: `failure_threshold=3, cooldown=60` — same reasoning, less severe (20 RPM vs. 5 RPM).
- Every other provider keeps the existing global default — their headroom is large enough that a burst of failures more likely signals a real outage worth tripping the standard way.

### 4.4 Quota tracker — new methods on `RedisSessionClient` (`backend/app/infrastructure/redis_client.py`)

Three mechanisms, because the providers genuinely don't share one shape:

- **Groq, Cerebras** (real rate-limit headers, confirmed live): after every call, parse `x-ratelimit-remaining-requests`/`-tokens` (Groq) or `x-ratelimit-remaining-requests-day`/`-minute` (Cerebras) and cache the value in Redis with a short TTL matching the header's own reset window. Authoritative — no independent counting needed. Parsed defensively: a missing or malformed header degrades to "assume available, let the circuit breaker be the backstop" — never "assume zero and block all calls," since these providers can change header formats without notice and a parsing bug must not be able to take down a healthy tier.
- **SambaNova, Gemini** (no headers, hard per-model/per-project request ceilings): an atomic Lua `EVAL` script doing sliding-window check-and-increment in one round trip against a `ZSET` — same conceptual shape as `check_qe_rate_limit()`'s sorted set, but atomic, closing the TOCTOU race a copy-pasted version of that pattern would have under concurrent requests near the boundary.
- **Cloudflare** (shared account-wide cost pool, not a request count): a single daily Redis counter, incremented by the real `cf-ai-neurons` value from each response header, checked against the configured 10,000/day ceiling before any Cloudflare-hosted tier (main, judge, or either vision tier) is attempted — this one counter is genuinely shared across all four Cloudflare-hosted chain entries, matching the platform's real accounting.

Each chain-registry entry's `quota_check_fn` points at whichever of these three a given provider needs — `walk_chain()` (§4.5) calls it uniformly and never needs to know which shape is underneath.

Live-updated at the same call site: a Prometheus gauge (`aegis_inference_quota_remaining{provider=,model=}`) set immediately after every quota check, not only via the periodic health-check cron — this is what makes quota exhaustion something Grafana can alert on as it happens, rather than something visible only up to 6 hours late.

No new dependency required: `redis.asyncio` (already in use throughout `redis_client.py`) supports `register_script`/`eval` natively — the atomic Lua check-and-increment is a client-side script string executed via the existing connection, not a new library or Redis module. On Redis unavailability, this quota check fails open per Design Principle 8 above.

### 4.5 Routing engine — `walk_chain()`, new function in `model_gateway.py`

```python
async def walk_chain(role: str, payload: ..., budget_seconds: float) -> ChainResult:
```

Walks `INFERENCE_CHAINS[role]` in order. For each tier: checks quota (§4.4) then circuit breaker (`allows_call`) — skip without attempting the HTTP call if either says no. Attempts the call via the appropriate adapter (`inference_providers.py` for OpenAI-shaped providers, the two new modules for Cloudflare/Gemini). On success: records success on the circuit, **increments `aegis_inference_tier_used_total{role=,tier=,provider=}`** (§4.9), returns. On failure: records failure, moves to the next tier — bounded by the role's cascade budget (§3, principle 3), tracked as elapsed wall-clock time across the whole walk, not reset per tier. On total exhaustion: raises one well-defined `InferenceChainExhausted(role, attempted=[...])` exception, and increments a new `aegis_inference_chain_exhausted_total{role=}` counter — this, not the per-provider circuit gauges (which will flap routinely as individual tiers degrade and recover), is the signal an operator should actually page on.

**Why the per-tier usage counter matters beyond generic observability:** the whole reason for a 3-5 tier design is that reordering tiers (e.g. Cerebras first instead of Groq, given Cerebras's larger daily request budget for the identical `gpt-oss-120b` model) is a legitimate, already-identified open question this project has not settled. Without a real record of which tier actually serves traffic over time, "is the chain order still right" stays a guess. With it, that becomes a question answerable directly from Grafana — see the future-evolution note in §7.

**Call-site integration, split by safety (§3, principle 2):**
- `model_gateway.call_judge()` and both of `ollama_vision.py`'s functions and `vision_task.py`'s function → call `walk_chain()` directly, full cascade. This replaces the duplicated inline try/except cascades — the three vision call sites keep their own try/except wrapping exactly as it is today (§3, principle 6), only the inside changes to a `walk_chain()` call.
- `model_gateway.generate_streaming()` → gets a narrower treatment: attempt tier 1; if it fails before any token has been yielded (connection error, immediate 4xx/5xx, or a timeout with zero content seen), attempt exactly tier 2 and stop there — never a full 4-tier cascade on the streaming path. This is Phase 4b, kept separate from the judge/vision work (Phase 4a) given its materially different risk profile.

### 4.6 Health monitor — new ARQ cron task `backend/app/tasks/check_inference_provider_health.py`

Follows the exact `check_config_staleness.py` shape (`async def check_inference_provider_health(ctx: Dict) -> dict`, own `asyncpg.connect(..., statement_cache_size=0)`, registered in both `WorkerSettings.functions` and `cron_jobs` at a UTC slot distinct from the existing 18:45/19:00/19:30 ones — e.g. `cron(check_inference_provider_health, hour=6, minute=15)`, roughly 12 hours offset from the existing cluster).

Each run:
1. For every (provider, model) pair in `INFERENCE_CHAINS`, calls that provider's model-list endpoint and diffs against the registry — catches a model silently disappearing, exactly as happened once already during this project's own research (Llama 4 Scout vanishing from Groq's live catalog).
2. Makes exactly one cheap live test call per **primary** tier only, never every fallback tier — deliberately conserves real quota rather than spending it on health-checking. Gemini gets an explicit, hard-coded skip in this step (not an implicit consequence of "primary only" — it's vision's last tier, but a future edit to "test every tier" must not be able to silently burn 20% of its 5-per-minute budget on a health check).
3. Writes results to a new append-only Postgres table (§4.7) and updates Prometheus gauges for catalog-drift and last-verified-working timestamps per tier.
4. Also writes the current quota-remaining snapshot for every tier into the same table on the same tick — this reuses the one cron task for both purposes rather than inventing a second, giving genuine historical trending (not just the live-but-resets-daily Redis state from §4.4) with no added scheduling complexity.

### 4.7 Migration — `database/migrations/011_inference_provider_health.sql`

One append-only table, `inference_provider_health_log`, in the established style (UUID PK, explicit `NULL`/`NOT NULL`, `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, named indexes on `(role, provider, model, created_at)` for time-range queries). Grants follow the `audit_log` precedent directly: `GRANT SELECT, INSERT ON TABLE inference_provider_health_log TO aegis_app_role; REVOKE UPDATE, DELETE ...` — written correctly the first time, not patched later the way `audit_log` itself needed a follow-up migration for a missing `SELECT` grant.

### 4.8 Admin endpoint — `GET /api/admin/inference-health`

Modeled directly on the Quick Entry `pipeline-health` endpoint (`Depends(require_it_admin)`, local `_db()` helper, single `badge` field computed from thresholds, structured sub-objects). Finally gives `circuit_registry.get_all_stats()` — built, currently called from nowhere — a real caller, joined with live quota-remaining state (§4.4) and the latest catalog/health snapshot (§4.7) per role and tier.

**Implementation note, not a bug:** `CircuitBreaker`'s `state` property has a read-side-effect — reading it can trigger an OPEN→HALF_OPEN transition based on wall-clock time. This means both this endpoint and every Prometheus scrape of circuit-derived gauges are not pure reads; they can each nudge a circuit from OPEN to HALF_OPEN (which only *permits* the next call, it doesn't force one). Not a problem to fix, just a real behavior worth the implementer knowing rather than assuming stats reads are side-effect-free.

### 4.9 Observability — `backend/app/observability.py` + Grafana

New metrics, following the existing naming convention and the required `multiprocess_mode="livesum"` on every Gauge:
- `aegis_inference_quota_remaining{provider=,model=}` (Gauge) — live, per §4.4.
- `aegis_inference_chain_exhausted_total{role=}` (Counter) — the real page-worthy signal, per §4.5.
- `aegis_inference_catalog_drift_total{provider=,model=}` (Counter) — incremented when the health-check cron finds a previously-registered model missing.
- `aegis_inference_tier_used_total{role=,tier=,provider=}` (Counter) — which tier actually served each successful request, per §4.5. This is the metric that turns "is this chain efficient" from an assumption into something you can look at.

New Grafana panels appended to `infrastructure/grafana/dashboards/aegis-main.json`'s existing `panels` array (next available grid position below the current layout) — quota-remaining bargauge per provider, a stat panel on chain-exhaustion count, no new provisioning step needed (file-based provisioning already picks up JSON changes).

---

## 5. Implementation phases

Resequenced from the original draft specifically to fix a dependency-ordering mistake the design-review pass caught: monitoring (Phase 5) only needs the registry and adapters, not the routing engine — it can be built and merged in parallel with the routing work, not strictly after it.

| Phase | What lands | Depends on | Risk to existing behavior |
|---|---|---|---|
| **0** | `INFERENCE_CHAINS` registry (data only) | — | None — nothing reads it yet |
| **1** | Cloudflare + Gemini wire-format adapters | — | None — unit-testable against mocked responses, not wired to any caller |
| **2** | Circuit-breaker per-provider overrides | — | None — existing providers keep default behavior, covered by existing CB tests |
| **3** | Quota tracker (`RedisSessionClient` methods, atomic) | — | None — standalone-testable, not wired to any caller |
| **4a** | `walk_chain()` wired into `call_judge` + all 3 vision call sites | 0, 1, 2, 3 | First phase touching production routing — scoped to call shapes proven cascade-safe |
| **4b** | Bounded pre-first-byte fallback for `generate_streaming` | 0, 1, 2, 3 | Separate PR from 4a given the different risk profile (streaming vs. non-streaming) |
| **5** | Health-check cron, migration 011, quota-snapshot writes, Prometheus gauges | 0, 1 (not 4) | None to request-time behavior — can be built in parallel with 4a/4b |
| **6** | Admin endpoint | 2, 3, 5 | None — read-only surface |

**Note on the existing uncommitted state**: `backend/app/config.py` and `.env.example` already carry the `SAMBANOVA_*`/`CLOUDFLARE_*`/`GEMINI_*` constants from the earlier research phase, uncommitted. Phase 0 builds directly on top of that existing diff rather than duplicating it.

---

## 6. Testing and verification

**The automated suite (`pytest`) never makes a live call to any external provider — for every phase.** All routing, quota, and cascade tests run against mocked HTTP responses built from the real shapes already captured during this project's live research (rate-limit headers, `cf-ai-neurons` values, Gemini's `429` body). This is a hard constraint, not an oversight: a test suite that calls real free-tier APIs would itself consume the same scarce quota this whole plan exists to protect, and would make CI runs non-deterministic against providers already observed changing behavior mid-project. The *only* real live calls anywhere in this plan's verification are the two explicitly one-off, manual steps below (Phase 5 and Phase 6) — never part of `pytest`.

- **Phase 0-3**: pure unit tests — chain-registry shape assertions, wire-format adapters against fixture responses matching the real captured shapes, circuit-breaker override behavior, quota-tracker atomicity under simulated concurrent requests (this is where the TOCTOU fix actually gets proven, not just asserted), and a specific test for Design Principle 8 (quota check against a deliberately-unavailable Redis connection must return "available," not "exhausted").
- **Phase 4a/4b**: extend the existing `tests/unit/test_ollama_vision.py` and add `test_model_gateway.py` coverage for `walk_chain()` — mock each tier failing in sequence and assert the cascade both succeeds correctly and respects the wall-clock budget (a test that mocks 4 tiers each taking 20s should assert the call aborts around the configured budget, not after 80s).
- **Phase 5**: run the health-check task manually once against real (rotated) API keys, confirm it correctly detects the already-known-missing Llama 4 Scout on Groq as a real, reproducible catalog-drift case rather than inventing a synthetic test for it.
- **Phase 6**: live-hit the new admin endpoint after deliberately tripping one circuit (bad API key) and confirm the badge and per-tier state reflect it correctly.
- **Whole-system**: after Phase 4a lands, re-run this project's own established discipline — full `pytest` suite, `docker compose config --quiet`, full container health check — before considering any phase done, matching every prior session in this project's history.

### Definition of done — one concrete, whole-system acceptance test

Individual phase tests prove their own piece works; none of them alone prove the *system* does what it was built for. Before considering this plan complete, run this once, manually, with real (rotated) keys: **deliberately invalidate the primary tier's API key for one role (e.g. corrupt `GROQ_API_KEY` for vision), send a real request through that role, and confirm three things simultaneously** — the request still succeeds (served by fallback tier 2), the new admin endpoint (§4.8) shows `groq_vision`'s circuit as open and the request as served by the correct fallback tier, and `aegis_inference_tier_used_total` reflects it in Grafana within one scrape interval. If all three are true, the system is doing the actual job this plan exists for, not just passing isolated unit tests.

---

## 7. Explicitly out of scope — a natural next step, not part of this plan

**Adaptive tier reordering.** Once `aegis_inference_tier_used_total` (§4.5, §4.9) has real data behind it — e.g. if it turns out Cerebras is serving a disproportionate share of main-reasoning traffic because Groq's smaller daily budget keeps getting exhausted first — the natural next question is whether `INFERENCE_CHAINS`' tier order should be revisited based on observed behavior rather than the point-in-time reasoning it was set with. This plan deliberately does not build that: it's a data-driven decision that only makes sense *after* real usage data exists, and building an auto-reordering mechanism now would be optimizing against a guess. Named here so it isn't rediscovered as a surprise later — it's a likely, sensible follow-up, not a gap in this plan.

---

*This plan does not re-open the model-selection question (already finalized in `INFERENCE_MODEL_RESEARCH_UPDATE_2026-07-18_v3_FINAL.md`) — it is scoped entirely to how the system routes across, monitors, and stays within the limits of those already-chosen chains.*
