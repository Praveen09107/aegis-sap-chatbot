# AEGIS Frontend — Reconciliation Findings
## Full re-read of all 46 spec documents against current (2026-07-19) library reality
## Read before the session guide — one finding here changes every session's build target

---

## FINDING 0 (fixed already): Master Reference's document-inventory table was stale

`FRONTEND_MASTER_REFERENCE.md`'s "Document Inventory" table proposed a session grouping from before the real, final structure was settled (confirmed via file timestamps — Master Reference was written the same session as the first spec documents; `FRONTEND_35_AGENT_SESSION_GUIDE.md`, the real operative structure, was written a full day later, after all other documents existed). **Corrected in place** — the table now matches the session guide's real grouping exactly, with a note explaining why, so no future session hits this contradiction.

---

## FINDING 1 — CRITICAL, REQUIRES YOUR DECISION: Next.js 15 + React 18 is one full major version behind current

`FRONTEND_04_DEPENDENCIES.md` specifies `"next": "15.0.3"`, `"react": "18.3.1"`. Confirmed via Next.js's own official docs and multiple independent, recent sources: **Next.js 16 is the current stable release** (16.2.10 as of Next.js's own upgrade-guide page, updated June 23, 2026), and critically, **Next.js 16 requires React 19 as its minimum supported version** — not an optional upgrade, a hard peer-dependency floor. React 19.0.7 is confirmed the current stable React release as of mid-July 2026.

**Why this matters beyond "it's a version behind":** Next.js 16 changes real, load-bearing behavior the specs assume — most significantly, an explicit caching model replacing Next.js 15's implicit default caching. This interacts directly with how `FRONTEND_11_TANSTACK_QUERY.md`'s polling/cache-invalidation strategy was designed. React 19 also deprecates `useFormState` in favor of `useActionState` — relevant if any admin form session uses the older API as written.

**The case for upgrading anyway, despite the spec mismatch:** zero real frontend code exists yet (confirmed — only 6 non-component auth/proxy files). There is no migration cost in the traditional sense; this is a fresh build starting from nothing. Building deliberately against an already-one-version-behind stack, on day one, creates technical debt before a single component exists — the opposite of the "no compromises" standard you've set.

**The case for staying on 15/18 as specced:** every code example across all 40 documents was written and reasoned about against React 18/Next.js 15 patterns. Upgrading means every session needs a real, checked translation pass (not just "it'll probably work"), and shadcn/ui's own compatibility with Next.js 16 + React 19 needs independent confirmation before I'd trust it blind.

**My recommendation: upgrade to Next.js 16 + React 19, and I'll do the compatibility verification pass myself as part of writing each session** — but this is consequential enough that I want your explicit go-ahead before committing every session guide to it, not a silent choice.

---

## FINDING 2 — Confirmed, straightforward fix: `framer-motion` → `motion`

Confirmed via the library's own GitHub, npm page, and changelog: Framer Motion was rebranded **Motion** in 2025, spinning off as an independent project. The API is unchanged; only the package name (`motion` instead of `framer-motion`) and import path (`motion/react` instead of `framer-motion`) differ. The old package name still receives releases (not abandoned), but `motion/react` is the current, correct convention. `FRONTEND_23_FRAMER_MOTION.md`'s code examples need this import path corrected throughout — a mechanical fix, not a design question, so I'll apply it directly rather than flag it as a decision.

---

## FINDING 3 — Confirmed, straightforward fix: WCAG 2.1 AA → 2.2 AA

Already reported in the verification-framework research. `FRONTEND_27_ACCESSIBILITY.md` targets WCAG 2.1 AA; WCAG 2.2 is current practice, with real new success criteria (target size minimums, focus-not-obscured, accessible authentication) 2.1 never required. Folding this into `F17`'s build directly, plus the automated `@axe-core/playwright` gate in the verification standards.

---

## FINDING 4 — Confirmed, no action needed: shadcn/ui, TanStack Query v5, Zustand remain current

Cross-checked against the same research pass: shadcn/ui is explicitly confirmed still the standard accessible-primitives choice for Next.js 16 projects. TanStack Query v5 (what the spec already targets) remains the current major version — only exact patch versions may drift, checked at actual build time rather than hardcoded now. No structural change needed to `FRONTEND_10_ZUSTAND_STORES.md` or `FRONTEND_11_TANSTACK_QUERY.md`'s design.

---

## FINDING 5 — Confirmed via direct file check: `FRONTEND_34_VERIFICATION.md` has zero automated testing

Already reported in full during the verification-framework planning pass. 371 lines, entirely manual checkbox-based, zero mentions of Playwright/Vitest/axe-core anywhere. This is what `FRONTEND_VERIFICATION_STANDARDS.md` (next document) replaces as the primary verification method — the manual checklist's real content (the specific feature-flow assertions per page) is preserved and folded in as the *residual, non-automatable* layer, not discarded.

---

## Still to verify before the session guide is finalized

- Confirm React 19's `useActionState`/`useFormStatus` changes don't conflict with any specific form-handling pattern in `FRONTEND_37_ADMIN_QUICK_ENTRY_FORM.md` (Quick Entry's multi-step form is the most form-heavy session in the entire spec set).
- Confirm `@react-pdf/renderer`'s current compatibility with React 19 before `F03`/`F18`'s PDF export work is finalized — this library has historically lagged major React version support.
- Full read-through of `FRONTEND_02_ARCHITECTURE.md` and `FRONTEND_29_33`/`SUPPLEMENT_03`/`SUPPLEMENT_04` against the real, current backend contract (confirmed WebSocket message types, confirmed endpoint paths from `DEC-057`–`DEC-062`) — not yet fully cross-checked line by line.
