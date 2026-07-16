# BACKEND AGENT SESSION GUIDE v4.0
## Operating Instructions for the Implementation Agent — AEGIS Backend
## Extends v3.0 (Sessions 01-22) — Adds Quick Entry (Sessions 23-29) and Four Cross-Cutting Amendments
## This document replaces v3.0 entirely — do not use v3.0 alongside this version

---

## WHAT CHANGED FROM v3.0 — READ THIS FIRST

v3.0 covered Sessions 01-22 only, built entirely around self-hosted Ollama inference and Sona Comstar as the sole deployment target. Since v3.0 was written:

1. **Four cross-cutting amendment documents** now exist in `specs/tier1_amendments/`, each attached alongside specific sessions below: `AMENDMENT_OBJECT_STORAGE_MINIO.md`, `AMENDMENT_INFERENCE_ARCHITECTURE.md`, `AMENDMENT_GENERALIZATION_BACKEND.md`, `AMENDMENT_GENERALIZATION_FRONTEND.md` (the last is consumed by the frontend guide, not this one).
2. **Sessions 23-29 (Quick Entry)** are added — these did not exist when v3.0 was written.
3. **Two of the twenty-nine sessions are already fully implemented as of this guide's writing** (Sessions 01 through approximately 16, partially) — several session entries below are therefore marked **RETROFIT** (apply the referenced amendment to already-existing code) rather than **FRESH BUILD** (apply it while writing the session for the first time). Check the RETROFIT STATUS table below before starting any session.
4. **`DECISIONS_LOG.md`** (in `specs/tier3_verification/`) is the authoritative record of *why* every change in this v4.0 guide exists, with full alternatives-considered reasoning. **`tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md`** is the lookup table for reconciling any discrepancy you notice between an original session document and what this guide says — check it before assuming either source is wrong.

---

## CRITICAL READING BEFORE STARTING

The specification set now contains 29 backend implementation sessions. Sessions 01-20 build the original system. **Session 21 applies critical bug fixes** — it MUST be run after Session 20 before any testing. Sessions 23-29 add Quick Entry and may be run any time after Session 22, in order.

The old patch documents (`IMPL_PATCH_01`, `IMPL_PATCH_02`, `IMPL_PATCH_03`) are SUPERSEDED by `IMPL_21` — confirmed directly in `IMPL_21`'s own text. Ignore the patch documents.

**This project no longer self-hosts any inference model.** All three model roles (main reasoning, judge/CRAG, vision) route to Cerebras and Groq by default (`INFERENCE_MODE=external`). A local/Ollama path remains available (`INFERENCE_MODE=local`) for future air-gapped client deployments, but is not the default and its Docker services do not start unless explicitly requested. See `AMENDMENT_INFERENCE_ARCHITECTURE.md` for the complete design.

**This project is no longer built for Sona Comstar specifically.** Company name, industry, and SAP module set are configuration, not hardcoded values. See `AMENDMENT_GENERALIZATION_BACKEND.md`.

**MinIO is a real, required 20th service**, used for durable document and screenshot storage. See `AMENDMENT_OBJECT_STORAGE_MINIO.md`.

---

## RETROFIT STATUS — WHICH SESSIONS ARE ALREADY BUILT

Check this table before starting any session below. **RETROFIT** means the session's original output already exists in the codebase and an amendment modifies existing files. **FRESH BUILD** means the session has not been implemented yet and the amendment's guidance is applied as the session is written for the first time.

| Session | Status | Amendments touching it |
|---|---|---|
| 01-09 | Already built | None |
| 10 | Already built | RETROFIT: `AMENDMENT_GENERALIZATION_BACKEND.md` (FILE 6) |
| 11 | Already built | None — corrected; see Session 13 |
| 12-13 | Already built | Session 13: RETROFIT: `AMENDMENT_INFERENCE_ARCHITECTURE.md` (FILE 4, `clients/ollama_vision.py` — corrected target, was mistakenly Session 11/`vision_task.py` in an earlier version of this guide) |
| 14-15 | Already built | RETROFIT: `AMENDMENT_INFERENCE_ARCHITECTURE.md` (FILE 7, retrieval_engine.py CRAG) — **⚠ apply Session 16's FILE 3 first.** FILE 7's retrofit calls `model_gateway.call_judge(crag_prompt, max_tokens=..., temperature=...)` — the *new* signature. The original `call_judge(self, prompt: str)` accepts no such arguments; applying FILE 7 before FILE 3 raises `TypeError` immediately. This is a real, load-bearing ordering dependency, not a suggestion. |
| 16 | Already built (verify — see diagnostic in Session 16 below) | RETROFIT: `AMENDMENT_INFERENCE_ARCHITECTURE.md` (FILE 3), `AMENDMENT_GENERALIZATION_BACKEND.md` (FILE 3/4) |
| 17 | Not yet built | None required — but note `run_judge_evaluation()` calls `model_gateway.call_judge()` directly and inherits Cerebras/Groq routing automatically once Session 16 is complete |
| 18 | Not yet built | FRESH BUILD: `AMENDMENT_GENERALIZATION_BACKEND.md` (FILE 1/2/7), `AMENDMENT_OBJECT_STORAGE_MINIO.md` (FILE 4/5) |
| 19-20 | Superseded (frontend portions) — see original supersession note; observability folded into 21 | — |
| 21 | Not yet built | FRESH BUILD: `AMENDMENT_OBJECT_STORAGE_MINIO.md` (FILE 6, FILE 8) |
| 22 | Not yet built | None |
| 23-27, 29 | Not yet built | None beyond the one instruction fix in 24 |
| 24 | Not yet built | FRESH BUILD: `AMENDMENT_GENERALIZATION_BACKEND.md` (FILE 8) |
| 28 | Not yet built | FRESH BUILD: `AMENDMENT_OBJECT_STORAGE_MINIO.md` (FILE 9 correction), `AMENDMENT_INFERENCE_ARCHITECTURE.md` (FILE 8) |

**Before Session 16 specifically, run the diagnostic in `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s AGENT INSTRUCTIONS** to confirm whether `model_gateway.py` is fully built as originally specified — this determines whether Session 16 is a verification-only pass or requires completing missing pieces before the FILE 3 replacement applies cleanly.

---

## DOCUMENT SUPERSESSION TABLE

| Original Document | Section Superseded | Superseded By |
|---|---|---|
| IMPL_03 (Docker) | nginx.conf location /, docker-compose.yml (missing frontend service) | IMPL_21 |
| IMPL_10 (Config) | config.py (12 missing constants, not 9 — see IMPL_21 directly for the exact list) | IMPL_21 |
| IMPL_11 (Orchestration) | arq_worker.py (task signatures), chat_handler.py (rpush calls) | IMPL_21 |
| IMPL_19 (Frontend) | Entire frontend deliverable | FRONTEND_01-40 (see frontend guide) |
| IMPL_20 (Admin) | Frontend deliverable → FRONTEND_01-40; main.py/admin_handler.py → IMPL_21; **observability.py + Grafana dashboard (FILE 7/FILE 8) → also folded into IMPL_21 ("Part C"), since this backend-only piece has no other home once IMPL_20's frontend is skipped** | FRONTEND_01-40 + IMPL_21 |
| **IMPL_10 (Keycloak seed emails)** | **test user email domain** | **AMENDMENT_GENERALIZATION_BACKEND.md FILE 6** |
| **IMPL_11 (vision_task.py)** | **direct Ollama vision call** | **AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 4** |
| **IMPL_15 (retrieval_engine.py)** | **direct Ollama CRAG call** | **AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 7** |
| **IMPL_16 (model_gateway.py, reasoning_service.py)** | **entire Ollama-only routing design; SYSTEM_ROLE company binding** | **AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 3; AMENDMENT_GENERALIZATION_BACKEND.md FILE 3/4** |
| **IMPL_18 (not yet built)** | **ALLOWED_MODULES/DOCUMENT_ID_PATTERN hardcoding; CURRENT_VALUES_AT_SONA_COMSTAR field name; no persistent document storage** | **AMENDMENT_GENERALIZATION_BACKEND.md FILE 1/2/7; AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 4/5** |
| **IMPL_21 (not yet built)** | **"15 confirmed bugs" (actual count is 13); no MinIO health check or admin download endpoint** | **This guide corrects the count; AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 6/8** |
| **IMPL_24 (not yet built)** | **"real Sona Comstar SAP examples" instruction** | **AMENDMENT_GENERALIZATION_BACKEND.md FILE 8** |
| **IMPL_28 (not yet built)** | **VISION_SERVICE_URL/VISION_MODEL="llava:13b" hardcoding; local SCREENSHOT_MINIO_BUCKET constant** | **AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 8; AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 9 correction** |

**Rule:** When a later document (IMPL_21, or any amendment) shows a complete file and an earlier document also shows that file, use the later document's version. When an amendment's `FIND/REPLACE` block targets a file, apply it against whatever the file's current content actually is — verify with the diagnostic commands shown in each amendment before assuming the `FIND` block matches exactly.

---

## BEFORE STARTING ANY SESSION

**Required in every session context (4 documents always):**
1. `specs/tier1_foundation/AEGIS_MASTER_REFERENCE.md`
2. `specs/tier1_foundation/AEGIS_DATA_CONTRACTS.md`
3. `specs/tier1_foundation/AEGIS_CONFIGURATION_CONSTANTS.md`
4. The session-specific IMPL document

**Additionally attach whichever amendment documents the RETROFIT STATUS table above lists for that session.** Do not attach an amendment to a session it does not affect — this keeps each session's context focused, consistent with why amendments are organized by concern rather than duplicated per file.

---

## SESSION START PROMPTS

### SESSION 01 — Dependencies
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_01_DEPENDENCIES
```
Read all four attached documents completely. Create every file listed in IMPL_01_DEPENDENCIES.md with exactly the content shown. Use exact version numbers. Run all verification steps and report results.
```
*(Already built. No amendment applies.)*

### SESSION 02 — Environment Setup
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_02_ENVIRONMENT_SETUP
```
Read all four attached documents. Execute every step in IMPL_02 in order. Create all files. Run all verification steps and report each result.
```
*(Already built. `AMENDMENT_GENERALIZATION_BACKEND.md` FILE 5 covers regenerating the TLS certificate with a generic subject line — apply as a follow-up operational step, not a re-run of this whole session.)*

### SESSION 03 — Docker Infrastructure
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_03_DOCKER_INFRASTRUCTURE
```
Read all four attached documents. Create docker-compose.yml and all infrastructure files as specified. Critical: Redis Instance 1 maxmemory=6gb allkeys-lru no persistence; Redis Instance 2 maxmemory=1gb noeviction AOF; OpenSearch OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g; all three Ollama instances OLLAMA_KEEP_ALIVE=-1; Keycloak uses PostgreSQL not H2. NOTE: Session 21 will later add the frontend Docker service and the aegis-minio service — do not add either now. NOTE: Session 21 will also mark the three Ollama services as an opt-in Compose profile (INFERENCE_MODE=external is the default and does not start them) — build them as originally specified here; the profile gating is applied later. Run all verification steps.
```
*(Already built. No immediate action — the MinIO and profile-gating additions land in Session 21.)*

### SESSION 04 — AI Models Setup
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_04_MODELS_SETUP
```
Read all four documents. Create scripts/setup_models.py. IMPORTANT: under INFERENCE_MODE=external (the default per AMENDMENT_INFERENCE_ARCHITECTURE.md), the Ollama model download steps in this session are NOT executed — no local model is needed. Run only the BGE and DeBERTa setup portions of this script. Skip the qwen2.5:32b/7b/vl:7b pull steps entirely unless explicitly setting up a local/air-gapped deployment (INFERENCE_MODE=local). Report the final verification result for BGE/DeBERTa only.
```
*(Already built in the original Sona Comstar environment, where Ollama models were genuinely downloaded. In the new Oracle deployment environment, only the BGE/DeBERTa portion needs to be re-run — the Ollama portion is moot under the default external inference mode.)*

### SESSION 05 — PostgreSQL Data Layer
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_05_DATA_LAYER_POSTGRESQL
```
Read all four documents. Create all migration SQL files, seed files, and scripts/init_database.py. Fix PgBouncer userlist.txt. Run: python scripts/init_database.py. Report T-code count and synonym count loaded.
```
*(Already built. No amendment applies.)*

### SESSION 06 — Qdrant Collections
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_06_DATA_LAYER_QDRANT
```
Read all four documents. Create scripts/init_qdrant.py and backend/app/infrastructure/qdrant_client.py. Run: python scripts/init_qdrant.py. Confirm ALL four collections show exactly 768-dimensional vectors. 768 is non-negotiable.
```
*(Already built. No amendment applies.)*

### SESSION 07 — OpenSearch Index
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_07_DATA_LAYER_OPENSEARCH
```
Read all four documents. Create scripts/init_opensearch.py and backend/app/infrastructure/opensearch_client.py. Run: python scripts/init_opensearch.py. Verify "VL150" through entity analyzer produces single token "vl150".
```
*(Already built. No amendment applies.)*

### SESSION 08 — Redis Clients
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_08_DATA_LAYER_REDIS
```
Read all four documents. Create backend/app/infrastructure/redis_client.py (RedisSessionClient and RedisQueueClient only — ARQTaskClient is added in Session 21) and scripts/verify_redis.py. Run: python scripts/verify_redis.py. Report memory configs for both instances.
```
*(Already built. No amendment applies.)*

### SESSION 09 — Security and Governance
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_09_SECURITY_NGINX_GOVERNANCE
```
Read all four documents. Create all four middleware files and backend/app/main.py (basic version — Session 21 will add full startup connections). Run: python -m pytest tests/unit/test_input_governance.py -v. Test that "ignore your previous instructions" returns 400.
```
*(Already built. No amendment applies.)*

### SESSION 10 — Identity and Secrets (RETROFIT)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_10_SECURITY_IDENTITY_SECRETS, AMENDMENT_GENERALIZATION_BACKEND
```
This session is already built. Apply AMENDMENT_GENERALIZATION_BACKEND.md's FILE 6 to the existing Keycloak seed script (backend/scripts/setup_keycloak.py) — change the two test user email domains from sonacomstar.local to aegis-demo.local. Do not re-run the rest of Session 10. For the record: this session's original prompt embedded an incomplete list of 11 "Session 21 will need" constants — the authoritative, complete list of 12 (including MODE_C_MAX_SUBQUERIES) lives only in IMPL_21 itself; do not re-derive the list from this session's original text.
```

### SESSION 11 — Zone B Orchestration
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_11_ORCHESTRATION_ZONE_B
```
This session is already built. No retrofit needed here — corrects an earlier version of this guide, which had placed the vision inference retrofit on this session's `vision_task.py`. Direct inspection of the real repository confirmed `vision_task.py` calls into `backend/app/clients/ollama_vision.py` (built by Session 13) rather than making its own request — the actual retrofit target is there. See Session 13 below.
```

### SESSION 12 — Query Intelligence Layer
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_12_QUERY_INTELLIGENCE
```
Read all four documents. Create backend/app/models/retrieval.py and backend/app/services/query_intelligence.py. Run: python -m pytest tests/unit/test_query_intelligence.py -v. Verify VL150 → error_code, VL01N → tcode, Mode C triggers for >200 char queries.
```
*(Already built. No amendment applies.)*

### SESSION 13 — Vision Service (RETROFIT — corrected target, moved from Session 11)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_13_VISION_SERVICE, AMENDMENT_INFERENCE_ARCHITECTURE
```
This session is already built. Apply AMENDMENT_INFERENCE_ARCHITECTURE.md's FILE 4 to the existing backend/app/clients/ollama_vision.py — this replaces classify_sap()'s and extract_sap_content()'s direct Ollama /api/generate calls with INFERENCE_MODE-aware routing through Groq (primary) / Cerebras (fallback) vision providers, via a shared _run_vision_prompt() helper. Preserve each function's own timeout (15s classify, 30s extract) — do not collapse into one shared constant. Run the diagnostic in that amendment's AGENT INSTRUCTIONS first. vision_task.py and vision_integration.py both require no changes — confirmed by direct inspection, not assumed. Do not re-run the rest of Session 13.
```


### SESSION 14 — Retrieval Engine Stages 1-5
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_14_RETRIEVAL_STAGES_1_TO_5
```
Read all four documents. Create backend/app/services/retrieval_engine.py with stages 1-5. Run: python -m pytest tests/unit/test_retrieval_engine.py -v. Verify rank=1 K=60 → score=0.01639, diversity bonus +0.15 on underrepresented docs.
```
*(Already built. No amendment applies.)*

### SESSION 15 — Retrieval Engine Stages 6-8 (RETROFIT — APPLY AFTER SESSION 16, NOT BEFORE)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_15_RETRIEVAL_STAGES_6_TO_8, AMENDMENT_INFERENCE_ARCHITECTURE
```
⚠ DEPENDENCY WARNING (see DECISIONS_LOG.md DEC-037): do not apply this session's retrofit until Session 16's FILE 3 (model_gateway.py full replacement) is confirmed complete. This retrofit calls model_gateway.call_judge() with max_tokens/temperature keyword arguments that only exist on the NEW signature — applying this against the original call_judge(self, prompt: str) signature raises TypeError immediately.

This session is already built. Apply AMENDMENT_INFERENCE_ARCHITECTURE.md's FILE 7 to the existing retrieval_engine.py — this replaces _stage6_crag's direct Ollama call with a call to model_gateway.call_judge(), passing CRAG_MAX_TOKENS explicitly so CRAG's smaller token budget is preserved rather than silently widened to the general judge budget. Do not re-run the rest of Session 15. CRITICAL (unchanged): Stage 7 source code position must remain BEFORE Stage 6; Mode C must still never return SKIPPED.
```

### SESSION 16 — Reasoning Service (RETROFIT — VERIFY FIRST, APPLY BEFORE SESSION 15)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_16_REASONING_SERVICE, AMENDMENT_INFERENCE_ARCHITECTURE, AMENDMENT_GENERALIZATION_BACKEND
```
Before doing anything else, run the diagnostic in AMENDMENT_INFERENCE_ARCHITECTURE.md's AGENT INSTRUCTIONS to confirm model_gateway.py's current state matches what the amendment assumes (select_model_tier, get_ollama_config, ModelGateway.generate_streaming, ModelGateway.call_judge — 5 items, in that order). If confirmed, apply that amendment's FILE 1, FILE 2, and FILE 3 (config.py additions, new inference_providers.py, full model_gateway.py replacement). Then apply AMENDMENT_GENERALIZATION_BACKEND.md's FILE 3 and FILE 4 to reasoning_service.py's SYSTEM_ROLE constant and its test assertion. Run: python -m pytest tests/unit/test_reasoning_service.py -v. Verify section order is unchanged: DOCUMENTATION→REGISTRY_NOTE→SCREEN_CONTEXT→EMPLOYEE QUESTION.
```

### SESSION 17 — Validation Engine
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_17_VALIDATION_ENGINE
```
Read all four documents. Create validation_engine.py. Run: python -m pytest tests/unit/test_validation_engine.py -v. Verify weights sum=1.0, all 7 freshness boundaries, badge thresholds 0.85/0.70.
```
*(Not yet built. No retrofit action needed here — validation's `run_judge_evaluation()` calls `model_gateway.call_judge()` directly, the exact interface `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s FILE 3 redesigns. This is not "provider-agnostic," it's provider-*abstracted* — a meaningful difference: it depends on the routing, it just already delegates to it correctly rather than making its own direct Ollama call the way `vision_task.py` and `retrieval_engine.py` originally did. Build IMPL_17 exactly as specified; it inherits Cerebras/Groq routing automatically once Session 16's FILE 3 replacement is in place.)*

### SESSION 18 — Ingestion Pipeline (FRESH BUILD)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, AEGIS_DOCUMENT_TEMPLATES, IMPL_18_INGESTION_PIPELINE, AMENDMENT_GENERALIZATION_BACKEND, AMENDMENT_OBJECT_STORAGE_MINIO
```
Read all seven attached documents. Build ingestion_pipeline.py per IMPL_18, incorporating from the start: (1) AMENDMENT_GENERALIZATION_BACKEND.md's FILE 1/2 — use the config.py-sourced, configurable ALLOWED_MODULES rather than IMPL_18's own hardcoded 7-module set, and build docs/DOCUMENT_AUTHORING_TEMPLATE.md per FILE 7 with the CURRENT_PRODUCTION_VALUES field name, not CURRENT_VALUES_AT_SONA_COMSTAR; (2) AMENDMENT_OBJECT_STORAGE_MINIO.md's FILE 4/5 — write the original uploaded document to MinIO in Stage 1, before parsing begins, and create migration 005_minio_object_keys.sql. Run: python -m pytest tests/unit/test_ingestion_pipeline.py -v, plus the MinIO-specific verification steps in that amendment.
```

### SESSION 19 — Employee Frontend (SUPERSEDED — DO NOT BUILD)
```
SKIP. The employee frontend is built entirely from FRONTEND_01-40 (see the frontend agent guide), not from this document. This entry is retained only so the DOCUMENT SUPERSESSION TABLE above remains traceable.
```

### SESSION 20 — Admin Portal and Observability (PARTIALLY SUPERSEDED)
```
SKIP the frontend portions (middleware.ts, admin pages) — built from FRONTEND_01-40 instead. The backend observability portions (observability.py, Grafana dashboard JSON) are folded into Session 21 below, not built as a standalone session.
```

### SESSION 21 — Fix and Integration (FRESH BUILD — CRITICAL, DO NOT SKIP)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_21_FIX_SESSION, AMENDMENT_OBJECT_STORAGE_MINIO, and IMPL_20_ADMIN_PORTAL_OBSERVABILITY (reference only — for its FILE 7/FILE 8 content, see Part C below)
```
Read all six attached documents. IMPL_21 fixes 13 confirmed bugs (not 15 — that figure in earlier guidance was incorrect) and adds 12 configuration constants (not 9 or 11 — the complete, authoritative list is in IMPL_21 itself, including MODE_C_MAX_SUBQUERIES=2). For every file listed in IMPL_21, create or replace it with the exact content shown: postgres_client.py, ARQTaskClient in redis_client.py, updated task function signatures, fixed CRAG parser (superseded further by AMENDMENT_INFERENCE_ARCHITECTURE.md's FILE 7 if Session 15's retrofit already ran — apply whichever is more recent), fixed Qdrant cache cleanup, multi-worker synonym listener, admin_handler.py, complete main.py, WebSocket auth function, HttpOnly cookie auth routes, API proxy route, updated auth.ts, frontend Dockerfile, frontend docker-compose service, fixed nginx.conf, warmup_models.py, and seed_test_documents.py.

PART C (folded from IMPL_20, since IMPL_20's frontend deliverable is skipped and this backend-only piece has no other home): build backend/app/observability.py exactly as shown in IMPL_20's FILE 7 — 13 custom Prometheus metrics (aegis_requests_total, aegis_generation_duration_seconds, aegis_generation_tier_total, aegis_validation_score, aegis_confidence_badge_total, aegis_cache_hits_total, aegis_crag_assessment_total, aegis_retrieval_mode_total, aegis_cross_encoder_top_score, aegis_escalations_total, aegis_knowledge_gap_events_total, aegis_vision_tasks_total, aegis_active_sessions) plus the record_pipeline_metrics() helper, called from chat_handler.py at the end of each turn. Build infrastructure/grafana/dashboards/aegis-main.json exactly as shown in IMPL_20's FILE 8 (the 8-panel dashboard).

Additionally, from AMENDMENT_OBJECT_STORAGE_MINIO.md: apply FILE 6 (the admin document-download endpoint and deletion cleanup) and FILE 8 (adding "minio" as a 6th key in the /health response, alongside redis_session, redis_queue, qdrant, opensearch, postgres — now also alongside the aegis_* metrics from Part C above). Run all verifications at the bottom of IMPL_21, plus this amendment's verification steps, plus a check that /metrics returns all 13 aegis_* series after a test query.
```

### SESSION 22 — Final Polish (Last Backend Session Before Quick Entry)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_22_FINAL_POLISH
```
Read all four attached documents. IMPL_22 fixes three final gaps: (1) Nginx WebSocket route — replace nginx.conf entirely with the version shown; (2) Admin pages — replace all seven admin page files with the corrected versions that use /api/proxy/ instead of getAccessToken(); (3) tests/conftest.py — create the shared test configuration file. Run all verification steps at the bottom of IMPL_22. Confirm WebSocket works through Nginx and admin pages load without 401 errors.
```
*(Not yet built. No amendment applies.)*

---

### SESSION 23 — Quick Entry Overview and Architecture
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_23_QUICK_ENTRY_OVERVIEW
```
Read all four documents. Build the architecture and data model foundation per IMPL_23. Run all verification steps at the bottom of IMPL_23.
```
*(Not yet built. No amendment applies — checked directly, no Sona Comstar references beyond a cosmetic document-footer line, no direct model calls.)*

### SESSION 24 — Quick Entry Data Model (FRESH BUILD)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_24_QUICK_ENTRY_DATA_MODEL, AMENDMENT_GENERALIZATION_BACKEND
```
Read all five documents. Build the data model per IMPL_24. Apply AMENDMENT_GENERALIZATION_BACKEND.md's FILE 8: where IMPL_24 instructs replacing [PLACEHOLDER] values with "real Sona Comstar SAP examples," use realistic but synthetic SAP examples not tied to any specific company instead. Run all verification steps at the bottom of IMPL_24.
```

### SESSION 25 — Quick Entry API Endpoints
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_25_QUICK_ENTRY_API_ENDPOINTS
```
Read all four documents. Build the API endpoints per IMPL_25. Run all verification steps.
```
*(Not yet built. No amendment applies.)*

### SESSION 26 — Quick Entry Processing Pipeline
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_26_QUICK_ENTRY_PROCESSING_PIPELINE
```
Read all four documents. Build the processing pipeline per IMPL_26. Run all verification steps.
```
*(Not yet built. No amendment applies.)*

### SESSION 27 — Quick Entry Chunking Engine
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_27_QUICK_ENTRY_CHUNKING_ENGINE
```
Read all four documents. Build the chunking engine per IMPL_27. Run all verification steps.
```
*(Not yet built. No amendment applies.)*

### SESSION 28 — Quick Entry Screenshot Pipeline (FRESH BUILD)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_28_QUICK_ENTRY_SCREENSHOT_PIPELINE, AMENDMENT_OBJECT_STORAGE_MINIO, AMENDMENT_INFERENCE_ARCHITECTURE
```
Read all six documents. IMPL_28 already specifies a complete MinIO upload/cleanup system of its own (Section 3 upload flow, Section 7 lifecycle management) — build it largely as originally specified, applying only AMENDMENT_OBJECT_STORAGE_MINIO.md's FILE 9 correction (use the shared config.py MINIO_BUCKET_SCREENSHOTS constant instead of a redundant local SCREENSHOT_MINIO_BUCKET, and drop the redundant "knowledge-screenshots/" prefix from the object key since that's already the bucket name). Separately, apply AMENDMENT_INFERENCE_ARCHITECTURE.md's FILE 8: IMPL_28's classify_sap() and extract_sap_content() functions hardcode VISION_SERVICE_URL and VISION_MODEL="llava:13b" — a different vision model than the rest of the architecture with no documented reason found anywhere. Replace both call sites with the shared _run_vision_prompt() helper shown in that amendment's FILE 8, routing through the same Groq/Cerebras vision pair used everywhere else. Run all verification steps at the bottom of IMPL_28, plus both amendments' verification steps.
```

### SESSION 29 — Quick Entry Operational Systems
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_29_QUICK_ENTRY_OPERATIONAL_SYSTEMS
```
Read all four documents. Build the operational systems (scheduled jobs, monitoring integration) per IMPL_29. Run all verification steps.
```
*(Not yet built. No amendment applies.)*

---

## AFTER ALL SESSIONS

```bash
# Final system check
python scripts/warmup_models.py       # No-op under INFERENCE_MODE=external — no local model to warm
python scripts/seed_test_documents.py # Seed data for integration tests
python scripts/verify_health.py       # Must show 0 failures, including the new minio key
python -m pytest tests/unit/ --timeout=30       # Must show 100% pass
python -m pytest tests/integration/ --timeout=180 -s
python aegis_inference_benchmark.py   # Confirm Cerebras/Groq routing end-to-end
```

Update `DECISIONS_LOG.md` with the date all sessions completed and the results of the benchmark run (this closes out `DECISIONS_LOG.md` DEC-023, currently OPEN).

---

## ERROR RECOVERY

### Agent creates wrong file
```
That file is wrong. Re-read [IMPL_XX or AMENDMENT_XX] section [name] and recreate [filename] with the exact content shown. Do not improvise or adapt.
```

### Docker service fails
```bash
docker compose logs [service] --tail=50
docker system prune   # if disk space
```

### Tests fail
Paste the complete pytest output and type:
```
These tests are failing. The specification says [quote spec]. Fix the implementation to match. Do not modify the tests.
```

### Cerebras or Groq API errors (NEW)
```bash
# Confirm the key is set and reachable
python -c "from app.config import CEREBRAS_API_KEY, GROQ_API_KEY; print(bool(CEREBRAS_API_KEY), bool(GROQ_API_KEY))"
curl -s https://api.cerebras.ai/v1/models -H "Authorization: Bearer $CEREBRAS_API_KEY" | head -5
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY" | head -5
```
If a model has been deprecated or renamed, record the actual current model ID in `DECISIONS_LOG.md` as a new entry, then update `AMENDMENT_INFERENCE_ARCHITECTURE.md`'s FILE 1 constants — do not silently change the model name without logging why.

### Ollama model tag not found (only relevant under INFERENCE_MODE=local)
```bash
docker exec aegis-ollama ollama search qwen2.5
# Record actual tag in DECISIONS_LOG
```

---

## GIT COMMIT CONVENTIONS

```
IMPL-01: Dependencies - verification passing
IMPL-02: Environment setup - folder structure complete
IMPL-03: Docker infrastructure - 20 services defined (19 + MinIO)
IMPL-04: AI models - BGE/DeBERTa verified (Ollama models skipped, INFERENCE_MODE=external)
IMPL-05: PostgreSQL - 13 tables created
IMPL-06: Qdrant - 4 collections 768-dim confirmed
IMPL-07: OpenSearch - SAP analyzer verified
IMPL-08: Redis - both instances configured
IMPL-09: Security/Governance - tests passing
IMPL-10: Identity/Secrets - authentication verified, seed emails generalized
IMPL-11: Zone B Orchestration - ARQ verified, vision_task.py routes through Groq/Cerebras
IMPL-12: Query Intelligence - tests passing
IMPL-13: Vision Service - DiagnosticObject enrichment verified
IMPL-14: Retrieval stages 1-5 - RRF and diversity bonus verified
IMPL-15: Retrieval stages 6-8 - CRAG routes through model_gateway.call_judge()
IMPL-16: Reasoning Service - Cerebras/Groq routing verified, SYSTEM_ROLE generalized
IMPL-17: Validation Engine - formula and freshness verified
IMPL-18: Ingestion Pipeline - chunking tests passing, MinIO write verified, fields generalized
IMPL-19: SKIPPED - superseded by FRONTEND_01-40
IMPL-20: SKIPPED (frontend) - observability folded into IMPL-21
IMPL-21: Fix session - 13 bugs fixed, MinIO health check + admin download added
IMPL-22: Final polish - WebSocket via Nginx verified, admin pages fixed
IMPL-23: Quick Entry overview - architecture verified
IMPL-24: Quick Entry data model - synthetic example data verified
IMPL-25: Quick Entry API endpoints - verified
IMPL-26: Quick Entry processing pipeline - verified
IMPL-27: Quick Entry chunking engine - verified
IMPL-28: Quick Entry screenshot pipeline - MinIO reconciled, vision unified to Groq/Cerebras
IMPL-29: Quick Entry operational systems - verified
```

---

## RULES THAT MUST NEVER BE BROKEN

1. **Vector dimension = 768 everywhere.** Any other number = hard failure.
2. **Pipeline: Stage 7 (reranking) runs BEFORE Stage 6 (CRAG).** Order: 1→2→3→4→5→7→6→8.
3. **Redis Instance 2 has AOF persistence.** Task durability requirement.
4. **config_values chunk is never split.** One indivisible chunk regardless of length.
5. **audit_log is append-only.** No UPDATE or DELETE, ever.
6. **Mode C always runs CRAG.** No skip condition exists for Mode C.
7. **CRAG failure defaults to SUFFICIENT.** Never block employees on model unavailability.
8. **CRAG's token budget (CRAG_MAX_TOKENS) is never silently widened to JUDGE_MAX_TOKENS.** These are intentionally different, and `model_gateway.call_judge()`'s optional override parameters exist specifically to preserve this distinction — a routing change that drops the explicit override is a regression, not a simplification.
9. **MinIO write failures are fatal for ingestion paths (documents, Quick Entry screenshots) and non-fatal for query-time paths (the live vision pipeline).** See `AMENDMENT_OBJECT_STORAGE_MINIO.md` Section 11.2 for the full reasoning — do not unify this to one behavior.
10. **The frontend never talks to MinIO directly.** All retrieval is proxied through a FastAPI endpoint that streams bytes back — a presigned URL pointing at the internal `aegis-minio` hostname is unreachable from a browser and is a real bug, not a valid alternative.

---

*Document version: 4.0 | AEGIS Backend Specification Set | Supersedes v3.0 in full*
