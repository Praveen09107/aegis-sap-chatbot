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

Open in browser (credentials are the real users `scripts/setup_keycloak.py` seeds — the
`@sonacomstar.com` addresses previously listed here don't exist in Keycloak, confirmed
live via a real ROPC token request):
- `http://localhost:3000` — AEGIS employee chat (login: employee1 / password: Employee@123)
- `http://localhost:3000/admin` — Admin portal (login: itadmin1 / password: ITAdmin@123)
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
