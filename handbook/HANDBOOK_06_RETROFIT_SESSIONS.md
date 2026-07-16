# AEGIS Implementation Handbook — Document 06
# Retrofit Sessions — Modifying Already-Built Code (Sessions 16, 10, 13, 15)

**Prerequisite:** Document 05 complete (the base runs, tests pass, stack is healthy).
**Outcome:** The four already-built sessions that need changes are correctly retrofitted, in the correct order, each verified.
**Time:** 2–4 hours total across the four sessions.

---

## WHAT A "RETROFIT" IS, AND WHY IT'S DIFFERENT FROM BUILDING

Sessions 16, 10, 13, and 15 already have real, working code from the original build. But decisions made *after* that build (external inference instead of self-hosted Ollama, company-name generalization) mean specific parts of that code must change. Editing existing code to match a new decision is a **retrofit** — fundamentally different from writing a new file from scratch (Document 07).

Retrofits are higher-risk than fresh builds for one reason: **the code you're editing might not match what the amendment document assumes it looks like.** This project already discovered this the hard way — an amendment was written assuming a file looked one way, the real file looked another, and applying the amendment blindly would have broken things. That's why every retrofit here starts with a *diagnostic* — you confirm the real code matches the amendment's assumption *before* changing anything.

---

## THE MANDATORY ORDER — AND WHY IT'S NOT NUMERIC

You do these four in this exact order:

**1. Session 16 → 2. Session 10 → 3. Session 13 → 4. Session 15**

Session 16 comes first even though 10 and 13 have lower numbers. Here's the hard reason: Session 16's retrofit changes the *signature* of a function called `call_judge()` in `model_gateway.py` — it adds new optional parameters. Session 15's retrofit *calls* `call_judge()` using those new parameters. If you did Session 15 first, its code would call a function whose new parameters don't exist yet, and it would crash immediately with a `TypeError`. Session 16 must establish the new signature before Session 15 can rely on it.

Sessions 10 and 13 are independent — they touch unrelated files (Keycloak seeding, vision client) — so they can go any time, but slotting them between 16 and 15 is the clean order. This ordering is recorded formally in `DECISIONS_LOG.md` as decision DEC-037; you don't need to read it, but that's where it lives if you want the full reasoning.

---

## BEFORE ANY RETROFIT — SET UP GIT DISCIPLINE

You'll work one session per git branch. This makes each session an isolated, revertable unit: if a session goes wrong, you throw away one branch instead of untangling mixed changes.

**At the start of each session**, from the project root:
```bash
cd ~/projects/aegis-project
git status
```
**Why:** Confirm you're starting clean — no leftover uncommitted changes from a previous session. `git status` should say "nothing to commit, working tree clean." If it doesn't, resolve that first (commit or discard the stray changes).

Then create the session branch (example shown for Session 16):
```bash
git checkout -b session/retrofit-16-reasoning
```
**Why:** `checkout -b` creates and switches to a new branch. Naming it after the session keeps history readable.

---

# ═══════════════════════════════════════════════════
# THE FULLY-WORKED EXAMPLE: SESSION 16 (do this exactly)
# ═══════════════════════════════════════════════════

Every later session — retrofit or build — follows this same shape. Session 16 is spelled out completely; the other three give you only their specifics, because the *process* is identical to this.

## 16.1 — Start clean and branch

```bash
cd ~/projects/aegis-project
git status                                    # expect: working tree clean
git checkout -b session/retrofit-16-reasoning # create the session branch
```
**Expect:** `git status` clean, then "Switched to a new branch 'session/retrofit-16-reasoning'".

## 16.2 — Confirm the stack is healthy before you start

```bash
docker compose ps
```
**Why:** You're about to modify a service and re-test. You need to know the stack was healthy *before* your change, so that if something breaks after, you know your change caused it — not some pre-existing problem.
**Expect:** All services running/healthy (as you left them at the end of Document 05). If not, fix that before starting the session.

## 16.3 — Open Claude Code and run the session-start command

```bash
claude
```
Once in Claude Code, run:
```
/aegis-session-start 16
```
**Why:** This is the slash command from your `.claude/commands/`. It runs the environment check and walks Claude Code through the 3-pass spec-reading discipline for this session. It's the codified version of "read everything carefully before touching anything."
**Expect:** Claude Code confirms the environment, then reads and summarizes what Session 16 involves.

## 16.4 — Tell Claude Code exactly what to read

This is where the old "Attach:" list from the session guide becomes real. Session 16's guide entry lists these documents. Give Claude Code this instruction, verbatim:

> Read these six documents completely before writing anything:
> - specs/tier1_foundation/AEGIS_MASTER_REFERENCE.md
> - specs/tier1_foundation/AEGIS_DATA_CONTRACTS.md
> - specs/tier1_foundation/AEGIS_CONFIGURATION_CONSTANTS.md
> - specs/tier2_implementation/IMPL_16_REASONING_SERVICE.md
> - specs/tier1_amendments/AMENDMENT_INFERENCE_ARCHITECTURE.md
> - specs/tier1_amendments/AMENDMENT_GENERALIZATION_BACKEND.md
>
> Do not write or change any file yet. Confirm when you've read all six.

**Why:** These are the exact documents Session 16 depends on. The three `tier1_foundation` docs are the ground-truth data contracts and constants. `IMPL_16` is what the session originally built. The two amendments are what's changing. Claude Code needs all six in its context before it can safely reason about the change.
**Expect:** Claude Code reads each and confirms. It should not start editing yet.

## 16.5 — Run the retrofit diagnostic (the safety check)

Because this is a retrofit, run the diagnostic before any change. Since Session 16 is a retrofit, use:
```
/aegis-retrofit-check backend/app/services/model_gateway.py
```
**Why:** This checks that `model_gateway.py`'s real, current functions match what `AMENDMENT_INFERENCE_ARCHITECTURE.md` assumes. Specifically, the amendment expects to find `select_model_tier`, `get_ollama_config`, `ModelGateway.generate_streaming`, and `ModelGateway.call_judge` — in that shape. If the real file differs, you must know *before* editing.
**Expect:** The command lists the real function/class signatures found in the file. Claude Code compares them to the amendment's assumptions and reports either "matches, safe to proceed" or "discrepancy found."
**If a discrepancy is reported:** STOP. Do not let Claude Code "adapt" the retrofit on the fly. Use `/aegis-report-blocker` and bring the specifics. A silently-adapted retrofit is exactly the failure this project has worked hard to prevent.

## 16.6 — Apply the retrofit

Now give Claude Code the actual work instruction. This comes straight from Session 16's guide entry:

> The diagnostic confirms the file matches. Now apply the retrofit:
> 1. From AMENDMENT_INFERENCE_ARCHITECTURE.md: apply FILE 1 (config.py additions), FILE 2 (create the new inference_providers.py), and FILE 3 (the full model_gateway.py replacement).
> 2. From AMENDMENT_GENERALIZATION_BACKEND.md: apply FILE 3 and FILE 4 to reasoning_service.py's SYSTEM_ROLE constant and its test assertion.
>
> Follow each amendment's FILE section exactly. Do not add anything not specified. When done, list every file you created or modified.

**Why:** You're directing Claude Code to the precise FILE sections, in order. FILE 1/2/3 rewire inference; the generalization FILEs remove the hardcoded company name from the system prompt. The "do not add anything not specified" enforces the no-invented-architecture rule from `CLAUDE.md`.
**Expect:** Claude Code edits `config.py`, creates `inference_providers.py`, replaces `model_gateway.py`, and edits `reasoning_service.py`, then lists all four files.

## 16.7 — Verify (the gate for this session)

```
/aegis-verify
```
**Why:** This runs the real checks — a syntax pass on changed files, the test suite, and the compose config validation. A session is not done because Claude Code *says* it's done; it's done when these actually pass.
**Expect:** The command runs `pytest tests/unit/test_reasoning_service.py -v` (Session 16's specific test), which must pass, plus the broader suite. It only produces a commit message if everything's clean.

Also confirm the one session-specific invariant Session 16's guide calls out:
> Confirm the prompt section order in reasoning_service.py is unchanged: DOCUMENTATION → REGISTRY_NOTE → SCREEN_CONTEXT → EMPLOYEE QUESTION.

**Why:** The generalization edit touches `reasoning_service.py`; you must confirm it changed *only* the company name, not the structural order of the prompt sections, which is load-bearing.
**Expect:** Claude Code confirms the order is intact.

## 16.8 — Restart the affected service and confirm health

```bash
docker compose up -d --build aegis-fastapi aegis-arq
docker compose ps
```
**Why:** You changed backend code. The running containers still have the *old* code until rebuilt. `--build` rebuilds the image with your new code; naming the two services rebuilds only those (faster than everything). Then confirm they come back healthy.
**Expect:** Both services rebuild and return to `healthy`.
**If unhealthy:** `docker compose logs aegis-fastapi --tail=50` — the logs name the problem (often an import error from a mistyped change). Fix before committing.

## 16.9 — Commit the session

If and only if 16.7 and 16.8 are fully clean:
```bash
git add -A
git commit -m "Session 16 retrofit: external inference + generalization

Files modified:
- backend/app/config.py (inference provider constants)
- backend/app/services/model_gateway.py (full replacement — Cerebras/Groq routing)
- backend/app/services/reasoning_service.py (SYSTEM_ROLE generalized)
Files created:
- backend/app/infrastructure/inference_providers.py

Verifications passed:
- pytest tests/unit/test_reasoning_service.py -v
- aegis-fastapi + aegis-arq rebuilt and healthy
- prompt section order confirmed unchanged"
```
**Why:** This captures the session as one clean, revertable unit with a record of exactly what changed and what verified it — the commit format this project has used since its original build.
**Expect:** git confirms the commit.

## 16.10 — Merge to your main working branch

```bash
git checkout dev            # or whatever your main working branch is called
git merge session/retrofit-16-reasoning
```
**Why:** Brings the verified session into your main line. Keeping the session branch until merged means any problem is isolated until you're confident.
**Expect:** A clean merge (fast-forward, since the branch came straight off dev).

**Session 16 is now complete.** Everything below follows this identical 10-step shape.

---

# ═══════════════════════════════════════════════════
# SESSION 10 — specifics only (follow the Session 16 shape)
# ═══════════════════════════════════════════════════

**Branch:** `git checkout -b session/retrofit-10-identity`

**Read (step .4 equivalent):**
- specs/tier1_foundation/AEGIS_MASTER_REFERENCE.md
- specs/tier1_foundation/AEGIS_DATA_CONTRACTS.md
- specs/tier1_foundation/AEGIS_CONFIGURATION_CONSTANTS.md
- specs/tier2_implementation/IMPL_10_SECURITY_IDENTITY_SECRETS.md
- specs/tier1_amendments/AMENDMENT_GENERALIZATION_BACKEND.md

**Retrofit-check (step .5):** `/aegis-retrofit-check backend/scripts/setup_keycloak.py`

**The change (step .6):** Apply AMENDMENT_GENERALIZATION_BACKEND.md's FILE 6 to `backend/scripts/setup_keycloak.py` — change the two test-user email domains from `sonacomstar.local` to `aegis-demo.local`. Nothing else.

**Session-specific caution:** Session 10's *original* prompt embedded an incomplete list of 11 "constants Session 21 will need." Ignore that list entirely — the authoritative, complete list of 12 (including `MODE_C_MAX_SUBQUERIES`) lives only in `IMPL_21` and gets handled when you build Session 21. Do not let Claude Code try to add constants here based on Session 10's old text.

**Verify (step .7):** `/aegis-verify` — plus confirm only the two email domains changed, nothing else in the Keycloak script.

**Service restart (step .8):** Keycloak seeding runs at setup, not continuously — no service rebuild needed, but if you re-run the seed script, confirm the two demo users get the new domain.

**Commit + merge (steps .9, .10):** same pattern.

---

# ═══════════════════════════════════════════════════
# SESSION 13 — specifics only
# ═══════════════════════════════════════════════════

**Branch:** `git checkout -b session/retrofit-13-vision`

**Read:**
- specs/tier1_foundation/AEGIS_MASTER_REFERENCE.md
- specs/tier1_foundation/AEGIS_DATA_CONTRACTS.md
- specs/tier1_foundation/AEGIS_CONFIGURATION_CONSTANTS.md
- specs/tier2_implementation/IMPL_13_VISION_SERVICE.md
- specs/tier1_amendments/AMENDMENT_INFERENCE_ARCHITECTURE.md

**Retrofit-check:** `/aegis-retrofit-check backend/app/clients/ollama_vision.py`

**The change:** Apply AMENDMENT_INFERENCE_ARCHITECTURE.md's FILE 4 to `backend/app/clients/ollama_vision.py` — replace `classify_sap()`'s and `extract_sap_content()`'s direct Ollama `/api/generate` calls with `INFERENCE_MODE`-aware routing through Groq (primary) / Cerebras (fallback), via a shared `_run_vision_prompt()` helper.

**Two session-specific cautions, both important:**
1. **Preserve each function's own timeout** — 15 seconds for classify, 30 seconds for extract. Do NOT collapse them into one shared constant. The amendment's FILE 4 is written to keep them separate; confirm Claude Code did.
2. `vision_integration.py` requires **no changes** (it has no model-calling code). `vision_task.py` is retrofitted **separately, under Session 11's work, NOT here** — these two files are independent (confirmed by direct inspection), not one calling the other. Do not let Claude Code "helpfully" also edit `vision_task.py` during this session.

**Verify:** `/aegis-verify` — plus confirm the two distinct timeouts survived.

**Service restart:** `docker compose up -d --build aegis-arq` (vision runs in the ARQ worker), then confirm healthy.

**Commit + merge:** same pattern.

---

# ═══════════════════════════════════════════════════
# SESSION 15 — specifics only (MUST be after Session 16)
# ═══════════════════════════════════════════════════

**⚠ Do not start this until Session 16 is committed and merged.** Session 15's change calls the new `call_judge()` signature that Session 16 creates. Out of order = immediate `TypeError`.

**Branch:** `git checkout -b session/retrofit-15-crag`

**Read:**
- specs/tier1_foundation/AEGIS_MASTER_REFERENCE.md
- specs/tier1_foundation/AEGIS_DATA_CONTRACTS.md
- specs/tier1_foundation/AEGIS_CONFIGURATION_CONSTANTS.md
- specs/tier2_implementation/IMPL_15_RETRIEVAL_STAGES_6_TO_8.md
- specs/tier1_amendments/AMENDMENT_INFERENCE_ARCHITECTURE.md

**Retrofit-check:** `/aegis-retrofit-check backend/app/services/retrieval_engine.py`

**The change:** Apply AMENDMENT_INFERENCE_ARCHITECTURE.md's FILE 7 to `retrieval_engine.py` — replace `_stage6_crag`'s direct Ollama call with a call to `model_gateway.call_judge()`, passing `CRAG_MAX_TOKENS` explicitly so CRAG's smaller token budget is preserved (not silently widened to the general judge budget).

**Two session-specific invariants that must remain true (the guide flags both as CRITICAL):**
1. **Stage 7 (reranking) source code position stays BEFORE Stage 6 (CRAG).** The pipeline order is deliberately 1→2→3→4→5→7→6→8. Confirm the retrofit didn't reorder them.
2. **Mode C must still never return SKIPPED.** CRAG always runs for Mode C queries.

**Verify:** `/aegis-verify` — plus run `pytest tests/unit/test_retrieval_stages_6_to_8.py -v` specifically, and confirm both invariants above.

**Service restart:** `docker compose up -d --build aegis-fastapi aegis-arq`, confirm healthy.

**Commit + merge:** same pattern.

---

## GATE — DO NOT PROCEED TO DOCUMENT 07 UNTIL ALL OF THESE ARE TRUE

- [ ] Sessions 16, 10, 13, 15 each committed on their own branch and merged.
- [ ] Session 16 was done **before** Session 15.
- [ ] The full test suite (`pytest tests/unit/ backend/tests/unit/ -v`) passes after all four.
- [ ] `docker compose ps` shows the whole stack healthy after the rebuilds.
- [ ] `curl http://localhost:8000/health` still returns healthy JSON.

**Run the full suite once more here, not just each session's narrow test** — retrofits can affect tests belonging to other sessions, and only the full run catches that.

---

## YOU ARE DONE WITH THIS DOCUMENT WHEN

All four retrofits are applied in the correct order, verified, committed, and the whole stack is still healthy. The existing code now reflects the current architecture. Move to Document 07 to build the remaining new backend sessions.
