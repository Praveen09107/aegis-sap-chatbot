# AEGIS — Project Memory

## What this is
AEGIS is a general-purpose SAP ERP helpdesk AI, built by Praveen (solo developer, portfolio/product project — not a team, no fixed deadline). Originally an internship build at Sona Comstar; decoupled from that company and generalized. Full history: `specs/tier3_verification/DECISIONS_LOG.md`.

**Current status lives in `specs/SPEC_INDEX_AND_CURRENT_STATUS.md` — always check that file first, never assume from this one.** This file holds stable facts only; session-by-session progress changes too often to duplicate here safely.

## Praveen's context — write code accordingly
Basic Python from coursework; has not built a system at this scale before. Explain *why*, not just *what*, when a decision is non-obvious. No other developer will review this code — be the second pair of eyes yourself before calling anything done.

## The Five Rules — non-negotiable, every session
1. **Spec paths are exact.** `backend/app/services/retrieval_engine.py` means exactly that path, not a close approximation.
2. **Every verification in a session's spec must pass before the session is complete.** One failing check = incomplete session, not "mostly done."
3. **No placeholder code, ever.** No `TODO`, no bare `pass` in real functions, no `NotImplementedError`, no hardcoded stub returns.
4. **Never invent architecture.** Nothing not in the spec gets added — no bonus endpoints, fields, middleware, logging. Build what's specified, nothing else.
5. **Ollama's bind-mount patch (`/home/pal/.ollama:/root/.ollama`) only applies under `INFERENCE_MODE=local`.** Default is `INFERENCE_MODE=external` (Cerebras/Groq) — Ollama containers don't start by default. Never assume Rule 5 applies without checking `INFERENCE_MODE` first.

## Architecture facts that must never be violated
- Vector dimension = 768 everywhere. Any other number is a hard failure.
- Pipeline order: Stage 7 (reranking) runs BEFORE Stage 6 (CRAG). Full order: 1→2→3→4→5→7→6→8.
- Redis Instance 2 has AOF persistence (task durability). Redis Instance 1 does not.
- `config_values` chunk is never split — one indivisible chunk regardless of length.
- `audit_log` is append-only. No UPDATE or DELETE, ever.
- Mode C always runs CRAG — no skip condition exists for Mode C.
- CRAG failure defaults to SUFFICIENT — never block an employee on model unavailability.
- CRAG's token budget (`CRAG_MAX_TOKENS`) is never silently widened to `JUDGE_MAX_TOKENS` — they're intentionally different.
- MinIO write failures are fatal on ingestion paths, non-fatal on query-time paths — don't unify this.
- The frontend never talks to MinIO directly — always through the FastAPI proxy.

## Six drift patterns to actively watch for (they compound silently)
1. Bypassing service client wrappers — no direct Ollama/DeBERTa/BGE calls outside `backend/app/infrastructure/` or `backend/app/clients/`.
2. Bypassing the `Settings` class — never `os.environ.get(...)` directly; always `from app.config import settings`.
3. Sync code in async context — no `requests.get()` or `time.sleep()` inside async functions; use `httpx.AsyncClient`/`asyncio.sleep`.
4. Wrong data layer — Redis for session/cache/queue only, Postgres for persistent data, Qdrant for vectors, OpenSearch for BM25, MinIO for files. Nothing crosses.
5. Handlers calling models directly — the chain is always handler → service → `model_gateway.py` → provider.
6. Frontend bypassing the API proxy — browser never calls FastAPI directly, always through `app/api/proxy/[...path]/route.ts`.

## Inference architecture (this changed after the original build — don't assume the old design)
Default `INFERENCE_MODE=external`: Cerebras primary / Groq fallback for main reasoning and judge, Groq primary / Cerebras fallback for vision. No self-hosted model runs by default. Full reasoning: `specs/tier1_amendments/AMENDMENT_INFERENCE_ARCHITECTURE.md`.

## Environment
Real project root: `~/projects/aegis-project` on WSL2 Ubuntu 22.04 (not `/home/pal/...` — that path is stale, from the original build machine). `.env` and `infrastructure/nginx/ssl` are symlinks into `secrets-share/` (gitignored) — if either looks broken, check the symlink target before assuming a config problem.

## Where the real detail lives — read these, don't ask Praveen to re-explain
- **Why any decision was made:** `specs/tier3_verification/DECISIONS_LOG.md`
- **What session comes next, in what order:** `specs/SPEC_INDEX_AND_CURRENT_STATUS.md`
- **Per-session exact prompts:** `specs/tier0_agent_guide/BACKEND_AGENT_SESSION_GUIDE_v4.md`, `FRONTEND_AGENT_SESSION_GUIDE_v2.md`
- **Whether an old document's claim is still true:** `specs/tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md`
- **How to use Claude Code specifically with this spec system:** `CLAUDE_CODE_SPEC_USAGE_GUIDE.md`

## Common commands
```bash
pytest tests/unit/ backend/tests/unit/ -v      # full existing test suite
docker compose config --quiet                   # validate compose file (silent = valid)
docker compose up -d && docker compose ps        # start stack, check health
./audit_repo.sh                                  # full repo audit vs. spec manifest
```

## Spec-reading discipline
Read a session's entire spec document before writing any file from it — later sections often constrain earlier ones. Never write partial understanding into code.
