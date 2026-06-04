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
