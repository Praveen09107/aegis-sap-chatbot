# AEGIS — Project Status Report
## Successor to `PROJECT_STATUS_REPORT_2026-07-18.md` — what changed, what real inference proved, what's next before the frontend

### Compiled 2026-07-19, from primary sources only

---

## How this document was produced

Every claim below is sourced from one of three places, checked live rather than recalled:

1. `git log --oneline --all` (79 commits, full history read)
2. `specs/tier3_verification/DECISIONS_LOG.md`, read in full including the new `DEC-058` and `DEC-059` entries added this session
3. Live checks run in this session: `pytest tests/unit/ backend/tests/unit/` (325 tests), `docker compose config --quiet`, `docker compose ps` (17 services healthy), real HTTP/WebSocket calls against the running stack with real (non-mocked) provider API keys, real Postgres/Qdrant/OpenSearch/MinIO row and object counts before and after cleanup

This document does not repeat everything in the 2026-07-18 report that is still true and unchanged — §1–5 of that report (what AEGIS is, scope decisions, data-layer facts, session-by-session build history through `IMPL_29`) remain accurate and are not re-derived here. This report focuses on what changed since then: the N-tier inference orchestration build (`DEC-058`), and this session's real-key, real end-to-end verification pass (`DEC-059`) — the first time in this project's entire history that a real LLM call has ever succeeded.

---

## 1. Executive summary

Two things happened since the 2026-07-18 report, in this order:

1. **A full N-tier, multi-provider inference orchestration system was built** (`DEC-058`) — a declarative chain registry, two new provider adapters (Cloudflare, Gemini), an atomic Redis-backed quota tracker, and a bounded-fallback routing engine (`walk_chain()`), replacing the original two-provider (Cerebras/Groq) design with 4 tiers for main reasoning and judge, 5 tiers for vision.

2. **With the developer's explicit, one-time authorization, real (pre-rotation) API keys were used to run the first genuinely live end-to-end pass through the entire backend** — real retrieval, real CRAG/judge assessment, real generation through `walk_chain()`, real validation, real vision extraction, real WebSocket delivery to a client. This is `DEC-059`.

That second pass found and fixed the single most severe bug ever found in this project: **the mechanism that streams a generated answer to an employee's browser had never actually worked**, since the feature was originally built, for a structural reason (not a config or key issue) that could only ever surface once real inference finally ran far enough to reach it. It also proved the new N-tier failover design works against a real, deliberately-broken provider — not just a mocked one — and closed two previously-open configuration gaps (`OPEN-13`, `OPEN-15`).

**Bottom line: the backend is now proven to work end-to-end against real inference, for the first time.** The main blocker to frontend work was never really "does the backend have bugs" — it was "has anyone ever seen it actually answer a real question." That question is now answered yes, with one critical bug found and fixed in the process, exactly the outcome this kind of test exists to produce.

---

## 2. What was built: N-tier inference orchestration (`DEC-058`)

Full design detail lives in `INFERENCE_ORCHESTRATION_ARCHITECTURE_PLAN.md` and `DEC-058`; summarized here for context.

| Tier role | Chain (primary → fallbacks) |
|---|---|
| Main reasoning | Groq → Cloudflare → Cerebras → SambaNova (4 tiers) |
| Judge / CRAG | Groq (fast) → Groq (large) → Cloudflare → SambaNova (4 tiers) |
| Vision | Groq → Cloudflare (Llama 4 Scout) → Cloudflare (Gemma) → Cerebras → Gemini (5 tiers) |

Key mechanics: `walk_chain()` in `model_gateway.py` attempts each tier in order, respects per-provider circuit breakers and Redis-backed sliding-window/ceiling quota tracking (atomic via Lua `EVAL`, closing a real TOCTOU race a naive check-then-act port would have had), and for the streaming main-reasoning path uses a bounded pre-first-byte fallback (if a tier fails before it emits its first token, fall to the next tier; once streaming has started, that tier is committed to). A new `GET /api/admin/inference-health` endpoint and a new ARQ cron task (`check_inference_provider_health`) report chain/circuit state.

**A real, live bug was found and fixed while building this, independent of the orchestration work itself:** `config.py`'s `GROQ_MODEL_VISION` still referenced a model (`meta-llama/llama-4-scout-17b-16e-instruct`) that no longer exists on Groq's live catalog, confirmed via a real `GET /v1/models` call — meaning the *already-shipped* vision cascade had been silently 404ing on its primary provider before this session touched anything. Fixed to the actual current primary (`qwen/qwen3.6-27b`); Llama 4 Scout is still used, just moved to a Cloudflare chain slot.

**Known, disclosed, out-of-scope limitation carried forward unchanged:** circuit-breaker state is per-process, in-memory only. `uvicorn` runs 2 worker processes (`UVICORN_WORKERS=2`), each with its own `circuit_registry` singleton, so a single admin-endpoint request reflects whichever worker happened to handle it. This was already true of every circuit this codebase has ever tracked (Qdrant, OpenSearch, the original Cerebras/Groq pair) — not a new defect, and making circuit state cross-process (e.g., Redis-backed) was never in scope.

321 unit tests passed after this build (all against mocked responses built from real, live-captured shapes — no automated test makes a live external call, per the plan's own testing constraint). The plan's own "Definition of Done" whole-system acceptance test — deliberately invalidate one tier's key, confirm real fallback — explicitly required real keys and was deferred to a later, developer-authorized pass. That pass is §3 below.

---

## 3. What was verified: the first real end-to-end pass (`DEC-059`)

The developer explicitly authorized using the current (unrotated) real provider API keys for this development/testing pass only, with a standing instruction to rotate them before actual production deployment — see the reminder in §7. This unblocked `OPEN-13`, open since Session 23, which had made every external inference call in this project's history fail with a real `401`.

### 3.1 The critical bug: the streamed answer never actually reached a browser

`reasoning_service.generate_and_stream()` has always published every generation token to a Redis Pub/Sub channel (`stream:{session_id}`) via `redis_session.publish_token`/`publish_stream_complete`. A full-codebase search confirmed **nothing, anywhere, in this codebase's entire history, ever subscribed to that channel.** The WebSocket handler awaited the function's return value and otherwise did nothing with the channel it was publishing to.

**Practical effect: no real employee has ever seen a streamed answer arrive in their browser**, regardless of how good the generated answer was — not a quality bug, a complete silent no-op on the one feature (real-time token streaming) the WebSocket architecture exists to provide. This was undiscoverable before now: `OPEN-13` blocked every real generation call since Session 23, so this code path never ran far enough, against a real model, for the gap to be observable.

**Fixed** by adding `_relay_pubsub_stream_to_websocket()` to `backend/app/handlers/chat_handler.py`, run as a concurrent `asyncio.create_task()` started *before* generation begins (not after — generation can start publishing tokens before a late subscribe would be in place to catch them), with a bounded 5-second safety net (`asyncio.wait_for`) in case the channel's own `stream_complete` signal is itself lost to a Redis blip mid-generation.

**Verified live:** a real WebSocket test client, authenticated with a real employee JWT, sent a real question and received real tokens streaming in from the actual model in real time, assembling into a complete, correct answer.

**A related gap, found and fixed in the same pass:** the final `validation_result` message sent to the client never included the answer text at all — an employee would see a validation score, confidence badge, and attribution panel, but never the actual answer. Fixed by adding `"answer_text": validation_result.answer_text` to that message. This also matters because `validation_engine.validate_with_regeneration()` can produce a genuinely different final answer via a direct, non-Pub/Sub-publishing call when the first attempt scores below amber — without this field, a client would never see that regenerated answer reflected anywhere.

**4 new regression tests** were added (`backend/tests/unit/test_chat_handler_streaming.py`), covering the relay's happy path, a mid-stream client disconnect, resilience to a malformed Pub/Sub message, and guaranteed unsubscribe-on-error — fully mocked, no real server, written specifically to catch any regression back to the silent-no-op state this fix corrects.

### 3.2 Everything else proven live for the first time

| Capability | Result |
|---|---|
| Real answerable question → real retrieval → real CRAG `SUFFICIENT` → real generated answer, streamed correctly | **Confirmed live**, full round trip, correct answer |
| Real unanswerable question → real CRAG `INSUFFICIENT` → ticket-escalation ARQ task queued → correct client-facing error message | **Confirmed live.** `ticket_id: None` in the immediate response is correct by design — ticket creation is fire-and-forget via ARQ, not synchronous |
| N-tier failover under a real, deliberately-broken primary provider | **Confirmed live** — broke the primary vision provider, container logs show `walk_chain()` detecting the failure and cascading to a completely different wire-format adapter (Cloudflare), output quality identical to the primary |
| Vision extraction quality on a real SAP screenshot | **Confirmed live**, flawless structured-field extraction |
| Admin endpoints against real backing services (`pipeline-health`, `knowledge-entries` list, `suggest-doc-id`, `validate-reference`, `check-duplicate`) | **Confirmed live** — `check-duplicate` specifically exercises a real BGE embedding call and a real Qdrant search, not mocks |

### 3.3 Two configuration gaps closed

- **`OPEN-15` resolved.** `secrets-share/.env`'s `KEYCLOAK_CLIENT_SECRET` still held the placeholder `REPLACE_client_secret`. Confirmed `backend/app/config.py` never actually reads this variable — the FastAPI backend only verifies JWT signatures against Keycloak's JWKS, never performs a client-secret grant itself — so this was latent, not a live backend bug, but it would have broken the not-yet-built frontend's own login flow (`frontend/src/app/api/auth/login/route.ts` depends on this exact variable for its ROPC exchange) the moment that frontend existed. Corrected `.env` to Keycloak's real configured value (`aegis_chat_client_secret_dev`, confirmed via a real token request), rather than rotating Keycloak, since nothing else in the stack references the old placeholder. This fix is local-only — `secrets-share/` is gitignored and does not appear in any commit.

- **A genuine operational finding, not a code defect:** `docker compose restart` does not pick up `.env` changes — it reuses a container's already-resolved environment. Only `docker compose up -d` (after a config edit) re-resolves `env_file` contents on container recreation. Discovered mid-failover-test when a deliberately-broken key kept succeeding against a `restart`ed container; corrected by using `up -d` and confirming via `docker exec ... env` that the change had actually taken effect before re-testing. Worth remembering for any future test that deliberately mutates `.env`.

### 3.4 Test artifacts created and fully cleaned up

A real Quick Entry (`SD-ERR-REALTEST-01`) with 2 real screenshots was created via the actual admin API — a pragmatic way to seed retrievable content into an otherwise-empty corpus for realistic testing. All of it was removed after verification and confirmed removed, not assumed:

- Postgres: `knowledge_form_entries`, `knowledge_form_screenshots`, `knowledge_form_entry_chunks`, `knowledge_form_entry_versions` all confirmed at row count **0** for this entry via a direct `SELECT count(*)`
- Qdrant points and OpenSearch documents for both chunks: deleted
- MinIO: both screenshot objects removed, confirmed via a real object listing on the bucket showing **0** remaining objects
- All host-side and container-side temporary test files removed

---

## 4. Current state, verified live (2026-07-19)

| Check | Result |
|---|---|
| Full unit test suite (`tests/unit/` + `backend/tests/unit/`) | **325 / 325 passing** (321 pre-existing + 4 new streaming-relay regression tests) |
| `docker compose config --quiet` | valid (silent exit) |
| Live container health, all 17 default-profile services | all healthy |
| Real end-to-end chat flow (retrieval → generation → streaming → validation) | **confirmed working live**, first time ever |
| Real CRAG `SUFFICIENT` and `INSUFFICIENT` paths | **both confirmed live** |
| Real N-tier provider failover | **confirmed live** against a real broken provider |
| Real vision extraction | **confirmed live**, flawless on the test image |
| Quick Entry backend (IMPL_23–29) | complete, unchanged since 2026-07-18, re-exercised this session via real API-created test data |
| Admin endpoint sweep (pipeline-health, knowledge-entries, suggest-doc-id, validate-reference, check-duplicate, inference-health) | **all confirmed live** against real backing services |
| Frontend UI (`.tsx` pages/components) | **still 0 of 19 sessions actually built** — unchanged since 2026-07-18, see that report's §7.1 for the full finding (`OPEN-11`) |

---

## 5. Full open items register (delta from 2026-07-18)

| ID | Status | What it was / is |
|---|---|---|
| `OPEN-13` | **RESOLVED this session** | Placeholder Cerebras/Groq keys returning hard `401`s. Real (pre-rotation) keys now confirmed working across all 5 providers, all 3 roles (main/judge/vision), live. |
| `OPEN-15` | **RESOLVED this session** | Stale `KEYCLOAK_CLIENT_SECRET` placeholder in `.env`. Corrected to Keycloak's real configured value. |
| `OPEN-11` | **Still open** | `FRONTEND_AGENT_SESSION_GUIDE_v2.md`'s retrofit-status table is false for 18 of 19 sessions. Blocks starting any frontend session (F01–F18) safely until re-audited. Unchanged since 2026-07-18 — this session did not touch the frontend guide. |
| `OPEN-14` | **Still open** | `vault_client.py` is dead code after `DEC-051`'s PgBouncer fix. Disposal decision (delete vs. keep for a future non-pooled use case) not made. Purely a cleanup decision, nothing functional depends on it. |
| `OPEN-05` | **Still open** | Real inference benchmark numbers (latency/throughput) never captured. Now unblocked by `OPEN-13`'s resolution — this is newly actionable, see §6. |
| `OPEN-08` | **Still open** | `AEGIS_DATA_CONTRACTS.md`'s documented `"correction"` WebSocket message type is never actually sent by `IMPL_17`. Needs a decision: build it, or correct the contract. |
| `OPEN-10` | **Still open** | `.env.example` still has a stale `KEYCLOAK_CLIENT_ID` value already corrected in the real `.env`. Worth fixing alongside any broader `.env.example` audit. |
| `OPEN-06` | **Still open** | SambaNova's exact free-tier numeric rate limits were never confirmed. Low priority — SambaNova is already wired in as a fallback tier in the new orchestration system with a conservative pre-registered circuit-breaker override, so this doesn't block anything currently working. |

**New this session:** no new open items were created. Both configuration gaps found (`OPEN-13`, `OPEN-15`) were fully resolved, not deferred.

---

## 6. Production-grade optimal next steps before frontend implementation

This is the direct answer to "what should happen before the frontend starts," given everything now proven and everything still open.

### 6.1 Do first — cheap, high-leverage, no frontend dependency

1. **Rotate all 5 provider API keys, then re-run the real end-to-end pass once against the rotated keys before considering the backend deployment-ready.** See the explicit reminder in §7 — this is not optional and was an explicit condition of using the current keys for this session's testing. A rotated-key re-run is the cheapest possible confirmation that rotation itself didn't silently break anything (wrong key format pasted, wrong provider account, etc.) — a five-minute check against a real risk.

2. **Run the real inference benchmark script (`aegis_inference_benchmark.py`) now that `OPEN-05` is actually unblocked.** This was deferred specifically because it needed real keys; it now has them (until rotation, at least — worth running once more after rotation too, since throughput can differ across API keys/accounts on some providers' free tiers). Real latency numbers are the only piece of information needed to set realistic frontend loading-state expectations (streaming-token cadence, timeout thresholds) — guessing at this before the frontend exists risks building UI around wrong assumptions.

3. **Re-audit `FRONTEND_AGENT_SESSION_GUIDE_v2.md` session-by-session (`OPEN-11`), the same way `BACKEND_AGENT_SESSION_GUIDE_v4.md` already was.** This is the single largest remaining risk to starting frontend work efficiently: the guide currently claims 18 of 19 sessions are "already built" when the real source tree has 6 files, none of them UI. Starting F01 against the guide as currently written risks the same near-miss that already happened once in Session 21 (almost updating admin-shell files that don't exist) — at much larger scale, across 19 sessions instead of 2 files. This is pure spec-correction work, no code risk, and unblocks everything after it.

### 6.2 Do soon — cheap, but not strictly blocking

4. **Decide and act on `OPEN-14`** (delete `vault_client.py`, or keep it and document the future use case it's being kept for). Five minutes either way; currently it's just dead code sitting in the tree with no owner decision.

5. **Fix `OPEN-10`** (`.env.example`'s stale `KEYCLOAK_CLIENT_ID`) while already touching Keycloak-related config this session — cheap, and prevents a fresh clone from reproducing a bug already fixed once in the real `.env`.

### 6.3 Explicitly not urgent

6. **`OPEN-08`** (the undocumented-vs-unimplemented `"correction"` WebSocket message type) and **`OPEN-06`** (SambaNova's exact rate limits) are both genuinely low-stakes — neither blocks anything currently working, and both can be picked up opportunistically whenever the relevant file is already open for another reason.

### 6.4 Why this order

The single biggest risk to frontend work was never "does the backend have undiscovered bugs" — every session has been independently re-verified live, repeatedly, and this session's own critical Pub/Sub find is proof that discipline works. The real risk was **building 19 frontend sessions against a spec document that already lies about what exists**, exactly the failure mode `DEC-047` caught once by luck in Session 21. Fixing that spec document is now the highest-leverage remaining action before any frontend code gets written — higher leverage than any further backend hardening, because the backend has now been proven to work end-to-end against real inference, which was the other major open question.

---

## 7. Standing reminder: rotate all 5 API keys before production deployment

**This is an explicit, standing instruction, not a suggestion.** The developer authorized using the current (unrotated) Groq, Cerebras, SambaNova, Cloudflare, and Gemini API keys specifically and only for this session's development/testing purposes, on the explicit condition that they be rotated to fresh values before the system is actually deployed. This has **not** been done as part of this session's work — it is being surfaced here so it isn't forgotten between now and deployment.

**Action required before production deployment, not before continuing development:**
1. Generate new API keys on each of the 5 provider dashboards (Groq, Cerebras, SambaNova, Cloudflare, Gemini).
2. Replace the corresponding values in `secrets-share/.env`.
3. `docker compose up -d aegis-fastapi aegis-arq` (not `restart` — see §3.3, `restart` will not pick up the change).
4. Re-run at least the real end-to-end chat test (§3.2) once against the rotated keys to confirm nothing broke in the swap.

---

*Sources: `git log --all` (79 commits) · `specs/tier3_verification/DECISIONS_LOG.md` (`DEC-001` through `DEC-059`) · live `pytest` (325 tests), `docker compose config`, `docker compose ps`, and real authenticated HTTP/WebSocket calls against the running stack, performed 2026-07-19 · predecessor report `PROJECT_STATUS_REPORT_2026-07-18.md` for all unchanged architecture/history detail.*
