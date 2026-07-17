# AEGIS — SPECIFICATION INDEX AND CURRENT STATUS
## Start Here — Project State, File Map, and Resume Instructions
## Place in: specs/SPEC_INDEX_AND_CURRENT_STATUS.md (specs/ root, not inside any tier)

---

## IF YOU READ NOTHING ELSE, READ THIS

**Current state:** Backend implementation reached approximately Session 16 in the original build order. Four cross-cutting amendments and two rewritten agent guides now exist, changing what "continuing from Session 16" actually means — several already-built sessions need retrofitting, not just the remaining sessions built fresh.

**The very next action, before anything else:**
```bash
grep -n "def select_model_tier\|def get_ollama_config\|class ModelGateway\|def generate_streaming\|def call_judge" backend/app/services/model_gateway.py
```
This confirms whether your real `model_gateway.py` matches what `AMENDMENT_INFERENCE_ARCHITECTURE.md` assumes. Full context: `DECISIONS_LOG.md` `OPEN-01`.

---

## THE CORRECTED IMPLEMENTATION ORDER

**Do not follow plain numeric session order — one hard dependency reverses part of it.** Confirmed during final verification (`DECISIONS_LOG.md` DEC-037): Session 16's retrofit changes `model_gateway.call_judge()`'s signature; Session 15's retrofit calls it using the *new* signature. Applying 15 before 16 raises a `TypeError` immediately.

```
STEP 0 — Diagnostic (see above)

STEP 1 — Session 16 retrofit FIRST
  → AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 3 (model_gateway.py full replacement)
  → AMENDMENT_GENERALIZATION_BACKEND.md FILE 3/4 (reasoning_service.py SYSTEM_ROLE)

STEP 2 — Independent retrofits (any order, no dependency on each other or Step 1)
  → Session 10: AMENDMENT_GENERALIZATION_BACKEND.md FILE 6 (Keycloak seed emails)
  → Session 13: AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 4 (clients/ollama_vision.py)
    — NOTE: this line previously cited DEC-038's claim that vision_task.py needs no
    changes. DEC-040 superseded that claim (vision_task.py makes its own separate,
    unretrofitted Ollama call); DEC-048 confirms live that FILE 4b's actual text was
    never updated to match, and vision_task.py is currently broken under
    INFERENCE_MODE=external. See DECISIONS_LOG.md DEC-048 / OPEN-12 before assuming
    Session 13 fully covers vision — it covers ollama_vision.py only.

STEP 3 — Session 15 retrofit (NOW safe — Session 16 is done)
  → AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 7 (retrieval_engine.py CRAG)

STEP 4 — Session 17, fresh build
  → IMPL_17_VALIDATION_ENGINE.md, as specified
  → No retrofit needed — already correctly delegates to model_gateway.call_judge()

STEP 5 — Session 18, fresh build
  → IMPL_18_INGESTION_PIPELINE.md
  → + AMENDMENT_GENERALIZATION_BACKEND.md FILE 1/2/7
  → + AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 4/5

STEP 6 — Session 21, fresh build (CRITICAL, do not skip)
  → IMPL_21_FIX_SESSION.md in full, including Part C (observability, folded from IMPL_20)
  → + AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 6/8

STEP 7 — Session 22, fresh build
  → IMPL_22_FINAL_POLISH.md, as specified

STEP 8 — Sessions 23-29, Quick Entry, in order
  → 23, 24 (+ AMENDMENT_GENERALIZATION_BACKEND.md FILE 8), 25, 26, 27,
    28 (+ AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 9 correction, + AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 8), 29

STEP 9 — Frontend, all 20 sessions per FRONTEND_AGENT_SESSION_GUIDE_v2.md
  → F01 through F19, following that document's own RETROFIT STATUS table

STEP 10 — Go live
  → docs/DEV_ENVIRONMENT_SETUP.md (if not already done) →
    docs/CLOUD_DEPLOYMENT_GUIDE.md → docs/DEMO_CONTENT_GUIDE.md
```

**Full detail for every step above lives in `BACKEND_AGENT_SESSION_GUIDE_v4.md` and `FRONTEND_AGENT_SESSION_GUIDE_v2.md` — this is the summary, not a replacement for reading the actual session prompts.**

---

## COMPLETE FILE MAP — WHERE EVERYTHING GOES

```
project-root/
│
├── specs/
│   ├── SPEC_INDEX_AND_CURRENT_STATUS.md          ← this file
│   │
│   ├── tier0_agent_guide/
│   │   ├── BACKEND_AGENT_SESSION_GUIDE_v4.md     [NEW]
│   │   ├── FRONTEND_AGENT_SESSION_GUIDE_v2.md    [NEW]
│   │   ├── COPILOT_01_PERSONAL_CONTEXT.md         (unchanged)
│   │   ├── COPILOT_02_RULES_AND_QUALITY_GATES.md  (unchanged)
│   │   ├── COPILOT_03_*.md                        (unchanged)
│   │   ├── COPILOT_04_*.md                        (unchanged)
│   │   ├── COPILOT_05_*.md                        (unchanged)
│   │   └── COPILOT_INITIATION_PROMPT.md           (unchanged)
│   │
│   ├── tier1_foundation/                          (unchanged, frozen — 5 files)
│   │   ├── AEGIS_MASTER_REFERENCE.md
│   │   ├── AEGIS_DATA_CONTRACTS.md
│   │   ├── AEGIS_CONFIGURATION_CONSTANTS.md
│   │   ├── AEGIS_PROJECT_STRUCTURE.md
│   │   └── AEGIS_DOCUMENT_TEMPLATES.md
│   │
│   ├── tier1_amendments/                          [NEW]
│   │   ├── AMENDMENT_OBJECT_STORAGE_MINIO.md
│   │   ├── AMENDMENT_INFERENCE_ARCHITECTURE.md
│   │   ├── AMENDMENT_GENERALIZATION_BACKEND.md
│   │   ├── AMENDMENT_GENERALIZATION_FRONTEND.md
│   │   └── AEGIS_INFERENCE_MODEL_SELECTION.md     [MOVED here — referenced by the inference amendment's own attach-list]
│   │
│   ├── tier2_implementation/                      (unchanged, frozen — IMPL_01 through IMPL_29)
│   │
│   ├── tier3_verification/
│   │   ├── DECISIONS_LOG.md                       [NEW]
│   │   ├── TESTING_STRATEGY.md                    [NEW]
│   │   ├── ALL_VERIFICATION_DOCUMENTS.md           (unchanged — pending future consolidation, DEC-030)
│   │   ├── VERIFICATION_IMPL08_TO_22.md            (unchanged — pending future consolidation, DEC-030)
│   │   └── VERIFICATION_RUNBOOK_IMPL15_22.md       [MOVED here — pending same future consolidation]
│   │
│   ├── tier4_frontend/                            (unchanged, frozen — FRONTEND_01-40 + supplements + master reference)
│   │
│   ├── tier5_historical/
│   │   ├── HISTORICAL_ARCHITECTURE_EVOLUTION.md   [NEW — the index for this whole folder]
│   │   ├── guides/
│   │   │   ├── AEGIS_DIRECTORY_STRUCTURE.md        (confirmed real, per your actual tree)
│   │   │   └── create_aegis_structure.sh           (confirmed real, per your actual tree)
│   │   ├── AGENT_SESSION_GUIDE.md                 [MOVED here — superseded by v4]
│   │   └── FRONTEND_35_AGENT_SESSION_GUIDE.md      [MOVED here — superseded by v2]
│   │
│   │   NOTE: earlier versions of this document listed several more items here
│   │   (wireframes, CLAUDE_CODE_FULL_CONTEXT.md, COPILOT_SESSION_PROMPTS_IMPL15_22.md,
│   │   clarification-answer docs, IMPL_PATCH_01-03, AEGIS_MASTER_CONTEXT.md, etc.) —
│   │   confirmed via your actual project tree that none of these exist in your real
│   │   repository. Removed from this map. They existed in this conversation's working
│   │   context but were never part of your real project.
│   │
│   │   SEPARATELY, project-root guides/ (NOT inside specs/, confirmed by your real
│   │   tree) is a completely different, unrelated folder — COPILOT_01-05,
│   │   COPILOT_INITIATION_PROMPT.md, GITHUB_SETUP_GUIDE.md, UBUNTU_OLLAMA_PATCH.md,
│   │   README.md, AEGIS Architecture.md. None of these are historical or superseded.
│   │   No move needed; leave this folder exactly where it is.
│   │
│   └── tier6_production/
│       ├── README.md                              [NEW — Phase B placeholder]
│       ├── AEGIS_AWS_Production_Deployment_Plan.md [only if this exists somewhere in your project; not confirmed in your real tree, not assumed]
│       └── AEGIS_AWS_IT_Head_Recommendation.md     [same caveat]
│
├── docs/                                          (project root, sibling to specs/ — confirmed real per your tree)
│   ├── ARCHITECTURE.md                            (unchanged, confirmed real)
│   ├── ONBOARDING.md                              (unchanged, confirmed real)
│   ├── DEV_ENVIRONMENT_SETUP.md                   [NEW, confirmed placed correctly]
│   ├── CLOUD_DEPLOYMENT_GUIDE.md                  [NEW, confirmed placed correctly]
│   ├── TROUBLESHOOTING_RUNBOOK.md                 [NEW, confirmed placed correctly]
│   └── DEMO_CONTENT_GUIDE.md                      [NEW, confirmed placed correctly]
│
│   NOTE: GITHUB_SETUP_GUIDE.md is NOT in docs/ — confirmed via your real tree it lives
│   in project-root guides/ instead. An earlier version of this map had this wrong.
│
└── scripts/                                       (actual codebase, not specs)
    └── aegis_inference_benchmark.py                [MOVED here — this is a tool to run, not a spec to read]
```

---

## OLD VS NEW — WHICH VERSION IS CORRECT, WHEN BOTH EXIST

Several documents now exist in more than one version because they were revised during this specification process. **This table is the single place to check "which one do I actually use."** The old version is never deleted (it moves to `tier5_historical/` as a record of how the project evolved), but it is never the one to implement against.

| Old version (archived, do not implement against) | Correct version (use this) | Why |
|---|---|---|
| `AGENT_SESSION_GUIDE.md` (v3.0) | `BACKEND_AGENT_SESSION_GUIDE_v4.md` | v4 adds Quick Entry, reconciles all 4 amendments, fixes the "15 bugs"/"9 constants" inaccuracies, adds the Session 16-before-15 dependency fix |
| `FRONTEND_35_AGENT_SESSION_GUIDE.md` (v1.0) | `FRONTEND_AGENT_SESSION_GUIDE_v2.md` | v2 adds F19 (Quick Entry), reconciles all 5 `SUPPLEMENT` documents that v1.0 never referenced at all |
| `CLAUDE_CODE_FULL_CONTEXT.md` **and** `CLAUDE_CODE_FULL_CONTEXT_v2.md` (both) | `tier1_foundation/` + all 4 `tier1_amendments/` documents + `DECISIONS_LOG.md`, together | These early consolidation documents are both fully superseded by the current, more accurate spec set — neither individual old version is "more correct" than the other, both are simply obsolete |
| `COPILOT_SESSION_PROMPTS_IMPL15_22.md` **and** `_v2.md` (both) | `BACKEND_AGENT_SESSION_GUIDE_v4.md` | Covers the same sessions (15-22) plus more, with corrected content |
| `IMPL_PATCH_01`, `_02`, `_03` | `IMPL_21_FIX_SESSION.md` (itself unchanged — still the correct, primary `tier2_implementation` document) | Confirmed via `IMPL_21`'s own text: *"This document supersedes IMPL_PATCH_01, IMPL_PATCH_02, and IMPL_PATCH_03."* |
| `AEGIS_DOCUMENT_TEMPLATES.md` (stays in `tier1_foundation/`, frozen — not archived, still needed as historical/technical reference) | `docs/DOCUMENT_AUTHORING_TEMPLATE.md` for actual document authoring | The frozen original still explains *why* the ingestion pipeline's field-detection regex is shaped the way it is — keep both, use them for different purposes |
| `model_gateway.py`'s original `call_judge(self, prompt: str)` | `call_judge(self, prompt, max_tokens=None, temperature=None)` (written by `AMENDMENT_INFERENCE_ARCHITECTURE.md` FILE 3) | This is code, not a spec document, but the same rule applies — DEC-037 exists specifically because this exact confusion is easy to make |

**Never in more than one version, no disambiguation needed:** all 5 `tier1_foundation/` documents, all 29 `tier2_implementation/` documents, all `tier4_frontend/` documents, all 5 `COPILOT_0X` documents. These are frozen originals — if you see conflicting information *about* them, the conflict is in some other document's *description* of them, not in the originals themselves.

---

## QUICK-REFERENCE: WHICH DOCUMENT ANSWERS WHICH QUESTION

| Question | Document |
|---|---|
| "Why is it built this way?" | `tier3_verification/DECISIONS_LOG.md` |
| "Is this old document still true?" | `tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md` |
| "What do I attach to Session N?" | `tier0_agent_guide/BACKEND_AGENT_SESSION_GUIDE_v4.md` or `FRONTEND_AGENT_SESSION_GUIDE_v2.md` |
| "How do I set up my dev environment?" | `docs/DEV_ENVIRONMENT_SETUP.md` |
| "How do I go live?" | `docs/CLOUD_DEPLOYMENT_GUIDE.md` |
| "Something broke, what do I do?" | `docs/TROUBLESHOOTING_RUNBOOK.md` |
| "What models does inference use, and why?" | `tier1_amendments/AEGIS_INFERENCE_MODEL_SELECTION.md` |
| "Where does this file physically go?" | This document, section above |

---

*This document should be updated whenever a new file is added to `specs/` anywhere — treat it as the map that must never go stale, the same discipline `DECISIONS_LOG.md`'s cross-reference table needed re-applying to itself this session.*
