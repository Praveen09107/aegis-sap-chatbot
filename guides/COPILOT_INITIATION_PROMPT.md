# COPILOT_INITIATION_PROMPT.md
## The exact prompt to paste into GitHub Copilot Chat at the start of every session
## Edit only the lines marked with ← EDIT THIS

---

## HOW TO USE THIS DOCUMENT

1. Copy the entire prompt block below
2. Replace [SESSION_N], [IMPL_XX], [SESSION_NAME], and [SPEC_FILE_PATH] with the correct values
3. Paste into GitHub Copilot Chat
4. Wait for Copilot to confirm it has read all 5 context documents
5. Wait for Copilot to confirm understanding before it begins writing code
6. Do NOT skip the confirmation step — it ensures Copilot has absorbed all context

---

## CURRENT SESSION QUICK REFERENCE

Fill this in each time before using the prompt:

```
Session number:     [e.g., Session 1]
IMPL document:      [e.g., IMPL_01]
Session name:       [e.g., Dependencies]
Spec file path:     [e.g., /home/pal/aegis-project/specs/tier2_implementation/IMPL_01_DEPENDENCIES.md]
Ubuntu patch needed: [Yes — IMPL_03 only / No — all other sessions]
```

---

## THE MASTER INITIATION PROMPT

```
═══════════════════════════════════════════════════════════════════════════
AEGIS IMPLEMENTATION SESSION — SONA COMSTAR SAP HELPDESK AI
═══════════════════════════════════════════════════════════════════════════

You are GitHub Copilot acting as the implementation agent for the AEGIS
SAP Helpdesk AI system at Sona Comstar, Chennai, India.

STEP 1 — READ ALL CONTEXT DOCUMENTS BEFORE DOING ANYTHING ELSE

Read these five documents in this exact order. Do not begin any
implementation until you have read all five:

  1. /home/pal/aegis-project/guides/COPILOT_01_PERSONAL_CONTEXT.md
  2. /home/pal/aegis-project/guides/COPILOT_02_RULES_AND_QUALITY_GATES.md
  3. /home/pal/aegis-project/guides/COPILOT_03_ARCHITECTURE_COMPLETE.md
  4. /home/pal/aegis-project/guides/COPILOT_04_WORKFLOWS_COMPLETE.md
  5. /home/pal/aegis-project/guides/COPILOT_05_SESSION_PROTOCOL.md

STEP 2 — CONFIRM YOUR UNDERSTANDING

After reading all five documents, confirm by answering these questions:

  a) What is Praveen's role and why does his skill level matter for how
     you write code?

  b) State the Five Absolute Rules from COPILOT_02 in one line each.

  c) What is the Ubuntu Ollama patch and which session requires it?

  d) What are the three Ollama Docker containers and what are their
     correct bind mount paths?

  e) Name the three Qdrant collections that store document content
     and their vector dimension.

  f) Trace the employee chat workflow from WebSocket message received
     to semantic cache check — how many stages and what happens at each?

  g) What is architecture drift and name three specific drift patterns
     to watch for in this project?

Do not proceed to Step 3 until you have answered all seven questions.

STEP 3 — READ THE SESSION SPEC

Read the full specification document for this session:

  [SPEC_FILE_PATH]              ← EDIT THIS

After reading the spec, state:
  - How many files this session creates
  - Which files are new vs modifications to existing files
  - What the verification commands are at the end
  - Whether any Ubuntu Ollama patch steps apply
  - Any potential conflicts with code from previous sessions

STEP 4 — BEGIN IMPLEMENTATION

Follow the implementation loop from COPILOT_05 Session Protocol:
  - Create each file at its exact specified path
  - Run syntax and import checks after each file
  - Run all spec verification commands after all files are created
  - Show the actual output of every verification command

Current session: [SESSION_N]: [IMPL_XX] — [SESSION_NAME]    ← EDIT THIS

Do not declare this session complete until every verification passes.

═══════════════════════════════════════════════════════════════════════════
```

---

## SESSION-SPECIFIC ADDITIONS

For certain sessions, add these extra instructions at the end of the prompt after the current session line.

### For IMPL_03 (Docker Infrastructure) — ADD THIS:

```
MANDATORY ENVIRONMENT PATCH FOR THIS SESSION:
Read guides/UBUNTU_OLLAMA_PATCH.md before writing docker-compose.yml.
This project uses Ubuntu WSL2 Ollama with models at /home/pal/.ollama
For all three Ollama containers (aegis-ollama-main, aegis-ollama-judge,
aegis-ollama-vision), the volume mount MUST be:
  volumes:
    - /home/pal/.ollama:/root/.ollama
Do NOT use the named volume aegis-ollama-models.
Do NOT declare aegis-ollama-models in the volumes section.
After writing docker-compose.yml, verify the patch with:
  grep -A3 "aegis-ollama-main:" docker-compose.yml | grep "home/pal"
This must return: - /home/pal/.ollama:/root/.ollama
```

### For IMPL_04 (Models Setup) — ADD THIS:

```
MANDATORY PRE-CHECK FOR THIS SESSION:
Before running setup_models.py, verify models are already inside Docker:
  docker exec aegis-ollama-main ollama list
All three models must appear immediately without downloading:
  qwen2.5:32b          ~19.8 GB
  qwen2.5:7b-instruct  ~4.7 GB
  qwen2.5vl:7b         ~5.1 GB
If they do NOT appear, stop and report — do not proceed.
If they DO appear, setup_models.py should detect them and skip re-download.
Report which models appeared and the exact ollama list output.
```

### For IMPL_21, IMPL_22, all IMPL_PATCH_XX — ADD THIS:

```
THIS IS A PATCH SESSION — CRITICAL INSTRUCTIONS:
This session modifies files created in previous sessions.
Do NOT replace entire files. Read each existing file's current content
before making any changes. Apply only the specific changes the spec describes.
After each patch, run the full import chain:
  python -c "import app.main; print('Import chain intact')"
Confirm that no previously passing tests now fail.
```

### For FRONTEND sessions — ADD THIS:

```
FRONTEND SESSION INSTRUCTIONS:
All TypeScript and React code must follow the standards in COPILOT_02 Section 6.
No any types. No inline styles (Tailwind only). No console.log.
All server state via TanStack Query. All client state via Zustand stores.
All API calls go through the Next.js proxy route — never directly from browser to FastAPI.
After creating components, run the TypeScript compiler check:
  cd /home/pal/aegis-project/frontend && npx tsc --noEmit
Zero TypeScript errors are acceptable. Fix all type errors before completing.
```

---

## EXAMPLE FILLED PROMPT — SESSION 1

This shows what the filled prompt looks like for IMPL_01:

```
═══════════════════════════════════════════════════════════════════════════
AEGIS IMPLEMENTATION SESSION — SONA COMSTAR SAP HELPDESK AI
═══════════════════════════════════════════════════════════════════════════

You are GitHub Copilot acting as the implementation agent for the AEGIS
SAP Helpdesk AI system at Sona Comstar, Chennai, India.

STEP 1 — READ ALL CONTEXT DOCUMENTS BEFORE DOING ANYTHING ELSE

Read these five documents in this exact order. Do not begin any
implementation until you have read all five:

  1. /home/pal/aegis-project/guides/COPILOT_01_PERSONAL_CONTEXT.md
  2. /home/pal/aegis-project/guides/COPILOT_02_RULES_AND_QUALITY_GATES.md
  3. /home/pal/aegis-project/guides/COPILOT_03_ARCHITECTURE_COMPLETE.md
  4. /home/pal/aegis-project/guides/COPILOT_04_WORKFLOWS_COMPLETE.md
  5. /home/pal/aegis-project/guides/COPILOT_05_SESSION_PROTOCOL.md

STEP 2 — CONFIRM YOUR UNDERSTANDING

After reading all five documents, confirm by answering these questions:

  a) What is Praveen's role and why does his skill level matter for how
     you write code?

  b) State the Five Absolute Rules from COPILOT_02 in one line each.

  c) What is the Ubuntu Ollama patch and which session requires it?

  d) What are the three Ollama Docker containers and what are their
     correct bind mount paths?

  e) Name the three Qdrant collections that store document content
     and their vector dimension.

  f) Trace the employee chat workflow from WebSocket message received
     to semantic cache check — how many stages and what happens at each?

  g) What is architecture drift and name three specific drift patterns
     to watch for in this project?

Do not proceed to Step 3 until you have answered all seven questions.

STEP 3 — READ THE SESSION SPEC

Read the full specification document for this session:

  /home/pal/aegis-project/specs/tier2_implementation/IMPL_01_DEPENDENCIES.md

After reading the spec, state:
  - How many files this session creates
  - Which files are new vs modifications to existing files
  - What the verification commands are at the end
  - Whether any Ubuntu Ollama patch steps apply
  - Any potential conflicts with code from previous sessions

STEP 4 — BEGIN IMPLEMENTATION

Follow the implementation loop from COPILOT_05 Session Protocol.

Current session: Session 1: IMPL_01 — Dependencies

Do not declare this session complete until every verification passes.

═══════════════════════════════════════════════════════════════════════════
```

---

## WHAT COPILOT'S CONFIRMATION SHOULD LOOK LIKE

After pasting the prompt, Copilot should respond with a structured confirmation before writing any code. If Copilot skips the confirmation and jumps straight to writing code, stop it and ask it to confirm first.

A correct confirmation looks like:

```
I have read all five context documents. Here is my confirmation:

a) Praveen is a third-year B.E. intern at Sona Comstar building AEGIS.
   His skill level matters because he cannot manually verify generated code,
   so every file must be correct on first write and every verification
   command must pass before I declare a session complete.

b) Five Absolute Rules:
   1. Spec paths are exact — no approximations
   2. All verifications must pass before session is complete
   3. Never write placeholder code or TODO comments
   4. Never invent architecture not present in the spec
   5. Apply the Ubuntu Ollama bind mount patch in IMPL_03

c) The Ubuntu Ollama patch replaces the named Docker volume with a bind
   mount (/home/pal/.ollama:/root/.ollama) for all three Ollama containers.
   Required only for IMPL_03.

d) Three Ollama containers:
   aegis-ollama-main: /home/pal/.ollama:/root/.ollama (qwen2.5:32b)
   aegis-ollama-judge: /home/pal/.ollama:/root/.ollama (qwen2.5:7b-instruct)
   aegis-ollama-vision: /home/pal/.ollama:/root/.ollama (qwen2.5vl:7b)

e) Three content Qdrant collections, all 768-dimensional:
   meridian_errors, meridian_procedures, meridian_configs

f) Employee chat stages 1–5: WebSocket received → authentication validation →
   input governance + rate limit → session state retrieval → semantic cache
   check (BGE embed → Qdrant cache_queries search, threshold 0.88).
   5 stages before the AI pipeline begins.

g) Architecture drift is when code makes decisions that differ from the spec.
   Three patterns:
   1. Reading os.environ.get() directly instead of settings.FIELD_NAME
   2. Handlers calling Ollama directly instead of through service → model_gateway
   3. Synchronous I/O (requests.get) inside async functions

I have read the spec for this session. Summary:
- Files to create: [N files listed]
- Verifications: [verification commands listed]
- Ubuntu patch: Not required for IMPL_01
- Conflicts: None — this is the first session

Beginning implementation now.
```

If the confirmation is vague, incomplete, or wrong on any point, ask Copilot to re-read the relevant document before proceeding.
