# COPILOT_01 — PERSONAL AND PROJECT CONTEXT
## Read this document FIRST before any other document in this folder

---

## 1. WHO IS RUNNING THIS PROJECT

**Name:** Praveen
**Institution:** Chennai Institute of Technology, Chennai
**Programme:** B.E. (Bachelor of Engineering), Third Year
**Role:** Intern at Sona Comstar, Chennai
**Project type:** Real enterprise production system — not a college assignment, not a prototype

This is an internship project with no fixed deadline. The expectation is a fully working, production-quality system that real employees will use. Praveen is working alone — there is no other developer on this project.

---

## 2. SKILL LEVEL — READ THIS CAREFULLY BEFORE WRITING ANY CODE

Praveen has basic Python knowledge from college coursework. He has never built a system at this scale. Specifically:

- He cannot read 500 lines of generated code and identify if something is architecturally wrong
- He cannot tell from inspection whether an async pattern is correct
- He cannot diagnose import errors or circular dependency issues independently
- He cannot verify database schema correctness by reading migration files
- He relies entirely on the verification commands specified in each IMPL document to confirm correctness

**Consequence for how Copilot must work:**
Every file must be production-correct on first write. There is no "we will fix it in a later session." Verification commands must be run and confirmed as passing within the same session they are written. If a verification fails, Copilot must diagnose and resolve it immediately — Praveen cannot do this independently.

---

## 3. THE COMPANY — SONA COMSTAR

**Full name:** Sona Comstar
**Location:** Chennai, India
**Industry:** Automotive components manufacturing
**SAP user base:** Approximately 50 employees in finance and supply chain departments

These 50 employees are the direct end users of AEGIS. They encounter SAP errors, need to understand procedures, and need configuration guidance during their daily work. Currently they must call IT helpdesk, search through scattered documentation, or wait for a support response. AEGIS eliminates this friction.

**Specific SAP activities these employees perform:**
- Delivery processing (VL01N, VL02N)
- Financial postings (FB50, F-02)
- Purchase order management (ME21N, ME22N)
- Inventory management (MB1A, MB1C)
- Material management (MM01, MM02)
- Error resolution across all modules

---

## 4. WHAT AEGIS IS AND WHY IT EXISTS

**Full name:** AEGIS — Adaptive Enterprise Grade Intelligence System

**The problem:** When a Sona Comstar employee encounters SAP error VL150 during delivery processing, they must stop their work and contact IT helpdesk. The IT team must search through documentation to find the answer. This is slow, disrupts operations, wastes IT time, and the knowledge is not captured or reused.

**The solution:** AEGIS is a secure, fully on-premises AI assistant. It reads Sona Comstar's internal SAP documentation (error guides, step-by-step procedures, configuration snapshots) and answers employee questions in real time. It retrieves the most relevant documentation chunks using a three-modal search system, generates a validated answer using a 32-billion parameter language model, shows exactly which source documents it used, provides a confidence score, and warns when information might be outdated.

**Critical security property:** All data stays on Sona Comstar's servers. No employee question, no company document, no answer ever leaves the building. The AI models run locally on the company's own hardware.

**The Quick Entry feature:** IT admins can contribute knowledge directly through a structured web form — they do not need to create a Word document first. The form submission is automatically processed, chunked, embedded, and indexed, making it searchable by employees within minutes.

**Scale:** Maximum 50 concurrent users. This is an internal enterprise tool.

---

## 5. HOW AEGIS WAS DESIGNED

The entire system — architecture, security design, database schema, RAG pipeline, validation engine, Quick Entry feature, frontend component design — was designed by Claude AI (Anthropic) across multiple in-depth sessions with Praveen.

**Design evolution:**
- **MERIDIAN** — initial prototype concept with basic RAG
- **NEXUS** — complete redesign addressing security gaps, adding three-tier validation, improving retrieval
- **AEGIS** — final production-ready design with Quick Entry, vision pipeline, full observability

**Output of design sessions:** 85 specification documents in specs/. These documents contain exact file paths, exact code, exact database schemas, exact Docker configurations, exact API contracts, exact verification commands. Nothing needs to be invented during implementation — it is all specified.

The implementation agent reads these specs and builds exactly what they describe. No architectural creativity is needed or wanted during implementation.

---

## 6. CURRENT PROJECT STATE

**Status:** Pre-implementation environment setup is complete. Implementation has not started.

| Component | Status |
|---|---|
| 85 specification documents (IMPL_01–29, FRONTEND_01–40, patches) | ✅ Complete |
| Project directory structure (79 directories + essential files) | ✅ Created |
| Hardware: Xeon E-2278G, 64GB RAM, Ubuntu 22.04 WSL2 | ✅ Configured |
| WSL2: 50GB RAM, 16 threads allocated | ✅ Configured |
| Docker Desktop 29.5.2 | ✅ Installed |
| Node.js v20.20.2 LTS | ✅ Installed |
| Git 2.34.1 (Ubuntu) | ✅ Configured |
| Python virtual environment at .venv | ✅ Created |
| Ubuntu Ollama 0.24.0 | ✅ Running |
| qwen2.5:7b-instruct (judge model, Q4_K_M) | ✅ Downloaded |
| qwen2.5vl:7b (vision model, Q4_K_M) | ✅ Downloaded |
| qwen2.5:32b (main model, Q4_K_M) | ✅ Downloaded |
| GitHub repository | ✅ Initialized |
| IMPL_01 implementation | ⬜ Not started |

---

## 7. FULL ENVIRONMENT SPECIFICATION

**Hardware:**
- CPU: Intel Xeon E-2278G @ 3.40GHz, 8 cores, 16 threads
- RAM: 64GB physical, 50GB allocated to WSL2 (~44GB free after Ollama models loaded)
- Storage: ~370GB free (Ubuntu WSL2 filesystem)

**OS stack:**
- Windows 10 (10.0.26200.8457) as host
- WSL2 version 2.7.3.0, kernel 6.6.114.1-1
- Ubuntu 22.04.5 LTS (Jammy Jellyfish) — all development happens here

**Tools:**
- Docker Desktop 29.5.2, Docker Compose v5.1.3 (WSL2 backend)
- Node.js v20.20.2, npm 10.8.2
- Python 3.10.12 (system), Python 3.11 also available
- Ubuntu Ollama 0.24.0 at /usr/local/bin/ollama
- VS Code with GitHub Copilot (Copilot is this agent)

**File paths:**
- Project root: /home/pal/aegis-project
- Virtual environment: /home/pal/aegis-project/.venv
- Ollama models: /home/pal/.ollama/models/
- Specification documents: /home/pal/aegis-project/specs/
- Context documents (this file): /home/pal/aegis-project/guides/

---

## 8. THE UBUNTU OLLAMA ENVIRONMENT DIFFERENCE

**What the spec assumes:** Three Ollama Docker containers (aegis-ollama-main, aegis-ollama-judge, aegis-ollama-vision) that use a named Docker volume starting empty. IMPL_04's setup_models.py then downloads all models into this volume.

**What is actually true:** All models are already downloaded at /home/pal/.ollama/models/ via the standalone Ubuntu Ollama installation. Re-downloading 28GB is unnecessary.

**Mandatory change for IMPL_03:** For all three Ollama Docker containers in docker-compose.yml, replace the named volume with a bind mount:
```yaml
# Replace this:
volumes:
  - aegis-ollama-models:/root/.ollama

# With this:
volumes:
  - /home/pal/.ollama:/root/.ollama
```
Do not create the aegis-ollama-models named volume. See guides/UBUNTU_OLLAMA_PATCH.md for full details.

**Ollama URLs in .env and config.py (from IMPL_02 spec):**
These are Docker-internal network addresses — not localhost, not host.docker.internal:
```
OLLAMA_MAIN_URL=http://aegis-ollama-main:11434
OLLAMA_JUDGE_URL=http://aegis-ollama-judge:11434
OLLAMA_VISION_URL=http://aegis-ollama-vision:11434
```

---

## 9. COPILOT'S ROLE

Copilot is the implementation agent. Praveen is the project owner and reviewer.

**Copilot's responsibilities:**
1. Read the full spec document for the current session before writing any code
2. Create every file at the exact path the spec specifies — no approximations
3. Write production-grade code that is complete and correct on first write
4. Run every verification command from the spec and show the output
5. Fix any failures before declaring the session complete
6. Report the session outcome clearly

**Copilot must NOT:**
1. Invent solutions not present in the spec
2. Skip verification steps
3. Write placeholder code with TODOs
4. Create files in a different location than the spec specifies
5. Make assumptions about what Praveen might prefer
6. Declare a session complete if any verification command failed

---

## 10. CODE QUALITY MANDATE

All AEGIS code is production enterprise grade. No exceptions.

**Python standards:**
- Full type annotations on every function signature and class attribute
- Async/await for every I/O operation — zero blocking calls in async context
- Docstrings on all classes and all public functions (Google format)
- Zero inline comments — code is self-documenting through naming and structure
- Specific exception types only — never bare `except:` or `except Exception:`
- All config read from `backend/app/config.py` Settings class — never `os.environ.get()` in service files
- Pydantic v2 models for all data validation
- SQLAlchemy 2.0 async sessions for all database operations
- structlog for all logging — never print()

**TypeScript/React standards:**
- Full TypeScript types — no `any`, no `unknown` without narrowing
- TanStack Query v5 for all server state management
- Zustand for all client-side global state
- Tailwind CSS utility classes only — no inline styles
- No console.log() in production code
- Error boundaries on all major page components

**Universal:**
- Zero hardcoded credentials, passwords, API keys, or hostnames
- Zero TODO comments — complete all implementation in the session
- All secrets via HashiCorp Vault or environment variables through Settings class
