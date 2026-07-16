# AEGIS — Testing Strategy
## The Philosophy Behind How This Project Is Verified
## Place in: specs/tier3_verification/TESTING_STRATEGY.md

---

## WHY THIS DOCUMENT EXISTS

This project's existing verification assets — `ALL_VERIFICATION_DOCUMENTS.md` (the originally-planned `VERIFY_01-04` architectural checks), `VERIFICATION_IMPL08_TO_22.md` (granular per-session checks), and a runbook produced during this project's specification-strategy work — overlap significantly and are flagged for future consolidation (`DECISIONS_LOG.md` DEC-030). None of them state *why* testing is structured the way it is. This document captures that reasoning once, so it survives independently of whichever specific checklist files exist at any given time.

---

## THE CORE APPROACH: AUTOMATED TESTS AS THE PRIMARY GATE, MANUAL CHECKS AT MILESTONES ONLY

**Every session's automated test suite runs after that session**, as originally specified in each `IMPL_XX`/`FRONTEND_XX` document's own "Verify" block. This is fast and catches regressions immediately.

**The full, detailed manual verification checklist is reserved for three milestone checkpoints, not run after every single session:**

1. **After ingestion-pipeline completion** (`IMPL_18`) — the point where the system can genuinely take in and process real content for the first time.
2. **After backend completion** (`IMPL_29`, the last Quick Entry session) — the entire backend, including Quick Entry, is functionally complete.
3. **After full-system completion** (`FRONTEND_19`/F19, the last frontend session) — the entire product, backend and frontend, is done.

---

## WHY NOT RUN THE FULL MANUAL CHECKLIST EVERY SESSION

For a solo developer implementing sessions sequentially via Claude Code, running an exhaustive manual checklist after each of ~48 total sessions (29 backend + 19 frontend) would turn every session into a multi-hour verification pass, disproportionate to what a single session's change surface actually requires. The automated suite already catches the overwhelming majority of regressions a single session could introduce. The manual checklist's real value is catching *integration* issues — problems that only appear once multiple sessions' outputs interact — which is exactly what the three milestone points are chosen to expose, and exactly what a single session's automated tests cannot catch by design (they test that session in isolation).

This is a deliberate efficiency choice, not a corner cut: rigor is preserved at the points where rigor actually catches something the automated suite structurally can't, while avoiding redundant manual effort at every intermediate step where it wouldn't.

---

## WHAT "PASSING" MEANS AT EACH LEVEL

| Level | Bar |
|---|---|
| Per-session automated tests | 100% pass, 0 skipped, per that session's own `IMPL_XX`/`FRONTEND_XX` verification block |
| Milestone manual checklist | Every check in the relevant consolidated `tier3_verification/` checklist passes; any failure is fixed before proceeding to the next milestone, not deferred |
| Full-system completion | All three milestone checkpoints have passed, plus the end-to-end checks in `docs/CLOUD_DEPLOYMENT_GUIDE.md`'s go-live checklist |

---

## HOW THIS INTERACTS WITH THE AMENDMENT DOCUMENTS

Each `tier1_amendments/*.md` document already embeds its own "how to verify this was implemented correctly" section, applied at the same time as the amendment itself (`DECISIONS_LOG.md` DEC-030) — these are not separate from the per-session automated-test gate described above; they're additional checks specific to that amendment, run alongside whichever session the amendment was attached to.

---

## WHEN THE THREE OVERLAPPING VERIFICATION DOCUMENTS GET CONSOLIDATED

Not scoped as part of this specification-writing phase. When undertaken, the consolidation should preserve: `VERIFY_01-04`'s architectural/health-check-level checks as the milestone-level content described above, and the granular per-session checks (currently duplicated between `VERIFICATION_IMPL08_TO_22.md` and the separately-produced runbook) merged into one set, attached to each session's own `IMPL_XX` document rather than living in a separate parallel file.

---

*Related: `DECISIONS_LOG.md` DEC-030, DEC-031.*
