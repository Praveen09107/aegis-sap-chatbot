# AEGIS — PROJECT DIRECTORY STRUCTURE
## Sona Comstar SAP Helpdesk AI | Production-Grade | Spec-Faithful
## All paths match exactly what IMPL_01–29 and FRONTEND_01–40 expect

---

## FILE LEGEND — HOW TO READ THIS DOCUMENT

Every file in every tree in this document is tagged with one of three markers:

```
[S]            → Script creates this file (bash create_aegis_structure.sh)
               Includes: all __init__.py, .gitignore, .env.example,
               Makefile, README.md, CONTRIBUTING.md, .editorconfig,
               .dockerignore, docs/, guides/, model_info.txt (empty)

[A: IMPL_XX]   → Agent (Copilot/Claude Code) creates this during the named
               implementation session. File contains real code from the spec.
               DO NOT create these manually — the agent writes them correctly.

[A: FE_XX]     → Agent creates during the named FRONTEND spec session.

[EXISTS]       → Already exists from previous work (specs/ folder, guides/).
               Do not recreate or overwrite.
```

**The script creates structure. The agent fills it with code. You review and commit.**

---

## HOW THIS STRUCTURE WAS DESIGNED

Every directory and file name in this guide was extracted directly from the 85 AEGIS specification documents. The structure is not generic — it matches what the implementation agent expects to find when building each session.

Four principles shaped this structure:

**Spec faithfulness** — The agent looks for exact file paths like `backend/app/services/form_chunker.py` or `services/bge-embedding/main.py`. If these paths do not match, the agent creates files in wrong locations. This guide uses the paths from the actual specs.

**Demo → Production with zero code changes** — The `docker-compose.prod.yml` file overrides only container configs. The `model_gateway.py` client reads env vars to choose Ollama vs vLLM. No Python file or TypeScript file changes for production. Only `.env` and `docker-compose.prod.yml` change.

**AEGIS zone architecture** — Each directory mirrors an AEGIS zone:
- `backend/` = Zone B (Orchestration) + Zone C (AI Pipeline)
- `services/` = Zone C AI microservices (DeBERTa, BGE)
- `frontend/` = Zone D (Employee Chat + Admin Portal)
- Nginx/Vault/Keycloak configs live inside `docker-compose.yml` volumes

**Copilot navigability** — Directories exist before the agent runs. When Copilot opens `backend/app/services/` it sees sibling files from earlier sessions. This context helps it write new files that are consistent in style, imports, and patterns with what was already written.

---

## FILE CREATION STRATEGY — WHAT THE SCRIPT CREATES VS WHAT THE AGENT CREATES

### What the script creates (run once, before any implementation session):

| Category | Files | Why upfront |
|---|---|---|
| All directories | All 77 dirs | Agent must find the folder or it creates file in wrong place |
| `__init__.py` files | All Python package markers | Python import system requires these before code runs |
| `.gitignore` | Root gitignore with full content | Must exist before first `git add` or `.env` gets committed |
| `.env.example` | Environment variable template | Referenced in IMPL_02, needed before any session starts |
| `frontend/.env.local.example` | Frontend env template | Referenced in IMPL_02 |
| `Makefile` | Common dev shortcuts | Developers need `make up`, `make migrate` from day one |
| `.editorconfig` | Code formatting rules | Consistent indentation across Python, TypeScript, YAML |
| `CONTRIBUTING.md` | Development workflow guide | Onboarding reference for the project |
| `docs/ARCHITECTURE.md` | System architecture overview | Quick reference during implementation |
| `docs/ONBOARDING.md` | Developer setup guide | Step-by-step environment setup |
| `backend/.dockerignore` | Docker build exclusions | Prevents `.venv`, `__pycache__` entering Docker image |
| `frontend/.dockerignore` | Docker build exclusions | Prevents `node_modules`, `.next` entering Docker image |
| `services/*/README.md` | Microservice README | Documents what each service does and its API |
| `alembic/versions/README.md` | Migration naming guide | Agent reads this to name migrations correctly |
| `docker-compose.prod.yml` | Empty production override | Placeholder; agent fills during IMPL_03 review |
| `scripts/model_info.txt` | Empty file | `setup_models.py` writes into this after pulling models |
| `README.md` | Project README | Every production repository needs this |

### What the agent creates (during each implementation session):

Everything else — all `.py` source files, all `.tsx`/`.ts` files, all `Dockerfile` files, `docker-compose.yml`, `requirements.txt`, `package.json`, `tsconfig.json`, migration files, Grafana dashboards, Prometheus configs, and all test files. The agent reads the spec, writes the file with correct full content, and you commit.

---

## ADDITIONAL ONBOARDING FILES — NOT IN SPECS, REQUIRED FOR PRODUCTION

These files are absent from the 85 AEGIS spec documents but are necessary for a production-grade project. All are created by the script.

**`Makefile`** — Shortcut commands so any developer can run `make up` instead of remembering the full docker compose command. Includes: `up`, `down`, `restart`, `logs`, `migrate`, `shell`, `test`, `lint`, `seed`, `init`, `status`.

**`.editorconfig`** — Enforces consistent indentation: 4 spaces for Python, 2 spaces for TypeScript/JSON/YAML, tabs for Makefile. Prevents formatting disagreements between VS Code, PyCharm, and any other editor.

**`CONTRIBUTING.md`** — Documents the branch naming convention, commit message format, and PR process. The agent reads this during sessions to ensure its commit suggestions follow your workflow.

**`docs/ARCHITECTURE.md`** — High-level AEGIS zone diagram and service list. The agent references this when it needs to understand how components connect without re-reading all 85 specs.

**`docs/ONBOARDING.md`** — Step-by-step guide: install WSL2, install Docker Desktop, configure Ollama, run the structure script, configure `.env`, run `make init`. A new team member should be running the system in under two hours following this guide.

**`backend/.dockerignore`** — Excludes `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.env`, `tests/`. Without this, the Docker build context includes gigabytes of unnecessary files and the image build is slow.

**`frontend/.dockerignore`** — Excludes `node_modules/`, `.next/`, `.env.local`, `*.log`. Same reason — keeps the image build fast and the image small.

---

## COMPLETE ANNOTATED DIRECTORY TREE
### Every directory and file. Every file marked [S] (script) or [A: spec] (agent).

```
aegis-project/                              ← your project root (~/aegis-project/)
│
├── .editorconfig                           [S] code formatting rules for all editors
├── .env.example                            [S] environment variable template (safe to commit)
├── .gitignore                              [S] full gitignore with AEGIS-specific exclusions
├── CONTRIBUTING.md                         [S] branch naming, commit format, PR process
├── Makefile                                [S] shortcuts: make up, make migrate, make test
├── README.md                               [S] project overview, quick start
├── docker-compose.yml                      [A: IMPL_03] all 19 services — demo deployment
├── docker-compose.prod.yml                 [S] empty placeholder — agent updates in IMPL_03
│
├── docs/                                   ← project-level documentation (not in specs)
│   ├── ARCHITECTURE.md                     [S] AEGIS zone diagram, all 19 services listed
│   └── ONBOARDING.md                       [S] new developer setup guide end-to-end
│
├── guides/                                 ← pre-implementation guides [EXISTS]
│   ├── PRE_IMPLEMENTATION_MASTER_PLAN.md   [EXISTS] phases A–K
│   ├── OLLAMA_MODEL_GUIDE_CORRECTED.md     [EXISTS] Qwen model download guide
│   ├── AEGIS_DIRECTORY_STRUCTURE.md        [EXISTS] this document
│   ├── create_aegis_structure.sh           [EXISTS] the bash script
│   └── GITHUB_SETUP_GUIDE.md               [EXISTS] GitHub setup guide
│
├── specs/                                  ← all 85 specification documents [EXISTS]
│   ├── tier0_agent_guide/
│   ├── tier1_foundation/
│   ├── tier2_implementation/               ← IMPL_01 through IMPL_29
│   │   ├── IMPL_01_DEPENDENCIES.md
│   │   ├── IMPL_02_ENVIRONMENT_SETUP.md
│   │   ├── IMPL_03_DOCKER_INFRASTRUCTURE.md
│   │   ├── IMPL_04_MODELS_SETUP.md
│   │   ├── IMPL_05_DATA_LAYER_POSTGRESQL.md
│   │   ├── IMPL_06_DATA_LAYER_QDRANT.md
│   │   ├── IMPL_07_DATA_LAYER_OPENSEARCH.md
│   │   ├── IMPL_08_DATA_LAYER_REDIS.md
│   │   ├── IMPL_09_SECURITY_NGINX_GOVERNANCE.md
│   │   ├── IMPL_10_SECURITY_IDENTITY_SECRETS.md
│   │   ├── IMPL_11_ORCHESTRATION_ZONE_B.md
│   │   ├── IMPL_12_QUERY_INTELLIGENCE.md
│   │   ├── IMPL_13_VISION_SERVICE.md
│   │   ├── IMPL_14_RETRIEVAL_STAGES_1_TO_5.md
│   │   ├── IMPL_15_RETRIEVAL_STAGES_6_TO_8.md
│   │   ├── IMPL_16_REASONING_SERVICE.md
│   │   ├── IMPL_17_VALIDATION_ENGINE.md
│   │   ├── IMPL_18_INGESTION_PIPELINE.md
│   │   ├── IMPL_19_EMPLOYEE_FRONTEND.md
│   │   ├── IMPL_20_ADMIN_PORTAL_OBSERVABILITY.md
│   │   ├── IMPL_21_FIX_SESSION.md
│   │   ├── IMPL_22_FINAL_POLISH.md
│   │   ├── IMPL_23_QUICK_ENTRY_OVERVIEW.md
│   │   ├── IMPL_24_QUICK_ENTRY_DATA_MODEL.md
│   │   ├── IMPL_25_QUICK_ENTRY_API_ENDPOINTS.md
│   │   ├── IMPL_26_QUICK_ENTRY_PROCESSING_PIPELINE.md
│   │   ├── IMPL_27_QUICK_ENTRY_CHUNKING_ENGINE.md
│   │   ├── IMPL_28_QUICK_ENTRY_SCREENSHOT_PIPELINE.md
│   │   ├── IMPL_29_QUICK_ENTRY_OPERATIONAL_SYSTEMS.md
│   │   ├── IMPL_PATCH_01_MISSING_CONSTANTS_AND_ADMIN_HANDLER.md
│   │   ├── IMPL_PATCH_02_CRITICAL_BUG_FIXES.md
│   │   └── IMPL_PATCH_03_QUALITY_FIXES.md
│   ├── tier3_verification/
│   └── tier4_frontend/                     ← FRONTEND_01 through FRONTEND_40
│       ├── FRONTEND_01_DESIGN_SYSTEM.md
│       ├── FRONTEND_02_ARCHITECTURE.md
│       ├── FRONTEND_03_TAILWIND_GLOBALS.md
│       ├── FRONTEND_04_DEPENDENCIES.md
│       ├── FRONTEND_05_CORE_COMPONENTS.md
│       ├── FRONTEND_06_DATA_COMPONENTS.md
│       ├── FRONTEND_07_OVERLAY_COMPONENTS.md
│       ├── FRONTEND_08_CHAT_COMPONENTS.md
│       ├── FRONTEND_09_LAYOUT_COMPONENTS.md
│       ├── FRONTEND_10_ZUSTAND_STORES.md
│       ├── FRONTEND_11_TANSTACK_QUERY.md
│       ├── FRONTEND_12_EMPLOYEE_CHAT.md
│       ├── FRONTEND_13_EMPLOYEE_CHAT_FEATURES.md
│       ├── FRONTEND_14_EMPLOYEE_HISTORY.md
│       ├── FRONTEND_15_EMPLOYEE_ONBOARDING.md
│       ├── FRONTEND_16_ADMIN_SHELL.md
│       ├── FRONTEND_17_ADMIN_DASHBOARD.md
│       ├── FRONTEND_18_ADMIN_DOCUMENTS.md
│       ├── FRONTEND_19_ADMIN_REGISTRY_CONFIG.md
│       ├── FRONTEND_20_ADMIN_GAPS_AUDIT.md
│       ├── FRONTEND_21_ADMIN_REVIEW_QUEUE.md
│       ├── FRONTEND_22_ADMIN_HEALTH_ANALYTICS.md
│       ├── FRONTEND_36_QUICK_ENTRY_LIST.md
│       ├── FRONTEND_37_QUICK_ENTRY_FORM.md
│       ├── FRONTEND_38_QUICK_ENTRY_SAP_ENTITY.md
│       ├── FRONTEND_39_QUICK_ENTRY_SCREENSHOTS.md
│       └── FRONTEND_40_SCREENSHOT_PROXY.md
│
├── backend/                                ← FastAPI app (Docker build context: ./backend)
│   ├── .dockerignore                       [S] excludes .venv, __pycache__, .env from image
│   ├── Dockerfile                          [A: IMPL_03] FastAPI + ARQ production image
│   ├── pyproject.toml                      [A: IMPL_01] project metadata, ruff, pytest config
│   ├── requirements.txt                    [A: IMPL_01] all production Python dependencies
│   ├── requirements-dev.txt                [A: IMPL_01] dev deps: pytest, ruff, httpx, etc.
│   │
│   └── app/
│       ├── __init__.py                     [S]
│       ├── config.py                       [A: IMPL_02] Settings class (reads all .env vars)
│       ├── main.py                         [A: IMPL_19, patched IMPL_21-22] FastAPI factory
│       ├── observability.py                [A: IMPL_20] Prometheus metrics, structured logging
│       ├── worker.py                       [A: IMPL_11] ARQ worker entry point
│       │
│       ├── handlers/                       ← HTTP + WebSocket route handlers (Zone B API)
│       │   ├── __init__.py                 [S]
│       │   ├── chat_handler.py             [A: IMPL_19, patched IMPL_21] /ws/chat WebSocket
│       │   ├── admin_handler.py            [A: IMPL_20, IMPL_25] all /api/admin/* endpoints
│       │   └── upload_handler.py           [A: IMPL_18] /api/admin/documents/upload
│       │
│       ├── infrastructure/                 ← external service clients (thin wrappers + retry)
│       │   ├── __init__.py                 [S]
│       │   ├── circuit_breaker.py          [A: IMPL_11] per-service circuit breaker
│       │   ├── opensearch_client.py        [A: IMPL_07] async client, BM25 search
│       │   ├── postgres_client.py          [A: IMPL_05, patched IMPL_21] async SQLAlchemy
│       │   ├── qdrant_client.py            [A: IMPL_06] 4 collections (meridian_errors,
│       │   │                               ←  meridian_procedures, meridian_configs, cache_queries)
│       │   └── redis_client.py             [A: IMPL_08, patched IMPL_21] session + ARQ
│       │
│       ├── middleware/                     ← Zone A enforcement inside FastAPI
│       │   ├── __init__.py                 [S]
│       │   ├── authentication.py           [A: IMPL_09, patched IMPL_21] JWT + Keycloak
│       │   ├── input_governance.py         [A: IMPL_09] Content Governance — input side
│       │   ├── output_governance.py        [A: IMPL_09] Content Governance — output side
│       │   ├── rate_limiting.py            [A: IMPL_09] Redis sliding window per employee
│       │   └── trace_id.py                 [A: IMPL_09] trace_id injection + propagation
│       │
│       ├── models/                         ← Pydantic data models (NOT ORM — dataclasses)
│       │   ├── __init__.py                 [S]
│       │   ├── api.py                      [A: IMPL_11] ChatRequest, ChatResponse, AdminModels
│       │   ├── retrieval.py                [A: IMPL_11] EnrichedQuery, RetrievedChunk, CRAG
│       │   └── session.py                  [A: IMPL_11] ConversationState, SessionMessage
│       │
│       ├── services/                       ← business logic (Zone B + Zone C pipeline)
│       │   ├── __init__.py                 [S]
│       │   ├── ingestion_pipeline.py       [A: IMPL_18] 11-stage document ingestion
│       │   ├── model_gateway.py            [A: IMPL_16] Ollama/vLLM — single env var swap
│       │   ├── query_intelligence.py       [A: IMPL_12, patched IMPL_22] entity extraction
│       │   ├── reasoning_service.py        [A: IMPL_16] prompt construction + model call
│       │   ├── retrieval_engine.py         [A: IMPL_14-15, patched IMPL_21] tri-modal retrieval
│       │   ├── validation_engine.py        [A: IMPL_17] three-tier validation engine
│       │   ├── vision_integration.py       [A: IMPL_13] screenshot classification + dispatch
│       │   ├── form_validator.py           [A: IMPL_25] Quick Entry form schema validation
│       │   ├── form_chunker.py             [A: IMPL_27] structure-aware chunking, 3 types
│       │   └── form_import_parser.py       [A: IMPL_29] DOCX/PDF → form pre-fill parser
│       │
│       ├── routers/                        ← Quick Entry REST router (IMPL_25 addition)
│       │   ├── __init__.py                 [S]
│       │   └── knowledge_entries.py        [A: IMPL_25] 11 Quick Entry CRUD endpoints
│       │
│       ├── clients/                        ← Quick Entry vision client (IMPL_28 addition)
│       │   ├── __init__.py                 [S]
│       │   └── ollama_vision.py            [A: IMPL_28] classify_sap() + extract_sap_content()
│       │
│       ├── tasks/                          ← ARQ background tasks (worker container)
│       │   ├── __init__.py                 [S]
│       │   ├── audit_task.py               [A: IMPL_11] async audit log write
│       │   ├── cache_task.py               [A: IMPL_11] semantic cache population
│       │   ├── cleanup_task.py             [A: IMPL_11] stale session + MinIO nightly cleanup
│       │   ├── feedback_task.py            [A: IMPL_11] feedback retrieval/generation diagnosis
│       │   ├── knowledge_gap_task.py       [A: IMPL_11] gap event + admin notification
│       │   ├── ticket_task.py              [A: IMPL_11] mock ticket create + status update
│       │   ├── vision_task.py              [A: IMPL_13] async vision enrichment for ingestion
│       │   ├── process_form_entry.py       [A: IMPL_26] Quick Entry pipeline stages A1–A13
│       │   ├── enrich_entry_screenshots.py [A: IMPL_28] screenshot enrichment V1–V10
│       │   └── retry_partial_indexing.py   [A: IMPL_26] Qdrant/OpenSearch retry with backoff
│       │
│       └── workers/
│           ├── __init__.py                 [S]
│           └── arq_worker.py               [A: IMPL_11] ARQ config, all task registrations
│
├── services/                               ← separate Python microservices, own containers
│   │
│   ├── bge-embedding/                      ← BGE-base-en-v1.5 dense embedding, 768-dim
│   │   ├── Dockerfile                      [A: IMPL_03] CPU-optimised torch image
│   │   ├── main.py                         [A: IMPL_04] FastAPI: /embed, /embed-single
│   │   ├── requirements.txt                [A: IMPL_01] sentence-transformers, torch, fastapi
│   │   └── README.md                       [S] service description, API contract, port
│   │
│   └── deberta-nli/                        ← DeBERTa-v3-large-mnli NLI validation
│       ├── Dockerfile                      [A: IMPL_03] CPU-optimised torch image
│       ├── main.py                         [A: IMPL_04] FastAPI: /nli (premise+hypothesis)
│       ├── requirements.txt                [A: IMPL_01] transformers, torch, fastapi
│       └── README.md                       [S] service description, API contract, port
│
├── frontend/                               ← Next.js 14 App Router (employee + admin)
│   ├── .dockerignore                       [S] excludes node_modules, .next from image
│   ├── .env.local.example                  [S] NEXT_PUBLIC_API_URL, NEXTAUTH_SECRET template
│   ├── Dockerfile                          [A: IMPL_03, patched IMPL_21] production image
│   ├── next.config.js                      [A: IMPL_02] Next.js config
│   ├── package.json                        [A: IMPL_02] all frontend dependencies
│   ├── postcss.config.js                   [A: IMPL_02] PostCSS config
│   ├── tailwind.config.js                  [A: IMPL_02] Tailwind config with design tokens
│   ├── tsconfig.json                       [A: IMPL_02] TypeScript config
│   │
│   └── src/
│       ├── app/                            ← Next.js App Router pages
│       │   ├── layout.tsx                  [A: FE_02] root layout (providers, fonts)
│       │   ├── fonts.ts                    [A: FE_02] font definitions
│       │   ├── globals.css                 [A: FE_03] CSS vars, Tailwind base, design tokens
│       │   ├── error.tsx                   [A: FE_02] global error boundary page
│       │   ├── not-found.tsx               [A: FE_02] 404 page
│       │   ├── login/page.tsx              [A: FE_15] root-level login fallback
│       │   │
│       │   ├── (admin)/                    ← route group: admin shell wraps all admin pages
│       │   │   ├── layout.tsx              [A: FE_16] admin shell with sidebar
│       │   │   └── admin/
│       │   │       ├── dashboard/page.tsx          [A: FE_17] admin dashboard
│       │   │       ├── documents/page.tsx           [A: FE_18] document upload + ingestion
│       │   │       ├── registry/page.tsx            [A: FE_19] Z-Error / Known Patterns
│       │   │       ├── config-snapshot/page.tsx     [A: FE_19] Config Snapshot management
│       │   │       ├── knowledge-gaps/page.tsx      [A: FE_20] knowledge gap events
│       │   │       ├── audit-trail/page.tsx         [A: FE_20] employee audit log
│       │   │       ├── review-queue/page.tsx        [A: FE_21] human review queue
│       │   │       ├── tickets/page.tsx             [A: FE_21] mock ticket management
│       │   │       ├── system-health/page.tsx       [A: FE_22] service health grid
│       │   │       ├── analytics/page.tsx           [A: FE_22] quality metrics + charts
│       │   │       └── quick-entry/
│       │   │           ├── page.tsx                 [A: FE_36] Quick Entry list page
│       │   │           ├── new/page.tsx             [A: FE_37] create Quick Entry
│       │   │           └── [id]/page.tsx            [A: FE_37] edit Quick Entry
│       │   │
│       │   ├── (employee)/                 ← route group: employee shell layout
│       │   │   ├── layout.tsx              [A: FE_09] employee shell with topbar
│       │   │   ├── page.tsx                [A: FE_12] main chat interface
│       │   │   └── history/page.tsx        [A: FE_14] conversation history
│       │   │
│       │   ├── (auth)/                     ← route group: no shell (full-page)
│       │   │   └── login/page.tsx          [A: FE_15] Keycloak login redirect
│       │   │
│       │   └── api/                        ← Next.js API routes (server-side only)
│       │       ├── auth/
│       │       │   ├── keycloak-token/route.ts     [A: FE_02, patched IMPL_21]
│       │       │   └── ws-token/route.ts           [A: FE_02, patched IMPL_21]
│       │       ├── proxy/[...path]/route.ts        [A: FE_02, patched IMPL_21]
│       │       ├── screenshots/[...path]/route.ts  [A: FE_40] MinIO proxy (IMPL_28)
│       │       └── upload/
│       │           ├── document/route.ts           [A: FE_18] document upload
│       │           └── screenshot/route.ts         [A: FE_39] screenshot upload
│       │
│       ├── components/
│       │   ├── admin/                      ← admin-specific components (FE_06, 17-22)
│       │   │   ├── charts/                 ← Recharts chart components
│       │   │   │   ├── CachePerformanceChart.tsx   [A: FE_22]
│       │   │   │   ├── ChartTooltip.tsx            [A: FE_22]
│       │   │   │   ├── ConfidenceDistChart.tsx     [A: FE_22]
│       │   │   │   ├── QueryVolumeChart.tsx        [A: FE_22]
│       │   │   │   ├── ResponsiveChart.tsx         [A: FE_22]
│       │   │   │   ├── RetrievalModeChart.tsx      [A: FE_22]
│       │   │   │   ├── TopModulesChart.tsx         [A: FE_22]
│       │   │   │   └── ValidationScoreChart.tsx    [A: FE_22]
│       │   │   ├── AdminEmptyPage.tsx              [A: FE_16]
│       │   │   ├── AdminNav.tsx                    [A: FE_16]
│       │   │   ├── AdminPageHeader.tsx             [A: FE_16]
│       │   │   ├── AdminPageWrapper.tsx            [A: FE_16]
│       │   │   ├── AdminStatRow.tsx                [A: FE_17]
│       │   │   ├── AdminTopbar.tsx                 [A: FE_16]
│       │   │   ├── AuditTimeline.tsx               [A: FE_20]
│       │   │   ├── BulkActionBar.tsx               [A: FE_18]
│       │   │   ├── ClaimHighlighter.tsx            [A: FE_21]
│       │   │   ├── DashboardRefreshIndicator.tsx   [A: FE_17]
│       │   │   ├── DataTable.tsx                   [A: FE_06]
│       │   │   ├── DocumentMetadataModal.tsx       [A: FE_18]
│       │   │   ├── EmptyState.tsx                  [A: FE_06]
│       │   │   ├── FilterChips.tsx                 [A: FE_06]
│       │   │   ├── GapCard.tsx                     [A: FE_20]
│       │   │   ├── GapEventsList.tsx               [A: FE_20]
│       │   │   ├── IngestionProgressRow.tsx        [A: FE_18]
│       │   │   ├── InlineEditCell.tsx              [A: FE_19]
│       │   │   ├── KanbanCard.tsx                  [A: FE_21]
│       │   │   ├── KanbanColumn.tsx                [A: FE_21]
│       │   │   ├── MetricCard.tsx                  [A: FE_17]
│       │   │   ├── ReviewItemDetail.tsx            [A: FE_21]
│       │   │   ├── ReviewItemList.tsx              [A: FE_21]
│       │   │   ├── ServiceStatusGrid.tsx           [A: FE_22]
│       │   │   ├── ServiceTile.tsx                 [A: FE_22]
│       │   │   ├── StalenessIndicator.tsx          [A: FE_19]
│       │   │   └── UploadDropZone.tsx              [A: FE_18]
│       │   │
│       │   ├── chat/                       ← employee chat components (FE_08, 12-13)
│       │   │   ├── AIResponseBubble.tsx            [A: FE_08]
│       │   │   ├── AttributionPanel.tsx            [A: FE_08]
│       │   │   ├── AttributionPanelShell.tsx       [A: FE_08]
│       │   │   ├── ChatEmptyState.tsx              [A: FE_08]
│       │   │   ├── ChatInterface.tsx               [A: FE_12]
│       │   │   ├── ComposeBar.tsx                  [A: FE_08]
│       │   │   ├── ConfidenceBadge.tsx             [A: FE_08]
│       │   │   ├── EntityChip.tsx                  [A: FE_08]
│       │   │   ├── FreshnessIndicator.tsx          [A: FE_08]
│       │   │   ├── MessageList.tsx                 [A: FE_08]
│       │   │   ├── RelatedQuestions.tsx            [A: FE_08]
│       │   │   ├── ResponseActions.tsx             [A: FE_08]
│       │   │   ├── SAPEntityHighlighter.tsx        [A: FE_08]
│       │   │   ├── ScoreBreakdown.tsx              [A: FE_08]
│       │   │   ├── ScreenshotDropZone.tsx          [A: FE_08]
│       │   │   ├── ScreenshotThumbnail.tsx         [A: FE_08]
│       │   │   ├── StreamingCursor.tsx             [A: FE_08]
│       │   │   ├── StreamingProgress.tsx           [A: FE_08]
│       │   │   └── UserBubble.tsx                  [A: FE_08]
│       │   │
│       │   ├── onboarding/                 ← first-time employee onboarding (FE_15)
│       │   │   ├── OnboardingModal.tsx             [A: FE_15]
│       │   │   ├── OnboardingProgress.tsx          [A: FE_15]
│       │   │   └── OnboardingStep.tsx              [A: FE_15]
│       │   │
│       │   ├── pdf/                        ← conversation export to PDF (FE_14)
│       │   │   └── SessionDocument.tsx             [A: FE_14]
│       │   │
│       │   ├── quick-entry/                ← all 26 Quick Entry components (FE_36-40)
│       │   │   ├── ArchiveConfirmModal.tsx         [A: FE_36]
│       │   │   ├── AttributionScreenshotsSection.tsx [A: FE_40]
│       │   │   ├── AutoSaveIndicator.tsx           [A: FE_37]
│       │   │   ├── ChunkPreviewDrawer.tsx          [A: FE_37]
│       │   │   ├── ConfigFormFields.tsx            [A: FE_38]
│       │   │   ├── ConflictDrawer.tsx              [A: FE_37]
│       │   │   ├── ContentTypeSelector.tsx         [A: FE_37]
│       │   │   ├── CoverageSearchBar.tsx           [A: FE_36]
│       │   │   ├── DuplicateCheckModal.tsx         [A: FE_37]
│       │   │   ├── ErrorGuideFormFields.tsx        [A: FE_38]
│       │   │   ├── FormHeaderSection.tsx           [A: FE_37]
│       │   │   ├── OnboardingModal.tsx             [A: FE_36]
│       │   │   ├── ProcedureFormFields.tsx         [A: FE_38]
│       │   │   ├── ProcessingStatusDrawer.tsx      [A: FE_36]
│       │   │   ├── QuickEntryFeedbackBadge.tsx     [A: FE_36]
│       │   │   ├── QuickEntryFilters.tsx           [A: FE_36]
│       │   │   ├── QuickEntryForm.tsx              [A: FE_37]
│       │   │   ├── QuickEntryFormActions.tsx       [A: FE_37]
│       │   │   ├── QuickEntryListCard.tsx          [A: FE_36]
│       │   │   ├── QuickEntrySourceBadge.tsx       [A: FE_36]
│       │   │   ├── QuickEntryStatusBadge.tsx       [A: FE_36]
│       │   │   ├── SapEntityPanel.tsx              [A: FE_38]
│       │   │   ├── ScreenshotLightbox.tsx          [A: FE_40]
│       │   │   ├── ScreenshotThumbnail.tsx         [A: FE_40]
│       │   │   ├── ScreenshotUploadZone.tsx        [A: FE_39]
│       │   │   └── VersionHistoryDrawer.tsx        [A: FE_37]
│       │   │
│       │   ├── sessions/                   ← conversation history components (FE_14)
│       │   │   ├── HistoryFilters.tsx              [A: FE_14]
│       │   │   ├── HistorySessionCard.tsx          [A: FE_14]
│       │   │   ├── SessionCard.tsx                 [A: FE_14]
│       │   │   ├── SessionContextMenu.tsx          [A: FE_14]
│       │   │   ├── SessionSearch.tsx               [A: FE_14]
│       │   │   └── SessionSidebar.tsx              [A: FE_14]
│       │   │
│       │   ├── shared/                     ← cross-cutting components
│       │   │   ├── providers/
│       │   │   │   ├── QueryProvider.tsx           [A: FE_04]
│       │   │   │   ├── ThemeProvider.tsx           [A: FE_04]
│       │   │   │   └── ToastProvider.tsx           [A: FE_04]
│       │   │   ├── CommandPalette.tsx              [A: FE_13]
│       │   │   ├── ConfirmDialog.tsx               [A: FE_07]
│       │   │   ├── EmployeeTopbar.tsx              [A: FE_09]
│       │   │   ├── ErrorBoundary.tsx               [A: FE_02]
│       │   │   ├── KeyboardShortcutsOverlay.tsx    [A: FE_13]
│       │   │   ├── LoadingScreen.tsx               [A: FE_07]
│       │   │   ├── OfflineBanner.tsx               [A: FE_07]
│       │   │   ├── PageTransition.tsx              [A: FE_07]
│       │   │   └── ThemeToggle.tsx                 [A: FE_07]
│       │   │
│       │   └── ui/                         ← primitive shadcn/ui components (FE_05)
│       │       ├── drawer.tsx                      [A: FE_07]
│       │       ├── spinner.tsx                     [A: FE_05]
│       │       └── status-dot.tsx                  [A: FE_05]
│       │
│       ├── hooks/
│       │   ├── queries/                    ← TanStack Query hooks (FE_11)
│       │   │   ├── adminAnalytics.ts               [A: FE_11]
│       │   │   ├── adminData.ts                    [A: FE_11]
│       │   │   ├── adminMetrics.ts                 [A: FE_11]
│       │   │   ├── index.ts                        [A: FE_11]
│       │   │   ├── mutations.ts                    [A: FE_11]
│       │   │   ├── preferences.ts                  [A: FE_11]
│       │   │   └── sessions.ts                     [A: FE_11]
│       │   ├── useAuth.ts                          [A: FE_11]
│       │   ├── useAutoSave.ts                      [A: FE_37] 30-second autosave
│       │   ├── useChatKeyboardShortcuts.ts         [A: FE_13]
│       │   ├── useCommandPalette.ts                [A: FE_13]
│       │   ├── useCountUp.ts                       [A: FE_06]
│       │   ├── useDebounce.ts                      [A: FE_06]
│       │   ├── useKeyboardShortcuts.ts             [A: FE_13]
│       │   ├── useLocalStorage.ts                  [A: FE_06]
│       │   ├── useMediaQuery.ts                    [A: FE_06]
│       │   ├── usePolling.ts                       [A: FE_11]
│       │   ├── useQuickEntry.ts                    [A: FE_36]
│       │   ├── useSapEntityDetector.ts             [A: FE_38]
│       │   └── useWebSocket.ts                     [A: FE_12]
│       │
│       ├── lib/
│       │   ├── animations.ts                       [A: FE_07]
│       │   ├── api.ts                              [A: FE_02, patched IMPL_21]
│       │   ├── auth.ts                             [A: FE_02, patched IMPL_21]
│       │   ├── chunkAssembler.ts                   [A: FE_37, IMPL_27] TS port of form_chunker
│       │   ├── constants.ts                        [A: FE_02, IMPL_23 Section 9]
│       │   ├── csvExport.ts                        [A: FE_20]
│       │   ├── errorCodes.ts                       [A: FE_02]
│       │   ├── queryKeys.ts                        [A: FE_11] TanStack Query key factory
│       │   ├── sapEntityDetector.ts                [A: FE_38]
│       │   ├── sessionExport.ts                    [A: FE_14] PDF/text export
│       │   ├── toast.ts                            [A: FE_07]
│       │   └── utils.ts                            [A: FE_02]
│       │
│       ├── stores/                         ← Zustand global state (FE_10)
│       │   ├── adminStore.ts               [A: FE_10]
│       │   ├── chatStore.ts                [A: FE_10]
│       │   ├── panelStore.ts               [A: FE_10] attribution panel open/closed
│       │   ├── sessionStore.ts             [A: FE_10]
│       │   └── uiStore.ts                  [A: FE_10]
│       │
│       └── types/
│           └── index.ts                    [A: FE_02, IMPL_23 Section 8] all TS interfaces
│
├── alembic/                                ← PostgreSQL database migrations
│   ├── alembic.ini                         [A: IMPL_05] Alembic config
│   ├── env.py                              [A: IMPL_05] migration environment
│   ├── script.py.mako                      [A: IMPL_05] migration file template
│   └── versions/
│       ├── README.md                       [S] migration naming convention
│       └── [migration files]               [A: IMPL_05, IMPL_24] — agent creates
│           e.g. 20250527_000000_initial_schema.py
│               20250527_000001_quick_entry_tables.py
│
├── scripts/                                ← operational scripts (exact names from IMPL docs)
│   ├── init_database.py                    [A: IMPL_05] run Alembic migrations
│   ├── init_opensearch.py                  [A: IMPL_07] create aegis_knowledge index + mapping
│   ├── init_qdrant.py                      [A: IMPL_06] create 4 Qdrant collections
│   ├── model_info.txt                      [S] empty — setup_models.py writes into this
│   ├── seed_test_documents.py              [A: IMPL_02] seed sample SAP documents
│   ├── setup_keycloak.py                   [A: IMPL_10] create realm, clients, roles, users
│   ├── setup_models.py                     [A: IMPL_04] pull Ollama models, verify services
│   ├── setup_vault.py                      [A: IMPL_10] AppRole, dynamic credentials, Transit
│   ├── verify_deps.py                      [A: IMPL_01] check Python + system dependencies
│   ├── verify_health.py                    [A: IMPL_04] curl all 19 service health endpoints
│   ├── verify_redis.py                     [A: IMPL_08] test Redis session + ARQ connections
│   └── warmup_models.py                    [A: IMPL_04] pre-load Ollama models into RAM
│
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml                  [A: IMPL_20] scrape configs for all 19 services
│   │   └── rules/
│   │       └── aegis_alerts.yml            [A: IMPL_20] alert rules (confidence drop, etc.)
│   └── grafana/
│       ├── datasources/
│       │   └── prometheus.yml              [A: IMPL_20] Prometheus datasource config
│       └── dashboards/
│           └── aegis_overview.json         [A: IMPL_20] main Grafana dashboard JSON
│
└── tests/
    ├── __init__.py                         [S]
    ├── conftest.py                         [A: IMPL_01] shared fixtures, test db setup
    ├── unit/
    │   ├── __init__.py                     [S]
    │   ├── test_input_governance.py        [A: IMPL_09] governance rule unit tests
    │   ├── test_query_intelligence.py      [A: IMPL_12]
    │   ├── test_form_chunker.py            [A: IMPL_27] Quick Entry chunker tests
    │   ├── test_form_validator.py          [A: IMPL_25]
    │   └── test_retrieval_engine.py        [A: IMPL_14-15]
    └── integration/
        ├── __init__.py                     [S]
        └── test_pipeline.py                [A: IMPL_11+] end-to-end pipeline test
```

---

## FULL FINAL REFERENCE TREE — FOR COPILOT VERIFICATION
### This section shows the complete project as it will look after ALL implementation sessions.
### PURPOSE: Copilot uses this to verify that all files have been created correctly.
### INSTRUCTION TO COPILOT: "Check my project structure against this reference tree.
### List any files shown here that are missing from my project."
### NOTE: Do not create these files manually. Follow the specs for all source files.

```
aegis-project/
├── .editorconfig
├── .env.example
├── .gitignore
├── CONTRIBUTING.md
├── Makefile
├── README.md
├── docker-compose.yml
├── docker-compose.prod.yml
│
├── docs/
│   ├── ARCHITECTURE.md
│   └── ONBOARDING.md
│
├── guides/
│   ├── AEGIS_DIRECTORY_STRUCTURE.md
│   ├── GITHUB_SETUP_GUIDE.md
│   ├── OLLAMA_MODEL_GUIDE_CORRECTED.md
│   ├── PRE_IMPLEMENTATION_MASTER_PLAN.md
│   └── create_aegis_structure.sh
│
├── specs/
│   ├── tier0_agent_guide/
│   ├── tier1_foundation/
│   ├── tier2_implementation/
│   │   ├── IMPL_01_DEPENDENCIES.md
│   │   ├── IMPL_02_ENVIRONMENT_SETUP.md
│   │   ├── IMPL_03_DOCKER_INFRASTRUCTURE.md
│   │   ├── IMPL_04_MODELS_SETUP.md
│   │   ├── IMPL_05_DATA_LAYER_POSTGRESQL.md
│   │   ├── IMPL_06_DATA_LAYER_QDRANT.md
│   │   ├── IMPL_07_DATA_LAYER_OPENSEARCH.md
│   │   ├── IMPL_08_DATA_LAYER_REDIS.md
│   │   ├── IMPL_09_SECURITY_NGINX_GOVERNANCE.md
│   │   ├── IMPL_10_SECURITY_IDENTITY_SECRETS.md
│   │   ├── IMPL_11_ORCHESTRATION_ZONE_B.md
│   │   ├── IMPL_12_QUERY_INTELLIGENCE.md
│   │   ├── IMPL_13_VISION_SERVICE.md
│   │   ├── IMPL_14_RETRIEVAL_STAGES_1_TO_5.md
│   │   ├── IMPL_15_RETRIEVAL_STAGES_6_TO_8.md
│   │   ├── IMPL_16_REASONING_SERVICE.md
│   │   ├── IMPL_17_VALIDATION_ENGINE.md
│   │   ├── IMPL_18_INGESTION_PIPELINE.md
│   │   ├── IMPL_19_EMPLOYEE_FRONTEND.md
│   │   ├── IMPL_20_ADMIN_PORTAL_OBSERVABILITY.md
│   │   ├── IMPL_21_FIX_SESSION.md
│   │   ├── IMPL_22_FINAL_POLISH.md
│   │   ├── IMPL_23_QUICK_ENTRY_OVERVIEW.md
│   │   ├── IMPL_24_QUICK_ENTRY_DATA_MODEL.md
│   │   ├── IMPL_25_QUICK_ENTRY_API_ENDPOINTS.md
│   │   ├── IMPL_26_QUICK_ENTRY_PROCESSING_PIPELINE.md
│   │   ├── IMPL_27_QUICK_ENTRY_CHUNKING_ENGINE.md
│   │   ├── IMPL_28_QUICK_ENTRY_SCREENSHOT_PIPELINE.md
│   │   ├── IMPL_29_QUICK_ENTRY_OPERATIONAL_SYSTEMS.md
│   │   ├── IMPL_PATCH_01_MISSING_CONSTANTS_AND_ADMIN_HANDLER.md
│   │   ├── IMPL_PATCH_02_CRITICAL_BUG_FIXES.md
│   │   └── IMPL_PATCH_03_QUALITY_FIXES.md
│   ├── tier3_verification/
│   └── tier4_frontend/
│       ├── FRONTEND_01_DESIGN_SYSTEM.md
│       ├── FRONTEND_02_ARCHITECTURE.md
│       ├── FRONTEND_03_TAILWIND_GLOBALS.md
│       ├── FRONTEND_04_DEPENDENCIES.md
│       ├── FRONTEND_05_CORE_COMPONENTS.md
│       ├── FRONTEND_06_DATA_COMPONENTS.md
│       ├── FRONTEND_07_OVERLAY_COMPONENTS.md
│       ├── FRONTEND_08_CHAT_COMPONENTS.md
│       ├── FRONTEND_09_LAYOUT_COMPONENTS.md
│       ├── FRONTEND_10_ZUSTAND_STORES.md
│       ├── FRONTEND_11_TANSTACK_QUERY.md
│       ├── FRONTEND_12_EMPLOYEE_CHAT.md
│       ├── FRONTEND_13_EMPLOYEE_CHAT_FEATURES.md
│       ├── FRONTEND_14_EMPLOYEE_HISTORY.md
│       ├── FRONTEND_15_EMPLOYEE_ONBOARDING.md
│       ├── FRONTEND_16_ADMIN_SHELL.md
│       ├── FRONTEND_17_ADMIN_DASHBOARD.md
│       ├── FRONTEND_18_ADMIN_DOCUMENTS.md
│       ├── FRONTEND_19_ADMIN_REGISTRY_CONFIG.md
│       ├── FRONTEND_20_ADMIN_GAPS_AUDIT.md
│       ├── FRONTEND_21_ADMIN_REVIEW_QUEUE.md
│       ├── FRONTEND_22_ADMIN_HEALTH_ANALYTICS.md
│       ├── FRONTEND_36_QUICK_ENTRY_LIST.md
│       ├── FRONTEND_37_QUICK_ENTRY_FORM.md
│       ├── FRONTEND_38_QUICK_ENTRY_SAP_ENTITY.md
│       ├── FRONTEND_39_QUICK_ENTRY_SCREENSHOTS.md
│       └── FRONTEND_40_SCREENSHOT_PROXY.md
│
├── backend/
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── app/
│       ├── __init__.py
│       ├── config.py
│       ├── main.py
│       ├── observability.py
│       ├── worker.py
│       ├── handlers/
│       │   ├── __init__.py
│       │   ├── admin_handler.py
│       │   ├── chat_handler.py
│       │   └── upload_handler.py
│       ├── infrastructure/
│       │   ├── __init__.py
│       │   ├── circuit_breaker.py
│       │   ├── opensearch_client.py
│       │   ├── postgres_client.py
│       │   ├── qdrant_client.py
│       │   └── redis_client.py
│       ├── middleware/
│       │   ├── __init__.py
│       │   ├── authentication.py
│       │   ├── input_governance.py
│       │   ├── output_governance.py
│       │   ├── rate_limiting.py
│       │   └── trace_id.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── api.py
│       │   ├── retrieval.py
│       │   └── session.py
│       ├── services/
│       │   ├── __init__.py
│       │   ├── form_chunker.py
│       │   ├── form_import_parser.py
│       │   ├── form_validator.py
│       │   ├── ingestion_pipeline.py
│       │   ├── model_gateway.py
│       │   ├── query_intelligence.py
│       │   ├── reasoning_service.py
│       │   ├── retrieval_engine.py
│       │   ├── validation_engine.py
│       │   └── vision_integration.py
│       ├── routers/
│       │   ├── __init__.py
│       │   └── knowledge_entries.py
│       ├── clients/
│       │   ├── __init__.py
│       │   └── ollama_vision.py
│       ├── tasks/
│       │   ├── __init__.py
│       │   ├── audit_task.py
│       │   ├── cache_task.py
│       │   ├── cleanup_task.py
│       │   ├── enrich_entry_screenshots.py
│       │   ├── feedback_task.py
│       │   ├── knowledge_gap_task.py
│       │   ├── process_form_entry.py
│       │   ├── retry_partial_indexing.py
│       │   ├── ticket_task.py
│       │   └── vision_task.py
│       └── workers/
│           ├── __init__.py
│           └── arq_worker.py
│
├── services/
│   ├── bge-embedding/
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── main.py
│   │   └── requirements.txt
│   └── deberta-nli/
│       ├── Dockerfile
│       ├── README.md
│       ├── main.py
│       └── requirements.txt
│
├── frontend/
│   ├── .dockerignore
│   ├── .env.local.example
│   ├── Dockerfile
│   ├── next.config.js
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── (admin)/
│       │   │   ├── admin/
│       │   │   │   ├── analytics/page.tsx
│       │   │   │   ├── audit-trail/page.tsx
│       │   │   │   ├── config-snapshot/page.tsx
│       │   │   │   ├── dashboard/page.tsx
│       │   │   │   ├── documents/page.tsx
│       │   │   │   ├── knowledge-gaps/page.tsx
│       │   │   │   ├── quick-entry/[id]/page.tsx
│       │   │   │   ├── quick-entry/new/page.tsx
│       │   │   │   ├── quick-entry/page.tsx
│       │   │   │   ├── registry/page.tsx
│       │   │   │   ├── review-queue/page.tsx
│       │   │   │   ├── system-health/page.tsx
│       │   │   │   └── tickets/page.tsx
│       │   │   └── layout.tsx
│       │   ├── (auth)/login/page.tsx
│       │   ├── (employee)/
│       │   │   ├── history/page.tsx
│       │   │   ├── layout.tsx
│       │   │   └── page.tsx
│       │   ├── api/
│       │   │   ├── auth/keycloak-token/route.ts
│       │   │   ├── auth/ws-token/route.ts
│       │   │   ├── proxy/[...path]/route.ts
│       │   │   ├── screenshots/[...path]/route.ts
│       │   │   ├── upload/document/route.ts
│       │   │   └── upload/screenshot/route.ts
│       │   ├── error.tsx
│       │   ├── fonts.ts
│       │   ├── globals.css
│       │   ├── layout.tsx
│       │   ├── login/page.tsx
│       │   └── not-found.tsx
│       ├── components/
│       │   ├── admin/
│       │   │   ├── charts/
│       │   │   │   ├── CachePerformanceChart.tsx
│       │   │   │   ├── ChartTooltip.tsx
│       │   │   │   ├── ConfidenceDistChart.tsx
│       │   │   │   ├── QueryVolumeChart.tsx
│       │   │   │   ├── ResponsiveChart.tsx
│       │   │   │   ├── RetrievalModeChart.tsx
│       │   │   │   ├── TopModulesChart.tsx
│       │   │   │   └── ValidationScoreChart.tsx
│       │   │   ├── AdminEmptyPage.tsx
│       │   │   ├── AdminNav.tsx
│       │   │   ├── AdminPageHeader.tsx
│       │   │   ├── AdminPageWrapper.tsx
│       │   │   ├── AdminStatRow.tsx
│       │   │   ├── AdminTopbar.tsx
│       │   │   ├── AuditTimeline.tsx
│       │   │   ├── BulkActionBar.tsx
│       │   │   ├── ClaimHighlighter.tsx
│       │   │   ├── DashboardRefreshIndicator.tsx
│       │   │   ├── DataTable.tsx
│       │   │   ├── DocumentMetadataModal.tsx
│       │   │   ├── EmptyState.tsx
│       │   │   ├── FilterChips.tsx
│       │   │   ├── GapCard.tsx
│       │   │   ├── GapEventsList.tsx
│       │   │   ├── IngestionProgressRow.tsx
│       │   │   ├── InlineEditCell.tsx
│       │   │   ├── KanbanCard.tsx
│       │   │   ├── KanbanColumn.tsx
│       │   │   ├── MetricCard.tsx
│       │   │   ├── ReviewItemDetail.tsx
│       │   │   ├── ReviewItemList.tsx
│       │   │   ├── ServiceStatusGrid.tsx
│       │   │   ├── ServiceTile.tsx
│       │   │   ├── StalenessIndicator.tsx
│       │   │   └── UploadDropZone.tsx
│       │   ├── chat/
│       │   │   ├── AIResponseBubble.tsx
│       │   │   ├── AttributionPanel.tsx
│       │   │   ├── AttributionPanelShell.tsx
│       │   │   ├── ChatEmptyState.tsx
│       │   │   ├── ChatInterface.tsx
│       │   │   ├── ComposeBar.tsx
│       │   │   ├── ConfidenceBadge.tsx
│       │   │   ├── EntityChip.tsx
│       │   │   ├── FreshnessIndicator.tsx
│       │   │   ├── MessageList.tsx
│       │   │   ├── RelatedQuestions.tsx
│       │   │   ├── ResponseActions.tsx
│       │   │   ├── SAPEntityHighlighter.tsx
│       │   │   ├── ScoreBreakdown.tsx
│       │   │   ├── ScreenshotDropZone.tsx
│       │   │   ├── ScreenshotThumbnail.tsx
│       │   │   ├── StreamingCursor.tsx
│       │   │   ├── StreamingProgress.tsx
│       │   │   └── UserBubble.tsx
│       │   ├── onboarding/
│       │   │   ├── OnboardingModal.tsx
│       │   │   ├── OnboardingProgress.tsx
│       │   │   └── OnboardingStep.tsx
│       │   ├── pdf/
│       │   │   └── SessionDocument.tsx
│       │   ├── quick-entry/
│       │   │   ├── ArchiveConfirmModal.tsx
│       │   │   ├── AttributionScreenshotsSection.tsx
│       │   │   ├── AutoSaveIndicator.tsx
│       │   │   ├── ChunkPreviewDrawer.tsx
│       │   │   ├── ConfigFormFields.tsx
│       │   │   ├── ConflictDrawer.tsx
│       │   │   ├── ContentTypeSelector.tsx
│       │   │   ├── CoverageSearchBar.tsx
│       │   │   ├── DuplicateCheckModal.tsx
│       │   │   ├── ErrorGuideFormFields.tsx
│       │   │   ├── FormHeaderSection.tsx
│       │   │   ├── OnboardingModal.tsx
│       │   │   ├── ProcedureFormFields.tsx
│       │   │   ├── ProcessingStatusDrawer.tsx
│       │   │   ├── QuickEntryFeedbackBadge.tsx
│       │   │   ├── QuickEntryFilters.tsx
│       │   │   ├── QuickEntryForm.tsx
│       │   │   ├── QuickEntryFormActions.tsx
│       │   │   ├── QuickEntryListCard.tsx
│       │   │   ├── QuickEntrySourceBadge.tsx
│       │   │   ├── QuickEntryStatusBadge.tsx
│       │   │   ├── SapEntityPanel.tsx
│       │   │   ├── ScreenshotLightbox.tsx
│       │   │   ├── ScreenshotThumbnail.tsx
│       │   │   ├── ScreenshotUploadZone.tsx
│       │   │   └── VersionHistoryDrawer.tsx
│       │   ├── sessions/
│       │   │   ├── HistoryFilters.tsx
│       │   │   ├── HistorySessionCard.tsx
│       │   │   ├── SessionCard.tsx
│       │   │   ├── SessionContextMenu.tsx
│       │   │   ├── SessionSearch.tsx
│       │   │   └── SessionSidebar.tsx
│       │   ├── shared/
│       │   │   ├── providers/
│       │   │   │   ├── QueryProvider.tsx
│       │   │   │   ├── ThemeProvider.tsx
│       │   │   │   └── ToastProvider.tsx
│       │   │   ├── CommandPalette.tsx
│       │   │   ├── ConfirmDialog.tsx
│       │   │   ├── EmployeeTopbar.tsx
│       │   │   ├── ErrorBoundary.tsx
│       │   │   ├── KeyboardShortcutsOverlay.tsx
│       │   │   ├── LoadingScreen.tsx
│       │   │   ├── OfflineBanner.tsx
│       │   │   ├── PageTransition.tsx
│       │   │   └── ThemeToggle.tsx
│       │   └── ui/
│       │       ├── drawer.tsx
│       │       ├── spinner.tsx
│       │       └── status-dot.tsx
│       ├── hooks/
│       │   ├── queries/
│       │   │   ├── adminAnalytics.ts
│       │   │   ├── adminData.ts
│       │   │   ├── adminMetrics.ts
│       │   │   ├── index.ts
│       │   │   ├── mutations.ts
│       │   │   ├── preferences.ts
│       │   │   └── sessions.ts
│       │   ├── useAuth.ts
│       │   ├── useAutoSave.ts
│       │   ├── useChatKeyboardShortcuts.ts
│       │   ├── useCommandPalette.ts
│       │   ├── useCountUp.ts
│       │   ├── useDebounce.ts
│       │   ├── useKeyboardShortcuts.ts
│       │   ├── useLocalStorage.ts
│       │   ├── useMediaQuery.ts
│       │   ├── usePolling.ts
│       │   ├── useQuickEntry.ts
│       │   ├── useSapEntityDetector.ts
│       │   └── useWebSocket.ts
│       ├── lib/
│       │   ├── animations.ts
│       │   ├── api.ts
│       │   ├── auth.ts
│       │   ├── chunkAssembler.ts
│       │   ├── constants.ts
│       │   ├── csvExport.ts
│       │   ├── errorCodes.ts
│       │   ├── queryKeys.ts
│       │   ├── sapEntityDetector.ts
│       │   ├── sessionExport.ts
│       │   ├── toast.ts
│       │   └── utils.ts
│       ├── stores/
│       │   ├── adminStore.ts
│       │   ├── chatStore.ts
│       │   ├── panelStore.ts
│       │   ├── sessionStore.ts
│       │   └── uiStore.ts
│       └── types/
│           └── index.ts
│
├── alembic/
│   ├── alembic.ini
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── README.md
│       ├── 20250527_000000_initial_schema.py
│       └── 20250527_000001_quick_entry_tables.py
│
├── scripts/
│   ├── init_database.py
│   ├── init_opensearch.py
│   ├── init_qdrant.py
│   ├── model_info.txt
│   ├── seed_test_documents.py
│   ├── setup_keycloak.py
│   ├── setup_models.py
│   ├── setup_vault.py
│   ├── verify_deps.py
│   ├── verify_health.py
│   ├── verify_redis.py
│   └── warmup_models.py
│
├── monitoring/
│   ├── grafana/
│   │   ├── dashboards/aegis_overview.json
│   │   └── datasources/prometheus.yml
│   └── prometheus/
│       ├── prometheus.yml
│       └── rules/aegis_alerts.yml
│
└── tests/
    ├── __init__.py
    ├── conftest.py
    ├── integration/
    │   ├── __init__.py
    │   └── test_pipeline.py
    └── unit/
        ├── __init__.py
        ├── test_form_chunker.py
        ├── test_form_validator.py
        ├── test_input_governance.py
        ├── test_query_intelligence.py
        └── test_retrieval_engine.py
```

---

## KEY DESIGN DECISIONS

**Why `backend/` and not `app/` at the root?**
IMPL_03 sets the Docker build context as `./backend`. All 22 base implementation documents
use paths like `backend/app/services/model_gateway.py`. If the folder is named `app/`,
the Docker build fails and all IMPL paths are wrong.

**Why `handlers/` instead of `routers/` for the main API?**
The base AEGIS design (IMPL_11–IMPL_20) uses `handlers/` for HTTP/WebSocket entry points.
Quick Entry (IMPL_25) adds a `routers/` directory alongside it, because it was designed
as a clean addition without modifying existing handler files.

**Why `infrastructure/` instead of `clients/` for service connections?**
The AEGIS spec uses `infrastructure/` for all external service clients (Qdrant, OpenSearch,
PostgreSQL, Redis). Quick Entry (IMPL_28) adds a separate `clients/` directory for the
Ollama vision client, which is a new dependency not in the base infrastructure set.

**Why are services hyphenated (`bge-embedding`, `deberta-nli`)?**
IMPL_03 docker-compose.yml uses `context: ./services/bge-embedding` and
`context: ./services/deberta-nli`. The directory names must match these build contexts
exactly or Docker cannot find the Dockerfiles.

**Why no BGE-M3 service directory?**
The AEGIS specs show one `bge-embedding` service that handles all embedding via
BGE-base-en-v1.5 (768-dimensional). BGE-M3 sparse embedding appears in the architecture
design but the implementation specs use a single embedding service. The agent handles
any sparse embedding logic inside the same service during IMPL_04.

**Why `guides/` folder at root?**
Pre-implementation documents (Ollama guide, this structure guide, the master plan) are
operational references, not code. Keeping them in `guides/` separates them from `docs/`
(architecture) and `specs/` (implementation instructions). They are committed to the
repository so any team member can access them.

**Why `docs/ARCHITECTURE.md` and `docs/ONBOARDING.md` created upfront?**
Both are written by the script with brief content. The agent updates them during IMPL_20
(final polish). Having them exist from the start gives Copilot a place to reference system
architecture without re-reading all 85 specs.

**Production migration — what changes:**
```
DEMO (.env)                           PRODUCTION (.env.prod)
──────────────────────────────────── ─────────────────────────────────────
MODEL_BACKEND=ollama                  MODEL_BACKEND=vllm
OLLAMA_BASE_URL=http://host.docker.  VLLM_BASE_URL=https://vllm.private
OLLAMA_MODEL_MAIN=qwen2.5:32b        VLLM_MODEL_MAIN=qwen2.5:72b
OLLAMA_MODEL_JUDGE=qwen2.5:7b        VLLM_MODEL_JUDGE=qwen2.5:14b
OLLAMA_MODEL_VISION=qwen2.5vl:7b     VLLM_MODEL_VISION=qwen2.5vl:72b
```
`model_gateway.py` reads `MODEL_BACKEND` env var and routes to either Ollama or vLLM.
One variable. No code changes. Everything else is identical between demo and production.

---

## QUICK REFERENCE — WHICH SPEC BUILDS WHICH DIRECTORY

| Spec document | Directories it populates |
|---|---|
| IMPL_01 | `scripts/verify_deps.py`, `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pyproject.toml` |
| IMPL_02 | `backend/app/config.py`, `.env.example`, `frontend/package.json`, all frontend config files |
| IMPL_03 | `docker-compose.yml`, `backend/Dockerfile`, `services/*/Dockerfile`, `frontend/Dockerfile` |
| IMPL_04 | `scripts/setup_models.py`, `scripts/warmup_models.py`, `scripts/verify_health.py`, `services/bge-embedding/main.py`, `services/deberta-nli/main.py` |
| IMPL_05 | `backend/app/infrastructure/postgres_client.py`, `scripts/init_database.py`, `alembic/` (all 3 core files) |
| IMPL_06 | `backend/app/infrastructure/qdrant_client.py`, `scripts/init_qdrant.py` |
| IMPL_07 | `backend/app/infrastructure/opensearch_client.py`, `scripts/init_opensearch.py` |
| IMPL_08 | `backend/app/infrastructure/redis_client.py`, `scripts/verify_redis.py` |
| IMPL_09 | `backend/app/middleware/` (all 5 files), `tests/unit/test_input_governance.py` |
| IMPL_10 | `scripts/setup_keycloak.py`, `scripts/setup_vault.py` |
| IMPL_11 | `backend/app/infrastructure/circuit_breaker.py`, `backend/app/models/` (all 3), `backend/app/tasks/` (all 7 base tasks), `backend/app/workers/arq_worker.py`, `backend/app/worker.py` |
| IMPL_12 | `backend/app/services/query_intelligence.py`, `tests/unit/test_query_intelligence.py` |
| IMPL_13 | `backend/app/services/vision_integration.py`, `backend/app/tasks/vision_task.py` |
| IMPL_14-15 | `backend/app/services/retrieval_engine.py`, `tests/unit/test_retrieval_engine.py` |
| IMPL_16 | `backend/app/services/model_gateway.py`, `backend/app/services/reasoning_service.py` |
| IMPL_17 | `backend/app/services/validation_engine.py` |
| IMPL_18 | `backend/app/services/ingestion_pipeline.py`, `backend/app/handlers/upload_handler.py`, `scripts/seed_test_documents.py` |
| IMPL_19 | `backend/app/handlers/chat_handler.py`, `backend/app/main.py` |
| IMPL_20 | `backend/app/handlers/admin_handler.py`, `backend/app/observability.py`, `monitoring/` (all files) |
| IMPL_21-22 | Patches to existing files (no new directories) |
| IMPL_23 | `frontend/src/types/index.ts`, `frontend/src/lib/constants.ts` |
| IMPL_24 | New Alembic migration in `alembic/versions/` for Quick Entry tables |
| IMPL_25 | `backend/app/routers/knowledge_entries.py`, `backend/app/services/form_validator.py`, `tests/unit/test_form_validator.py` |
| IMPL_26 | `backend/app/tasks/process_form_entry.py`, `backend/app/tasks/retry_partial_indexing.py` |
| IMPL_27 | `backend/app/services/form_chunker.py`, `frontend/src/lib/chunkAssembler.ts`, `tests/unit/test_form_chunker.py` |
| IMPL_28 | `backend/app/clients/ollama_vision.py`, `backend/app/tasks/enrich_entry_screenshots.py` |
| IMPL_29 | `backend/app/services/form_import_parser.py`, `backend/app/tasks/cleanup_task.py` |
| FRONTEND_01-05 | `frontend/src/app/globals.css`, `frontend/src/components/ui/` (drawer, spinner, status-dot) |
| FRONTEND_06-07 | `frontend/src/components/admin/` (DataTable, EmptyState, FilterChips, overlays), `frontend/src/hooks/` (utility hooks) |
| FRONTEND_08 | `frontend/src/components/chat/` (all 19 chat components) |
| FRONTEND_09 | `frontend/src/components/shared/EmployeeTopbar.tsx`, employee layout |
| FRONTEND_10 | `frontend/src/stores/` (all 5 Zustand stores) |
| FRONTEND_11 | `frontend/src/hooks/queries/` (all 7 query hooks), `useAuth.ts`, `usePolling.ts` |
| FRONTEND_12-13 | `frontend/src/app/(employee)/page.tsx`, `ChatInterface.tsx`, keyboard shortcuts |
| FRONTEND_14 | `frontend/src/components/sessions/` (all 6), `frontend/src/components/pdf/`, history page |
| FRONTEND_15 | `frontend/src/components/onboarding/` (all 3), login pages |
| FRONTEND_16 | `frontend/src/app/(admin)/layout.tsx`, admin shell components (AdminNav, AdminTopbar, etc.) |
| FRONTEND_17 | `frontend/src/app/(admin)/admin/dashboard/page.tsx`, MetricCard, DashboardRefreshIndicator |
| FRONTEND_18 | `frontend/src/app/(admin)/admin/documents/page.tsx`, upload components |
| FRONTEND_19 | Registry + Config Snapshot pages, InlineEditCell, StalenessIndicator |
| FRONTEND_20 | Knowledge Gaps + Audit Trail pages, GapCard, GapEventsList, AuditTimeline, csvExport.ts |
| FRONTEND_21 | Review Queue + Tickets pages, Kanban components, ClaimHighlighter |
| FRONTEND_22 | System Health + Analytics pages, all 8 chart components, ServiceStatusGrid |
| FRONTEND_36-40 | `frontend/src/components/quick-entry/` (all 26), `quick-entry/` pages, ScreenshotProxy |

