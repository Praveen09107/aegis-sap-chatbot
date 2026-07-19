# AEGIS — Implementation File Status
## What's actually built vs. what's actually still missing, verified live against the real filesystem

### Compiled 2026-07-19

---

## How this document was produced

Every "implemented" claim below is backed by a real file existing on disk, checked directly (`find`, `git log`, `grep`) — not by trusting `specs/SPEC_INDEX_AND_CURRENT_STATUS.md` or `BACKEND_AGENT_SESSION_GUIDE_v4.md`'s own "RETROFIT STATUS" tables, both of which are confirmed stale (they still describe the backend as stopping "approximately Session 16" and list Sessions 17-29 as "Not yet built," which stopped being true many sessions ago — see `specs/tier3_verification/DECISIONS_LOG.md` for the real, current history, `DEC-001` through `DEC-062`). This document is the file-level companion to `PROJECT_STATUS_REPORT_2026-07-19.md` — that report explains *what happened and why*; this one is a flat, checkable inventory of *what file exists where*.

Sources: `find backend/app -type f -name "*.py"` (66 files), `find frontend -type f` (17 files), `find database/migrations`, `find scripts`, `docker-compose.yml`, `git log --all -- frontend/`, and `DECISIONS_LOG.md`'s Cross-Reference Index, all re-checked live on 2026-07-19.

---

## 1. Backend — IMPLEMENTED (66 real files under `backend/app/`)

The entire original 22-session build plus all 7 Quick Entry sessions plus the post-hoc N-tier inference orchestration work are real, present, and — as of `DEC-059` — proven working end-to-end against live inference, not just unit-tested.

### 1.1 Sessions 1-9 — Foundation (dependencies, environment, Docker, data layer, security)

| Session | Real files |
|---|---|
| 01-03 (deps, env, Docker) | `docker-compose.yml` (31 services), `.env.example`, `requirements.txt` — no dedicated `app/` files |
| 05 (PostgreSQL) | `database/migrations/001-004*.sql`, `backend/app/infrastructure/postgres_client.py`, `scripts/init_database.py` |
| 06 (Qdrant) | `backend/app/infrastructure/qdrant_client.py`, `scripts/init_qdrant.py` |
| 07 (OpenSearch) | `backend/app/infrastructure/opensearch_client.py`, `scripts/init_opensearch.py` |
| 08 (Redis) | `backend/app/infrastructure/redis_client.py`, `scripts/verify_redis.py` |
| 09 (Security/governance) | `backend/app/middleware/{authentication,input_governance,output_governance,rate_limiting,trace_id}.py`, `backend/app/models/api.py` (Pydantic request/response models — real, complete, but confirmed via grep to have **zero references anywhere** in the codebase; likely superseded once the design settled on WebSocket-only chat rather than REST, same "real file, dead code" class as `vault_client.py` below) |

### 1.2 Sessions 10-18 — Core intelligence pipeline

| Session | Real files | Notes |
|---|---|---|
| 10 (Identity/secrets) | `scripts/setup_keycloak.py` | Test-user emails generalized (`aegis-demo.local`) |
| 11 (Zone B orchestration) | `backend/app/handlers/chat_handler.py`, `backend/app/workers/arq_worker.py`, `backend/app/services/session.py`, `backend/app/models/session.py`, `backend/app/tasks/{audit_task,cache_task,cleanup_task,feedback_task,ticket_task,knowledge_gap_task}.py` | `chat_handler.py` also carries `DEC-059`'s Pub/Sub relay fix |
| 12 (Query Intelligence) | `backend/app/services/query_intelligence.py`, `backend/app/models/retrieval.py` | |
| 13 (Vision Service) | `backend/app/clients/ollama_vision.py`, `backend/app/services/vision_integration.py`, `backend/app/tasks/vision_task.py`, `backend/app/handlers/upload_handler.py` | Vision now routes through `walk_chain()` (`DEC-058`), not the original 2-provider cascade |
| 14-15 (Retrieval stages 1-8) | `backend/app/services/retrieval_engine.py` | Full 8-stage pipeline, correct 1→2→3→4→5→7→6→8 order confirmed |
| 16 (Reasoning Service) | `backend/app/services/reasoning_service.py`, `backend/app/services/model_gateway.py`, `backend/app/config.py` | `model_gateway.py` fully rewritten twice more since original build (`DEC-058` N-tier, `DEC-061` per-tier token floor) |
| 17 (Validation Engine) | `backend/app/services/validation_engine.py` | |
| 18 (Ingestion Pipeline) | `backend/app/services/ingestion_pipeline.py`, `database/migrations/005_minio_object_keys.sql` | |

### 1.3 Sessions 21-22 — Fix/integration, final polish

| Session | Real files |
|---|---|
| 21 (Fix & Integration + folded observability) | `backend/app/main.py`, `backend/app/handlers/admin_handler.py`, `backend/app/observability.py`, `infrastructure/grafana/dashboards/aegis-main.json`, `backend/app/infrastructure/minio_client.py` |
| 22 (Final polish) | `infrastructure/nginx/nginx.conf`, `backend/tests/unit/` scaffolding |

**Session 19 (Employee Frontend) and Session 20's frontend portion:** correctly skipped per the guide's own supersession note — that work belongs to the frontend guide (§2 below), not this list.

**`backend/app/infrastructure/vault_client.py`:** exists, real, fully implemented — but confirmed dead code as of `DEC-051`/`DEC-060` (nothing calls it; PgBouncer's static-role fix superseded the dynamic-credential design it was built for). Listed here as "implemented" because the file is real and complete, not because it's in use — see §3 for its actual status.

### 1.4 Sessions 23-29 — Quick Entry (all 7 sessions complete, re-verified live multiple times)

| Session | Real files |
|---|---|
| 23-24 (Overview, data model) | `backend/app/models/quick_entry.py`, `database/migrations/007_quick_entry_tables.sql` |
| 25 (API endpoints) | `backend/app/handlers/knowledge_entries_handler.py` (18 endpoints total across this + screenshots handler) |
| 26 (Processing pipeline) | `backend/app/tasks/process_form_entry.py`, `backend/app/tasks/retry_partial_indexing.py` |
| 27 (Chunking engine) | `backend/app/services/form_chunker.py`, `backend/app/services/form_validator.py`, `backend/app/services/form_import_parser.py` |
| 28 (Screenshot pipeline) | `backend/app/handlers/knowledge_screenshots_handler.py`, `backend/app/tasks/enrich_entry_screenshots.py`, `backend/app/tasks/cleanup_eligible_screenshots.py` |
| 29 (Operational systems) | `backend/app/tasks/check_config_staleness.py`, `backend/app/services/quick_entry_quality.py` |

Migrations: `006-010_*.sql`. Real, live-verified end-to-end (`DEC-057`, `DEC-059`): create → publish → real retrieval → real cited answer.

### 1.5 Post-hoc work — N-tier inference orchestration (not tied to an original `IMPL_XX` session number)

Built and verified this session and the one before it (`DEC-058` through `DEC-061`), on top of the original 29-session plan:

| File | Purpose |
|---|---|
| `backend/app/config_inference_chains.py` | Declarative 4/4/5-tier provider chain registry (main/judge/vision) |
| `backend/app/infrastructure/providers_cloudflare.py`, `providers_gemini.py` | New wire-format adapters (Workers AI REST, Gemini `generateContent`) |
| `backend/app/infrastructure/inference_providers.py` | Groq/Cerebras/SambaNova shared OpenAI-compatible adapter |
| `backend/app/infrastructure/circuit_breaker.py` | Per-provider circuit-breaker overrides |
| `backend/app/handlers/inference_health_handler.py` | New `GET /api/admin/inference-health` endpoint |
| `backend/app/tasks/check_inference_provider_health.py` | New ARQ cron health monitor |
| `database/migrations/011_inference_provider_health.sql` | New |

**Real, live proof this works** (not just unit-tested): `DEC-059` deliberately broke a real provider and confirmed genuine cross-provider failover; `DEC-061` root-caused and fixed a real judge-tier reliability bug found by the real benchmark in `DEC-060`.

### 1.6 Test coverage

328 unit tests passing (`tests/unit/` — 21 files, `backend/tests/unit/` — 2 files). Zero `TODO`/`FIXME`/`NotImplementedError` anywhere in `backend/app` — confirmed via direct grep, not assumed from the "no placeholder code" rule being followed.

---

## 2. Backend — NOT YET IMPLEMENTED (genuine gaps, each independently confirmed live)

| Item | Confirmed via | What's missing |
|---|---|---|
| **Negative-feedback admin notifications** (`IMPL_29` §3.2) | `grep -rln "admin_notifications" database/migrations backend/app` — zero migration creates this table; only a docstring comment in `knowledge_entries_handler.py` notes it was deliberately deferred | The `admin_notifications` table itself, and the alerting logic that would populate it when an entry accumulates net-negative feedback. Only the *read* endpoint this feature would eventually feed (`IMPL_29` §3.1, already built in Session 25) exists. |
| **`"correction"` WebSocket message type** (`AEGIS_DATA_CONTRACTS.md`, `OPEN-08`) | `grep -rn "\"correction\"" backend/app` — zero matches anywhere | Documented in the data contracts as a message type the Validation Engine can send; `IMPL_17` never actually implements sending it. Genuine spec-vs-code gap, present since the original build, never decided whether to build or correct the contract. |
| **Vault-backed secrets management** (`DEC-060`/`DEC-061`, scoped as a named follow-up, direction chosen not to delete) | `backend/app/infrastructure/vault_client.py` exists but implements only the now-superseded dynamic-Postgres-credential path; no KV v2 engine provisioning anywhere in `scripts/setup_vault.py` | Repurposing Vault's already-working AppRole auth to store the 5 external provider API keys instead of a flat `.env` — a real multi-file feature (new engine provisioning, `vault_client.py` rewrite into a generic `get_secret()`, a rotation-without-container-recreation design), not started. |
| **Real production deployment (Oracle Cloud)** | `find . -iname "*.tfstate" -o -iname "*ansible*"` — nothing; `docker context ls` shows only local Docker Desktop/WSL2 | `docs/CLOUD_DEPLOYMENT_GUIDE.md` exists as a written plan but has never actually been executed — this project has only ever run on WSL2. No ARM64 compatibility issue has ever been hit for real, since it's never been tried. |
| **API key rotation** | Standing reminder from `DEC-059`, not yet actioned | The 5 provider keys (Groq, Cerebras, SambaNova, Cloudflare, Gemini) currently live in `secrets-share/.env` are the same ones used for this session's real-inference testing and must be rotated before actual production deployment. |
| **SambaNova's real rate limit** (`OPEN-06`) | `DEC-060` deliberately checked and found no evidence either way (zero rate-limit headers on a real 200) | Not a missing file — a missing piece of information. The existing "20 RPM" assumption in `circuit_breaker.py`'s comments is unverified; low priority since SambaNova is only a fallback tier. |

**Everything else in the original 29-session backend plan is built and verified.** This is a short list because the backend genuinely is close to complete — these are the specific, named exceptions, not a sign of broader incompleteness.

---

## 3. Frontend — IMPLEMENTED (6 real files, none ever executed)

```
frontend/src/lib/auth.ts
frontend/src/app/api/auth/login/route.ts
frontend/src/app/api/auth/refresh/route.ts
frontend/src/app/api/auth/set-token/route.ts
frontend/src/app/api/auth/ws-token/route.ts
frontend/src/app/api/proxy/[...path]/route.ts
```

All 6 were added in a single commit (`07cb029`, "Session 21"), built ad hoc to support real backend/Keycloak integration testing during that session — **not produced by any proper run of the frontend session guide.** None have ever actually been executed: `npm run dev` has never run against this codebase (confirmed — no frontend container has ever appeared in `docker compose ps` history), so their correctness is unverified, not just untested.

`package.json` is real but minimal — `next`, `react`, `jose` (JWT), `clsx`/`tailwind-merge` only. No shadcn/ui (`components.json` doesn't exist — shadcn was never initialized), no `@tanstack/react-query`, no state-management library, no `@react-pdf/renderer`, no animation library.

---

## 4. Frontend — NOT YET IMPLEMENTED (all 19 sessions, ~197-217 files)

As of `DEC-062`'s re-audit (2026-07-19), every session F01 through F18 is corrected from the guide's previous, false "already built" claim to **FRESH BUILD**. Nothing below exists yet.

| Session | What it builds | Files (estimate, per the guide) |
|---|---|---|
| F01 | Project scaffold — Next.js 15, shadcn init, all UI primitives | ~15-20 |
| F02 | Design system & globals | ~5-8 |
| F03 | Architecture & infrastructure — **verify the 6 real files above first, don't discard** | ~10-15 |
| F04 | Tailwind patterns & shadcn overrides | ~5-8 |
| F05 / F05b | Core & data components | ~15-20 |
| F06 | Chat components | ~8-10 |
| F07 | Layout components & stores | ~8-10 |
| F08 | TanStack Query hooks | ~10-12 |
| F09 | Employee chat interface (+ multi-tab coordination, partial-stream recovery) | ~10-15 |
| F10 | Employee history & onboarding | ~10-12 |
| F11 | Admin shell & dashboard | ~10-15 |
| F12 | Admin documents & registry | ~10-12 |
| F13 | Admin gaps, audit, review & tickets | ~12-15 |
| F14 | Admin health & analytics | ~8-10 |
| F15 | Animations & micro-interactions | ~5-8 |
| F16 | Dark mode, error handling & polish | ~8-10 |
| F17 | Accessibility & performance | ~5-8 |
| F18 | Backend API proxy & final verification — **verify the proxy route above first** | ~10-15 |
| F19 | Quick Entry admin UI + employee screenshot attribution | ~15-20 |

**Full detail, corrected session-by-session prompts:** `specs/tier0_agent_guide/FRONTEND_AGENT_SESSION_GUIDE_v2.md`.

---

## 5. Infrastructure & deployment

| Category | Status |
|---|---|
| `docker-compose.yml` | **Implemented** — 31 services defined (17 run under the default `INFERENCE_MODE=external` profile; 3 Ollama services correctly gated behind `--profile local-inference` and don't start by default) |
| Database migrations | **Implemented** — 12 real migrations (`001` through `011`, plus `00_create_keycloak_db.sql`), all applied |
| Setup/verification scripts | **Implemented** — 9 real scripts under `scripts/` (`init_database.py`, `init_qdrant.py`, `init_opensearch.py`, `setup_keycloak.py`, `setup_vault.py`, `setup_models.py`, `verify_deps.py`, `verify_models.py`, `verify_redis.py`), plus the rewritten `aegis_inference_benchmark.py` |
| Nginx | **Implemented** — WebSocket routing confirmed working (Session 22) |
| Grafana dashboard | **Implemented** — 8-panel `aegis-main.json`, extended to 11 panels for the N-tier inference metrics (`DEC-058`) |
| Real Oracle Cloud production deployment | **Not implemented** — see §2. Development has only ever happened on WSL2; the deployment guide exists as a document, never executed |
| Vault (as a secrets-management feature) | **Provisioned, not used** — the container runs, `setup_vault.py` configures AppRole + Database/Transit/PKI engines, but nothing in the application calls any of it (see §2) |

---

## 6. One-paragraph summary

**Backend: essentially complete.** All 29 original sessions plus 7 Quick Entry sessions plus a full N-tier multi-provider inference orchestration layer (built after the original plan) are real, present, and — as of this week — proven working end-to-end against live inference, including a critical streaming bug found and fixed by that real testing. What's left is a short, specific list: one deferred notification feature, one undocumented-vs-unimplemented WebSocket message type, one scoped-but-not-built secrets-management upgrade, and the fact that this has never actually been deployed anywhere but a WSL2 dev machine.

**Frontend: essentially not started.** 6 files exist, all incidental to backend integration testing, none ever run. All 19 sessions and effectively the entire UI — every page, every component, every store — remain to be built, now against an accurate guide instead of a false one.

---

*Sources: live `find`/`git log`/`grep` against the real repository, 2026-07-19 · `specs/tier3_verification/DECISIONS_LOG.md` `DEC-001` through `DEC-062` · companion document `PROJECT_STATUS_REPORT_2026-07-19.md` for the narrative version of this same state.*
