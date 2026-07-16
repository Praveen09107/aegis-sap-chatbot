# AEGIS — Implementation Strategy
## Current State Through Production — Phases, Gates, and Reasoning
## Place at project root or `specs/`

---

## HOW THIS RELATES TO `SPEC_INDEX_AND_CURRENT_STATUS.md`

That document has the literal step-by-step order and file map — the *what*. This document is the *why* and the *gates*: what must be true before moving from one phase to the next, and what to do if it isn't. Read both; they're not duplicates of each other.

---

## REAL CURRENT STATE (as of the last audit — update this section if it goes stale)

Confirmed via `audit_repo.sh` run on the actual repository, not assumed:
- All 71 real files from Sessions 01–16 exist and pass non-triviality checks
- 4/4 critical architectural facts confirmed (PgBouncer port, migration count, MinIO correctly absent pre-`IMPL_18`, 3 Ollama services present)
- 31 real git commits with specific, plausible messages
- `docker compose config --quiet` passes cleanly (after fixing two broken symlinks — see `DECISIONS_LOG.md` for the full incident if you need the history)
- **`secrets-share/.env` still contains template placeholder values, not real API keys** — this is the literal starting point below
- **`pytest` has not yet been run against the full existing suite** — the second literal starting point

Nothing here has been verified to *work end-to-end* yet — only to *exist correctly*. Phase 0 closes that gap before any new code gets written.

---

## PHASE 0 — CLOSE THE VERIFICATION GAP (you are here)

**Goal:** move from "the right files exist" to "the existing system actually runs."

1. Fill in real values in `secrets-share/.env` — at minimum `CEREBRAS_API_KEY`, `GROQ_API_KEY`
2. `pip install -r backend/requirements-dev.txt`
3. `pytest tests/unit/ backend/tests/unit/ -v` — every test from Sessions 01–16 must pass
4. `docker compose up -d && docker compose ps` — every service reaches `healthy`, not just `running`

**Gate to Phase 1:** all four steps above are clean. If `pytest` shows failures, fix them here — do not carry a known-broken foundation into retrofit work. A retrofit applied on top of a subtly broken base produces a result that's broken in two places instead of one, and harder to debug for it.

---

## PHASE 1 — RETROFIT ALREADY-BUILT SESSIONS

**Why this phase exists separately from Phase 2:** Sessions 10, 11→13, 14–15, and 16 already have real code from the original build. The four cross-cutting amendments (`tier1_amendments/`) change specific parts of that code to reflect decisions made after the original build (external inference, generalization, MinIO, Quick Entry corrections). This is editing, not building — a fundamentally different mode of work than Phase 2, which is why it's sequenced first and treated as its own phase rather than folded into "continue where you left off."

**Order, and why it's not numeric order:** Session 16 first. Its retrofit changes `model_gateway.py`'s `call_judge()` signature; Session 15's retrofit calls that method using the *new* signature. Reversed, Session 15's retrofit throws `TypeError` immediately (`DECISIONS_LOG.md` DEC-037). Sessions 10 and 13 are independent of this chain and of each other — any order, any time within this phase.

**Gate to Phase 2:** every retrofit's own verification block (in `BACKEND_AGENT_SESSION_GUIDE_v4.md`) passes. Re-run the full test suite once more at the end of this phase, not just each retrofit's own narrow check — retrofits can have effects on tests belonging to *other* sessions that a narrow per-retrofit check wouldn't catch.

---

## PHASE 2 — REMAINING BACKEND SESSIONS

Session 17 → 18 → 21 → 22, in that order (per `BACKEND_AGENT_SESSION_GUIDE_v4.md`'s own sequencing — 19 and 20 are skipped/folded, not missing). This is fresh-build work, not retrofitting — standard session discipline applies (read full spec, write, self-verify, close out).

**Gate to Phase 3:** `docker compose up -d` still reaches all-healthy with the new services included (particularly MinIO, added in Session 18). The observability stack added in Session 21's Part C should show real metrics at `/metrics`, not an empty response.

---

## PHASE 3 — QUICK ENTRY

Sessions 23–29, in order. Lower architectural risk than Phase 2 — this is additive functionality on an already-stable base, not touching core inference/retrieval paths except at the two specific points already flagged (`IMPL_24`'s generalization fix, `IMPL_28`'s MinIO/vision reconciliation).

**Gate to Phase 4:** Quick Entry's own admin-facing flow works end-to-end for at least one real test entry (create → review → publish), not just unit tests passing in isolation.

---

## PHASE 4 — FRONTEND

All 20 sessions (F01–F19, including the F05/F05b split) per `FRONTEND_AGENT_SESSION_GUIDE_v2.md`. Can begin once Phase 2's backend API surface is stable — doesn't strictly need Phase 3 (Quick Entry) complete first, except for the specific frontend sessions that depend on it (F19 itself, obviously, plus any earlier session touching Quick Entry's admin UI stubs).

**Gate to Phase 5:** `npm run build` succeeds with zero type errors, and a manual click-through of the primary employee chat flow works against the real backend, not mocked data.

---

## PHASE 5 — MILESTONE TESTING

Per `TESTING_STRATEGY.md`'s own philosophy — the full manual checklist runs at three points, not after every session: after Session 18 (ingestion complete), after Session 29 (backend complete), after F19 (full system complete). If you're only now reaching this phase, at least the second and third checkpoints are due.

**Gate to Phase 6:** all three checkpoints pass, including the ones that should have already happened earlier in the sequence if this is being run as a genuine gate rather than a formality.

---

## PHASE 6 — PRODUCTION (ORACLE)

Confirmed still the target regardless of the local WSL pause. `docs/CLOUD_DEPLOYMENT_GUIDE.md` end to end: VM provisioning, domain, real TLS via Certbot, production `.env` review, `docker-compose.prod.yml`, go-live checklist.

**One thing worth deciding explicitly when this phase starts, not assumed now:** whether Oracle becomes the *dev* environment too (as originally designed in `docs/DEV_ENVIRONMENT_SETUP.md`) or stays deploy-only, with WSL remaining the working dev environment going forward. Both are legitimate; revisit this when Phase 6 actually starts rather than deciding it now while still in Phase 0.

**Gate to "done":** the full go-live checklist in `CLOUD_DEPLOYMENT_GUIDE.md` passes against the real public domain, not `localhost`.

---

## IF SOMETHING BREAKS MID-PHASE

Don't skip ahead to "make progress elsewhere" — per `COPILOT_02`'s still-valid Section 9 guidance (carried into `CLAUDE.md`'s Five Rules), a session with a failing verification is not a complete session. Fix forward within the phase you're in. If a fix genuinely requires reopening an earlier phase's work, that's real information — log it as a new entry in `DECISIONS_LOG.md` the same way every other real finding in this project has been logged, not silently patched and forgotten.

---

*Related: `SPEC_INDEX_AND_CURRENT_STATUS.md` (the detailed step list), `CLAUDE.md`, `CLAUDE_CODE_PROMPTS.md`, `TESTING_STRATEGY.md`.*
