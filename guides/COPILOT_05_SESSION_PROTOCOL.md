# COPILOT_05 — SESSION PROTOCOL
## The exact procedure for every implementation session, start to finish

---

## BEFORE STARTING ANY SESSION — MANDATORY PRE-SESSION CHECKLIST

Run these commands in the Ubuntu terminal before opening any spec document.

```bash
# 1. Confirm you are in the right directory
pwd
# Expected: /home/pal/aegis-project

# 2. Activate the virtual environment
source .venv/bin/activate
python --version
# Expected: Python 3.11.x (if upgraded) or Python 3.10.12

# 3. Confirm Docker is running
docker ps --format "{{.Names}}" | wc -l
# Expected for sessions AFTER IMPL_03: 19 containers running
# Expected for sessions BEFORE IMPL_03: 0 containers (not yet deployed)

# 4. Confirm git is on the correct branch
git branch --show-current
# Should be on your session branch: session/impl-XX-description

# 5. Confirm Ollama is running (for sessions after IMPL_04)
curl -s http://localhost:11434 | head -c 30
# Expected: Ollama is running
```

If any check fails, resolve it before starting the session. Do not proceed with a broken environment.

---

## HOW TO READ A SPEC DOCUMENT

Every IMPL document has a consistent structure. Read it in this order:

**Pass 1 — Full document read (no writing):**
1. Read the session overview section first — understand what this session builds
2. Read all FILE sections — understand every file that will be created
3. Read the verification section at the end — understand what success looks like
4. Highlight or note any IMPORTANT or CRITICAL callouts in the document

**Pass 2 — Cross-reference check:**
- List all files the spec says to create
- Check which already exist from previous sessions
- For files that already exist: read the spec to see if it modifies or patches them
- For new files: confirm the parent directory exists

**Pass 3 — Dependency check:**
- Does this session import from a file created in a previous session?
- Confirm those files exist and have the expected classes/functions
- If they don't exist, STOP — sessions are out of order or a previous session was incomplete

Only after completing all three passes should code writing begin.

---

## THE STANDARD SESSION PROMPT TEMPLATE

This is the exact prompt to paste into GitHub Copilot Chat at the start of each session. Edit only the bracketed parts.

```
You are implementing [SESSION NAME] for the AEGIS SAP Helpdesk AI system at Sona Comstar.

MANDATORY: Before writing any code, read these documents IN THIS EXACT ORDER:
1. /home/pal/aegis-project/guides/COPILOT_01_PERSONAL_CONTEXT.md
2. /home/pal/aegis-project/guides/COPILOT_02_RULES_AND_QUALITY_GATES.md
3. /home/pal/aegis-project/guides/COPILOT_03_ARCHITECTURE_COMPLETE.md
4. /home/pal/aegis-project/guides/COPILOT_04_WORKFLOWS_COMPLETE.md
5. /home/pal/aegis-project/guides/COPILOT_05_SESSION_PROTOCOL.md

After reading all 5 documents, confirm your understanding by stating:
- Your primary role in one sentence
- The 3 most important rules from COPILOT_02
- What AEGIS does in two sentences
- Whether this session requires the Ubuntu Ollama patch (yes/no, why)

Then read the full specification for this session:
[SPEC FILE PATH — e.g., /home/pal/aegis-project/specs/tier2_implementation/IMPL_01_DEPENDENCIES.md]

After reading the spec, state:
- How many files you will create
- What verifications you will run at the end
- Any conflicts with existing code you noticed

Then begin implementation. Create each file at its exact specified path. After all files are created, run every verification command from the spec and show the output. Do not declare this session complete until all verifications pass.

Current session: [SESSION_N]: [IMPL_XX] — [Session description from spec]
```

---

## IMPLEMENTATION LOOP — FOR EACH FILE IN THE SESSION

Repeat this loop for every file the spec requires:

**Step 1 — Locate the exact file path from the spec**
The spec will say: "Create this file at exactly this path: `backend/app/services/model_gateway.py`"
Use that exact path. Not a relative path. Not an approximate path.

**Step 2 — Check for conflicts**
```bash
ls -la backend/app/services/model_gateway.py 2>/dev/null
```
- If file does not exist: create it fresh
- If file exists from a previous session: read its current content carefully, then apply only what the spec says to add or change. Do not replace the entire file unless the spec explicitly says to replace it.

**Step 3 — Write the file**
Write complete, production-quality code. Reference COPILOT_02 Section 5 and 6 for exact Python and TypeScript code standards. No placeholder code. No TODO comments.

**Step 4 — Immediate syntax check (Python files)**
```bash
python -m py_compile backend/app/services/model_gateway.py
echo "Exit code: $?"
# Must be: Exit code: 0
```

**Step 5 — Import verification (Python files)**
```bash
cd /home/pal/aegis-project/backend
python -c "from app.services.model_gateway import ModelGateway; print('Import OK')"
```

**Step 6 — Report file completion**
State clearly: "Created `backend/app/services/model_gateway.py` — syntax check passed, import verified."

Then move to the next file.

---

## POST-SESSION VERIFICATION PROTOCOL

After all files are created, run the complete verification sequence from the spec. This is mandatory.

**Universal verifications that run for every session:**

```bash
# Python syntax check for all files created in this session
find backend/app -name "*.py" -newer /tmp/session_start -exec python -m py_compile {} \; && echo "ALL SYNTAX OK"

# Import chain check (from project root)
cd /home/pal/aegis-project/backend
python -c "import app.main; print('Main import chain OK')"

# If tests exist for this session:
cd /home/pal/aegis-project
source .venv/bin/activate
pytest tests/unit/test_[relevant_module].py -v --tb=short
```

**Session-specific verifications:**
Run every command listed in the spec verification section. Show the exact output, not a summary.

**Docker services verification (for sessions after IMPL_03):**
```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}"
# All 19 containers must show "healthy" or "Up"
```

---

## REPORTING SESSION COMPLETION

When all verifications pass, provide this structured report:

```
SESSION [N] COMPLETE: [IMPL_XX] — [Session name]

FILES CREATED ([count]):
  ✅ backend/app/services/model_gateway.py (new)
  ✅ backend/app/services/reasoning_service.py (new)
  ✅ backend/app/config.py (modified — added OLLAMA_ config fields)

VERIFICATIONS PASSED ([count]/[total]):
  ✅ python -m py_compile all files — Exit code 0
  ✅ from app.services.model_gateway import ModelGateway — Import OK
  ✅ pytest tests/unit/test_model_gateway.py — 8/8 passed
  ✅ curl http://localhost:8000/health — {"status": "healthy"}

ENVIRONMENT PATCHES APPLIED:
  [List any Ubuntu Ollama patch steps or other environment-specific changes]
  OR: None — session required no environment-specific modifications

READY FOR COMMIT: Yes
NEXT SESSION: [IMPL_XX+1] — [next session name]
```

---

## COMMIT PROCEDURE

After session report is delivered, commit:

```bash
cd /home/pal/aegis-project

# Stage all new and modified files
git add -A

# Verify nothing sensitive is being committed
git diff --cached --name-only
# Check: .env must NOT appear in this list
# Check: .venv/ must NOT appear in this list

# Commit with structured message
git commit -m "Session N: IMPL_XX — Session description

Files created:
- backend/app/services/model_gateway.py
- backend/app/services/reasoning_service.py

Files modified:
- backend/app/config.py

Verifications: all passed
Tests: 8/8 unit tests passing
Notes: [environment patches or notable decisions]"

# Push the session branch
git push -u origin session/impl-XX-description
```

---

## SPECIAL PROCEDURES FOR KEY SESSIONS

### IMPL_03 — Docker Infrastructure

This session creates docker-compose.yml. The Ubuntu Ollama patch MUST be applied.

After writing docker-compose.yml, before running `docker compose up`:
1. Verify the bind mount is correct: `grep -A2 "aegis-ollama-main" docker-compose.yml | grep "home/pal"`
2. Should show: `- /home/pal/.ollama:/root/.ollama`
3. Verify named volume is NOT declared: `grep "aegis-ollama-models" docker-compose.yml`
4. Should return nothing

Then start services:
```bash
docker compose up -d
sleep 120  # Wait 2 minutes for services to reach healthy state
docker compose ps
```

If any container is in "starting" state after 5 minutes, check its logs:
```bash
docker compose logs [container-name] --tail=50
```

### IMPL_04 — Models Setup

Before running setup_models.py, verify models are already available inside Docker:
```bash
docker exec aegis-ollama-main ollama list
```
All three models must appear immediately. If they do NOT appear, the bind mount from IMPL_03 is wrong. Fix the volume mount before proceeding.

setup_models.py should detect existing models and skip re-download. If it still tries to pull 19GB, stop and diagnose the bind mount.

### IMPL_05 — PostgreSQL

After running Alembic migration, verify:
```bash
docker exec aegis-postgres-primary psql -U aegis_user -d aegis_db -c "\dt"
```
All tables from the spec must appear.

### IMPL_21, IMPL_22, IMPL_PATCH_01, IMPL_PATCH_02, IMPL_PATCH_03 — Patch Sessions

These sessions MODIFY existing files from previous sessions. Never replace entire files.
1. Read the existing file content
2. Apply only the specific changes the patch specifies
3. Run the full import chain verification after each patch
4. Confirm no previously passing tests now fail

---

## ARCHITECTURE DRIFT SELF-CHECK

Before declaring any session complete, answer these questions:

1. Does any service file read config with `os.environ.get()` instead of `from app.config import settings`?
   - If yes: fix it before completing

2. Does any handler file call Ollama, Qdrant, or OpenSearch directly without going through the service layer?
   - If yes: fix it before completing

3. Does any async function contain synchronous blocking calls (requests.get, time.sleep, open())?
   - If yes: fix it before completing

4. Does any file contain hardcoded values (URLs, passwords, model names, thresholds) that should come from config?
   - If yes: fix it before completing

5. Do all new Pydantic models have complete type annotations?
   - If no: fix it before completing

6. Are there any TODO comments, pass statements, or NotImplementedError in production code?
   - If yes: implement the missing code before completing

---

## WARNING SIGNS — STOP AND REPORT IMMEDIATELY

These situations require stopping and reporting to Praveen before taking any action:

**Warning 1:** A docker container health check fails after 10 minutes of waiting.
Report: container name, last 50 lines of container logs, what was expected from spec.

**Warning 2:** An Alembic migration fails to apply.
Report: exact error message, current migration head, which migration failed.

**Warning 3:** The import chain breaks (importing app.main fails after a session).
Report: exact ImportError message, which module is missing or has a circular import.

**Warning 4:** A verification command returns output that doesn't match the spec's expected output.
Report: the command, what the spec says it should return, what it actually returned.

**Warning 5:** IMPL_04 setup_models.py shows it is downloading models from scratch (instead of detecting existing ones).
Report: which model it is downloading, current bind mount configuration from docker-compose.yml.

**Warning 6:** A spec file references a class or function that was not created in its supposed session.
Report: which spec, which class/function is missing, which session should have created it.

Do NOT attempt to work around these situations independently. They indicate either an environment problem or a spec dependency issue that needs guidance.

---

## RECOVERY FROM FAILED SESSIONS

If a session cannot be completed due to a persistent error:

**Step 1 — Document the failure state**
```bash
git status                    # what files were created
git diff --cached --stat      # what changes were staged
docker compose ps             # container states
cat /tmp/session_error.log    # if error was logged
```

**Step 2 — Stash incomplete work**
```bash
git stash push -m "Incomplete IMPL_XX — [error description]"
```

**Step 3 — Report to Praveen**
Provide:
- Exact error message
- Which file was being created when failure occurred
- Which verification command failed and its output
- Docker container status if relevant
- The stash reference (git stash list)

**Step 4 — After guidance, resume**
```bash
git stash pop  # restore incomplete work
# Continue from where the session stalled
```

---

## HANDOFF FORMAT FOR NEXT SESSION

At the end of every session report, include this handoff block so the next session starts with complete context:

```
HANDOFF TO NEXT SESSION:

Environment state:
- Docker: [19/19 healthy | not yet started]
- Virtual environment: activated, Python [version]
- Last migration applied: [migration name or N/A]
- Ollama models: verified accessible inside Docker [yes/no | N/A]

Files available for next session to import:
- [list key classes/functions created in this session that next session will import]

Known issues for next session to be aware of:
- [any known limitations, temporary workarounds, or decisions that affect next session]
- OR: None — clean state

Next session should begin with:
git checkout dev && git pull origin dev
git checkout -b session/impl-[XX+1]-[name]
```

---

## IMPLEMENTATION ORDER — FULL REFERENCE

```
Session 1:  IMPL_01 — Dependencies (requirements.txt, pyproject.toml)
Session 2:  IMPL_02 — Environment Setup (.env, config.py, frontend dependencies)
Session 3:  IMPL_03 — Docker Infrastructure [APPLY UBUNTU OLLAMA PATCH]
Session 4:  IMPL_04 — AI Models Setup [VERIFY BIND MOUNT FIRST]
Session 5:  IMPL_05 — PostgreSQL Data Layer
Session 6:  IMPL_06 — Qdrant Vector Database
Session 7:  IMPL_07 — OpenSearch
Session 8:  IMPL_08 — Redis (dual instance)
Session 9:  IMPL_09 — Nginx + Content Governance Middleware
Session 10: IMPL_10 — Keycloak + HashiCorp Vault
Session 11: IMPL_11 — Zone B Orchestration (session, models, ARQ tasks)
Session 12: IMPL_12 — Query Intelligence Service
Session 13: IMPL_13 — Vision Integration Service
Session 14: IMPL_14 — Retrieval Pipeline Stages 1–5 (dense, sparse, BM25, graph, RRF)
Session 15: IMPL_15 — Retrieval Pipeline Stages 6–8 (CRAG, reranker, hydration)
Session 16: IMPL_16 — Reasoning Service + Model Gateway
Session 17: IMPL_17 — Validation Engine (three tiers)
Session 18: IMPL_18 — Document Ingestion Pipeline
Session 19: IMPL_19 — Employee Chat Handler + WebSocket
Session 20: IMPL_20 — Admin Portal Handler + Observability
Session 21: IMPL_21 — Session Fix (patches to multiple files)
Session 22: IMPL_22 — Final Polish (patches to multiple files)
Session 23: IMPL_23 — Quick Entry Overview + Data Contracts
Session 24: IMPL_24 — Quick Entry Database Schema (Alembic migration)
Session 25: IMPL_25 — Quick Entry API Router (11 endpoints)
Session 26: IMPL_26 — Quick Entry Processing Pipeline (ARQ tasks A1–A13)
Session 27: IMPL_27 — Quick Entry Chunking Engine
Session 28: IMPL_28 — Quick Entry Screenshot Vision Pipeline (V1–V10)
Session 29: IMPL_29 — Quick Entry Operational Systems (staleness, bulk import)
Session 30: FRONTEND_01–11 — Design system, base components, stores, hooks
Session 31: FRONTEND_12–15 — Employee chat, history, onboarding, auth
Session 32: FRONTEND_16–22 — Admin shell, all admin pages, charts
Session 33: FRONTEND_36–40 — Quick Entry UI, all 26 components, screenshot proxy
```

After all 33 sessions: apply IMPL_PATCH_01, IMPL_PATCH_02, IMPL_PATCH_03 in order.
