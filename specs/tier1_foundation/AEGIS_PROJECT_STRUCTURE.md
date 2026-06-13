# AEGIS PROJECT STRUCTURE
## Complete Directory and File Tree — Every Folder and File
## Place in: specs/tier1_foundation/

---

## CRITICAL INSTRUCTION FOR THE AI AGENT

This document defines the exact location of every file in the AEGIS project. When creating any file, check this document first to confirm the correct path. Do not create files outside the structure defined here. Do not create additional folders unless this document shows them.

Every Python file shown here requires an `__init__.py` file in its folder. The `__init__.py` files are listed explicitly below.

---

## COMPLETE DIRECTORY TREE

```
aegis-project/                              # Root project directory
│
├── .env                                    # Actual environment variables (git-ignored)
├── .env.example                            # Template with all variable names, empty values
├── .gitignore                              # Git ignore rules
├── docker-compose.yml                      # Main Docker Compose definition (all 20 services)
├── docker-compose.override.yml             # Development overrides (port exposures for debugging)
├── README.md                               # Project overview and setup instructions
│
├── specs/                                  # All specification documents (read-only reference)
│   ├── tier0_agent_guide/
│   │   └── AGENT_SESSION_GUIDE.md
│   ├── tier1_foundation/
│   │   ├── AEGIS_MASTER_REFERENCE.md
│   │   ├── AEGIS_DATA_CONTRACTS.md
│   │   ├── AEGIS_CONFIGURATION_CONSTANTS.md
│   │   ├── AEGIS_PROJECT_STRUCTURE.md      # This file
│   │   └── AEGIS_DOCUMENT_TEMPLATES.md
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
│   │   └── IMPL_20_ADMIN_PORTAL_OBSERVABILITY.md
│   └── tier3_verification/
│       ├── VERIFY_01_COMPONENT_TESTS.md
│       ├── VERIFY_02_INTEGRATION_TESTS.md
│       ├── VERIFY_03_ARCHITECTURAL_COMPLIANCE.md
│       ├── VERIFY_04_HEALTH_CHECK.md
│       └── DECISIONS_LOG.md
│
├── backend/                                # Python FastAPI backend
│   ├── Dockerfile                          # FastAPI + ARQ worker image
│   ├── requirements.txt                    # Production Python dependencies
│   ├── requirements-dev.txt                # Testing and development dependencies
│   ├── pyproject.toml                      # Project metadata
│   └── app/
│       ├── __init__.py
│       ├── main.py                         # FastAPI application factory, app creation, middleware registration
│       ├── config.py                       # All constants from AEGIS_CONFIGURATION_CONSTANTS loaded from env
│       ├── dependencies.py                 # FastAPI dependency injection (DB connections, service instances)
│       │
│       ├── middleware/
│       │   ├── __init__.py
│       │   ├── authentication.py           # JWT verification, revocation check, user extraction
│       │   ├── input_governance.py         # Schema validation, magic bytes, SAP injection patterns
│       │   ├── output_governance.py        # Restricted content scan, sentence-by-sentence
│       │   └── rate_limiting.py            # Redis-backed rate limit enforcement
│       │
│       ├── models/                         # Pydantic data models and dataclasses
│       │   ├── __init__.py
│       │   ├── session.py                  # SessionState, ConversationTurn, EntityObject
│       │   ├── retrieval.py                # EnrichedQuery, RetrievalResult, RetrievedChunk, ParentHeader, RegistryResult
│       │   ├── validation.py               # ValidationResult, Tier1Failure, AttributionPanel
│       │   ├── tasks.py                    # VisionTaskPayload, AuditTaskPayload, etc. (all ARQ task schemas)
│       │   └── api.py                      # ChatRequest, FeedbackRequest, UploadResponse, etc.
│       │
│       ├── services/                       # Core AI service implementations
│       │   ├── __init__.py
│       │   ├── query_intelligence.py       # Entity extraction, context resolver, synonym map, mode assignment
│       │   ├── retrieval_engine.py         # Stages 1-8: registry, Qdrant, OpenSearch, KG, RRF, CRAG, rerank, hydration
│       │   ├── reasoning_service.py        # Prompt assembly, tier selection, streaming coordination
│       │   ├── model_gateway.py            # OpenAI-compatible API client for Ollama/vLLM
│       │   ├── validation_engine.py        # Tier 1, 2, 3 validation with concurrent streaming
│       │   └── ingestion_pipeline.py       # 11-stage document ingestion
│       │
│       ├── tasks/                          # ARQ background task implementations
│       │   ├── __init__.py
│       │   ├── vision_task.py              # Screenshot processing, DiagnosticObject extraction
│       │   ├── audit_task.py               # Audit log write to PostgreSQL
│       │   ├── feedback_task.py            # Feedback diagnosis (retrieval vs generation failure)
│       │   ├── cache_task.py               # Semantic cache write to Qdrant cache_queries
│       │   ├── knowledge_gap_task.py       # Knowledge gap event write to PostgreSQL
│       │   ├── ticket_task.py              # Mock ticket creation in PostgreSQL
│       │   └── cleanup_task.py             # Nightly cache cleanup (delete stale cache_queries points)
│       │
│       ├── infrastructure/                 # Data store clients and system integrations
│       │   ├── __init__.py
│       │   ├── redis_client.py             # RedisSessionClient (Instance 1) and RedisQueueClient (Instance 2)
│       │   ├── qdrant_client.py            # Qdrant operations (search, upsert, delete, collection management)
│       │   ├── opensearch_client.py        # OpenSearch operations (search, index, delete)
│       │   ├── postgres_client.py          # Async PostgreSQL operations (all table queries)
│       │   ├── vault_client.py             # Vault AppRole auth, dynamic creds, transit, PKI
│       │   └── circuit_breaker.py          # CircuitBreaker class, CircuitBreakerRegistry
│       │
│       ├── handlers/                       # FastAPI route handlers
│       │   ├── __init__.py
│       │   ├── chat_handler.py             # POST /api/chat + WebSocket upgrade, full pipeline coordination
│       │   ├── upload_handler.py           # POST /admin/documents/upload, ingestion trigger
│       │   └── admin_handler.py            # All /admin/* API endpoints
│       │
│       └── workers/
│           ├── __init__.py
│           └── arq_worker.py               # ARQ worker process entry point, task registration, Redis settings
│
├── services/                               # Custom AI inference microservices
│   ├── bge-embedding/
│   │   ├── Dockerfile
│   │   ├── requirements.txt                # sentence-transformers, fastapi, uvicorn
│   │   └── main.py                         # FastAPI app: POST /embed, POST /embed-single
│   └── deberta-nli/
│       ├── Dockerfile
│       ├── requirements.txt                # transformers, torch, fastapi, uvicorn
│       └── main.py                         # FastAPI app: POST /nli, POST /nli-batch
│
├── frontend/                               # Next.js frontend (employee chat + admin portal)
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── middleware.ts                       # Edge middleware for /admin/* role enforcement
│   ├── .env.local                          # Frontend environment variables
│   └── src/
│       ├── app/                            # Next.js App Router
│       │   ├── layout.tsx                  # Root layout
│       │   ├── page.tsx                    # Employee chat interface (root route /)
│       │   ├── login/
│       │   │   └── page.tsx                # Login page with ROPC form
│       │   └── admin/
│       │       ├── layout.tsx              # Admin portal layout (nav + sidebar)
│       │       ├── page.tsx                # Admin dashboard (redirects to /admin/documents)
│       │       ├── documents/
│       │       │   └── page.tsx            # Document Management screen
│       │       ├── registry/
│       │       │   └── page.tsx            # Known Patterns Registry screen
│       │       ├── config-snapshot/
│       │       │   └── page.tsx            # Config Snapshot Management screen
│       │       ├── knowledge-gaps/
│       │       │   └── page.tsx            # Knowledge Gap Dashboard screen
│       │       ├── audit-trail/
│       │       │   └── page.tsx            # Employee Audit Trail screen
│       │       ├── review-queue/
│       │       │   └── page.tsx            # Human Review Queue screen
│       │       └── tickets/
│       │           └── page.tsx            # Mock Ticket Management screen
│       │
│       ├── components/
│       │   ├── chat/
│       │   │   ├── ChatInterface.tsx        # Main chat container, message list, input
│       │   │   ├── MessageBubble.tsx        # Individual message display (user and AEGIS)
│       │   │   ├── ConfidenceBadge.tsx      # Green/amber/none badge component
│       │   │   ├── AttributionPanel.tsx     # Source document attribution display
│       │   │   ├── FeedbackButtons.tsx      # Thumbs up/down buttons
│       │   │   └── FileUpload.tsx           # Screenshot/document upload UI
│       │   └── admin/
│       │       ├── DocumentTable.tsx        # Sortable/filterable document list
│       │       ├── RegistryManager.tsx      # Registry entries with approve/reject
│       │       ├── ConfigSnapshotEditor.tsx # Inline-editable config values with staleness indicators
│       │       ├── KnowledgeGapDashboard.tsx # Clustered gap events with counts
│       │       ├── AuditTrailTable.tsx      # Queryable audit log
│       │       ├── ReviewQueueManager.tsx   # Generation failure queue with answer input
│       │       └── TicketManager.tsx        # Mock ticket list with status management
│       │
│       ├── hooks/
│       │   ├── useWebSocket.ts             # WebSocket hook: persistent connection, token streaming, vision push
│       │   ├── useAuth.ts                  # JWT cookie management, ROPC flow, refresh timer
│       │   └── useStream.ts                # Token accumulation and display state
│       │
│       ├── lib/
│       │   ├── api.ts                      # All API call functions (typed, using fetch)
│       │   ├── auth.ts                     # ROPC login, token refresh, logout functions
│       │   └── constants.ts                # Frontend constants (API base URL, timeout values)
│       │
│       └── types/
│           └── index.ts                    # TypeScript interfaces for all shared types
│
├── infrastructure/                         # Configuration files for infrastructure services
│   ├── nginx/
│   │   ├── nginx.conf                      # Complete Nginx config (TLS, routing, rate limiting)
│   │   └── ssl/                            # TLS certificates directory (generated at setup)
│   │       ├── aegis.crt
│   │       └── aegis.key
│   ├── prometheus/
│   │   └── prometheus.yml                  # Prometheus scrape config (all service targets, 15s interval)
│   ├── grafana/
│   │   ├── dashboards/
│   │   │   └── aegis-main.json             # All 8 dashboard panels exported as JSON
│   │   └── provisioning/
│   │       ├── dashboards.yml              # Grafana dashboard provisioning config
│   │       └── datasources.yml             # Prometheus datasource config
│   ├── pgbouncer/
│   │   └── pgbouncer.ini                   # PgBouncer config (transaction mode, pool size 20)
│   └── opensearch/
│       └── opensearch.yml                  # OpenSearch config (security disabled for demo)
│
├── database/
│   ├── migrations/
│   │   ├── 001_operational_schema.sql      # All operational tables
│   │   ├── 002_analytical_schema.sql       # All analytical tables
│   │   ├── 003_config_snapshot.sql         # Config snapshot table
│   │   └── 004_initial_data.sql            # Permissions grants, append-only enforcement
│   └── seeds/
│       ├── transaction_code_permissions.sql # Initial T-code permission entries
│       └── synonym_map.sql                 # Initial synonym map entries
│
├── scripts/                                # One-time setup and utility scripts
│   ├── init_database.py                    # Runs all migration files in order
│   ├── init_qdrant.py                      # Creates all four Qdrant collections
│   ├── init_opensearch.py                  # Creates SAP documents index with custom analyzer
│   ├── seed_registry.py                    # Seeds Known Patterns Registry with initial entries
│   ├── verify_health.py                    # Health check: all services + schemas + collections
│   └── verify_deps.py                      # Imports all Python packages and confirms versions
│
└── tests/
    ├── conftest.py                         # Shared pytest fixtures (test client, mock services)
    ├── unit/
    │   ├── __init__.py
    │   ├── test_query_intelligence.py      # QIL: entity extraction, context resolver, mode assignment
    │   ├── test_retrieval_engine.py        # Retrieval: RRF formula, CRAG gating, reranking
    │   ├── test_validation_engine.py       # Validation: NLI scoring, ensemble formula, badge routing
    │   ├── test_ingestion_pipeline.py      # Ingestion: chunking rules, field detection, metadata
    │   └── test_session_state.py           # Session: state machine transitions, TTL, intent labels
    └── integration/
        ├── __init__.py
        ├── test_walkthrough_a.py           # Cache hit scenario (full path, ~2 seconds)
        ├── test_walkthrough_b.py           # Full pipeline Mode B (full path, ~90 seconds)
        ├── test_walkthrough_c.py           # Screenshot + vision + proactive push (~120 seconds)
        └── test_walkthrough_d.py           # Mode C complex multi-module query (~150 seconds)
```

---

## FILE PURPOSE EXPLANATIONS

### backend/app/config.py
This file reads every environment variable and exposes them as typed Python constants. It is the single source for all configuration values. No other file should read environment variables directly — they all import from config.py.

```python
# Pattern that all other files follow:
from app.config import REDIS_SESSION_URL, QDRANT_HOST, SEMANTIC_CACHE_THRESHOLD
# NOT:
import os
os.environ.get("REDIS_SESSION_URL")  # Wrong — don't do this in other files
```

### backend/app/main.py
Creates the FastAPI application instance. Registers all middleware in the exact order: authentication → input_governance → rate_limiting → trace_id generation. Registers all route handlers. Configures WebSocket endpoint. Creates startup event that initialises infrastructure connections.

### backend/app/workers/arq_worker.py
The entry point for the ARQ worker process. Defines the `WorkerSettings` class with Redis connection URL (Instance 2), all task function registrations, queue polling interval, and max jobs setting. This file is started as a separate process.

### backend/services/bge-embedding/main.py
A lightweight FastAPI application that loads the BGE-base-en-v1.5 model once at startup and exposes POST /embed and POST /embed-single endpoints. Runs on port 8002. This is the service that all embedding calls go through.

### backend/services/deberta-nli/main.py
A lightweight FastAPI application that loads the DeBERTa-v3-large-mnli model and the ms-marco-MiniLM-L-12-v2 cross-encoder model at startup. Exposes POST /nli, POST /nli-batch (for DeBERTa), and POST /rerank (for cross-encoder). Runs on port 8001.

### frontend/middleware.ts
The Next.js Edge middleware file. Must be at `frontend/middleware.ts` (not inside src/). This is the server-side admin role check that runs before any /admin/* page renders.

### scripts/verify_health.py
Run this script at any time to check system state. It checks all services are reachable, all Qdrant collections exist with 768-dim vectors, all PostgreSQL tables exist, both Redis instances are correctly configured, and all Ollama models respond to a test prompt. Output: PASS or FAIL with specific details.

---

## NAMING CONVENTIONS

### Python files
- All lowercase with underscores: `query_intelligence.py`
- Class names: PascalCase (`class QueryIntelligenceLayer:`)
- Function names: snake_case (`def extract_entities():`)
- Constants: UPPER_CASE (`SEMANTIC_CACHE_THRESHOLD = 0.88`)

### TypeScript/React files
- Components: PascalCase (`ChatInterface.tsx`)
- Hooks: camelCase starting with `use` (`useWebSocket.ts`)
- Regular files: camelCase (`api.ts`)
- Interfaces: PascalCase (`interface RetrievalResult {}`)

### API routes
- Backend: lowercase with hyphens (`/admin/knowledge-gaps`)
- Frontend pages: lowercase with hyphens (`/admin/knowledge-gaps/page.tsx`)

### Docker
- Container names: `aegis-{service-name}` (e.g. `aegis-fastapi`)
- Volume names: `aegis-{purpose}` (e.g. `aegis-postgres-data`)
- Network names: `nexus-{zone}` (e.g. `nexus-app`)

---

## FILES THAT MUST EXIST BEFORE IMPLEMENTATION STARTS

These files are created during Session 01 and 02 and must exist before any AI services are implemented:

1. `docker-compose.yml` — all 20 services must be running
2. `backend/app/config.py` — all constants must be defined
3. `backend/app/models/session.py` — SessionState must be defined (other services depend on it)
4. `backend/app/models/retrieval.py` — EnrichedQuery, RetrievalResult must be defined
5. `backend/app/infrastructure/redis_client.py` — both Redis clients must be functional
6. `backend/app/infrastructure/circuit_breaker.py` — CircuitBreaker must be defined

These files are depended upon by almost every other file. Create them first.

---

*Document version: 1.0 | AEGIS Specification Set*
