# AEGIS — HISTORICAL ARCHITECTURE EVOLUTION
## The Lookup Table for Everything Archived in tier5_historical/
## Place in: specs/tier5_historical/HISTORICAL_ARCHITECTURE_EVOLUTION.md

---

## HOW TO USE THIS DOCUMENT

This is a **lookup table**, not a chronological record. Consult it at the specific moment you open a file in this folder and need to know: *is this claim still true?*

It is not `DECISIONS_LOG.md` (in `specs/tier3_verification/`). That document is a chronological diary — consult it when you want to understand *why* a decision was made and what alternatives were considered. This document only answers *whether an old claim still holds*, with a pointer to the `DECISIONS_LOG.md` entry that has the full reasoning.

**The governing rule, stated once, applies to every entry below:** per the authority hierarchy established in this project (`IMPL_XX` spec files, then `tier1_foundation` documents, then the `tier0` agent guides, then everything in this folder, in descending order of authority), nothing archived here is authoritative. If a current, active spec file says something different from a document in this folder, the active spec file is correct. This folder exists so you don't have to *re-derive* that conclusion from scratch every time — the reconciliation work has already been done once, below.

---

## WHAT IS ARCHIVED HERE, AND WHY

| Archived file | Why it's here |
|---|---|
| `guides/PRE_IMPLEMENTATION_MASTER_PLAN.md` | Early planning document, predates the final `IMPL_XX` spec set |
| `guides/OLLAMA_MODEL_GUIDE.md` | Superseded by `OLLAMA_MODEL_GUIDE_CORRECTED.md`, itself now moot per DEC-015 (self-hosted inference abandoned entirely) |
| `guides/OLLAMA_MODEL_GUIDE_CORRECTED.md` | Same — moot regardless of its own internal corrections, since Ollama is no longer self-hosted by default |
| `guides/AEGIS_DIRECTORY_STRUCTURE.md` | **Partially superseded, not wholly wrong** — see the explicit note below. Its directory/tier structure claims (`tier4_frontend`, the 85-document count) were independently re-verified and are still accurate. Its production-model claims (Entry 1 below) are not |
| `guides/create_aegis_structure.sh` | One-time bootstrapping script, already executed; the structure it created is now the live project tree |
| `AEGIS_CLARIFICATION_ANSWERS.md` | Early clarification round (50 questions), superseded in places by `AEGIS_TIER1_CLARIFICATION_ANSWERS.md` and, ultimately, by the final `IMPL_XX`/`tier1_foundation` documents |
| `AEGIS_TIER1_CLARIFICATION_ANSWERS.md` | Corrects the document above against `tier1_foundation` — itself superseded by the same final specs where they overlap |
| `AEGIS_GUIDES_CONFLICT_ANSWERS.md` | Resolves conflicts within `guides/` — contains at least one confirmed error of its own (Entry 4 below) |
| `AEGIS_MASTER_CONTEXT.md` | A one-time historical snapshot, explicitly generated "after all pre-implementation work complete, about to begin IMPL_01" — frozen at that point in time by its own stated purpose, not meant to be kept current |
| `IMPL_PATCH_01_MISSING_CONSTANTS_AND_ADMIN_HANDLER.md` | Fully absorbed into `IMPL_21` — confirmed via `IMPL_21`'s own text: *"This document supersedes IMPL_PATCH_01, IMPL_PATCH_02, and IMPL_PATCH_03."* Content matches exactly (12 constants, `admin_handler.py`, `postgres_client.py`) |
| `IMPL_PATCH_02_CRITICAL_BUG_FIXES.md` | Same — absorbed into `IMPL_21` |
| `IMPL_PATCH_03_QUALITY_FIXES.md` | Same — absorbed into `IMPL_21` |
| `AGENT_PROMPT_PLACE_FILES.md` | A one-time file-placement utility prompt; the files it moved (`IMPL_23-29`, confirmed via direct directory listing) are already in place |
| `SAP_Document_Templates_SonaComstar.docx` | The original Word-document source that `AEGIS_DOCUMENT_TEMPLATES.md` was derived from — explicitly Sona-Comstar-branded by its own filename, and now superseded twice over: first by `AEGIS_DOCUMENT_TEMPLATES.md` (the markdown spec), then by `docs/DOCUMENT_AUTHORING_TEMPLATE.md` (the generalized version, per DEC-036) |
| `aegis-admin-wireframe.html`, `aegis-chat-wireframe.html`, `aegis-sitemap.html` | Early visual mockups, predating and lower-fidelity than the complete, code-level `FRONTEND_01-40` specification set that now describes the same UI in full detail |

**Checked and confirmed NOT archived, still valid, left where it is:** `GITHUB_SETUP_GUIDE.md` — a standalone repository bootstrapping guide, not spec content, not superseded by anything. **`COPILOT_01-05` and `COPILOT_INITIATION_PROMPT.md` are also confirmed NOT archived** — this is a still-valid, complementary rules layer (the "Five Absolute Rules") that applies to every session alongside the agent guides, not a historical artifact.

---

## THE LOOKUP TABLE

### Entry 1 — "Production uses a MODEL_BACKEND switch, upgrading to Qwen2.5-72B/14B/72B-vision on dedicated GPU"

**Found in:** `guides/AEGIS_DIRECTORY_STRUCTURE.md` ("Key Design Decisions" section), `.env.example`'s commented-out `VLLM_*` block, `AEGIS_GUIDES_CONFLICT_ANSWERS.md`

**Is this still true? No — on two independent grounds.**

1. Verified absent from the actual authoritative specs. Zero mentions of `MODEL_BACKEND`, `vllm`, or `72b` anywhere in `IMPL_16_REASONING_SERVICE.md`, `AEGIS_MASTER_REFERENCE.md`, or `AEGIS_CONFIGURATION_CONSTANTS.md` — confirmed by direct search. This was early planning that never survived into the final spec.
2. Now doubly moot: self-hosted inference (of any model, any size) was abandoned entirely in favor of external Cerebras/Groq API routing.

**Current truth:** `model_gateway.py` routes to `gpt-oss-120b` (dual-homed Cerebras/Groq), `llama-3.1-8b-instant` (Groq), and Groq's Llama 4 Scout / Cerebras's Gemma 4 31B for vision. See `AMENDMENT_INFERENCE_ARCHITECTURE.md`.

**Full reasoning:** `DECISIONS_LOG.md` DEC-015, DEC-025 (point 1).

---

### Entry 2 — "Docker service count is 20, including aegis-minio" (main ingestion path)

**Found in:** All three clarification-answer documents (`AEGIS_CLARIFICATION_ANSWERS.md`, `AEGIS_TIER1_CLARIFICATION_ANSWERS.md`, `AEGIS_GUIDES_CONFLICT_ANSWERS.md`)

**Is this still true? Complicated — it was false, then became true again, but for a different reason than originally planned, and it was never actually false for one specific part of the system.**

- For the main document-ingestion path (`IMPL_18`): confirmed absent from the final specs (`IMPL_18_INGESTION_PIPELINE.md`, `IMPL_03_DOCKER_INFRASTRUCTURE.md`, `AEGIS_MASTER_REFERENCE.md`, `AEGIS_PROJECT_STRUCTURE.md` — zero mentions). It was dropped before finalization, then deliberately re-added as a new decision, not a restoration of the original plan.
- **For Quick Entry (`IMPL_28`) specifically: this claim was never false.** `IMPL_28`'s own final spec text contains a complete, independent MinIO integration (its own upload sequence, its own nightly cleanup job with version/age-based eligibility rules) that survived into the final spec set without ever being dropped. This was only discovered during a later verification pass — the earlier "MinIO was dropped" conclusion (DEC-025) was accurate for `IMPL_18` but incomplete as a blanket statement about the whole system.

**Current truth:** MinIO is real, a genuine 20th service, for both the main ingestion path (via `AMENDMENT_OBJECT_STORAGE_MINIO.md`'s new integration) and Quick Entry (via `IMPL_28`'s own pre-existing integration, with two small naming corrections).

**Full reasoning:** `DECISIONS_LOG.md` DEC-024, DEC-025 (point 2), DEC-034.

---

### Entry 3 — "AEGIS uses two embedding models: BGE-large (dense) and BGE-M3 (sparse)"

**Found in:** Early planning documents (predates the final `IMPL_04`/`IMPL_06` specs)

**Is this still true? No.**

`guides/AEGIS_DIRECTORY_STRUCTURE.md` itself contains the explicit reconciliation for this one, in its own "why no BGE-M3 service directory" explanation — meaning this particular drift was already partially self-documented in the very guide that also contains Entry 1's since-corrected claim. Worth noting as a small irony: the same document got this one right (proactively explaining its own supersession) while stating Entry 1's claim without any such caveat.

**Current truth:** A single `BAAI/bge-base-en-v1.5` model, 768-dimensional, dense only, confirmed throughout `IMPL_04`, `IMPL_06`, and `AEGIS_MASTER_REFERENCE.md`. No sparse component exists anywhere in the final architecture.

**Full reasoning:** `DECISIONS_LOG.md` DEC-025 (point 3).

---

### Entry 4 — "PgBouncer's internal port is 5432, not 6432"

**Found in:** `AEGIS_GUIDES_CONFLICT_ANSWERS.md` (stated there as a correction to an earlier document)

**Is this still true? No — this document's "correction" was itself the error.**

Direct inspection of `IMPL_03_DOCKER_INFRASTRUCTURE.md`'s actual `pgbouncer.ini` configuration shows `listen_port = 6432` (PgBouncer's own listening port, which the application connects to), forwarding to PostgreSQL itself on `5432` (PgBouncer's target, not what the application ever talks to directly). `IMPL_05` and `AEGIS_MASTER_REFERENCE.md` both independently confirm `6432` as the application-facing port.

**Current truth:** The application connects via port `6432`. This was correct all along; `AEGIS_GUIDES_CONFLICT_ANSWERS.md`'s "correction" introduced the error, not fixed one.

**Full reasoning:** `DECISIONS_LOG.md` DEC-025 (point 4).

---

### Entry 5 — "IMPL_PATCH_01/02/03 are the current fix documents to implement"

**Found in:** The patch documents themselves; referenced as still-relevant in the pre-v3.0 phase of the backend agent guide's history

**Is this still true? No.**

Confirmed via `IMPL_21_FIX_SESSION.md`'s own explicit text: *"This document supersedes IMPL_PATCH_01, IMPL_PATCH_02, and IMPL_PATCH_03."* Content verified to match exactly — all 12 configuration constants, `admin_handler.py`, `postgres_client.py`, and the five critical bug fixes described across the three patches are all present in `IMPL_21`.

**Current truth:** Implement `IMPL_21` only. The three patch documents require no action of their own.

**Full reasoning:** `DECISIONS_LOG.md` DEC-025.

---

## A NOTE ON WHY THIS DOCUMENT EXISTS AT ALL

Every entry above was found by direct verification against the actual current specs, not by trusting either the old document or an assumption that it must be wrong. Entry 3's own self-aware correction and Entry 4's "correction that was itself wrong" are both included deliberately, as a reminder that supersession isn't always one-directional or obvious — the safest habit is checking the specific claim against the current authoritative source every time, not assuming a pattern ("early docs are always outdated," or conversely, "this specific document already fixed itself once, so it's probably fine now") holds universally.

---

*This document is updated only when a new archived document is added to `tier5_historical/`, or a new discrepancy between an archived document and a current spec is found. It does not need updating when a `DECISIONS_LOG.md` entry is added for a reason unrelated to reconciling an old document's claims.*
