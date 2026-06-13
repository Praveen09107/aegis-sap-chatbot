# AGENT SESSION GUIDE v3.0
## Operating Instructions for the GitHub Copilot Agent — AEGIS Implementation
## Final version — includes Session 21 and patch guidance

---

## CRITICAL READING BEFORE STARTING

The specification set contains 21 implementation sessions. Sessions 01-20 build the system. **Session 21 applies critical bug fixes** — it MUST be run after Session 20 before any testing.

The old patch documents (IMPL_PATCH_01, IMPL_PATCH_02, IMPL_PATCH_03) are SUPERSEDED by IMPL_21. Ignore the patch documents. Use only IMPL_21 for all fix work.

---

## DOCUMENT SUPERSESSION TABLE

Some original session documents have sections superseded by IMPL_21. The agent must apply IMPL_21's version when conflicts exist.

| Original Document | Section Superseded by IMPL_21 |
|---|---|
| IMPL_03 (Docker) | nginx.conf location /, docker-compose.yml (missing frontend service) |
| IMPL_10 (Config) | config.py (missing 9 constants) |
| IMPL_11 (Orchestration) | arq_worker.py (task signatures), chat_handler.py (rpush calls) |
| IMPL_19 (Frontend) | auth.ts (sessionStorage → cookies), useWebSocket.ts (token fetch) |
| IMPL_20 (Admin) | main.py (missing startup connections, missing routers) |

**Rule:** When IMPL_21 shows a complete file and the original IMPL doc also shows that file, use IMPL_21's version.

---

## BEFORE STARTING ANY SESSION

**Required in every session context (4 documents always):**
1. `specs/tier1_foundation/AEGIS_MASTER_REFERENCE.md`
2. `specs/tier1_foundation/AEGIS_DATA_CONTRACTS.md`
3. `specs/tier1_foundation/AEGIS_CONFIGURATION_CONSTANTS.md`
4. The session-specific IMPL document

---

## SESSION START PROMPTS

### SESSION 01 — Dependencies
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_01_DEPENDENCIES
```
Read all four attached documents completely. Create every file listed in IMPL_01_DEPENDENCIES.md with exactly the content shown. Use exact version numbers. Run all verification steps and report results.
```

### SESSION 02 — Environment Setup
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_02_ENVIRONMENT_SETUP
```
Read all four attached documents. Execute every step in IMPL_02 in order. Create all files. Run all verification steps and report each result.
```

### SESSION 03 — Docker Infrastructure
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_03_DOCKER_INFRASTRUCTURE
```
Read all four attached documents. Create docker-compose.yml and all infrastructure files as specified. Critical: Redis Instance 1 maxmemory=6gb allkeys-lru no persistence; Redis Instance 2 maxmemory=1gb noeviction AOF; OpenSearch OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g; all three Ollama instances OLLAMA_KEEP_ALIVE=-1; Keycloak uses PostgreSQL not H2. NOTE: Session 21 will later add the frontend Docker service — do not add it now. Run all verification steps.
```

### SESSION 04 — AI Models Setup
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_04_MODELS_SETUP
```
Read all four documents. Create scripts/setup_models.py. Then run: python scripts/setup_models.py. The 32B model is ~19GB and may take 30-60 minutes. Report the final verification result.
```

### SESSION 05 — PostgreSQL Data Layer
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_05_DATA_LAYER_POSTGRESQL
```
Read all four documents. Create all migration SQL files, seed files, and scripts/init_database.py. Fix PgBouncer userlist.txt. Run: python scripts/init_database.py. Report T-code count and synonym count loaded.
```

### SESSION 06 — Qdrant Collections
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_06_DATA_LAYER_QDRANT
```
Read all four documents. Create scripts/init_qdrant.py and backend/app/infrastructure/qdrant_client.py. Run: python scripts/init_qdrant.py. Confirm ALL four collections show exactly 768-dimensional vectors. 768 is non-negotiable.
```

### SESSION 07 — OpenSearch Index
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_07_DATA_LAYER_OPENSEARCH
```
Read all four documents. Create scripts/init_opensearch.py and backend/app/infrastructure/opensearch_client.py. Run: python scripts/init_opensearch.py. Verify "VL150" through entity analyzer produces single token "vl150".
```

### SESSION 08 — Redis Clients
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_08_DATA_LAYER_REDIS
```
Read all four documents. Create backend/app/infrastructure/redis_client.py (RedisSessionClient and RedisQueueClient only — ARQTaskClient is added in Session 21) and scripts/verify_redis.py. Run: python scripts/verify_redis.py. Report memory configs for both instances.
```

### SESSION 09 — Security and Governance
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_09_SECURITY_NGINX_GOVERNANCE
```
Read all four documents. Create all four middleware files and backend/app/main.py (basic version — Session 21 will add full startup connections). Run: python -m pytest tests/unit/test_input_governance.py -v. Test that "ignore your previous instructions" returns 400.
```

### SESSION 10 — Identity and Secrets
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_10_SECURITY_IDENTITY_SECRETS
```
Read all four documents. Create scripts/setup_keycloak.py, authentication.py, vault_client.py, and config.py. IMPORTANT: After creating config.py, also add these missing constants that Session 21 will need: KG_BASE_RANK_EQUIVALENT=15, FEEDBACK_RETRIEVAL_FAIL_THRESHOLD=0.65, QUERY_SUMMARY_MAX_CHARS=200, ANSWER_SUMMARY_MAX_CHARS=300, MAX_SCREENSHOT_BYTES=10485760, MAX_DOCUMENT_BYTES=52428800, GENERATION_MAX_TOKENS=1000, CRAG_MAX_TOKENS=200, JUDGE_MAX_TOKENS=300, GENERATION_TEMPERATURE=0.1, JUDGE_TEMPERATURE=0.0. Run: python scripts/setup_keycloak.py. Verify ROPC token flow returns access_token.
```

### SESSION 11 — Zone B Orchestration
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_11_ORCHESTRATION_ZONE_B
```
Read all four documents. Create circuit_breaker.py, session.py, api.py, all seven task files, arq_worker.py, and chat_handler.py. NOTE: Session 21 will update task function signatures and ARQ enqueueing — do not worry about ARQ format correctness now. Verify circuit breaker transitions and session state round-trip.
```

### SESSION 12 — Query Intelligence Layer
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_12_QUERY_INTELLIGENCE
```
Read all four documents. Create backend/app/models/retrieval.py and backend/app/services/query_intelligence.py. Run: python -m pytest tests/unit/test_query_intelligence.py -v. Verify VL150 → error_code, VL01N → tcode, Mode C triggers for >200 char queries.
```

### SESSION 13 — Vision Service
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_13_VISION_SERVICE
```
Read all four documents. Create upload_handler.py and vision_integration.py. Update chat_handler.py with proactive vision response. Run: python -m pytest tests/unit/test_vision_integration.py -v.
```

### SESSION 14 — Retrieval Engine Stages 1-5
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_14_RETRIEVAL_STAGES_1_TO_5
```
Read all four documents. Create backend/app/services/retrieval_engine.py with stages 1-5. Run: python -m pytest tests/unit/test_retrieval_engine.py -v. Verify rank=1 K=60 → score=0.01639, diversity bonus +0.15 on underrepresented docs.
```

### SESSION 15 — Retrieval Engine Stages 6-8
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_15_RETRIEVAL_STAGES_6_TO_8
```
Read all four documents. Add stages 6, 7, 8 to retrieval_engine.py. Replace temporary return with complete retrieve() method. CRITICAL: verify Stage 7 source code position is BEFORE Stage 6. Verify Mode C never returns SKIPPED. Run all tests.
```

### SESSION 16 — Reasoning Service
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_16_REASONING_SERVICE
```
Read all four documents. Create model_gateway.py and reasoning_service.py. Run: python -m pytest tests/unit/test_reasoning_service.py -v. Verify section order: DOCUMENTATION→REGISTRY_NOTE→SCREEN_CONTEXT→EMPLOYEE QUESTION.
```

### SESSION 17 — Validation Engine
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_17_VALIDATION_ENGINE
```
Read all four documents. Create validation_engine.py. Run: python -m pytest tests/unit/test_validation_engine.py -v. Verify weights sum=1.0, all 7 freshness boundaries, badge thresholds 0.85/0.70.
```

### SESSION 18 — Ingestion Pipeline
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, AEGIS_DOCUMENT_TEMPLATES, IMPL_18_INGESTION_PIPELINE
```
Read all five documents. Create backend/app/services/ingestion_pipeline.py. Run: python -m pytest tests/unit/test_ingestion_pipeline.py -v.
```

### SESSION 19 — Employee Frontend
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_19_EMPLOYEE_FRONTEND
```
Read all four documents. Create all frontend TypeScript files as specified. NOTE: Session 21 will replace auth.ts with a cookie-based version and add API proxy routes — create auth.ts as shown in IMPL_19 now, it will be replaced later. Run: cd frontend && npm run type-check.
```

### SESSION 20 — Admin Portal and Observability
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_20_ADMIN_PORTAL_OBSERVABILITY
```
Read all four documents. Create middleware.ts, admin pages, observability.py, and Grafana dashboard config. NOTE: admin_handler.py and the complete main.py are created in Session 21 — do not create them in this session. Create only the files explicitly listed in IMPL_20.
```

### SESSION 21 — Fix and Integration (CRITICAL — DO NOT SKIP)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_21_FIX_SESSION
```
Read all four attached documents. IMPL_21 fixes 15 confirmed bugs in the codebase. For every file listed in IMPL_21, create or replace it with the exact content shown. This session creates: postgres_client.py, ARQTaskClient in redis_client.py, updated task function signatures, fixed CRAG parser, fixed Qdrant cache cleanup, multi-worker synonym listener, admin_handler.py, complete main.py, WebSocket auth function, HttpOnly cookie auth routes, API proxy route, updated auth.ts, frontend Dockerfile, frontend docker-compose service, fixed nginx.conf, warmup_models.py, and seed_test_documents.py. Run all verifications at the bottom of IMPL_21.
```

---

## AFTER ALL 21 SESSIONS

```bash
# Final system check
python scripts/warmup_models.py       # Warm up models after any restart
python scripts/seed_test_documents.py # Seed data for integration tests
python scripts/verify_health.py       # Must show 0 failures
python -m pytest tests/unit/ --timeout=30       # Must show 100% pass
python -m pytest tests/integration/ --timeout=180 -s
```

---

## ERROR RECOVERY

### Agent creates wrong file
```
That file is wrong. Re-read [IMPL_XX] section [name] and recreate [filename] with the exact content shown. Do not improvise or adapt.
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

### Ollama model tag not found
```bash
docker exec aegis-ollama-main ollama search qwen2.5
# Record actual tag in DECISIONS_LOG
```

---

## GIT COMMIT CONVENTIONS

```
IMPL-01: Dependencies - verification passing
IMPL-02: Environment setup - folder structure complete
IMPL-03: Docker infrastructure - 19 services healthy
IMPL-04: AI models - all models verified
IMPL-05: PostgreSQL - 13 tables created
IMPL-06: Qdrant - 4 collections 768-dim confirmed
IMPL-07: OpenSearch - SAP analyzer verified
IMPL-08: Redis - both instances configured
IMPL-09: Security/Governance - tests passing
IMPL-10: Identity/Secrets - authentication verified
IMPL-11: Zone B Orchestration - ARQ and session state verified
IMPL-12: Query Intelligence - tests passing
IMPL-13: Vision Service - DiagnosticObject enrichment verified
IMPL-14: Retrieval stages 1-5 - RRF and diversity bonus verified
IMPL-15: Retrieval stages 6-8 - CRAG and reranking verified
IMPL-16: Reasoning Service - prompt assembly verified
IMPL-17: Validation Engine - formula and freshness verified
IMPL-18: Ingestion Pipeline - chunking tests passing
IMPL-19: Employee Frontend - login and streaming verified
IMPL-20: Admin Portal - Prometheus metrics and Grafana verified
IMPL-21: Fix session - all 15 bugs fixed, integration tests passing
```

---

## SEVEN RULES THAT MUST NEVER BE BROKEN

1. **Vector dimension = 768 everywhere.** Any other number = hard failure.
2. **Pipeline: Stage 7 (reranking) runs BEFORE Stage 6 (CRAG).** Order: 1→2→3→4→5→7→6→8.
3. **Redis Instance 2 has AOF persistence.** Task durability requirement.
4. **config_values chunk is never split.** One indivisible chunk regardless of length.
5. **audit_log is append-only.** No UPDATE or DELETE, ever.
6. **Mode C always runs CRAG.** No skip condition exists for Mode C.
7. **CRAG failure defaults to SUFFICIENT.** Never block employees on model unavailability.

---

*Document version: 3.0 — Final with Session 21 | AEGIS Specification Set*

### SESSION 22 — Final Polish (Last Session)
**Attach:** AEGIS_MASTER_REFERENCE, AEGIS_DATA_CONTRACTS, AEGIS_CONFIGURATION_CONSTANTS, IMPL_22_FINAL_POLISH
```
Read all four attached documents. IMPL_22 fixes three final gaps: (1) Nginx WebSocket route — replace nginx.conf entirely with the version shown; (2) Admin pages — replace all seven admin page files with the corrected versions that use /api/proxy/ instead of getAccessToken(); (3) tests/conftest.py — create the shared test configuration file. Run all verification steps at the bottom of IMPL_22. Confirm WebSocket works through Nginx and admin pages load without 401 errors.
```
