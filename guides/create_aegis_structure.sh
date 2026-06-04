#!/bin/bash
# =============================================================================
# AEGIS PROJECT STRUCTURE CREATION SCRIPT — V2
# Sona Comstar SAP Helpdesk AI
#
# WHAT THIS SCRIPT CREATES:
#   - All 80 directories
#   - All Python __init__.py package markers
#   - Essential non-code files: .gitignore, .env.example, Makefile,
#     .editorconfig, CONTRIBUTING.md, docs/, guides/ placeholder,
#     .dockerignore files, service README.md files, model_info.txt
#
# WHAT THIS SCRIPT DOES NOT CREATE:
#   - Python source files (.py except __init__.py) — agent creates per spec
#   - TypeScript/React files (.tsx, .ts) — agent creates per spec
#   - Dockerfiles — agent creates in IMPL_03
#   - docker-compose.yml — agent creates in IMPL_03
#   - requirements.txt, package.json — agent creates in IMPL_01/02
#   - Alembic source files — agent creates in IMPL_05
#   - Monitoring configs — agent creates in IMPL_20
#   - Test files — agent creates per spec
#
# RUN: bash create_aegis_structure.sh
# FROM: ~/aegis-project/
# =============================================================================

set -e

echo ""
echo "=========================================================="
echo "  AEGIS Project Structure — V2"
echo "  Creates directories + essential files only"
echo "  Agent (Copilot) creates all source code per specs"
echo "=========================================================="
echo ""
echo "Target directory: $(pwd)"
echo ""
echo "Press Enter to continue, Ctrl+C to cancel..."
read -r

# =============================================================================
# SECTION 1 — BACKEND DIRECTORIES
# Docker build context: ./backend  (defined in IMPL_03 docker-compose.yml)
# =============================================================================
echo "[1/9] Creating backend/ directories..."

mkdir -p backend/app/handlers
mkdir -p backend/app/infrastructure
mkdir -p backend/app/middleware
mkdir -p backend/app/models
mkdir -p backend/app/services
mkdir -p backend/app/routers
mkdir -p backend/app/clients
mkdir -p backend/app/tasks
mkdir -p backend/app/workers

# Python package markers — Python cannot import from a directory without __init__.py
# These must exist BEFORE the agent writes any source files or imports will fail
echo "      Creating backend __init__.py package markers..."
touch backend/app/__init__.py
touch backend/app/handlers/__init__.py
touch backend/app/infrastructure/__init__.py
touch backend/app/middleware/__init__.py
touch backend/app/models/__init__.py
touch backend/app/services/__init__.py
touch backend/app/routers/__init__.py
touch backend/app/clients/__init__.py
touch backend/app/tasks/__init__.py
touch backend/app/workers/__init__.py

# Docker ignore — exclude unnecessary files from the backend Docker image
# Without this, .venv, __pycache__, .env enter the image (slow builds, security risk)
cat > backend/.dockerignore << 'DOCKERIGNORE_EOF'
.venv/
venv/
env/
__pycache__/
*.pyc
*.pyo
.pytest_cache/
.ruff_cache/
.mypy_cache/
*.egg-info/
dist/
build/
.env
.env.*
!.env.example
tests/
*.log
logs/
.git/
.gitignore
README.md
CONTRIBUTING.md
DOCKERIGNORE_EOF

# =============================================================================
# SECTION 2 — MICROSERVICES
# Names are hyphenated — must match IMPL_03 docker-compose.yml build contexts:
#   context: ./services/bge-embedding
#   context: ./services/deberta-nli
# =============================================================================
echo "[2/9] Creating services/ directories..."

mkdir -p services/bge-embedding
mkdir -p services/deberta-nli

# Service README files — documents API contract for each microservice
cat > services/bge-embedding/README.md << 'BGE_README_EOF'
# BGE Embedding Service

**Model:** BAAI/bge-base-en-v1.5
**Output dimensions:** 768 (dense vector)
**Port:** 8002
**Container name:** aegis-bge

## API

POST /embed
Body: {"texts": ["text1", "text2"]}
Returns: {"embeddings": [[0.1, 0.2, ...], ...]}

POST /embed-single
Body: {"text": "single text"}
Returns: {"embedding": [0.1, 0.2, ...]}

GET /health
Returns: {"status": "healthy", "model": "bge-base-en-v1.5", "dim": 768}

## Notes
- Implemented in IMPL_04
- Dockerfile in IMPL_03
- Called by retrieval_engine.py and process_form_entry.py ARQ task
BGE_README_EOF

cat > services/deberta-nli/README.md << 'DEBERTA_README_EOF'
# DeBERTa NLI Service

**Model:** cross-encoder/nli-deberta-v3-large
**Task:** Natural Language Inference (entailment validation)
**Port:** 8001
**Container name:** aegis-deberta

## API

POST /nli
Body: {"premise": "source text", "hypothesis": "claim to verify"}
Returns: {"label": "entailment|neutral|contradiction", "score": 0.95}

GET /health
Returns: {"status": "healthy", "model": "nli-deberta-v3-large"}

## Notes
- Implemented in IMPL_04
- Dockerfile in IMPL_03
- Called by validation_engine.py Tier 2 NLI check
DEBERTA_README_EOF

# =============================================================================
# SECTION 3 — FRONTEND DIRECTORIES
# Exact paths extracted from FRONTEND_01-40 specification documents
# Route groups (admin), (employee), (auth) are Next.js App Router conventions
# =============================================================================
echo "[3/9] Creating frontend/ directories..."

# Route group directories — Next.js uses () for layout grouping without URL segments
mkdir -p "frontend/src/app/(admin)/admin/dashboard"
mkdir -p "frontend/src/app/(admin)/admin/documents"
mkdir -p "frontend/src/app/(admin)/admin/quick-entry/new"
mkdir -p "frontend/src/app/(admin)/admin/quick-entry/[id]"
mkdir -p "frontend/src/app/(admin)/admin/registry"
mkdir -p "frontend/src/app/(admin)/admin/knowledge-gaps"
mkdir -p "frontend/src/app/(admin)/admin/review-queue"
mkdir -p "frontend/src/app/(admin)/admin/tickets"
mkdir -p "frontend/src/app/(admin)/admin/config-snapshot"
mkdir -p "frontend/src/app/(admin)/admin/audit-trail"
mkdir -p "frontend/src/app/(admin)/admin/system-health"
mkdir -p "frontend/src/app/(admin)/admin/analytics"
mkdir -p "frontend/src/app/(employee)/history"
mkdir -p "frontend/src/app/(auth)/login"
mkdir -p "frontend/src/app/login"

# API routes — Next.js server-side routes
mkdir -p "frontend/src/app/api/auth/keycloak-token"
mkdir -p "frontend/src/app/api/auth/ws-token"
mkdir -p "frontend/src/app/api/proxy/[...path]"
mkdir -p "frontend/src/app/api/screenshots/[...path]"
mkdir -p "frontend/src/app/api/upload/document"
mkdir -p "frontend/src/app/api/upload/screenshot"

# Component directories
mkdir -p frontend/src/components/admin/charts
mkdir -p frontend/src/components/chat
mkdir -p frontend/src/components/onboarding
mkdir -p frontend/src/components/pdf
mkdir -p frontend/src/components/quick-entry
mkdir -p frontend/src/components/sessions
mkdir -p frontend/src/components/shared/providers
mkdir -p frontend/src/components/ui

# State, hooks, utilities
mkdir -p frontend/src/hooks/queries
mkdir -p frontend/src/lib
mkdir -p frontend/src/stores
mkdir -p frontend/src/types

# Frontend Docker ignore
cat > frontend/.dockerignore << 'FE_DOCKERIGNORE_EOF'
node_modules/
.next/
out/
.env.local
.env.development.local
.env.test.local
.env.production.local
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.git/
.gitignore
README.md
FE_DOCKERIGNORE_EOF

# Frontend env template — NEXT_PUBLIC_ vars are safe to commit as examples
cat > frontend/.env.local.example << 'FE_ENV_EOF'
# Frontend environment — copy this to .env.local and fill in real values
# NEVER commit .env.local to git

# API endpoints (from Next.js browser context)
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# Auth (server-side only — not NEXT_PUBLIC)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=REPLACE_generate_with_openssl_rand_base64_32

# Backend internal URL (for Next.js API routes calling FastAPI)
BACKEND_INTERNAL_URL=http://aegis-fastapi:8000

# Keycloak (server-side only)
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=nexus-realm
KEYCLOAK_CLIENT_ID=aegis-frontend
KEYCLOAK_CLIENT_SECRET=REPLACE_client_secret
FE_ENV_EOF

# =============================================================================
# SECTION 4 — OTHER PROJECT DIRECTORIES
# =============================================================================
echo "[4/9] Creating alembic/, scripts/, monitoring/, tests/ directories..."

mkdir -p alembic/versions
mkdir -p scripts
mkdir -p monitoring/prometheus/rules
mkdir -p monitoring/grafana/datasources
mkdir -p monitoring/grafana/dashboards
mkdir -p tests/unit
mkdir -p tests/integration

# Python test package markers
touch tests/__init__.py
touch tests/unit/__init__.py
touch tests/integration/__init__.py

# Alembic versions README — agent reads this to name migration files correctly
cat > alembic/versions/README.md << 'ALEMBIC_EOF'
# Alembic Migration Naming Convention

File format: YYYYMMDD_HHMMSS_short_description.py

Examples:
  20250527_000000_initial_schema.py         — IMPL_05 initial tables
  20250527_000001_quick_entry_tables.py     — IMPL_24 Quick Entry tables

Rules:
  - One migration per IMPL session that changes the schema
  - Descriptions must be lowercase with underscores
  - Never rename a migration after it has been applied to any environment
  - Run migrations with: docker compose exec aegis-fastapi alembic upgrade head
ALEMBIC_EOF

# Empty model_info.txt — setup_models.py writes into this after pulling Ollama models
# Its existence is checked by IMPL_04 verification steps
touch scripts/model_info.txt

# =============================================================================
# SECTION 5 — DOCUMENTATION DIRECTORIES (not in specs, required for production)
# =============================================================================
echo "[5/9] Creating docs/ directory..."

mkdir -p docs

cat > docs/ARCHITECTURE.md << 'ARCH_EOF'
# AEGIS Architecture Overview
## Adaptive Enterprise Grade Intelligence System — Sona Comstar

---

## System Description

AEGIS is an enterprise SAP helpdesk AI that answers employee questions about SAP
by retrieving information from internal documentation and generating validated answers.

All data stays on-premises (demo) or on a private cloud (production). No SAP data
leaves the Sona Comstar network at any point.

---

## Zone Architecture

```
Zone A — Security Perimeter
  Nginx (reverse proxy, TLS termination, rate limiting)
  Keycloak (OIDC/OAuth2 identity, JWT issuance)
  HashiCorp Vault (secrets, dynamic credentials, PKI)

Zone B — Orchestration (FastAPI + ARQ)
  FastAPI application (chat, admin, Quick Entry APIs)
  ARQ worker (async: vision enrichment, audit logs, cache, gaps)
  Content Governance Middleware (input + output filtering)

Zone C — AI Pipeline
  Query Intelligence (SAP entity extraction, context resolution)
  Retrieval Engine (dense + BM25 + CRAG + reranker)
  Model Gateway (Ollama demo / vLLM production — env var switch)
  Validation Engine (deterministic + NLI + LLM judge)
  Vision Integration (Ollama qwen2.5vl screenshot reading)

Zone D — Presentation
  Next.js (employee chat + admin portal — single application)

Zone E — Data Layer
  PostgreSQL primary + read replica + PgBouncer connection pool
  Qdrant vector DB (4 collections: errors, procedures, configs, cache)
  OpenSearch (BM25 keyword search, SAP-specific analyzer)
  Redis session store + Redis ARQ queue (two separate instances)
  MinIO object storage (documents, knowledge screenshots)

Zone F — Observability
  Prometheus (metrics from all 19 services)
  Grafana (dashboards: system health, LLM quality, retrieval quality)
```

---

## AI Models

| Model | Role | Demo | Production |
|-------|------|------|------------|
| Main generation | Writes answers | qwen2.5:32b CPU via Ollama | qwen2.5:72b GPU via vLLM |
| Judge model | Tier 3 validation | qwen2.5:7b CPU via Ollama | qwen2.5:14b GPU via vLLM |
| Vision model | Reads SAP screenshots | qwen2.5vl:7b CPU via Ollama | qwen2.5vl:72b GPU via vLLM |
| Dense embedding | 768-dim vectors | BGE-base-en-v1.5 CPU | BGE-base-en-v1.5 GPU |
| NLI validation | Tier 2 entailment | DeBERTa-v3-large-mnli CPU | same GPU |

---

## Qdrant Collections

| Collection | Content |
|------------|---------|
| meridian_errors | Error guide chunks (SAP error code documentation) |
| meridian_procedures | Procedure chunks (step-by-step SAP workflows) |
| meridian_configs | Configuration chunks (SAP settings, field values) |
| cache_queries | Semantic cache (previously answered queries) |

All vectors: 768-dimensional (BGE-base-en-v1.5)

---

## Implementation Sessions

Sessions 1–22: Base AEGIS system (IMPL_01 through IMPL_22)
Sessions 23–29: Quick Entry feature (IMPL_23 through IMPL_29)
Frontend 1–22: Employee chat + admin portal (FRONTEND_01 through FRONTEND_22)
Frontend 36–40: Quick Entry UI (FRONTEND_36 through FRONTEND_40)

---

## Production Migration

One environment variable change triggers the switch:
MODEL_BACKEND=ollama  →  MODEL_BACKEND=vllm

model_gateway.py reads this and routes all inference calls accordingly.
No Python code changes. No TypeScript changes. docker-compose.prod.yml
overrides service configs. The rest of the stack is identical.
ARCH_EOF

cat > docs/ONBOARDING.md << 'ONBOARD_EOF'
# AEGIS Developer Onboarding Guide
## New Developer Setup — End to End

---

## Prerequisites

Before starting, confirm these are installed on your Windows machine:
- WSL2 with Ubuntu (Windows key → type "WSL", install from Microsoft Store)
- Docker Desktop for Windows (docker.com/products/docker-desktop)
- Ollama for Windows (ollama.com/download)
- Node.js 20+ (nodejs.org)
- Git for Windows (git-scm.com)

Confirm in Ubuntu terminal:
```bash
docker --version        # Docker version 25+
node --version          # v20+
python3 --version       # Python 3.11+
git --version           # git version 2.40+
```

---

## Step 1 — Clone the Repository

```bash
cd ~
git clone https://github.com/YOUR-USERNAME/aegis-sap-helpdesk.git aegis-project
cd aegis-project
```

---

## Step 2 — Configure Environment

```bash
cp .env.example .env
cp frontend/.env.local.example frontend/.env.local
```

Open `.env` and fill in the REPLACE_ values. Key ones for local dev:
- `APP_SECRET_KEY` — generate: `python3 -c "import secrets; print(secrets.token_hex(32))"`
- `NEXTAUTH_SECRET` — generate: `openssl rand -base64 32`
- Passwords can be anything strong for local dev

---

## Step 3 — Download Ollama Models (one-time, takes 1-3 hours)

Open Windows PowerShell:
```powershell
ollama pull qwen2.5:32b     # 19GB — main generation model
ollama pull qwen2.5:7b      # 4.5GB — judge model
ollama pull qwen2.5vl:7b    # 5GB — vision model (check exact tag with: ollama search qwen2.5vl)
```

Verify:
```powershell
ollama list   # should show all 3 models
```

---

## Step 4 — Start All Services

```bash
cd ~/aegis-project
make up          # starts all 19 Docker services
make status      # check all are healthy (takes 2-3 minutes on first start)
```

---

## Step 5 — Initialize Data Stores

```bash
make init        # runs: init_database.py, init_qdrant.py, init_opensearch.py
python scripts/setup_keycloak.py   # creates realm, clients, test users
python scripts/setup_vault.py      # configures Vault AppRole and secrets
python scripts/setup_models.py     # verifies all AI services respond
python scripts/seed_test_documents.py  # loads sample SAP documents
```

---

## Step 6 — Verify Everything

```bash
make status               # all 19 services green
python scripts/verify_health.py   # all endpoints responding
curl http://localhost:11434        # Ollama is running (from Ubuntu)
```

Open in browser:
- `http://localhost:3000` — AEGIS employee chat (login: employee@sonacomstar.com / password: aegis2024)
- `http://localhost:3000/admin` — Admin portal (login: admin@sonacomstar.com / password: aegis2024)
- `http://localhost:9090` — Prometheus
- `http://localhost:3001` — Grafana (admin/admin)

---

## Daily Development Commands

```bash
make up          # start all services
make down        # stop all services
make logs        # follow FastAPI logs
make shell       # bash inside FastAPI container
make migrate     # run database migrations
make test        # run test suite
make lint        # run ruff linter
make status      # check service health
```

---

## Implementation Session Workflow

```bash
# Before each session
git checkout dev && git pull origin dev
git checkout -b session/impl-XX-description

# After agent completes the session
git add -A
git commit -m "Session N: IMPL_XX — description"
git push -u origin session/impl-XX-description

# After review
git checkout dev && git merge session/impl-XX-description && git push origin dev
```

---

## Where to Find Things

| What | Where |
|------|-------|
| All specification documents | `specs/tier2_implementation/` and `specs/tier4_frontend/` |
| Environment variables | `.env` and `frontend/.env.local` |
| Docker service definitions | `docker-compose.yml` |
| Database migrations | `alembic/versions/` |
| AI model config | `.env` — OLLAMA_MODEL_MAIN, OLLAMA_MODEL_JUDGE, OLLAMA_MODEL_VISION |
| Admin API routes | `backend/app/handlers/admin_handler.py` |
| Chat API + WebSocket | `backend/app/handlers/chat_handler.py` |
| Quick Entry API | `backend/app/routers/knowledge_entries.py` |
| Main AI pipeline | `backend/app/services/retrieval_engine.py` + `validation_engine.py` |
ONBOARD_EOF

# =============================================================================
# SECTION 6 — GUIDES DIRECTORY (pre-implementation documents)
# =============================================================================
echo "[6/9] Creating guides/ directory..."

mkdir -p guides
# Note: The actual guide files (Ollama guide, master plan, this script, GitHub guide)
# should be moved here from wherever they were created.
# The agent does NOT create files in guides/ — these are your operational docs.
cat > guides/README.md << 'GUIDES_EOF'
# AEGIS Guides

Pre-implementation and operational guides for the AEGIS project.
These are not implementation specs — they are setup and reference documents.

| File | Purpose |
|------|---------|
| PRE_IMPLEMENTATION_MASTER_PLAN.md | Phases A-K before first coding session |
| OLLAMA_MODEL_GUIDE_CORRECTED.md | How to download and verify Qwen models |
| AEGIS_DIRECTORY_STRUCTURE.md | This project's directory structure explained |
| create_aegis_structure.sh | The script that created this project structure |
| GITHUB_SETUP_GUIDE.md | GitHub repository setup from scratch |
GUIDES_EOF

# =============================================================================
# SECTION 7 — ROOT FILES
# =============================================================================
echo "[7/9] Creating root files..."

# .gitignore — must exist before first git add or .env gets committed
cat > .gitignore << 'GITIGNORE_EOF'
# =============================================================================
# AEGIS — Git Ignore
# =============================================================================

# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
.venv/
venv/
env/
*.egg-info/
dist/
build/
.pytest_cache/
.ruff_cache/
.mypy_cache/
.coverage
htmlcov/
coverage.xml

# CRITICAL: NEVER commit environment files with real credentials
.env
.env.prod
.env.local
.env.development.local
.env.test.local
.env.production.local
frontend/.env.local

# Keep the example templates — these are safe to commit
!.env.example
!.env.prod.example
!frontend/.env.local.example

# Node
frontend/node_modules/
frontend/.next/
frontend/out/

# Docker volume data (large, machine-specific, never commit)
postgres_data/
qdrant_storage/
opensearch_data/
redis_data/
minio_data/
grafana_data/
prometheus_data/
keycloak_data/
vault_data/

# Model weights (gigabytes, never commit)
*.gguf
*.ggml
*.bin
models/

# SSL certificates (never commit private keys)
*.pem
*.crt
*.key
*.p12
backend/app/certs/

# IDE
.vscode/settings.json
.idea/
*.swp
*.swo
.cursor/

# OS
.DS_Store
Thumbs.db
desktop.ini

# Logs
*.log
logs/

# Alembic cache only (migration py files are committed)
alembic/__pycache__/

# Test artifacts
.coverage
htmlcov/
coverage.xml

# Temporary files
tmp/
temp/
*.tmp
GITIGNORE_EOF

# .env.example — full template with all required variables
cat > .env.example << 'ENV_EOF'
# =============================================================================
# AEGIS Environment Variables — Template
# Copy to .env and fill in real values
# NEVER commit .env to git
# =============================================================================

# ─── Application ──────────────────────────────────────────────────────────────
APP_ENV=development
APP_SECRET_KEY=REPLACE_generate_with_python_secrets_token_hex_32
DEBUG=true
LOG_LEVEL=INFO

# ─── PostgreSQL ───────────────────────────────────────────────────────────────
POSTGRES_HOST=aegis-postgres-primary
POSTGRES_PORT=5432
POSTGRES_DB=aegis_db
POSTGRES_USER=aegis_user
POSTGRES_PASSWORD=REPLACE_strong_password
# Routed through PgBouncer connection pool
DATABASE_URL=postgresql+asyncpg://aegis_user:REPLACE_strong_password@aegis-pgbouncer:5432/aegis_db

# ─── Qdrant Vector Database ───────────────────────────────────────────────────
# Collections: meridian_errors, meridian_procedures, meridian_configs, cache_queries
# All vectors: 768-dimensional (BGE-base-en-v1.5)
QDRANT_HOST=aegis-qdrant
QDRANT_PORT=6333
QDRANT_API_KEY=

# ─── OpenSearch (BM25 keyword search) ─────────────────────────────────────────
OPENSEARCH_HOST=aegis-opensearch
OPENSEARCH_PORT=9200
OPENSEARCH_USER=admin
OPENSEARCH_PASSWORD=REPLACE_strong_password
OPENSEARCH_INDEX=aegis_knowledge

# ─── Redis (TWO separate instances) ──────────────────────────────────────────
# Instance 1: session store, semantic cache, rate limiting
REDIS_SESSION_URL=redis://aegis-redis-session:6379
# Instance 2: ARQ job queue, JWT revocation set
REDIS_ARQ_URL=redis://aegis-redis-queue:6380

# ─── MinIO Object Storage ─────────────────────────────────────────────────────
MINIO_ENDPOINT=aegis-minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=REPLACE_strong_password
MINIO_BUCKET_DOCUMENTS=aegis-documents
MINIO_BUCKET_SCREENSHOTS=knowledge-screenshots
MINIO_USE_SSL=false

# ─── Keycloak OIDC ────────────────────────────────────────────────────────────
KEYCLOAK_URL=http://aegis-keycloak:8080
KEYCLOAK_REALM=nexus-realm
KEYCLOAK_CLIENT_ID=aegis-backend
KEYCLOAK_CLIENT_SECRET=REPLACE_client_secret
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=REPLACE_keycloak_admin_password

# ─── HashiCorp Vault ──────────────────────────────────────────────────────────
VAULT_ADDR=http://aegis-vault:8200
VAULT_ROLE_ID=REPLACE_role_id
VAULT_SECRET_ID=REPLACE_secret_id
# Dev only — do not use in production
VAULT_DEV_ROOT_TOKEN=aegis-dev-root-token

# ─── AI Models — DEMO (CPU inference via Ollama on Windows host) ──────────────
# MODEL_BACKEND controls which inference backend is used
# demo: ollama | production: vllm
MODEL_BACKEND=ollama

# host.docker.internal = Windows host IP reachable from Docker containers
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL_MAIN=qwen2.5:32b
OLLAMA_MODEL_JUDGE=qwen2.5:7b
OLLAMA_MODEL_VISION=qwen2.5vl:7b

# ─── AI Models — PRODUCTION (swap MODEL_BACKEND=vllm + fill these) ────────────
# MODEL_BACKEND=vllm
# VLLM_BASE_URL=https://your-private-vllm-endpoint
# VLLM_MODEL_MAIN=qwen2.5:72b
# VLLM_MODEL_JUDGE=qwen2.5:14b
# VLLM_MODEL_VISION=qwen2.5vl:72b
# VLLM_API_KEY=your-vllm-api-key

# ─── AI Microservices (internal Docker network) ────────────────────────────────
BGE_SERVICE_URL=http://aegis-bge:8002
DEBERTA_SERVICE_URL=http://aegis-deberta:8001

# ─── Semantic Cache ───────────────────────────────────────────────────────────
SEMANTIC_CACHE_THRESHOLD=0.88
SEMANTIC_CACHE_TTL_HOURS=24

# ─── Frontend ─────────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
BACKEND_INTERNAL_URL=http://aegis-fastapi:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=REPLACE_generate_with_openssl_rand_base64_32
ENV_EOF

# docker-compose.prod.yml — empty placeholder; agent fills in IMPL_03 review
cat > docker-compose.prod.yml << 'PROD_EOF'
# =============================================================================
# AEGIS — Production Docker Compose Override
# Usage: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
#
# This file overrides the demo docker-compose.yml for production deployment.
# It changes only model-serving related configs.
# All other services (PostgreSQL, Qdrant, OpenSearch, Redis, etc.) are identical.
#
# Agent populates this file during the IMPL_03 session review.
# The key changes for production:
#   - MODEL_BACKEND=vllm (instead of ollama)
#   - No local Ollama containers (3 removed)
#   - vLLM endpoint configured via VLLM_BASE_URL env var
#   - Resource limits adjusted for cloud GPU instance
# =============================================================================

# Agent creates this file content during IMPL_03
PROD_EOF

# README.md — project overview
cat > README.md << 'README_EOF'
# AEGIS — SAP Helpdesk AI
## Adaptive Enterprise Grade Intelligence System | Sona Comstar, Chennai

AEGIS is an enterprise-grade AI assistant that answers SAP helpdesk questions
by retrieving information from internal SAP documentation and generating
validated, source-cited answers.

---

## Quick Start (after initial setup)

```bash
make up          # start all 19 Docker services
make status      # verify all services healthy
make logs        # follow application logs
```

Access:
- Employee Chat: http://localhost:3000
- Admin Portal: http://localhost:3000/admin
- Grafana: http://localhost:3001

---

## First Time Setup

See `docs/ONBOARDING.md` for complete setup instructions.

Short version:
1. Install prerequisites (WSL2, Docker Desktop, Ollama, Node.js)
2. `cp .env.example .env` and fill in values
3. Download Ollama models: `ollama pull qwen2.5:32b` (+ 2 more)
4. `make up && make init`
5. `python scripts/setup_keycloak.py && python scripts/setup_models.py`

---

## Architecture

See `docs/ARCHITECTURE.md` for the full system design.

19 Docker services across 6 zones (Security, Orchestration, AI Pipeline,
Presentation, Data Layer, Observability). Demo runs on CPU with Qwen2.5-32B.
Production migrates to private cloud GPU with Qwen2.5-72B — one env var change.

---

## Implementation Progress

Session status tracked in `specs/tier2_implementation/` (IMPL_01–29) and
`specs/tier4_frontend/` (FRONTEND_01–40).

---

## For Developers

See `CONTRIBUTING.md` for branch naming, commit format, and PR process.
README_EOF

# CONTRIBUTING.md — development workflow guide
cat > CONTRIBUTING.md << 'CONTRIB_EOF'
# Contributing to AEGIS

## Branch Naming Convention

```
session/impl-01-dependencies
session/impl-02-env-setup
session/impl-03-docker
session/impl-04-models
...
session/impl-23-quickentry-overview
session/impl-24-quickentry-data-model
session/impl-25-quickentry-api
session/impl-26-quickentry-pipeline
session/impl-27-quickentry-chunker
session/impl-28-quickentry-screenshots
session/impl-29-quickentry-operations
session/frontend-01-11-core
session/frontend-12-15-employee
session/frontend-16-22-admin
session/frontend-36-40-quickentry
```

## Commit Message Format

```
Session N: IMPL_XX — short description of what was built

- specific component 1 created
- specific component 2 created
- tests added for component X
- verified: all existing tests still pass
```

Example:
```
Session 4: IMPL_04 — AI models setup complete

- BGE embedding service verified (768-dim vectors)
- DeBERTa NLI service verified (entailment labels correct)
- All 3 Ollama models verified via API
- model_info.txt written with exact model tags
```

## Workflow

1. Pull latest dev: `git checkout dev && git pull origin dev`
2. Create session branch: `git checkout -b session/impl-XX-description`
3. Run agent with the spec document
4. Review all created files
5. Run verification commands from the spec
6. Commit: `git add -A && git commit -m "Session N: IMPL_XX — ..."`
7. Push: `git push -u origin session/impl-XX-description`
8. After review, merge to dev: `git checkout dev && git merge session/impl-XX-description`

## Never Do

- Never commit directly to `main`
- Never commit `.env` or any file containing real credentials
- Never skip the verification commands at the end of each spec
- Never create files the agent should create — let the agent write all source code
CONTRIB_EOF

# =============================================================================
# SECTION 8 — MAKEFILE (common development shortcuts)
# =============================================================================
echo "[8/9] Creating Makefile and .editorconfig..."

cat > Makefile << 'MAKEFILE_EOF'
# =============================================================================
# AEGIS Makefile — Common Development Commands
# =============================================================================

.PHONY: up down restart logs logs-all migrate shell test lint status init seed clean

# ─── Docker ──────────────────────────────────────────────────────────────────

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose down && docker compose up -d

status:
	docker compose ps

logs:
	docker compose logs -f aegis-fastapi

logs-all:
	docker compose logs -f

logs-worker:
	docker compose logs -f aegis-arq

logs-bge:
	docker compose logs -f aegis-bge

logs-deberta:
	docker compose logs -f aegis-deberta

# ─── Database ────────────────────────────────────────────────────────────────

migrate:
	docker compose exec aegis-fastapi alembic upgrade head

migrate-history:
	docker compose exec aegis-fastapi alembic history

migrate-rollback:
	docker compose exec aegis-fastapi alembic downgrade -1

# ─── Development ─────────────────────────────────────────────────────────────

shell:
	docker compose exec aegis-fastapi bash

shell-worker:
	docker compose exec aegis-arq bash

# ─── Tests and Quality ───────────────────────────────────────────────────────

test:
	docker compose exec aegis-fastapi pytest tests/ -v

test-unit:
	docker compose exec aegis-fastapi pytest tests/unit/ -v

test-integration:
	docker compose exec aegis-fastapi pytest tests/integration/ -v

lint:
	docker compose exec aegis-fastapi ruff check backend/

# ─── Initialization (run once after first make up) ───────────────────────────

init:
	python3 scripts/init_database.py
	python3 scripts/init_qdrant.py
	python3 scripts/init_opensearch.py
	python3 scripts/verify_redis.py
	@echo "Core data stores initialized. Now run:"
	@echo "  python3 scripts/setup_keycloak.py"
	@echo "  python3 scripts/setup_vault.py"
	@echo "  python3 scripts/setup_models.py"

seed:
	python3 scripts/seed_test_documents.py

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean:
	docker compose down -v
	@echo "All Docker volumes deleted. Data is gone. Run 'make up && make init' to rebuild."

# ─── Production (use after IT approval) ─────────────────────────────────────

prod-up:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down
MAKEFILE_EOF

# .editorconfig — consistent formatting across all editors and languages
cat > .editorconfig << 'EDITORCONFIG_EOF'
# EditorConfig: https://editorconfig.org
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

# Python files — PEP8 uses 4 spaces
[*.py]
indent_style = space
indent_size = 4
max_line_length = 100

# TypeScript, JavaScript, JSON, CSS — 2 spaces is Next.js/Node convention
[*.{ts,tsx,js,jsx,json,css,scss,yaml,yml,toml,html}]
indent_style = space
indent_size = 2

# Markdown — preserve trailing spaces (they create line breaks)
[*.md]
trim_trailing_whitespace = false

# Makefile — tabs are required (make fails with spaces)
[Makefile]
indent_style = tab

# Shell scripts — 2 spaces
[*.sh]
indent_style = space
indent_size = 2
EDITORCONFIG_EOF

# =============================================================================
# SECTION 9 — FINAL VERIFICATION
# =============================================================================
echo "[9/9] Verifying structure..."

echo ""
echo "=========================================================="
echo "  ✅ AEGIS Structure Creation Complete"
echo "=========================================================="
echo ""
echo "Statistics:"
echo "  Directories : $(find . -type d | grep -v '\.git' | wc -l)"
echo "  Files       : $(find . -type f | grep -v '\.git' | wc -l)"
echo ""
echo "Files created by this script (script-created):"
echo "  Backend __init__.py files  : $(find backend -name '__init__.py' | wc -l)"
echo "  Test __init__.py files     : $(find tests -name '__init__.py' | wc -l)"
echo "  Documentation files        : $(find docs guides -type f | wc -l)"
echo ""
echo "Files the agent will create during implementation sessions:"
echo "  Python source files  : 0 (agent creates all .py source files)"
echo "  TypeScript files     : 0 (agent creates all .ts/.tsx files)"
echo "  Dockerfiles          : 0 (agent creates in IMPL_03)"
echo "  Config files         : 0 (agent creates requirements.txt, package.json, etc.)"
echo ""
echo "Next steps:"
echo "  1. Copy guide files to guides/ folder:"
echo "     cp /path/to/AEGIS_DIRECTORY_STRUCTURE.md guides/"
echo "     cp /path/to/GITHUB_SETUP_GUIDE.md guides/"
echo "     cp /path/to/OLLAMA_MODEL_GUIDE_CORRECTED.md guides/"
echo "  2. Run: git init && git checkout -b main"
echo "  3. Run: git add -A && git commit -m 'Initial AEGIS project structure'"
echo "  4. Follow GITHUB_SETUP_GUIDE.md to push to GitHub"
echo "  5. Begin IMPL_01 implementation session"
