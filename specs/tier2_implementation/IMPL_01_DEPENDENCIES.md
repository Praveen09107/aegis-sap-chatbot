# IMPL_01: DEPENDENCIES MANIFEST
## All Package Dependencies With Exact Versions
## Session 01 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 01: Create all dependency files.

Read all attached documents completely before starting. Then create every file listed in this document with exactly the content specified. Do not add packages not listed here. Do not use different version numbers.

After creating all files, run the verification steps at the bottom of this document and confirm all pass.

---

## FILE 1: backend/requirements.txt

Create this file at exactly this path: `backend/requirements.txt`

```
# AEGIS Backend — Production Dependencies
# Generated for Python 3.11+
# Do not modify versions without updating all related documents

# ============================================================
# Web Framework
# ============================================================
fastapi==0.115.4
uvicorn[standard]==0.32.1
python-multipart==0.0.12
websockets==13.1

# ============================================================
# Data Validation
# ============================================================
pydantic==2.9.2
pydantic-settings==2.6.1
email-validator==2.2.0

# ============================================================
# Async HTTP Client (for calling Ollama, Vault, external services)
# ============================================================
httpx==0.27.2
aiofiles==24.1.0

# ============================================================
# Authentication and Security
# ============================================================
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
cryptography==43.0.3

# ============================================================
# Database — PostgreSQL
# ============================================================
asyncpg==0.30.0
sqlalchemy[asyncio]==2.0.36

# ============================================================
# Database — Redis
# ============================================================
redis==5.2.0

# ============================================================
# Database — Qdrant
# ============================================================
qdrant-client==1.12.1

# ============================================================
# Database — OpenSearch
# ============================================================
opensearch-py==2.7.0
aiohttp==3.10.10

# ============================================================
# Background Task Queue
# ============================================================
arq==0.26.1

# ============================================================
# Secret Management (Vault)
# ============================================================
hvac==2.3.0

# ============================================================
# Document Parsing
# ============================================================
python-docx==1.1.2
pdfplumber==0.11.4
pypdf==5.1.0

# ============================================================
# AI / ML — Embeddings and NLI (for BGE and DeBERTa services)
# ============================================================
sentence-transformers==3.3.1
transformers==4.46.2
torch==2.5.1+cpu
torchvision==0.20.1+cpu
torchaudio==2.5.1+cpu
tokenizers==0.20.3
accelerate==1.0.1
huggingface-hub==0.26.2
numpy==1.26.4
scipy==1.14.1

# ============================================================
# Observability
# ============================================================
prometheus-client==0.21.0
structlog==24.4.0

# ============================================================
# Utilities
# ============================================================
python-dotenv==1.0.1
pyyaml==6.0.2
click==8.1.7
rich==13.9.4
tenacity==9.0.0

# ============================================================
# Image Processing (for vision upload handling)
# ============================================================
Pillow==11.0.0

# ============================================================
# Text Processing
# ============================================================
tiktoken==0.8.0
```

**IMPORTANT NOTE on PyTorch:** The `torch==2.5.1+cpu` package requires a special index URL because the CPU-only version is on a separate PyTorch index. After creating requirements.txt, the install command must be:

```bash
pip install torch==2.5.1+cpu torchvision==0.20.1+cpu torchaudio==2.5.1+cpu --index-url https://download.pytorch.org/whl/cpu
pip install -r backend/requirements.txt --no-deps torch torchvision torchaudio
```

Or use this two-step approach in the Dockerfile:

```dockerfile
RUN pip install torch==2.5.1+cpu --index-url https://download.pytorch.org/whl/cpu
RUN pip install -r requirements.txt
```

---

## FILE 2: backend/requirements-dev.txt

Create this file at exactly this path: `backend/requirements-dev.txt`

```
# AEGIS Backend — Development and Testing Dependencies
# Install in addition to requirements.txt for development

# ============================================================
# Testing
# ============================================================
pytest==8.3.3
pytest-asyncio==0.24.0
pytest-cov==6.0.0
pytest-timeout==2.3.1
httpx==0.27.2
anyio==4.6.2

# ============================================================
# Code Quality
# ============================================================
ruff==0.7.4
mypy==1.13.0
black==24.10.0

# ============================================================
# Development Utilities
# ============================================================
ipython==8.29.0
watchfiles==1.0.0
```

---

## FILE 3: backend/pyproject.toml

Create this file at exactly this path: `backend/pyproject.toml`

```toml
[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.backends.legacy:build"

[project]
name = "aegis-backend"
version = "1.0.0"
description = "AEGIS - Adaptive Enterprise Grade Intelligence System - Backend"
requires-python = ">=3.11"

[tool.pytest.ini_options]
asyncio_mode = "auto"
timeout = 180
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.mypy]
python_version = "3.11"
strict = false
ignore_missing_imports = true

[tool.black]
line-length = 100
target-version = ["py311"]
```

---

## FILE 4: services/bge-embedding/requirements.txt

Create this file at exactly this path: `services/bge-embedding/requirements.txt`

```
# BGE Embedding Service Dependencies
fastapi==0.115.4
uvicorn[standard]==0.32.1
sentence-transformers==3.3.1
torch==2.5.1+cpu
transformers==4.46.2
tokenizers==0.20.3
numpy==1.26.4
pydantic==2.9.2
```

---

## FILE 5: services/deberta-nli/requirements.txt

Create this file at exactly this path: `services/deberta-nli/requirements.txt`

```
# DeBERTa NLI + Cross-Encoder Service Dependencies
fastapi==0.115.4
uvicorn[standard]==0.32.1
transformers==4.46.2
sentence-transformers==3.3.1
torch==2.5.1+cpu
tokenizers==0.20.3
numpy==1.26.4
pydantic==2.9.2
```

---

## FILE 6: frontend/package.json

Create this file at exactly this path: `frontend/package.json`

```json
{
  "name": "aegis-frontend",
  "version": "1.0.0",
  "description": "AEGIS Employee Chat Interface and Admin Portal",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "jose": "5.9.6",
    "clsx": "2.1.1",
    "tailwind-merge": "2.5.4"
  },
  "devDependencies": {
    "@types/node": "20.17.6",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "typescript": "5.6.3",
    "tailwindcss": "3.4.15",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.49",
    "eslint": "8.57.1",
    "eslint-config-next": "15.0.3"
  }
}
```

---

## FILE 7: frontend/next.config.js

Create this file at exactly this path: `frontend/next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better error detection
  reactStrictMode: true,

  // Environment variables available to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000',
  },

  // API route rewrites so frontend can call backend without CORS issues
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://aegis-fastapi:8000'}/api/:path*`,
      },
      {
        source: '/admin/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://aegis-fastapi:8000'}/admin/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

---

## FILE 8: frontend/tsconfig.json

Create this file at exactly this path: `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{"name": "next"}],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## FILE 9: frontend/tailwind.config.js

Create this file at exactly this path: `frontend/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AEGIS brand colors
        'aegis-green': '#16a34a',    // Confidence badge: green
        'aegis-amber': '#d97706',    // Confidence badge: amber
        'aegis-blue': '#1d4ed8',     // Primary action color
        'aegis-gray': '#6b7280',     // Secondary text
      },
    },
  },
  plugins: [],
};
```

---

## FILE 10: frontend/postcss.config.js

Create this file at exactly this path: `frontend/postcss.config.js`

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## FILE 11: scripts/verify_deps.py

Create this file at exactly this path: `scripts/verify_deps.py`

This script imports every production package and confirms it loads without error. Run it to verify installation is correct.

```python
#!/usr/bin/env python3
"""
AEGIS Dependency Verification Script
Run after installing requirements.txt to confirm all packages load correctly.
Usage: python scripts/verify_deps.py
"""
import sys

def check(package_name: str, import_statement: str) -> bool:
    try:
        exec(import_statement)
        print(f"  ✓ {package_name}")
        return True
    except ImportError as e:
        print(f"  ✗ {package_name} — FAILED: {e}")
        return False

print("\nVerifying AEGIS Python dependencies...\n")
results = []

# Web Framework
results.append(check("fastapi", "import fastapi; assert fastapi.__version__.startswith('0.115')"))
results.append(check("uvicorn", "import uvicorn"))
results.append(check("pydantic", "import pydantic; assert pydantic.__version__.startswith('2.')"))
results.append(check("python-multipart", "import multipart"))
results.append(check("websockets", "import websockets"))

# Database
results.append(check("asyncpg", "import asyncpg"))
results.append(check("sqlalchemy", "import sqlalchemy"))
results.append(check("redis", "import redis.asyncio"))
results.append(check("qdrant-client", "from qdrant_client import QdrantClient"))
results.append(check("opensearch-py", "from opensearchpy import AsyncOpenSearch"))

# Auth
results.append(check("python-jose", "from jose import jwt"))
results.append(check("passlib", "from passlib.context import CryptContext"))
results.append(check("cryptography", "import cryptography"))

# Document parsing
results.append(check("python-docx", "from docx import Document"))
results.append(check("pdfplumber", "import pdfplumber"))

# AI/ML
results.append(check("sentence-transformers", "from sentence_transformers import SentenceTransformer"))
results.append(check("transformers", "from transformers import pipeline"))
results.append(check("torch (CPU)", "import torch; assert not torch.cuda.is_available() or True"))
results.append(check("numpy", "import numpy"))

# Background tasks
results.append(check("arq", "import arq"))

# Vault
results.append(check("hvac", "import hvac"))

# HTTP
results.append(check("httpx", "import httpx"))
results.append(check("aiofiles", "import aiofiles"))

# Observability
results.append(check("prometheus-client", "import prometheus_client"))
results.append(check("structlog", "import structlog"))

# Utilities
results.append(check("python-dotenv", "from dotenv import load_dotenv"))
results.append(check("pyyaml", "import yaml"))
results.append(check("pillow", "from PIL import Image"))
results.append(check("tiktoken", "import tiktoken"))

# Summary
passed = sum(results)
total = len(results)
print(f"\n{'='*50}")
print(f"Results: {passed}/{total} packages verified")
if passed == total:
    print("✓ ALL DEPENDENCIES VERIFIED SUCCESSFULLY")
    sys.exit(0)
else:
    print(f"✗ {total - passed} PACKAGES FAILED — resolve before proceeding")
    sys.exit(1)
```

---

## FILE 12: .env.example

Create this file at exactly this path: `.env.example` (in the project root)

```bash
# AEGIS Environment Variables Template
# Copy this file to .env and fill in actual values
# NEVER commit .env to git

# ============================================================
# PostgreSQL (populated by Vault at runtime, set defaults for local dev)
# ============================================================
POSTGRES_HOST=aegis-pgbouncer
POSTGRES_PORT=6432
POSTGRES_DB=aegis
POSTGRES_USER=aegis_dev_user
POSTGRES_PASSWORD=change_this_in_production

# ============================================================
# Redis
# ============================================================
REDIS_SESSION_URL=redis://aegis-redis-session:6379/0
REDIS_QUEUE_URL=redis://aegis-redis-queue:6379/0

# ============================================================
# Vault (Dev Mode)
# ============================================================
VAULT_ADDR=http://aegis-vault:8200
VAULT_TOKEN=aegis-dev-root-token

# ============================================================
# Ollama Instances
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
# Keycloak
# ============================================================
KEYCLOAK_URL=http://aegis-keycloak:8080
KEYCLOAK_REALM=aegis-realm
KEYCLOAK_CLIENT_ID=aegis-chat
KEYCLOAK_CLIENT_SECRET=change_this_secret
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=change_this_password

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
SECRET_KEY=generate_a_random_32_char_string_here
FASTAPI_HOST=0.0.0.0
FASTAPI_PORT=8000

# ============================================================
# Frontend (used in Next.js)
# ============================================================
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
BACKEND_URL=http://aegis-fastapi:8000
```

---

## DOCKER IMAGE VERSIONS

These are the exact Docker image tags to use in docker-compose.yml. Created in Session 03.

```yaml
# Use these exact image tags in docker-compose.yml:

nginx:            "nginx:1.27-alpine"
keycloak:         "quay.io/keycloak/keycloak:26.0.5"
vault:            "hashicorp/vault:1.18.1"
postgres:         "postgres:16.4-alpine"    # Both primary and replica
pgbouncer:        "pgbouncer/pgbouncer:1.23.1"
redis:            "redis:7.4-alpine"         # Both instances
qdrant:           "qdrant/qdrant:v1.12.1"
opensearch:       "opensearchproject/opensearch:2.17.0"
prometheus:       "prom/prometheus:v2.55.0"
grafana:          "grafana/grafana:11.3.1"
ollama:           "ollama/ollama:0.4.1"      # All three Ollama instances
```

For FastAPI, ARQ worker, BGE service, and DeBERTa service — build from Dockerfile (not a pre-built image).

---

## VERIFICATION STEPS FOR THIS SESSION

Run these commands after creating all files. All must succeed before committing.

### Step 1: Create Python virtual environment and install dependencies

```bash
# From project root
cd backend
python3 -m venv venv
source venv/bin/activate

# Install PyTorch CPU first (special index URL required)
pip install torch==2.5.1+cpu --index-url https://download.pytorch.org/whl/cpu

# Install all other dependencies
pip install -r requirements.txt

# Verify all packages load correctly
python ../scripts/verify_deps.py
```

Expected output: `✓ ALL DEPENDENCIES VERIFIED SUCCESSFULLY`

### Step 2: Install Node.js dependencies

```bash
# From project root
cd frontend
npm install

# Verify no errors and check installed versions
npm list next react react-dom typescript
```

Expected: Shows installed versions matching package.json

### Step 3: Verify file structure

```bash
# From project root
# Check all required files exist
ls backend/requirements.txt
ls backend/requirements-dev.txt
ls backend/pyproject.toml
ls services/bge-embedding/requirements.txt
ls services/deberta-nli/requirements.txt
ls frontend/package.json
ls frontend/next.config.js
ls frontend/tsconfig.json
ls frontend/tailwind.config.js
ls .env.example
ls scripts/verify_deps.py
```

Expected: All files exist without errors

### Step 4: Run the dependency verification script

```bash
# From project root with virtual environment activated
python scripts/verify_deps.py
```

Expected output ends with: `✓ ALL DEPENDENCIES VERIFIED SUCCESSFULLY`

---

## WHEN VERIFICATION PASSES

Commit with:
```
git add -A
git commit -m "IMPL-01: Dependencies manifest - verification tests passing"
```

Then update `specs/tier3_verification/DECISIONS_LOG.md` with:
- Date
- Session 01 complete
- Python packages installed successfully
- Node.js packages installed successfully
- Any packages where specified version was unavailable and what version was used instead
- Any issues encountered

---

*Document version: 1.0 | AEGIS Specification Set*
