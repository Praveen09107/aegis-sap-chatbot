# IMPL_02: ENVIRONMENT SETUP
## Software Installation, Project Structure Creation, and Environment Configuration
## Session 02 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 02: Set up the development environment and project structure.

Attach to this session: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

Read all four documents. Then follow every step below in exact order. Do not skip steps. Do not reorder steps.

---

## PART 1 — VERIFY SOFTWARE PREREQUISITES

Run each command and confirm the expected output before proceeding.

### Python 3.11
```bash
python3 --version
```
Expected: `Python 3.11.x` or higher. If lower than 3.11, install:
```bash
sudo apt update
sudo apt install python3.11 python3.11-venv python3.11-pip -y
```

### Node.js 20
```bash
node --version
```
Expected: `v20.x.x`. If not installed:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y
```

### Docker and Docker Compose
```bash
docker --version
docker compose version
```
Expected: Docker 24+ and Docker Compose 2.x. If not installed:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
sudo apt install docker-compose-plugin -y
```

### Git
```bash
git --version
```
Expected: `git version 2.x`. If not installed: `sudo apt install git -y`

### OpenSSL (for TLS certificate generation)
```bash
openssl version
```
Expected: `OpenSSL 3.x`. If not installed: `sudo apt install openssl -y`

---

## PART 2 — CREATE THE COMPLETE FOLDER STRUCTURE

Run these commands from the project root directory (`aegis-project/`). The specs folder and all AEGIS specification documents should already be in place from Session 01.

```bash
# Navigate to project root (adjust path as needed)
cd ~/aegis-project

# Verify specs folder is present
ls specs/tier0_agent_guide/AGENT_SESSION_GUIDE.md || echo "ERROR: specs not found"

# ============================================================
# Backend structure
# ============================================================
mkdir -p backend/app/middleware
mkdir -p backend/app/models
mkdir -p backend/app/services
mkdir -p backend/app/tasks
mkdir -p backend/app/infrastructure
mkdir -p backend/app/handlers
mkdir -p backend/app/workers

# Create all __init__.py files for Python packages
touch backend/__init__.py
touch backend/app/__init__.py
touch backend/app/middleware/__init__.py
touch backend/app/models/__init__.py
touch backend/app/services/__init__.py
touch backend/app/tasks/__init__.py
touch backend/app/infrastructure/__init__.py
touch backend/app/handlers/__init__.py
touch backend/app/workers/__init__.py

# ============================================================
# Custom AI services
# ============================================================
mkdir -p services/bge-embedding
mkdir -p services/deberta-nli

# ============================================================
# Frontend structure
# ============================================================
mkdir -p frontend/src/app/login
mkdir -p frontend/src/app/admin/documents
mkdir -p frontend/src/app/admin/registry
mkdir -p frontend/src/app/admin/config-snapshot
mkdir -p frontend/src/app/admin/knowledge-gaps
mkdir -p frontend/src/app/admin/audit-trail
mkdir -p frontend/src/app/admin/review-queue
mkdir -p frontend/src/app/admin/tickets
mkdir -p frontend/src/components/chat
mkdir -p frontend/src/components/admin
mkdir -p frontend/src/hooks
mkdir -p frontend/src/lib
mkdir -p frontend/src/types
mkdir -p frontend/public

# ============================================================
# Infrastructure configuration files
# ============================================================
mkdir -p infrastructure/nginx/ssl
mkdir -p infrastructure/prometheus
mkdir -p infrastructure/grafana/dashboards
mkdir -p infrastructure/grafana/provisioning
mkdir -p infrastructure/pgbouncer
mkdir -p infrastructure/opensearch

# ============================================================
# Database migration files
# ============================================================
mkdir -p database/migrations
mkdir -p database/seeds

# ============================================================
# Scripts
# ============================================================
mkdir -p scripts

# ============================================================
# Tests
# ============================================================
mkdir -p tests/unit
mkdir -p tests/integration
touch tests/__init__.py
touch tests/unit/__init__.py
touch tests/integration/__init__.py

# Verify structure was created
echo "=== FOLDER STRUCTURE VERIFICATION ==="
ls backend/app/
ls services/
ls frontend/src/app/
ls infrastructure/
echo "=== STRUCTURE COMPLETE ==="
```

---

## PART 3 — CREATE THE ENVIRONMENT FILE

Create the `.env` file in the project root with all required variables.

```bash
cat > .env << 'EOF'
# AEGIS Environment Variables — Demo Configuration
# This file is git-ignored. Never commit this file.

# ============================================================
# PostgreSQL — Admin user (used by PgBouncer and Keycloak)
# ============================================================
POSTGRES_ADMIN_PASSWORD=aegis_admin_dev_2024
POSTGRES_REPLICATION_PASSWORD=replication_dev_2024

# ============================================================
# Keycloak Admin
# ============================================================
KEYCLOAK_ADMIN_PASSWORD=keycloak_admin_dev_2024
KEYCLOAK_CLIENT_SECRET=aegis_chat_client_secret_dev

# ============================================================
# Redis (no auth in demo — connection strings only)
# ============================================================
REDIS_SESSION_URL=redis://aegis-redis-session:6379/0
REDIS_QUEUE_URL=redis://aegis-redis-queue:6379/0

# ============================================================
# Vault (Dev mode — fixed root token)
# ============================================================
VAULT_ADDR=http://aegis-vault:8200
VAULT_TOKEN=aegis-dev-root-token

# ============================================================
# Ollama
# ============================================================
OLLAMA_MAIN_URL=http://aegis-ollama-main:11434
OLLAMA_JUDGE_URL=http://aegis-ollama-judge:11434
OLLAMA_VISION_URL=http://aegis-ollama-vision:11434

# ============================================================
# AI Services
# ============================================================
BGE_SERVICE_URL=http://aegis-bge:8002
DEBERTA_SERVICE_URL=http://aegis-deberta:8001

# ============================================================
# Keycloak (connection from FastAPI)
# ============================================================
KEYCLOAK_URL=http://aegis-keycloak:8080
KEYCLOAK_REALM=aegis-realm
KEYCLOAK_CLIENT_ID=aegis-chat
KEYCLOAK_CLIENT_SECRET=aegis_chat_client_secret_dev

# ============================================================
# OpenSearch
# ============================================================
OPENSEARCH_HOST=aegis-opensearch
OPENSEARCH_PORT=9200

# ============================================================
# Qdrant
# ============================================================
QDRANT_HOST=aegis-qdrant
QDRANT_PORT=6333

# ============================================================
# Application
# ============================================================
ENVIRONMENT=demo
LOG_LEVEL=INFO
FASTAPI_HOST=0.0.0.0
FASTAPI_PORT=8000

# ============================================================
# Grafana
# ============================================================
GRAFANA_PASSWORD=grafana_admin_dev

# ============================================================
# Frontend
# ============================================================
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
BACKEND_URL=http://aegis-fastapi:8000
EOF

echo "Created .env file"
cat .env | head -5
```

---

## PART 4 — GENERATE TLS CERTIFICATES FOR NGINX

Generate a self-signed TLS certificate for the demo. In production, replace with a proper certificate.

```bash
# Generate self-signed certificate (valid for 365 days)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infrastructure/nginx/ssl/aegis.key \
  -out infrastructure/nginx/ssl/aegis.crt \
  -subj "/C=IN/ST=TamilNadu/L=Chennai/O=SonaComstar/OU=IT/CN=aegis.sonacomstar.local"

# Verify certificates were created
ls -la infrastructure/nginx/ssl/
echo "Certificate created successfully"
openssl x509 -in infrastructure/nginx/ssl/aegis.crt -noout -subject -dates
```

Expected output: Shows Subject with SonaComstar and validity dates.

---

## PART 5 — CREATE THE .gitignore FILE

```bash
cat > .gitignore << 'EOF'
# Environment files — NEVER commit these
.env
.env.local
.env.*.local

# Python
*.pyc
*.pyo
__pycache__/
*.py[cod]
*$py.class
.Python
build/
dist/
*.egg-info/
.eggs/
venv/
.venv/
env/
.pytest_cache/
.mypy_cache/
.ruff_cache/
htmlcov/
.coverage
*.log

# Node.js
node_modules/
.next/
out/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# TLS certificates (generated locally, not committed)
infrastructure/nginx/ssl/*.key
infrastructure/nginx/ssl/*.crt

# Docker volumes (data directories)
postgres-data/
redis-data/
qdrant-storage/
opensearch-data/

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store

# Temporary files
/tmp/
*.tmp

# HuggingFace model cache (too large to commit)
.cache/

# Grafana state
infrastructure/grafana/grafana.db
EOF

echo "Created .gitignore"
```

---

## PART 6 — CREATE THE README FILE

```bash
cat > README.md << 'EOF'
# AEGIS — Adaptive Enterprise Grade Intelligence System
## Sona Comstar SAP Helpdesk AI Platform

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Docker with Docker Compose plugin
- OpenSSL

### First-Time Setup
```bash
# 1. Install Python dependencies
cd backend && python3 -m venv venv && source venv/bin/activate
pip install torch==2.5.1+cpu --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt && cd ..

# 2. Install frontend dependencies
cd frontend && npm install && cd ..

# 3. Start all services
docker compose up -d

# 4. Check system health
python scripts/verify_health.py
```

### Architecture
AEGIS is a six-zone enterprise AI platform with zero-trust security,
adaptive tri-modal retrieval, and three-tier answer validation.
See specs/ directory for complete architecture documentation.

### Specifications
All architecture and implementation specifications are in the specs/ directory.
- specs/tier0_agent_guide/ — Implementation guide for AI-assisted development
- specs/tier1_foundation/ — Core architecture reference documents
- specs/tier2_implementation/ — Step-by-step implementation guides
- specs/tier3_verification/ — Testing and compliance verification
EOF

echo "Created README.md"
```

---

## PART 7 — CREATE PLACEHOLDER INIT FILES FOR KEY MODULES

These placeholder files establish the module structure. The actual content will be filled in during later sessions.

```bash
# backend/app/config.py placeholder
cat > backend/app/config.py << 'EOF'
"""
AEGIS Configuration Module
Reads all environment variables and exposes them as typed constants.
All values in this file come from AEGIS_CONFIGURATION_CONSTANTS.md.
This file is implemented fully in Session 02.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# This file will be fully implemented in Session 02 (environment setup).
# All constants defined in AEGIS_CONFIGURATION_CONSTANTS.md will be here.
# Placeholder to establish module structure.

ENVIRONMENT = os.getenv("ENVIRONMENT", "demo")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Redis
REDIS_SESSION_URL = os.getenv("REDIS_SESSION_URL", "redis://localhost:6379/0")
REDIS_QUEUE_URL = os.getenv("REDIS_QUEUE_URL", "redis://localhost:6380/0")

# Qdrant
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))

# Note: Full implementation added in Session 02
EOF

echo "Created backend/app/config.py placeholder"

# backend/app/main.py placeholder
cat > backend/app/main.py << 'EOF'
"""
AEGIS FastAPI Application
Full implementation added in Session 11 (Zone B Orchestration).
"""
from fastapi import FastAPI

app = FastAPI(title="AEGIS", version="1.0.0")

@app.get("/health")
async def health():
    return {"status": "starting"}
EOF

echo "Created backend/app/main.py placeholder"
```

---

## PART 8 — INITIALIZE THE BACKEND VIRTUAL ENVIRONMENT

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Verify Python version in venv
python --version

# Install PyTorch CPU first
pip install torch==2.5.1+cpu --index-url https://download.pytorch.org/whl/cpu
echo "PyTorch installed"

# Install all other dependencies
pip install -r requirements.txt
echo "All backend dependencies installed"

# Install dev dependencies
pip install -r requirements-dev.txt
echo "Dev dependencies installed"

cd ..
```

---

## PART 9 — INSTALL FRONTEND DEPENDENCIES

```bash
cd frontend
npm install
echo "Frontend dependencies installed"
npm list next react typescript | head -10
cd ..
```

---

## PART 10 — CREATE THE INITIAL GIT COMMIT

```bash
# Add all files
git add -A

# Make the initial commit
git commit -m "IMPL-02: Environment setup - folder structure and dependencies"

echo "=== Initial commit created ==="
git log --oneline | head -3
```

---

## PART 11 — VERIFICATION STEPS

Run all these verification steps. Every one must pass.

### Verification 1: Python environment
```bash
cd backend
source venv/bin/activate
python --version
python scripts/verify_deps.py
```
Expected: `✓ ALL DEPENDENCIES VERIFIED SUCCESSFULLY`

### Verification 2: Folder structure
```bash
# From project root
test -d backend/app/middleware && echo "✓ backend/app/middleware exists"
test -d backend/app/services && echo "✓ backend/app/services exists"
test -d backend/app/tasks && echo "✓ backend/app/tasks exists"
test -d backend/app/infrastructure && echo "✓ backend/app/infrastructure exists"
test -d services/bge-embedding && echo "✓ bge-embedding service exists"
test -d services/deberta-nli && echo "✓ deberta-nli service exists"
test -d infrastructure/nginx/ssl && echo "✓ Nginx SSL directory exists"
test -d database/migrations && echo "✓ Database migrations directory exists"
test -d tests/unit && echo "✓ Unit tests directory exists"
test -d tests/integration && echo "✓ Integration tests directory exists"
```
Expected: All show ✓

### Verification 2: TLS certificates
```bash
test -f infrastructure/nginx/ssl/aegis.key && echo "✓ TLS key exists"
test -f infrastructure/nginx/ssl/aegis.crt && echo "✓ TLS certificate exists"
openssl x509 -in infrastructure/nginx/ssl/aegis.crt -noout -subject
```
Expected: Both files exist, subject shows SonaComstar

### Verification 3: Environment file
```bash
test -f .env && echo "✓ .env file exists"
grep -c "=" .env
```
Expected: .env exists and contains approximately 30 lines with = signs

### Verification 4: Frontend dependencies
```bash
cd frontend
test -d node_modules && echo "✓ node_modules installed"
node -e "const next = require('next/package.json'); console.log('next:', next.version)"
cd ..
```
Expected: Shows next version 15.x.x

### Verification 5: Git status
```bash
git log --oneline
git status
```
Expected: Shows 1-2 commits, working tree clean

---

## WHEN ALL VERIFICATIONS PASS

Commit and update decisions log:
```bash
git add -A
git commit -m "IMPL-02: Environment setup - verification tests passing"
```

Update `specs/tier3_verification/DECISIONS_LOG.md` with:
- Session 02 complete
- Folder structure created as specified
- Backend venv created with Python version
- TLS certificate generated
- Frontend dependencies installed
- Any deviations from specified structure

---

*Document version: 1.0 | AEGIS Specification Set*
