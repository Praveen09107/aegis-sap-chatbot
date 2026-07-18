lts for `screenshot_ids`/`has_screenshots` anywhere in `retrieval_engine.py`. This blocked this verification pass's own required final end-to-end test (an employee query must be able to display a cited entry's attributed screenshot). Flagged directly rather than silently built or silently skipped; built on explicit authorization. `RetrievedChunk` gained `source_type`/`form_entry_id`/`has_screenshots`/`screenshot_ids`; a new batch-fetch function in the Validation Engine returns proxy-ready screenshot metadata (URL, caption, section) in the attribution panel.

---

## 7. Current state, verified live (2026-07-18)

| Check | Result |
|---|---|
| Full unit test suite (`tests/unit/` + `backend/tests/unit/`) | **261 / 261 passing** |
| `docker compose config --quiet` | valid (silent exit) |
| Live container health, all 17 default-profile services | all healthy |
| Quick Entry backend (IMPL_23–29) | complete, re-verified end to end including a real API-created entry, real screenshot, real publish, and a real retrieval query proving the chunk is found and correctly attributed |
| Frontend UI (`.tsx` pages/components) | **0 of 19 sessions actually built** — see §7.1 |
| Any real (non-mocked, non-401) LLM call, ever, anywhere in this project's history | **never succeeded** — blocked by `OPEN-13` |

### 7.1 The frontend gap

This is the largest unresolved discrepancy in the project. `FRONTEND_AGENT_SESSION_GUIDE_v2.md`'s own status table marks 18 of 19 frontend sessions (F01 through F18) as **"Already built,"** including F01 — the project scaffold itself, whose own verification step (`npm run dev` must compile) cannot pass against an empty source tree. Checked directly, not trusted:

```
$ find frontend/src -type f
frontend/src/lib/auth.ts
frontend/src/app/api/proxy/[...path]/route.ts
frontend/src/app/api/auth/set-token/route.ts
frontend/src/app/api/auth/refresh/route.ts
frontend/src/app/api/auth/login/route.ts
frontend/src/app/api/auth/ws-token/route.ts
```

Six files. All authentication/proxy plumbing (login, token refresh, WebSocket token issuance, and the generic API proxy route). No `layout.tsx`, no page, no component, no hook exists anywhere. `git log --oneline --all -- frontend/` confirms no commit in this repository's entire history has ever added a single `.tsx` file, or any pre-Session-21 `.ts` file, under `frontend/src/`.

This nearly caused a real problem once already: Session 21 assumed it could *update* two existing files — an admin shell page and a WebSocket hook — to render into. Neither existed; caught and corrected before being acted on (`DEC-047`). The guide's false claim is tracked as `OPEN-11` and blocks every frontend session from starting safely until it receives the same session-by-session retrofit-status re-audit the backend guide already went through.

---

## 8. Full open items register

Everything below is explicitly tracked in `DECISIONS_LOG.md` Part G as genuinely unresolved. Each was left open deliberately, with a stated reason, not forgotten.

| ID | What's unresolved | What it blocks |
|---|---|---|
| `OPEN-13` | `CEREBRAS_API_KEY`/`GROQ_API_KEY` are still placeholders — every external inference call returns a real, confirmed `401`. | Any real generated answer, judge call, or vision call, anywhere in the system. Deliberately left open — asked directly, chose to proceed rather than supply keys immediately. |
| `OPEN-15` | The configured Keycloak client secret doesn't match Keycloak's real configured secret for the `aegis-chat` client — only a hardcoded setup-script literal works. | Real employee/admin login the instant a frontend exists and exercises the real token exchange. Not a live outage today only because no frontend container runs yet. |
| `OPEN-11` | `FRONTEND_AGENT_SESSION_GUIDE_v2.md`'s retrofit-status table is false for 18 of 19 sessions (see §7.1). | Starting any frontend session (F01–F18) safely. |
| `OPEN-14` | `vault_client.py` is now dead code after `DEC-051`'s PgBouncer fix moved every Postgres call site to static credentials. Disposal (delete vs. keep for a future non-pooled use case) not decided. | Nothing functionally — a cleanup decision only. |
| `OPEN-05` | The inference benchmark script (`aegis_inference_benchmark.py`) exists, built against AEGIS's real prompt shapes, but has never been run against real API keys. | Real, documented latency/throughput numbers — depends on `OPEN-13` being resolved first. |
| `OPEN-08` | `AEGIS_DATA_CONTRACTS.md` documents a `"correction"` WebSocket message type that `IMPL_17`'s Validation Engine never actually implements sending. | Nothing functional yet — a genuine spec-vs-spec inconsistency present since the original build, needs a decision on whether to build it or correct the contract. |
| `OPEN-10` | `.env.example` still has the same stale `KEYCLOAK_CLIENT_ID=aegis-backend` already corrected in the real secrets file. | Any fresh environment bootstrapped from the example file — worth a broader audit of that file's other values while this is being looked at. |
| `OPEN-06` | SambaNova's real free-tier numeric rate limits were never confirmed (a genuine no-card free tier exists, but exact limits couldn't be located), so it stayed excluded from the architecture rather than rejected outright. | Nothing currently — a possible future provider option if someone checks the real dashboard. |

**Resolved items, for completeness (not open, listed so this report doesn't look like it omitted them):** `OPEN-01` through `OPEN-04`, `OPEN-07`, `OPEN-09`, and `OPEN-12` are all marked `RESOLVED` in `DECISIONS_LOG.md`, each with the specific fix and commit that closed it.

---

## 9. What I think the optimal next step is

Three real candidates compete for "what's next": build the frontend, get real inference API keys, or fix the Keycloak client secret. Here is the priority order, and the reasoning.

### 1. Get real Cerebras and Groq API keys — resolve `OPEN-13` first

This is the single highest-leverage action available, and it costs minutes, not sessions, on a free signup. Across 29 backend sessions and 261 unit tests, **no real LLM call has ever succeeded** in this project's entire history — every reasoning, judge, and vision call has either been exercised against a mock in a unit test, or has failed at the exact same `401` authentication boundary in every live check performed. That means the part of AEGIS that actually answers a question, decides whether that answer is well-supported by its sources, and reads a screenshot — the part that makes it a *product* rather than a very well-tested retrieval and storage system — has never once been observed working end to end on real inference.

Before investing in 19 more frontend sessions built on top of this backend, it is worth confirming the core generation loop actually produces a correct, well-formed, properly-cited answer against real data. This is also the cheapest possible way to validate an enormous amount of already-built, already-unit-tested code (`reasoning_service.py`, `validation_engine.py`, the CRAG stage, the vision pipeline) that has been checked for correctness in isolation but never seen a real end-to-end run.

### 2. Fix the Keycloak client secret mismatch — resolve `OPEN-15`

Also a cheap, direct configuration fix, and currently silent only because nothing exercises real login yet. It will not stay silent — the moment a frontend login page exists and calls the real token exchange (`frontend/src/app/api/auth/login/route.ts` already depends on this exact variable), this breaks immediately and would likely present as a confusing frontend authentication failure rather than an obvious config mismatch. Fixing it now, while it's a five-minute correction with a known cause, is strictly cheaper than re-discovering it later during frontend integration.

### 3. Re-audit the frontend guide session-by-session before touching F01

The guide's "already built" claims are false for every one of the 18 sessions that matters (§7.1). Starting F01 against that guide as currently written risks the same near-miss that already happened once during Session 21 (almost updating admin-shell files that don't exist), at much larger scale, across an entire 19-session sequence. The fix is the same process the backend guide (`BACKEND_AGENT_SESSION_GUIDE_v4.md`) already went through: go through each frontend session individually and mark it fresh-build or retrofit against what is actually present in the repository, not what the guide currently assumes.

### Summary judgment

The backend is genuinely complete and has been checked harder than most production systems get checked — every session independently re-verified live, several real bugs found and fixed in already-shipped code well after it was first called "done." But it has only ever been checked as *plumbing*. The one thing that would make it a working product — a real, generated, cited answer to a real question — has never actually run, in this project's entire history. That is the fastest, cheapest, and highest-information next step, and it should happen before any further frontend investment.

---

*Sources: `git log --all` (78 commits) · `specs/tier3_verification/DECISIONS_LOG.md` (DEC-001 through DEC-057) · live `pytest`, `docker compose config`, and `docker compose ps` runs performed 2026-07-18.*# AEGIS — Full Project Status Report
## What has been implemented, why, how it was verified, and what's next
### Compiled 2026-07-18, from primary sources only

---

## How this document was produced

Every claim below is sourced from one of three places, checked live rather than recalled:

1. `git log --oneline --all` (78 commits, full history read)
2. `specs/tier3_verification/DECISIONS_LOG.md`, read in full (1,035 lines, 57 decisions, `DEC-001` through `DEC-057`)
3. Live checks run in this session: `pytest tests/unit/ backend/tests/unit/` (261 tests), `docker compose config --quiet`, `docker compose ps` (17 services), `find frontend/src -type f`

`specs/SPEC_INDEX_AND_CURRENT_STATUS.md` was checked and found stale (it still says "reached approximately Session 16") — it is **not** used as a source here. If you read it separately, do not trust its "current state" section; trust this document and `DECISIONS_LOG.md` instead.

---

## 1. What AEGIS is

AEGIS is a general-purpose SAP ERP helpdesk AI. An employee asks a question in plain language; the system retrieves the relevant internal documentation (error guides, procedures, config references), generates an answer, validates that answer against the retrieved source material before showing it, and cites exactly what it used, including any relevant screenshots. A separate IT-admin surface lets staff author new knowledge, including a fast form-based path ("Quick Entry") as an alternative to writing a full source document by hand.

**Origin and current legal/ownership framing:** AEGIS began as an internship project at Sona Comstar. When the internship ended, the developer (an authorized collaborator who had already pulled the full repository) chose to continue the project independently rather than abandon the work — as a portfolio piece and potential future product template (`DEC-001`). No claim is made anywhere in the project's history about intellectual property rights, NDAs, or employment terms governing this continuation; the developer was advised to have any agreements signed during the internship reviewed by a qualified advisor before public distribution or commercialization. This question remains explicitly unresolved and is not addressed further in this report.

**Core capabilities as actually built (not aspirational):**
- **Retrieval-augmented answering** — an 8-stage pipeline (dense vector search, identity vector search, BM25 keyword search, knowledge-graph boost, reciprocal-rank fusion, cross-encoder reranking, corrective self-reflection/CRAG, parent-header hydration) against Qdrant + OpenSearch. Pipeline execution order is **1 → 2 → 3 → 4 → 5 → 7 → 6 → 8** — reranking (stage 7) runs *before* CRAG (stage 6), not after, per hard architecture rule.
- **Three-tier answer validation** — every generated answer is scored on NLI entailment support, judge-assessed faithfulness and completeness, and source freshness, before an employee ever sees it. Produces a green/amber/none confidence badge and a per-claim attribution panel.
- **Vision-based screenshot understanding** — SAP screenshots are classified by type and have structured fields extracted, used both in live employee chat and in admin-authored knowledge entries.
- **Quick Entry** — full form-based authoring: validation, structure-aware chunking, background indexing (ARQ), screenshot attachment, staleness detection, feedback loop, rate limiting, bulk import, pipeline health reporting.

---

## 2. Scope and direction — the decisions that shape everything else

These live in `DECISIONS_LOG.md` Parts A–D and are explicitly treated as the *highest* authority for these specific questions — higher than the original frozen specs, since they were made after the pivot away from Sona Comstar and no original spec document can speak to them.

| ID | Decision | Why it matters going forward |
|---|---|---|
| `DEC-001` | Project continues independently, outside Sona Comstar. | IP/NDA question explicitly unresolved, not re-litigated here. |
| `DEC-002` | Success bar = fully working, production-grade, zero recurring cost forever, no feature/quality reduction accepted. | Explicitly overrode two real proposals to cut scope for time (see DEC-005) or use a weaker model for latency. |
| `DEC-003` | Single-tenant, company-agnostic — **not** multi-tenant SaaS. | Multi-tenant would need an estimated 2–3 more months (tenant-scoped DB routing, per-tenant vector namespacing, billing) — deliberately out of scope. |
| `DEC-004` | Generalized to "any company running SAP," **not** fully domain-agnostic. | Ingestion field-detection and entity extraction stay SAP-specific by design; not meant to handle arbitrary HR/legal/finance documents. |
| `DEC-005` | Quick Entry (IMPL_23–29 + FRONTEND_36–40) is fully in scope. | Reverses an earlier deferral suggestion — the developer explicitly confirmed it stays in scope after a real conflict between two earlier statements was surfaced directly. |
| `DEC-006` | Vision is a **primary**, non-optional feature. | Was proposed as droppable to save resources; explicitly overridden — contingent only on finding a free vision-capable provider, which was found. |
| `DEC-007` | Quick Entry's only generalization touchpoint: one "use real Sona Comstar SAP examples" instruction corrected to synthetic examples. | The only Sona-Comstar-specific *instruction* found anywhere in the Quick Entry spec set. |

---

## 3. Architecture as it actually runs today

### 3.1 Inference: no self-hosted models, dual-homed free-tier APIs

The original design planned every model role as a locally-hosted Ollama container. This was abandoned (`DEC-015`) after modeling self-hosted throughput on Oracle's free ARM tier: 2–4 tokens/second for even a 7B model, an estimated 75–150 seconds per response — rejected as incompatible with the production-grade bar in `DEC-002`. A 3B model (40–75s) was also rejected on the same grounds. Groq-as-sole-provider was explicitly rejected by the developer as reading like "just an API wrapper" to a technical reviewer — resolved not by abandoning API inference, but by reframing it as a genuine piece of distributed-systems engineering: a multi-provider gateway with circuit-breaker failover between independently-hosted, identically-weighted models.

| Role | Model | Primary | Fallback | Verified limits (Free tier) | Decision |
|---|---|---|---|---|---|
| Main reasoning | `gpt-oss-120b` | Cerebras | Groq | Cerebras: 5 RPM / 30K TPM / 1M TPD. Groq: 30 RPM / 1K RPD / 8K TPM / 200K TPD. | `DEC-019` |
| Judge / CRAG / fast-path | `llama-3.1-8b-instant` | Groq only | degrades to main pair, reduced token budget | 30 RPM / **14,400 RPD** / 6K TPM / 500K TPD | `DEC-020` |
| Vision | `llama-4-scout-17b-16e-instruct` | Groq | `gemma-4-31b` (Cerebras) | Groq: 30 RPM/1K RPD/30K TPM (Preview status). Cerebras: 5 RPM/30K TPM/1M TPD, **2 images/request, 4MB payload limit on Free Trial specifically**. | `DEC-021` |

The main-reasoning role deliberately serves **identical weights on both providers** specifically so failover has zero behavioral drift — this was the single deciding factor in that model's selection over `llama-3.3-70b-versatile` (no Cerebras equivalent) and `zai-glm-4.7` (Preview status, no Groq equivalent).

**Rejected providers, with reasons (`DEC-022`):** Gemini (prompts may train Google's models — disqualifying on privacy grounds), Mistral (no real free production API, only a ~25 msg/day consumer chat product), OpenRouter (thinner base free tier than going direct, requires paid top-up for its better tier, catalog rotates without notice), SambaNova (excluded, not rejected — a genuine free tier exists but exact numeric limits were never confirmed; tracked as `OPEN-06`).

`INFERENCE_MODE=external` is the live default. A fully air-gapped `INFERENCE_MODE=local` path still exists in the architecture and would be offered to a real client with genuine data-sensitivity requirements (`DEC-017`) — this distinction must be stated explicitly in any future client-facing privacy claims, since the live demo's acceptance of external API calls is scoped specifically to its synthetic (non-real-company) demo content (`DEC-016`, `DEC-017`).

**Current status: this entire path is unverified with real traffic.** `CEREBRAS_API_KEY` and `GROQ_API_KEY` are both still placeholder strings. Every external call returns a real, confirmed `401 Unauthorized` — not a connection failure, a genuine authentication rejection from the real provider endpoints. This is `OPEN-13`, tracked as a deliberate, not-yet-resolved decision (see §7 and §8).

### 3.2 Data layer

| Store | Used for | Real, verified detail |
|---|---|---|
| PostgreSQL (primary + streaming replica) | Persistent structured data | 17 tables (13 original + 4 Quick Entry), pooled through PgBouncer via a dedicated least-privilege role (`aegis_pooled_role`, not superuser — see §6) |
| Qdrant | Vectors | 4 collections (`meridian_errors`, `meridian_procedures`, `meridian_configs`, `cache_queries`). **768 dimensions everywhere, no exceptions.** Named `content` + `identity` vectors, INT8 quantization. |
| OpenSearch | BM25 keyword search | Single index `sap_documents`, custom SAP-terminology analyzer |
| Redis Instance 1 (session) | Session/cache state | No AOF persistence, by design |
| Redis Instance 2 (queue) | ARQ job queue | **AOF persistence enabled**, by design — task durability required here, not on Instance 1 |
| MinIO | Original documents + screenshots | Re-added as a 20th service after being dropped from the final spec (`DEC-024`); ~100–150MB RAM impact. Write failures are **fatal** on ingestion paths, **non-fatal** on query-time paths — deliberately not unified. |

### 3.3 Deployment and dev environment

Target deployment is Oracle Cloud's Always Free tier — **2 OCPU / 12GB ARM** (corrected during planning from an initially-assumed 4 OCPU/24GB, per Oracle's actual current documentation, `DEC-009`). ARM64 requires exactly one infrastructure accommodation: an explicit ARM64 image tag for OpenSearch (`DEC-014`); every other image in the stack is already multi-architecture.

`DEC-013` states development happens via VS Code Remote-SSH directly on the Oracle VM. **This does not match actual practice** — this entire project's real development history has run on WSL2 (confirmed directly: this session itself is operating on a `\\wsl.localhost\...` path). This contradiction has never been formally logged as reversed (per `DECISIONS_LOG.md`'s own rule that a reversed `CONFIRMED` decision must be marked `SUPERSEDED BY DEC-XXX`). It is noted here as a real, still-open documentation drift, not resolved either way.

17 services run under the default `INFERENCE_MODE=external` profile: `aegis-postgres-primary`, `aegis-postgres-replica`, `aegis-pgbouncer`, `aegis-redis-session`, `aegis-redis-queue`, `aegis-qdrant`, `aegis-opensearch`, `aegis-minio`, `aegis-vault`, `aegis-keycloak`, `aegis-bge`, `aegis-deberta`, `aegis-fastapi`, `aegis-arq`, `aegis-nginx`, `aegis-prometheus`, `aegis-grafana`. The three Ollama containers (`aegis-ollama-main`, `-judge`, `-vision`) exist in `docker-compose.yml` but are gated behind a `local-inference` Compose profile and correctly do not start by default — see §6 for why getting this gating fully correct mattered more than it looks.

---

## 4. Session-by-session implementation history

All sessions below are merged to `main`. Backend session numbering follows the original `IMPL_XX` spec files; several were retrofitted out of their original numeric order once the inference and generalization amendments were written mid-project.

### 4.1 Original build (IMPL_01 – IMPL_22)

| Session(s) | What was built | Fresh build / retrofit |
|---|---|---|
| IMPL_01 – 04 | Dependency manifest, environment setup, Docker infrastructure, model provisioning | Fresh |
| IMPL_05 | PostgreSQL data layer — 13 tables, seed data, PgBouncer port (6432), replica streaming | Fresh |
| IMPL_06 | Qdrant vector database — 4 collections, 768-dim, named vectors, INT8 quantization | Fresh |
| IMPL_07 | OpenSearch data layer — SAP-terminology analyzer | Fresh |
| IMPL_08 | Redis data layer — both instances | Fresh |
| IMPL_09 | Nginx + content-governance middleware stack | Fresh |
| IMPL_10 | Keycloak realm, Vault engines, JWT auth middleware | Fresh, later retrofitted for test-user email domain generalization |
| IMPL_11 | Zone B orchestration — ARQ worker, circuit breakers, session state, WebSocket handler | Fresh |
| IMPL_12 | Query Intelligence Layer — entity extraction, query enrichment | Fresh |
| IMPL_13 | Vision Service — upload handler, `DiagnosticObject` enrichment | Fresh, then retrofitted to route through Cerebras/Groq instead of local Ollama |
| IMPL_14 | Retrieval stages 1–5 — RRF fusion, diversity bonus | Fresh |
| IMPL_15 | Retrieval stages 6–8 — CRAG, reranking, hydration | Retrofitted (CRAG routed through the new `model_gateway.call_judge()`) — **had a hard dependency on Session 16 landing first**, see below |
| IMPL_16 | Reasoning Service — model gateway, prompt assembly, Redis Pub/Sub streaming | Retrofitted — full `model_gateway.py` rewrite for Cerebras/Groq dual-homing |
| IMPL_17 | Validation Engine — three-tier answer quality scoring | Fresh build, confirmed already correctly delegating to the new gateway, no retrofit needed |
| IMPL_18 | Ingestion Pipeline + MinIO object storage | Fresh build. Follow-up fix: a knowledge-graph-edge foreign-key ordering bug (stage 11 must run before stage 10) |
| IMPL_21 | Fix and Integration + IMPL_20 observability (folded in) + MinIO finishing | Fresh build |
| IMPL_22 | Final polish — Nginx WebSocket route fix, test conftest fix | Fresh build |
| (separate fix) | `vision_task.py` retrofit for real Cerebras/Groq routing | Fixes `OPEN-12`, applied after IMPL_22 |

**The Session 15/16 ordering dependency (`DEC-037`):** applying Session 16's `model_gateway.py` rewrite *after* Session 15's CRAG retrofit raises an immediate `TypeError` — Session 15's retrofit calls `call_judge()` with keyword arguments (`max_tokens=`, `temperature=`) that only exist on the *new* signature Session 16 introduces. This reverses the sessions' natural numeric order and was found only during a dedicated final cross-document dependency check, not from following session numbers in order.

### 4.2 Quick Entry (IMPL_23 – IMPL_29)

Added as a deliberately in-scope feature (`DEC-005`). Seven backend sessions, each independently verified live.

**Session 23 — Prerequisites verification.** 5 of 6 infrastructure prerequisites confirmed live (MinIO bucket, Postgres migration state, OpenSearch mapping state, ARQ graceful reload, Redis rate-limit namespace). The 6th (a working vision call) genuinely failed — not because the literal spec check was wrong, but for a more specific real reason: the actual call path (`ollama_vision.py`, already `INFERENCE_MODE`-aware) returned a real `401`, not a missing-container error. **Discovered along the way:** the *already-shipped* chat screenshot feature (`vision_task.py`) was silently broken under the live default config — it made a raw, unbranched Ollama call with zero `INFERENCE_MODE` awareness, traced to a stale amendment document that claimed a fix existed which had never actually been written (`DEC-048`).

**Session 24 — Data model.** 4 new Postgres tables (`knowledge_form_entries`, `_versions`, `_chunks`, `knowledge_form_screenshots`) plus Python dataclasses. The kickoff spec named "SQLAlchemy data models" twice; checked directly before writing anything — `sqlalchemy` is a declared-but-unused dependency across the entire codebase, `alembic` isn't installed at all. Built with plain `@dataclass` and a numbered `.sql` migration instead, matching this codebase's actual established convention (`DEC-050`). Also corrected: 4 documents referencing a nonexistent `aegis_knowledge` collection/index, corrected to the real 4-collection/1-index architecture.

**Session 25 — API endpoints.** Create/list/get/update/archive plus suggest-doc-id/check-duplicate/validate-reference utility endpoints, full form validator (29 tests), optimistic-locking on publish. `process_form_entry` enqueued via a disclosed stub since the processing task didn't exist yet.

**Session 26/27 — Processing pipeline + chunking.** Structure-aware chunker (`form_chunker.py`), the 13-stage `process_form_entry` background task, `retry_partial_indexing`. Closed Session 25's stub. Bundled with two unrelated infra fixes found while building: **PgBouncer was completely bypassed** (see §6), and vision-task Prometheus metrics were invisible because the ARQ worker never shared a multiprocess directory with FastAPI.

**Session 27 — Version/restore + feedback.** `GET /{id}/versions`, `POST /{id}/restore/{version}`, `GET /{id}/feedback-summary`. Found and fixed a real, already-shipped Session 25 bug: the very first publish-update of *any* entry hit a live `500`, because both `create_entry()` and `update_entry()` tried to insert a versions-table snapshot for the same version row.

**Session 28 — Screenshot pipeline.** Explicitly flagged in its own spec as carrying a real, named risk: a possible second, duplicate vision client. Verified clean by grep — zero results for `llava` or any duplicate `VISION_SERVICE_URL`-style constant anywhere in the codebase; the pipeline correctly reuses the existing `classify_sap()`/`extract_sap_content()` functions. Also fixed, as an unrelated-but-adjacent finding: the nightly cache-cleanup job (`nightly_cleanup`) had never actually been scheduled anywhere in the codebase despite being described as a running job — no APScheduler dependency, no ARQ cron entry existed at all.

**Session 29 — Operational systems + hardening.** Staleness detection (`check_config_staleness`), rate limiting, bulk import parser, pipeline health endpoint, Knowledge Gaps write-back. Explicit hardening checks (not code review) found **two real concurrent-edit bugs** in already-shipped code: (1) simultaneous *draft* edits produced two `200`s with zero conflict signal — silent last-write-wins, because drafts never increment their version number, so the existing version-based optimistic lock structurally cannot see draft-to-draft collisions; true since Session 25. (2) Simultaneous *publish* races raised an unhandled `500` where the API contract promised `409` — the database constraint correctly prevented data corruption, the wrong status code just surfaced.

### 4.3 Final rigorous re-verification pass, Sessions 25–29 (2026-07-18, `DEC-057`)

A dedicated, from-scratch verification pass against genuinely live containers — real HTTP calls, real service interruptions, real concurrent requests, real payload inspection — run specifically because prior "session complete" claims, however carefully verified at the time, deserved one more independent check before being trusted as final. This is the work this exact conversation performed. Full detail in §6.

---

## 5. Verification methodology — the project's actual engineering culture

The single most consistent thread across all 57 logged decisions is a refusal to accept a plausible explanation, a spec's own claim, or a partial code excerpt as settled fact without checking it against the real, running system. Concrete, named instances of this pattern recur throughout the project's history:

1. **Read the complete real file, never an excerpt.** Twice, a defect was invisible in a partial code paste and surfaced only once the complete file was requested and read in full — including the single most severe defect found during the entire spec-writing phase (see §6, "missing `depends_on` removal").

2. **Treat "this is expected at this stage" as a hypothesis to verify, not a conclusion to accept.** When `/health` reported degraded after a retrofit, the first explanation offered — "Qdrant's collections don't exist yet because ingestion hasn't been built" — was plausible and wrong. Direct investigation found two separate, real issues instead (§6).

3. **A decisions log's own "done" entry can itself be wrong.** `DEC-040` recorded a `vision_task.py` retrofit as written and applied. It never actually was — the session that wrote that entry described an intention, not a completed action. This was only caught because a later session (`DEC-048`) tried to build on top of it and the fix wasn't there. The explicit lesson recorded afterward: even this log's own `CONFIRMED` entries need spot-checking against the real file before being trusted.

4. **Prefer exercising the actual failure condition over reading the code meant to handle it.** Concurrent-edit protection, partial-index recovery, and rate limiting were all verified by actually stopping a service mid-operation, firing genuinely simultaneous requests, and reading real HTTP status codes and response bodies — never by confirming the relevant function exists.

5. **Grep for the exact thing you're worried about, and report the literal count.** "Zero results for `llava`" is treated as a materially stronger claim than "I reviewed the vision code and it looks fine" — this is the explicit, stated standard this project's own checklists ask for.

6. **When a suspicion is raised, check it before acting on it, and report the outcome either way.** A suspicion that `KEYCLOAK_REALM` might actually be `nexus-realm` (matching a real naming pattern found elsewhere in the project) was checked directly and found to be a plausible-but-wrong inference (`DEC-043`) — recorded as a resolved false lead, not silently dropped.

This discipline exists partly because there is no second reviewer on this project — it is built and maintained solo, with the explicit acknowledgment in the project's own instructions that "no other developer will review this code — be the second pair of eyes yourself before calling anything done." The verification habits above function as a substitute for that missing second reviewer.

---

## 6. Every significant bug found this way, in full

This section is comprehensive, not curated — every defect judged severe enough to get its own `DEC-XXX` entry, in roughly chronological order of discovery.

**`select_model_tier()`'s signature was wrong in the amendment spec (`DEC-040`).** Written as `(classification, mode, has_diagnostic_object)` while the real function is `(enriched_query, retrieval_result, has_diagnostic_object)`. Would have raised an immediate `TypeError` at the real call site. Found only once the complete real file was read, not a partial excerpt.

**Missing `depends_on` removal would have hung the entire stack at startup, forever (`DEC-040`).** Gating the three Ollama containers behind a `local-inference` profile was specified without also removing four `depends_on: condition: service_healthy` entries FastAPI and ARQ had on those same containers. Under the live default `INFERENCE_MODE=external`, this would leave two core services waiting indefinitely for a health check from containers that never start — judged, at the time, the single most severe defect found across the entire verification process, since it would have prevented the stack from starting at all. Caught and fixed before any session applied it.

**`vision_task.py` and `ollama_vision.py` are genuinely independent implementations, not one calling the other (`DEC-038`, corrected by `DEC-040`).** An earlier conclusion (based on spec text, never verified against real files) assumed `vision_task.py` called into `ollama_vision.py` and therefore needed no separate retrofit. Reading both real files showed they are two parallel implementations from different points in the project's history, using different Ollama endpoints (`/api/chat` vs `/api/generate`) with different prompt strategies, never consolidated. Each needed its own separate fix.

**`DEC-040`'s own claim that the `vision_task.py` fix had been written was never true (`DEC-048`, `DEC-049`).** A later session tried to verify the fix and found `vision_task.py` still making a raw, unbranched Ollama call under the live default config — the already-shipped employee chat screenshot feature was genuinely broken. Root-caused by exhaustively checking for a stale-local-copy explanation first (checked a separate D: drive clone and a Windows Downloads-folder copy — neither had the fix either) before concluding the fix had simply never been written, only described as done. Real `INFERENCE_MODE`-aware retrofit written and applied for the first time in `DEC-049`; verified live with a real `401` from Cerebras (not a connection failure).

**`/health` had never once reported fully healthy since the original build (`DEC-044`).** Two distinct causes, both found by refusing to accept "expected until ingestion is built" as a full explanation: (1) `scripts/init_qdrant.py` had simply never been run against this particular Docker volume — a runtime gap, not a code bug. (2) A genuine, years-old code bug: the data contract specifies every service reports `"healthy"`/`"unhealthy"`, but OpenSearch's client passed through the cluster's own native `green`/`yellow`/`red` vocabulary verbatim, which the health aggregator never recognized as healthy — and a single-node cluster (this deployment) can structurally never reach `green`, since that requires a second node for replica shards. This had been silently broken since the file was first written; issue (1) had simply always failed first and masked it.

**Grafana had never loaded a single dashboard, since Session 03 (`DEC-046`).** Provisioning files sat directly in `provisioning/` instead of the `dashboards/`/`datasources/` subdirectories Grafana 11.3.1 actually requires. The container reported healthy regardless of this — the only trace was one line in Grafana's own container log that nothing was watching. Caught by querying the live Grafana API directly (`/api/datasources` returning `[]`) rather than confirming the dashboard JSON file existed on disk.

**`audit_log` had `INSERT` only, never `SELECT`, since the original migration (`DEC-046`).** The "append-only" rule was implemented as "no read either," which the rule never actually required — append-only describes write behavior, not readability. Broke the real admin audit-trail endpoint with a live `500` on first test. Fixed with a scoped `GRANT SELECT` migration; confirmed afterward that `UPDATE`/`DELETE` remain `false` — the append-only guarantee was never weakened.

**`KEYCLOAK_CLIENT_ID` had been wrong since the very first scaffold commit (`DEC-046`).** No Keycloak client named `aegis-backend` has ever existed; real users authenticate through `aegis-chat`. Session 10's own original verification never had a chance to catch this — it only ever decoded and printed a token's `sub`/`roles`/TTL, never checked `aud`/`azp` against the configured client ID. Surfaced only when a live WebSocket test decoded a real token and got a rejection ("Token not issued for this client"). Fixed in the real secrets file; the same stale value in `.env.example` is tracked separately as `OPEN-10`, since that file is what any fresh clone copies from.

**PgBouncer's pool was completely bypassed; every pooled query silently ran as Postgres superuser (`DEC-051`).** `POSTGRES_HOST`/`POSTGRES_PORT` pointed directly at the primary Postgres container, not the pooler. Before simply flipping the environment variable, this was investigated directly: connecting through the pooler with a real dynamic credential and running `SELECT current_user` returned `postgres`, not the credential actually presented. Root cause: PgBouncer's `auth_type=any` only governs client-facing authentication — it always connects to its real backend using its own fixed identity, which had been left as the raw superuser role. Fixed with a new, dedicated least-privilege role (`aegis_pooled_role`) as PgBouncer's backend identity — a deliberate trade-off that loses Vault's per-request dynamic-credential rotation in exchange for genuine connection pooling, leaving `vault_client.py` as now-unused code (`OPEN-14`). A second, previously-latent bug surfaced by this same fix: asyncpg's default prepared-statement cache is incompatible with PgBouncer's transaction pool mode, fixed with `statement_cache_size=0` added to all 16 asyncpg call sites in the codebase.

**Two silent concurrent-edit bugs in already-shipped Quick Entry code (`DEC-056`).** (1) Simultaneous *draft* edits produced two `200`s with zero conflict signal — confirmed live, silent last-write-wins, because drafts never increment `version`, so the optimistic lock structurally cannot see draft-to-draft collisions. True since Session 25. Fixed with a second, `updated_at`-based lock specific to the draft path. (2) Simultaneous *publish* updates raised an unhandled `500` instead of the documented `409` — the database's unique constraint correctly prevented actual data corruption, the wrong status code just surfaced. Both fixed and re-verified with real concurrent `curl` requests, not assumed from the fix.

**CRITICAL — Quick Entry content was never retrievable by any employee query since Session 26 (`DEC-057`, found 2026-07-18).** The reciprocal-rank-fusion stage in `retrieval_engine.py` silently drops any chunk whose vector payload lacks a `chunk_id` key (`if not chunk_id: continue`). Every Quick Entry chunk, since the processing pipeline was first built, never had one. Every Quick Entry knowledge entry — correctly chunked, correctly indexed into both Qdrant and OpenSearch, correctly marked `active` — was structurally invisible to the retrieval pipeline the entire time. Found empirically, by directly inspecting a live chunk's actual payload keys during this session's final verification pass, not by reading the indexing code, which read as correct in isolation. Fixed by adding the missing key in both the primary indexing task and the retry-on-partial-failure task.

**`is_current` was written correctly on every Quick Entry version bump but enforced by no retrieval stage at all (`DEC-057`).** Editing an entry correctly marked its prior chunk version as retired (`is_current=False`) in both Qdrant and OpenSearch payloads — but neither the dense vector search, the identity vector search, nor the BM25 keyword search ever actually filtered on that flag, confirmed by grep returning zero results for `is_current` anywhere in the retrieval query construction. Practical effect: every past version of every edited Quick Entry remained permanently retrievable, and could outrank the current version, since RRF independently scores stale duplicates. Fixed with a deliberately **exclude-only** filter (`is_current != False`), not a blanket require-filter — a require-filter would have matched Qdrant/OpenSearch's actual "a missing field never matches" semantics and silently zeroed out any hypothetical document-pipeline content that has never set the field at all, since both content types share the same collections.

**The bulk-import parser (Session 29) was built against a fictional document structure (`DEC-057`).** Live `.docx` upload testing found the parser's field-detection logic keyed on labels (`CAUSE_DESCRIPTION`, `ISSUE_DESCRIPTION`) that do not exist anywhere in the real, frozen source-of-truth template — confirmed by reading `AEGIS_DOCUMENT_TEMPLATES.md` directly rather than trusting the parser's own spec pseudocode a second time. Compounding bugs found and fixed along the way: label matching without line-start anchoring or case sensitivity caused a label to match as a substring of a longer label, then — even after a first partial fix — to match the same word appearing inside another field's own prose value. Rewritten against the real, per-cause-prefixed field structure. 14 new tests added, including regression tests for both matching bugs specifically.

**A malformed JSON request body produced an unhandled `500` on any endpoint, not the documented `400` (`DEC-057`).** Systemic gap across the whole API, not endpoint-specific — fixed with one global exception handler.

**OpenSearch's Quick Entry chunk document never indexed `screenshot_ids`, only `has_screenshots` (`DEC-057`).** Inconsistent with the retry-on-partial-failure task's equivalent write, which already included it correctly. Since chunk metadata is hydrated from whichever search result list a chunk first appears in (dense results checked before keyword results), this specifically affected chunks ranked via keyword search alone — a real indexing inconsistency between two write paths for the same data, regardless of how often it triggered in practice.

**IMPL_28 Section 5 (screenshot surfacing in the answer-attribution pipeline) had never been implemented in any session (`DEC-057`).** Confirmed by grep — zero resu
