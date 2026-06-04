# COPILOT_03 — AEGIS COMPLETE SYSTEM ARCHITECTURE
## Every component, every service, every database, every design decision

---

## 1. SYSTEM SUMMARY

AEGIS is a secure, fully on-premises enterprise AI system. It answers SAP-related questions from Sona Comstar employees by retrieving information from internal documentation and generating validated, source-cited answers using large language models running locally on company hardware.

The system processes approximately 50 concurrent users maximum. All AI inference runs on a CPU-only server (Intel Xeon E-2278G, 64GB RAM) during the demo phase. No data ever leaves the company network.

The architecture is divided into six zones. Each zone has a clear responsibility boundary and communicates with adjacent zones through defined interfaces.

---

## 2. THE SIX ZONES

### Zone A — Security Perimeter
Every request from any client passes through Zone A before reaching any application code. Zone A is responsible for TLS termination, request routing, authentication, secret management, and rate limiting at the network level.

Components: Nginx (reverse proxy), Keycloak (identity provider), HashiCorp Vault (secrets)

### Zone B — Orchestration
The FastAPI application and ARQ background worker. Zone B receives authenticated requests from Zone A, orchestrates the AI pipeline in Zone C, manages conversation state, and coordinates all async background work.

Components: aegis-fastapi (HTTP/WebSocket handlers), aegis-arq (async task worker)

### Zone C — AI Pipeline
The intelligence core of AEGIS. Zone C contains all AI-powered services: query understanding, multi-modal retrieval, language model reasoning, answer validation, and computer vision.

Components: BGE embedding service, DeBERTa NLI service, three Ollama instances (main generation, judge validation, vision)

### Zone D — Presentation
The Next.js 14 application serving both the employee chat interface and the admin portal from a single application. Uses Next.js App Router with route groups to separate employee and admin layouts.

Components: aegis-nginx (also serves frontend static assets), Next.js application

### Zone E — Data Layer
All persistent and ephemeral data stores. Each store serves a specific, non-overlapping purpose.

Components: PostgreSQL (relational data), Qdrant (vector embeddings), OpenSearch (BM25 keyword search), Redis Session (session state + semantic cache + rate limiting), Redis Queue (ARQ job queue + JWT revocation), MinIO (file storage)

### Zone F — Observability
Metrics collection and visualization. Prometheus scrapes metrics from all services. Grafana provides dashboards.

Components: aegis-prometheus, aegis-grafana

---

## 3. ALL 19 DOCKER SERVICES — COMPLETE SPECIFICATION

### Zone A Services

**aegis-vault**
- Image: hashicorp/vault:1.18.1
- Purpose: Secret management, PKI certificate authority, dynamic PostgreSQL credentials, Transit encryption engine
- Internal port: 8200
- Health check: vault status
- Key feature: AppRole authentication used by FastAPI to retrieve secrets at startup
- All production secrets live here — database passwords, JWT signing keys, API keys

**aegis-keycloak**
- Image: quay.io/keycloak/keycloak:26.0.5
- Purpose: OIDC identity provider, JWT issuance, role-based access control (employee vs admin roles)
- Internal port: 8080
- Health check: /health/ready
- Realm: nexus-realm
- Clients: aegis-backend (FastAPI), aegis-frontend (Next.js)
- Roles: aegis-employee, aegis-admin
- Dependency: PostgreSQL (Keycloak stores its data in aegis_keycloak database)

**aegis-nginx**
- Image: nginx:1.27-alpine
- Purpose: Reverse proxy for all incoming traffic, TLS termination, rate limiting at network level, serving Next.js static assets
- Exposed port: 443 (HTTPS), 80 (redirects to HTTPS)
- Routes: /api/* → aegis-fastapi:8000, /ws/* → aegis-fastapi:8000 (WebSocket upgrade), /* → Next.js static files

### Zone B Services

**aegis-fastapi**
- Image: Custom build from backend/ (Dockerfile in backend/)
- Purpose: Main application server — all HTTP endpoints, WebSocket chat endpoint, AI pipeline orchestration
- Internal port: 8000
- Health check: GET /health
- Entry point: uvicorn app.main:app
- Dependencies: all Zone E services, all Zone C AI services, Keycloak, Vault
- Key handlers: chat_handler.py (WebSocket streaming), admin_handler.py (all admin APIs), upload_handler.py (document uploads)

**aegis-arq**
- Image: Same custom build as aegis-fastapi (same Dockerfile, same Python environment)
- Purpose: ARQ background task worker — runs async tasks that should not block the HTTP request cycle
- Entry point: python backend/app/worker.py (different command from fastapi)
- Tasks it runs: audit_task, cache_task, cleanup_task, feedback_task, knowledge_gap_task, ticket_task, vision_task, process_form_entry, enrich_entry_screenshots, retry_partial_indexing
- Dependencies: Redis Queue (receives task jobs), all Zone E stores, Zone C AI services

### Zone C Services

**aegis-bge**
- Image: Custom build from services/bge-embedding/
- Purpose: Dense vector embedding using BGE-base-en-v1.5 (768-dimensional output)
- Internal port: 8002
- Endpoints: POST /embed (batch), POST /embed-single (single text), GET /health
- Model: BAAI/bge-base-en-v1.5 loaded via sentence-transformers
- Used by: retrieval_engine.py (query embedding), ingestion_pipeline.py (document chunk embedding), process_form_entry ARQ task (Quick Entry embedding)
- CRITICAL: All vector dimensions in Qdrant are 768 to match this model's output. This is non-negotiable.

**aegis-deberta**
- Image: Custom build from services/deberta-nli/
- Purpose: Natural Language Inference validation — determines if a claim is entailed by a source text
- Internal port: 8001
- Endpoint: POST /nli, body: {premise: str, hypothesis: str}, response: {label: "entailment"|"neutral"|"contradiction", score: float}
- Model: cross-encoder/nli-deberta-v3-large loaded via transformers
- Used by: validation_engine.py Tier 2 — validates each claim in the generated answer against source chunks

**aegis-ollama-main**
- Image: ollama/ollama:0.4.1
- Purpose: Hosts qwen2.5:32b — the primary language model for generating SAP helpdesk answers
- Internal port: 11434 (Docker internal network only, not exposed to host)
- Model loaded: qwen2.5:32b (Q4_K_M quantization, ~19GB)
- Volume: /home/pal/.ollama:/root/.ollama (bind mount — models already present)
- Config: OLLAMA_KEEP_ALIVE=-1 (keep model in RAM permanently), OLLAMA_NUM_THREAD=10
- Used by: model_gateway.py for Tier 1 and Tier 2 generation (complex SAP queries)
- Demo inference speed: 3–6 tokens/second on CPU
- Production replacement: qwen2.5:72b via vLLM on cloud GPU

**aegis-ollama-judge**
- Image: ollama/ollama:0.4.1
- Purpose: Hosts qwen2.5:7b-instruct — the validation judge model
- Internal port: 11434 (Docker internal network only)
- Model loaded: qwen2.5:7b-instruct (Q4_K_M, ~4.7GB)
- Volume: /home/pal/.ollama:/root/.ollama (same bind mount, shares model storage)
- Config: OLLAMA_KEEP_ALIVE=-1, OLLAMA_NUM_THREAD=3
- Used by: validation_engine.py Tier 3 (LLM-as-Judge), retrieval_engine.py CRAG self-reflection assessor
- Production replacement: qwen2.5:14b via vLLM

**aegis-ollama-vision**
- Image: ollama/ollama:0.4.1
- Purpose: Hosts qwen2.5vl:7b — the vision-language model for SAP screenshot analysis
- Internal port: 11434 (Docker internal network only)
- Model loaded: qwen2.5vl:7b (Q4_K_M, ~5.1GB, architecture: qwen25vl, context: 128k tokens)
- Volume: /home/pal/.ollama:/root/.ollama (same bind mount)
- Config: OLLAMA_KEEP_ALIVE=-1, OLLAMA_NUM_THREAD=3
- Used by: ollama_vision.py (classify_sap, extract_sap_content), triggered by enrich_entry_screenshots ARQ task
- Production replacement: qwen2.5vl:72b via vLLM

### Zone E Services

**aegis-postgres-primary**
- Image: postgres:16.4-alpine
- Purpose: Primary PostgreSQL instance — all relational persistent data for AEGIS
- Internal port: 5432
- Databases: aegis_db (main application), keycloak (Keycloak storage)
- Connection: applications connect through PgBouncer, not directly to this service
- WAL archiving configured for replica streaming

**aegis-postgres-replica**
- Image: postgres:16.4-alpine
- Purpose: Read replica of primary — provides read scaling and failover capability
- Streams WAL from primary in real time
- Used for read-heavy analytical queries from admin portal

**aegis-pgbouncer**
- Image: pgbouncer/pgbouncer:1.23.1
- Purpose: PostgreSQL connection pooler — prevents connection exhaustion from FastAPI async pool
- Internal port: 5432 (presents as PostgreSQL to clients)
- All FastAPI database connections go through PgBouncer, not directly to postgres-primary

**aegis-qdrant**
- Image: qdrant/qdrant:v1.12.1
- Purpose: Vector database — stores all document chunk embeddings for semantic similarity search
- Internal port: 6333 (REST), 6334 (gRPC)
- Collections (all 768-dimensional):
  * meridian_errors — error guide chunks from SAP error documentation
  * meridian_procedures — procedure/workflow step chunks
  * meridian_configs — configuration snapshot field chunks
  * cache_queries — semantic cache of previously answered queries (separate collection)
- Each content collection has TWO named vectors per point: "dense" (BGE embedding) and "sparse" (for sparse retrieval)

**aegis-opensearch**
- Image: opensearchproject/opensearch:2.17.0
- Purpose: BM25 keyword search with SAP-specific text analysis
- Internal port: 9200
- Index: aegis_knowledge — contains all document chunks as searchable text
- Analyzer: custom SAP analyzer that tokenizes T-codes (VL01N → VL, 01N as separate tokens), preserves error codes, handles SAP-specific terminology
- Used in parallel with Qdrant for the BM25 component of tri-modal retrieval

**aegis-redis-session**
- Image: redis:7.4-alpine
- Internal port: 6379
- Purpose — THREE separate responsibilities:
  1. Conversation session state (ConversationState objects with TTL)
  2. Semantic cache (query hash → previous answer mapping)
  3. Rate limiting counters (sliding window per employee per endpoint)

**aegis-redis-queue**
- Image: redis:7.4-alpine
- Internal port: 6380 (different port from redis-session to prevent confusion)
- Purpose — TWO responsibilities:
  1. ARQ job queue (all background tasks are dispatched here, aegis-arq polls here)
  2. JWT revocation set (revoked tokens stored here, authentication middleware checks here)

**MinIO**
- Purpose: Object storage for document files and Quick Entry screenshots
- Buckets:
  * aegis-documents — uploaded SAP documentation files (DOCX, PDF) before and after ingestion
  * knowledge-screenshots — SAP screenshots attached to Quick Entry forms
- Files never served directly from MinIO — always through Next.js API route proxy with authentication
- Referenced in env as MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY

### Zone F Services

**aegis-prometheus**
- Image: prom/prometheus:v2.55.0
- Purpose: Metrics collection from all services
- Scrapes: aegis-fastapi:8000/metrics, aegis-bge:8002/metrics, aegis-deberta:8001/metrics, aegis-qdrant:6333/metrics, aegis-redis-session:6379, aegis-redis-queue:6380

**aegis-grafana**
- Image: grafana/grafana:11.3.1
- Purpose: Metrics visualization
- Dashboards: system health, LLM quality metrics (confidence scores, validation pass rates), retrieval quality (cache hit rate, mode distribution), Quick Entry pipeline health

---

## 4. AI MODEL COMPLETE SPECIFICATION

### Main Generation Model

| Property | Demo | Production |
|---|---|---|
| Model | qwen2.5:32b | qwen2.5:72b |
| Container | aegis-ollama-main | vLLM endpoint |
| Quantization | Q4_K_M | BF16 or FP8 |
| Parameters | 32 billion | 72 billion |
| Inference | CPU (Xeon E-2278G) | GPU (private cloud) |
| Speed | 3–6 tokens/second | 50–100 tokens/second |
| RAM required | ~19GB | Cloud GPU VRAM |
| Config var | OLLAMA_MODEL_MAIN=qwen2.5:32b | VLLM_MODEL_MAIN=qwen2.5:72b |
| Role | Primary RAG answer generation, complex SAP reasoning | Same |

### Judge / Validation Model

| Property | Demo | Production |
|---|---|---|
| Model | qwen2.5:7b-instruct | qwen2.5:14b |
| Container | aegis-ollama-judge | vLLM endpoint |
| Quantization | Q4_K_M | BF16 |
| Parameters | 7.6 billion | 14 billion |
| Config var | OLLAMA_MODEL_JUDGE=qwen2.5:7b-instruct | VLLM_MODEL_JUDGE=qwen2.5:14b |
| Roles | Tier 3 LLM-as-Judge validation, CRAG self-reflection assessor | Same |

### Vision Model

| Property | Demo | Production |
|---|---|---|
| Model | qwen2.5vl:7b | qwen2.5vl:72b |
| Container | aegis-ollama-vision | vLLM endpoint |
| Quantization | Q4_K_M | BF16 |
| Parameters | 8.3 billion | 72 billion |
| Context | 128,000 tokens | 128,000 tokens |
| Config var | OLLAMA_MODEL_VISION=qwen2.5vl:7b | VLLM_MODEL_VISION=qwen2.5vl:72b |
| Capabilities | completion, vision (image input) | Same |
| Roles | Classify SAP screenshot type, extract structured data from screenshots | Same |

### Embedding Model (BGE-base-en-v1.5)

- Library: sentence-transformers (Python)
- Dimensions: 768 (fixed — all Qdrant collections use 768-dim vectors)
- Runs in: aegis-bge Docker container
- This model does NOT change between demo and production
- Input: any text string
- Output: 768-dimensional float32 vector

### NLI Model (DeBERTa-v3-large-mnli)

- Library: transformers (Python), cross-encoder approach
- Runs in: aegis-deberta Docker container
- Input: premise (source text), hypothesis (claim to verify)
- Output: label (entailment/neutral/contradiction), confidence score (0.0–1.0)
- Threshold for accepting a claim as grounded: score > 0.70 for entailment label
- This model does NOT change between demo and production

---

## 5. DATABASE SCHEMAS — KEY TABLES

### PostgreSQL — Core Application Tables

**knowledge_form_entries** — Quick Entry records (IMPL_24)
- id (UUID PK), content_type (error_guide/procedure/config), title, module, status (draft/published/archived), version (INTEGER, increments on update), submitted_by, published_at, next_review_date, gap_id (nullable FK to gap_events)
- Trigger: BEFORE UPDATE auto-increments version, writes immutable snapshot to versions table

**knowledge_form_entry_versions** — Immutable version snapshots
- entry_id (FK), version (INTEGER), form_data (JSONB), chunk_ids (JSONB array of Qdrant point IDs), changed_at, changed_by
- Never updated — append-only. Enables rollback and full audit trail.

**knowledge_form_entry_chunks** — Maps entries to their Qdrant vector points
- entry_id (FK), version, chunk_type, chunk_text, qdrant_point_id (UUID), qdrant_collection, is_current (BOOLEAN)
- When entry is updated: old chunks marked is_current=false, new chunks inserted with is_current=true

**knowledge_form_screenshots** — Screenshot metadata for Quick Entry
- id (UUID), entry_id (FK), section_key, minio_object_key, vision_status (pending/processing/completed/failed), extracted_text, ocr_confidence, created_at

**documents_registry** — Uploaded SAP documentation files
- id (UUID), filename, content_type, minio_object_key, ingestion_status, chunk_count, created_at, last_updated_at

**feedback_events** — Employee feedback on answers
- id, session_id, rating (thumbs_up/thumbs_down), category, detail, answer_id, diagnosed_as (retrieval_failure/generation_failure/correct), created_at

**knowledge_gap_events** — Detected gaps in knowledge base
- id, query_text, session_id, detected_at, status (open/filled), filled_by_entry_id (nullable FK)

**audit_log** — Append-only employee action audit trail
- id, user_id, action_type, resource_type, resource_id, details (JSONB), timestamp
- NEVER updated, NEVER deleted

**admin_notifications** — In-portal alerts for admins
- id, notification_type, message, related_entry_id, is_read, created_at

### Qdrant Collections — Vector Storage Structure

**meridian_errors, meridian_procedures, meridian_configs** (content collections)

Each point contains:
- id: UUID (matches knowledge_form_entry_chunks.qdrant_point_id)
- vectors: {"dense": [768 floats], "sparse": {indices: [...], values: [...]}}
- payload:
  - content_type: "error_guide" | "procedure" | "config"
  - chunk_type: "field_chunk" | "section_chunk" | "overview_chunk"
  - chunk_text: the actual text that was embedded
  - title: entry or document title
  - module: SAP module (MM, FI, SD, etc.)
  - sap_entities: {tcodes: [...], error_codes: [...], field_names: [...]}
  - source_type: "document" | "quick_entry"
  - entry_id or document_id: UUID back-reference
  - version: integer
  - has_screenshots: boolean
  - screenshot_ids: [UUID, ...]
  - freshness_date: ISO date (for staleness checking)
  - quality_score: float 0.0–1.0

**cache_queries** (semantic cache collection)

Each point contains:
- id: UUID
- vectors: {"dense": [768 floats]}
- payload:
  - query_text: original query string
  - query_hash: hash of normalized query
  - response_text: cached answer
  - confidence_score: float
  - source_chunk_ids: [UUID, ...]
  - created_at: ISO datetime
  - expires_at: ISO datetime (TTL)
  - hit_count: integer

---

## 6. BACKEND CODE STRUCTURE

### backend/app/handlers/ — HTTP and WebSocket Route Handlers

**chat_handler.py** — Employee-facing endpoints
- WebSocket: /ws/chat — bidirectional streaming, handles conversation turns
- POST /api/feedback — submit thumbs up/down on a response
- GET /api/session/{id} — retrieve session state

**admin_handler.py** — Admin portal API (all /api/admin/* routes)
- Document management (upload, list, status, delete)
- Quick Entry management (CRUD via knowledge_entries router)
- Registry management (Known Patterns)
- Config Snapshot management
- Knowledge gap events
- Audit trail
- System health metrics
- Pipeline health for Quick Entry

**upload_handler.py** — File upload endpoint
- POST /api/admin/documents/upload — multipart upload to MinIO, triggers ingestion ARQ task

### backend/app/infrastructure/ — External Service Clients

**circuit_breaker.py** — Per-service circuit breaker with fallback chains
- Each downstream service (Qdrant, OpenSearch, BGE, DeBERTa, Ollama instances) has a named circuit breaker
- States: CLOSED (normal), OPEN (failing, fast-fail), HALF_OPEN (testing recovery)
- When Qdrant circuit opens, falls back to OpenSearch-only retrieval
- All infrastructure clients go through circuit breaker before making actual calls

**qdrant_client.py** — Qdrant async operations
- search_dense(collection, vector, top_k) — HNSW ANN search
- search_sparse(collection, sparse_vector, top_k) — sparse vector search
- upsert_point(collection, point_id, vectors, payload) — insert/update
- delete_points(collection, point_ids) — delete for versioning
- get_points(collection, ids) — fetch by ID for parent hydration

**opensearch_client.py** — OpenSearch BM25 operations
- search(index, query, filters, top_k) — BM25 keyword search with SAP analyzer
- index_document(index, doc_id, body) — index a chunk
- update_document(index, doc_id, partial_body) — update chunk metadata

**postgres_client.py** — SQLAlchemy async engine and session factory
- Connects through PgBouncer, not directly to postgres-primary
- Provides async_session() context manager
- Handles connection pool sizing for PgBouncer compatibility

**redis_client.py** — Redis dual-instance client
- session_client: Redis Instance 1 (port 6379) — session state, semantic cache, rate limits
- queue_client: Redis Instance 2 (port 6380) — ARQ jobs, JWT revocation

### backend/app/services/ — Business Logic

**model_gateway.py** — Single point of LLM abstraction (THE MOST IMPORTANT FILE FOR PRODUCTION MIGRATION)
- Reads MODEL_BACKEND env var: "ollama" → Ollama, "vllm" → vLLM
- For Ollama: uses OLLAMA_MAIN_URL, OLLAMA_JUDGE_URL with Ollama API format
- For vLLM: uses VLLM_BASE_URL with OpenAI-compatible API format
- Provides: generate_streaming(prompt, tier, session_id) → AsyncIterator[str]
- Provides: generate_complete(prompt, tier) → str (for validation tasks)
- Tier selection logic: Tier 1 (simple queries) → judge model, Tier 2 (complex) → main model
- This is the ONLY file that changes between demo and production for AI inference

**retrieval_engine.py** — Tri-modal retrieval orchestration
- Runs dense search, sparse search, BM25 search in parallel (asyncio.gather)
- Applies RRF fusion with k=60 parameter
- Calls CRAG self-reflection via judge model
- Applies cross-encoder reranking
- Hydrates parent chunks from PostgreSQL

**validation_engine.py** — Three-tier answer validation
- Tier 1: Deterministic rules (output leak, scope, T-code policy)
- Tier 2: DeBERTa NLI claim-by-claim entailment check
- Tier 3: LLM-as-Judge holistic quality assessment via judge model
- Freshness check: compares source chunk dates against config_snapshot thresholds
- Attribution builder: constructs the attribution_panel response field

**query_intelligence.py** — Query understanding
- SAP entity extraction: T-codes (VL01N pattern), error codes (VL150 pattern), transaction names, field names
- Context resolution: resolves pronouns and references using conversation history
- Synonym mapping: maps informal terms to SAP terminology (e.g., "delivery document" → VL01N)
- Complexity classification: determines which model tier to use

**ingestion_pipeline.py** — 11-stage document ingestion
- See COPILOT_04 for stage-by-stage detail

**form_chunker.py** — Quick Entry structure-aware chunking
- Different chunking strategy per content_type:
  * error_guide: chunks by error_code field, symptoms, root_causes, resolution_steps
  * procedure: chunks by individual step, groups of 3 steps for context, overview chunk
  * config: chunks by individual field definition, groups by functional area
- Every chunk includes a TypeScript-mirrored version in frontend/src/lib/chunkAssembler.ts

**form_validator.py** — Quick Entry form validation
- Validates required fields per content_type
- Validates SAP entity format (T-code regex, error code regex)
- Validates module against allowed values
- Returns specific field-level error messages (not generic "invalid form")

**vision_integration.py** — Vision pipeline coordination for document ingestion
- Dispatches vision ARQ task when uploaded document contains screenshots
- Different from Quick Entry screenshot pipeline (that uses ollama_vision.py directly)

### backend/app/routers/ — REST Routers (Quick Entry Addition)

**knowledge_entries.py** — 11 Quick Entry REST endpoints
- POST /api/admin/knowledge-entries — create draft
- GET /api/admin/knowledge-entries — list with filters/pagination
- GET /api/admin/knowledge-entries/{id} — get single entry with all versions
- PATCH /api/admin/knowledge-entries/{id} — update draft
- POST /api/admin/knowledge-entries/{id}/publish — publish entry
- POST /api/admin/knowledge-entries/{id}/archive — archive entry
- POST /api/admin/knowledge-entries/{id}/confirm-current — reset staleness
- GET /api/admin/knowledge-entries/{id}/versions — version history
- GET /api/admin/knowledge-entries/{id}/chunks — preview chunks
- GET /api/admin/knowledge-entries/coverage-search — pre-creation duplicate check
- POST /api/admin/knowledge-entries/bulk-import — import from DOCX/PDF

### backend/app/clients/ — Vision Client (Quick Entry Addition)

**ollama_vision.py** — Direct Ollama vision API client
- classify_sap(image_base64: str) → SAPScreenshotType
  * Identifies screenshot type: error_dialog, transaction_screen, report_output, configuration, list_display
- extract_sap_content(image_base64: str, screen_type: SAPScreenshotType) → ExtractedSAPData
  * Extracts: error_codes, t_codes, field_names, field_values, screen_title, message_text, table_data
  * Uses type-specific prompt templates for higher accuracy
- Both methods call OLLAMA_VISION_URL/api/generate with base64 image in the messages

---

## 7. FRONTEND ARCHITECTURE

### Technology Stack
- Next.js 14 with App Router (file-based routing)
- TypeScript (strict mode)
- Tailwind CSS (utility-first styling, design tokens in globals.css)
- Zustand (client-side global state)
- TanStack Query v5 (server state, caching, mutations)
- shadcn/ui primitives (drawer, dialog components)

### Route Groups (Next.js App Router)
- **(admin)** route group: wraps all /admin/* pages with AdminShell layout (sidebar + topbar)
- **(employee)** route group: wraps the chat and history pages with EmployeeShell layout (topbar only)
- **(auth)** route group: login page with no shell layout

### Admin Portal Pages
- /admin/dashboard — real-time quality metrics, recent activity
- /admin/documents — upload SAP documentation, ingestion status
- /admin/quick-entry — Quick Entry list, search, filters
- /admin/quick-entry/new — create Quick Entry form
- /admin/quick-entry/[id] — edit existing Quick Entry
- /admin/registry — Z-Error/Known Patterns Registry
- /admin/knowledge-gaps — detected gaps from employee queries
- /admin/review-queue — human review queue (low-confidence answers)
- /admin/tickets — mock SAP ticket management
- /admin/config-snapshot — current SAP config snapshot management
- /admin/audit-trail — employee action audit log
- /admin/system-health — all 19 service health statuses
- /admin/analytics — Recharts dashboards for LLM quality, retrieval quality, cache performance

### State Management
- **chatStore** — messages array, streaming state, session ID, screenshot attachments
- **sessionStore** — user identity, role (employee/admin), access token, token expiry
- **adminStore** — admin portal filters, pagination state, bulk selection
- **panelStore** — attribution panel open/closed state, selected source chunk
- **uiStore** — sidebar collapsed/expanded, dark/light theme, command palette open

### Next.js API Routes (Server-Side Only)
- /api/auth/keycloak-token — exchanges Keycloak code for tokens, sets HttpOnly cookies
- /api/auth/ws-token — issues short-lived WebSocket authentication token
- /api/proxy/[...path] — authenticated proxy to FastAPI (adds Bearer token from cookie)
- /api/screenshots/[...path] — authenticated MinIO proxy (validates user can see screenshot)
- /api/upload/document — proxies document upload to FastAPI with auth
- /api/upload/screenshot — proxies screenshot upload with auth

---

## 8. SECURITY ARCHITECTURE

### Authentication Flow
1. Employee opens browser → redirected to Keycloak login page
2. Employee authenticates with Keycloak (LDAP/local credentials)
3. Keycloak issues JWT (access token + refresh token)
4. Next.js keycloak-token route stores tokens in HttpOnly cookies (not accessible to JavaScript)
5. Every API call from Next.js proxy route reads token from cookie, adds Bearer header to FastAPI request
6. FastAPI authentication middleware validates JWT signature against Keycloak public key (cached)
7. Middleware checks JWT revocation set in Redis Queue
8. Middleware extracts user_id and role from JWT claims
9. Role is attached to request state for handler-level authorization

### Key Security Properties
- Employees cannot access /admin/* routes — role check in authentication middleware
- All tokens stored in HttpOnly cookies — XSS cannot steal tokens
- mTLS between internal Docker services in production
- Input governance middleware blocks: prompt injection attempts, system prompt extraction, questions about DB credentials or Vault paths, attempts to make the AI ignore its instructions
- Output governance middleware blocks: database connection strings, internal hostnames, Vault paths, content that references internal infrastructure

---

## 9. QUICK ENTRY FEATURE — ARCHITECTURAL OVERVIEW

Quick Entry is a parallel knowledge ingestion path that bypasses the document creation stage of the standard ingestion pipeline.

**Standard ingestion path:** IT creates Word doc → uploads to AEGIS → 11-stage pipeline processes it → searchable

**Quick Entry path:** IT fills web form → server-side validation (replaces stages 1–4) → embedding + indexing (stages 7, 10, 11) → searchable in minutes

**Three form types, each with different chunking strategy:**
1. error_guide — documents a specific SAP error code, its symptoms, root causes, resolution steps
2. procedure — documents a multi-step SAP workflow with numbered steps and decision points
3. config — documents a configuration field: current value, allowed values, impact, last changed

**Quick Entry chunks land in the same Qdrant collections as document chunks.** The retrieval system has no knowledge of whether a chunk came from a document or a Quick Entry — it treats them identically. This is by design.

**Screenshot attachment:** IT admins can attach SAP screenshots to specific sections of a Quick Entry. The vision model reads these screenshots and appends extracted data (error codes, field values, screen title) to the relevant chunk's text before embedding. This enriches the chunk with additional searchable content.

---

## 10. PRODUCTION MIGRATION MECHANISM

The entire demo → production migration is controlled by a single environment variable.

**In .env:**
```
MODEL_BACKEND=ollama         # demo
# MODEL_BACKEND=vllm         # production — uncomment to switch
```

**model_gateway.py reads this variable and routes accordingly:**
```python
if settings.MODEL_BACKEND == "ollama":
    base_url = settings.OLLAMA_MAIN_URL   # http://aegis-ollama-main:11434
    # Ollama API format: POST /api/generate
else:
    base_url = settings.VLLM_BASE_URL     # https://private-cloud-vllm
    # vLLM OpenAI-compatible API: POST /v1/chat/completions
```

**What changes for production:**
1. Set MODEL_BACKEND=vllm in .env
2. Add VLLM_BASE_URL, VLLM_MODEL_MAIN, VLLM_MODEL_JUDGE, VLLM_MODEL_VISION
3. Use docker-compose.prod.yml which removes the three Ollama containers (GPU handles inference)
4. Scale PostgreSQL, Redis, Qdrant to cloud instances if needed

**What does NOT change:**
- Zero Python source files change
- Zero TypeScript source files change
- Zero Docker configurations change except removing Ollama containers
- All business logic, validation, retrieval, frontend — identical
