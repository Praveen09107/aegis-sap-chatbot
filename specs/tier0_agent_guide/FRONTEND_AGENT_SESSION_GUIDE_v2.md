# FRONTEND AGENT SESSION GUIDE v2.0
## Complete Implementation Roadmap — Exact Prompts and File Lists
## Extends v1.0 (FRONTEND_35, Sessions F01-F18) — Adds Quick Entry (F19), Reconciles Supplements 01-05, Weaves In Generalization Fixes
## This document replaces v1.0 entirely — do not use v1.0 alongside this version

---

## RE-AUDIT NOTICE (2026-07-19) — READ THIS FIRST, BEFORE "WHAT CHANGED FROM v1.0"

This document previously stated, as its own "CRITICAL READING BEFORE STARTING" section, that all 18 original sessions (F01-F18) were "already fully built" and that every session below except F19 was a **RETROFIT** — apply a diff to existing code, do not recreate anything from scratch. **That claim is comprehensively false, confirmed by a live, direct filesystem check on 2026-07-19, not by re-reading this document's own prior text:**

```
$ find frontend -type f -not -path "*/node_modules/*" -not -path "*/.next/*"
```
returns **17 files total**. Under `frontend/src/`, exactly **6** source files exist:
```
src/app/api/auth/login/route.ts
src/app/api/auth/refresh/route.ts
src/app/api/auth/set-token/route.ts
src/app/api/auth/ws-token/route.ts
src/app/api/proxy/[...path]/route.ts
src/lib/auth.ts
```
No `layout.tsx`, no `page.tsx`, no `src/components/`, no `src/hooks/`, no `src/store/`, no `components.json` (shadcn was never initialized), and `package.json` has none of the dependencies the guide's own `FRONTEND_04_DEPENDENCIES.md`/F01 requires (no shadcn primitives, no `@tanstack/react-query`, no state-management library, no `@react-pdf/renderer`, no animation library). `git log --all -- frontend/` confirms all 6 real files were added in a single commit, `07cb029` ("Session 21: IMPL_21 Fix and Integration..."), built ad hoc to support real backend/Keycloak integration testing — **not produced by any proper execution of F01 through F18 as written**. None of the ~197 files this document previously claimed existed are present. None of these 6 real files have ever actually been run (`npm run dev` has never executed against this codebase, confirmed: no frontend container has ever appeared in this project's `docker compose ps` history).

**This was found, and is corrected in this same pass, in the exact spirit of `OPEN-02`'s resolution for the backend guide** — a false "already built" claim blocks every session from starting safely (this guide's own `F11` entry already shows the concrete cost of trusting it: an earlier retrofit run nearly edited two admin-shell files that turned out not to exist, caught only by luck before being acted on — `DEC-047`). The correction below follows the same standard the backend guide was held to: every session's own prompt text is rewritten to say what actually needs to be built, not just a table updated with a status word.

**What this means practically:** every session F01 through F18 is now a **FRESH BUILD**, not a retrofit. Every "Apply fix X to the existing file Y" instruction below has been rewritten to "Build file Y from its original spec document, with fix X already correct from the start" — there is no existing file to patch. The one narrow exception: F03 ("Architecture & Infrastructure") should treat the 5 real pre-existing files above (`auth.ts` + the 4 auth API routes) as a starting point to verify, complete, and correct — not overwrite blindly — since they are real, if untested, work; F18 should do the same for the proxy route. Every other session (F01-F02, F04-F17) has nothing pre-existing to preserve.

This notice, and the corrections below, resolve `OPEN-11`. Full reasoning: `specs/tier3_verification/DECISIONS_LOG.md`, `DEC-062`.

---

## WHAT CHANGED FROM v1.0 — READ THIS FIRST

v1.0 (`FRONTEND_35_AGENT_SESSION_GUIDE.md`) covered 18 sessions (F01-F18) built entirely around Sona Comstar branding, with no session ever attaching any of the five `FRONTEND_SUPPLEMENT_01-05` documents. Since v1.0 was written:

1. **`AMENDMENT_GENERALIZATION_FRONTEND.md`** now exists in `specs/tier1_amendments/`, with 11 file-level touchpoints across 7 different sessions — woven into each affected session's prompt text below, not left as a separate table.
2. **The five `FRONTEND_SUPPLEMENT_01-05` documents were never referenced anywhere in v1.0**, despite two of them (`SUPPLEMENT_03`, `SUPPLEMENT_04`) explicitly declaring themselves replacements for a document `F18` still attaches, and a third (`SUPPLEMENT_05`) explicitly stating which sessions it applies to. All five are reconciled into the relevant sessions below.
3. **Session F19 (Quick Entry) is new** — `FRONTEND_36-40` did not exist when v1.0 was written and are not covered by any of its 18 sessions.
4. **`SUPPLEMENT_05`'s F09/F10/F11 header claim is fully accurate, once all four of its Parts are checked, not just Part 3.** Part 3 (audit trail, registry timestamps) maps to F13/F12, not F11 — but Part 4 (Import Path Standardisation) does belong to F11, resolving what first looked like a discrepancy in the supplement's own stated scope. Worth recording as a reminder: confirming a claim requires checking *all* of a source's relevant content, not stopping once part of it fails to match.
5. **`DECISIONS_LOG.md`** (in `specs/tier3_verification/`) is the authoritative record of every generalization decision's full reasoning — this guide states what to do at each session; it does not re-argue why.

**Note (2026-07-19):** items 1-4's actual *content* (which amendment/supplement fix applies to which session) remains accurate and is preserved below — the RE-AUDIT NOTICE above corrects only the *retrofit-vs-fresh-build* framing this section and the "CRITICAL READING BEFORE STARTING" section originally asserted, not the substance of which fixes apply where.

---

## RETROFIT STATUS AND SUPPLEMENT RECONCILIATION — CORRECTED 2026-07-19

| Session | Real status (verified live) | What must be built |
|---|---|---|
| F01 | **FRESH BUILD** — no scaffold, no shadcn, no `components.json` | Full project scaffold per `FRONTEND_04_DEPENDENCIES.md` |
| F02 | **FRESH BUILD** | Design system + globals, with `AMENDMENT_GENERALIZATION_FRONTEND.md` FILE 6 (`layout.tsx` metadata using `orgName`) correct from the start |
| F03 | **FRESH BUILD, with 5 real pre-existing files to verify/complete, not overwrite** | Architecture + infrastructure per `FRONTEND_02_ARCHITECTURE.md`, FILE 1/2/3 correct from the start, `SUPPLEMENT_02`'s more complete PDF component (FILE 11) used as the canonical PDF export. **`src/lib/auth.ts` and the 4 files under `src/app/api/auth/` already exist (Session 21) — verify them against this session's real spec, complete anything missing, do not discard.** |
| F04 | **FRESH BUILD** | Tailwind patterns + shadcn overrides |
| F05 / F05b | **FRESH BUILD** | Core + data components, with FILE 7 (`LoadingScreen.tsx` `orgName` alt text) correct from the start |
| F06 | **FRESH BUILD** | Chat components, with FILE 8 (`ChatEmptyState.tsx` `orgName` alt text) correct from the start |
| F07 | **FRESH BUILD** | Layout components + stores, with FILE 9 (`EmployeeTopbar.tsx` — the single most visible generalization touchpoint) correct from the start |
| F08 | **FRESH BUILD** | TanStack Query hooks |
| F09 | **FRESH BUILD** | Employee chat interface, with `SUPPLEMENT_05` Parts 1-2 (multi-tab coordination, partial-stream error handling) built in from the start, not retrofitted after |
| F10 | **FRESH BUILD** | Employee history + onboarding, with FILE 5 (`OnboardingStep.tsx`), FILE 10 (`formatDateLocalized`), and `SUPPLEMENT_05` Part 3's session-history-card timestamp handling all correct from the start |
| F11 | **FRESH BUILD** | Admin shell + dashboard, with `SUPPLEMENT_05` Part 4 (`EmptyState.tsx` at its one canonical path, `@/components/admin/EmptyState`) correct from the start — no other import path is ever created |
| F12 | **FRESH BUILD** | Admin documents + registry, with `SUPPLEMENT_05` Part 3's registry `created_at` display using `formatDateLocalized` from the start |
| F13 | **FRESH BUILD** | Admin gaps/audit/review/tickets, with `SUPPLEMENT_05` Part 3's audit-timeline and knowledge-gap timestamp displays using `formatDateLocalized` from the start |
| F14-F17 | **FRESH BUILD** | Admin health/analytics, animations, dark mode/error handling, accessibility/performance — no amendment applies to any of these four |
| F18 | **FRESH BUILD, with 1 real pre-existing file to verify/complete** | Backend API proxy + final verification, built against `SUPPLEMENT_03`/`SUPPLEMENT_04` (not the stale `FRONTEND_29_33_BACKEND_API_CONTRACTS.md`) from the start. **`src/app/api/proxy/[...path]/route.ts` already exists (Session 21) — verify it against `SUPPLEMENT_02`'s proxy-route portion and this session's real spec, complete anything missing, do not discard.** This is also the session where `FRONTEND_34_VERIFICATION.md`'s full pass first becomes meaningful, since it's the first point every prior session's real output exists to verify. |
| F19 | **FRESH BUILD** (unchanged — this was already correct) | `FRONTEND_36-40` (Quick Entry) |

---

## CRITICAL READING BEFORE STARTING

**Corrected 2026-07-19 — see the RE-AUDIT NOTICE above.** None of the 18 original sessions are built. Every session below, F01 through F18, is a **FRESH BUILD** from its original spec document(s), with the relevant `AMENDMENT_GENERALIZATION_FRONTEND.md`/`FRONTEND_SUPPLEMENT_0X` fix already correct in the file as it's written for the first time — there is no existing file to diff against, except the 5 files noted under F03 and the 1 file noted under F18, which should be verified and completed rather than assumed correct or overwritten blindly.

**Company branding is not hardcoded, from the first line of code.** Every place branding would appear routes through the `NEXT_PUBLIC_ORG_NAME` environment variable (via an `orgName` constant in `src/lib/constants.ts`, itself created fresh in F02/F03) from the moment that code is first written — not fixed later as a patch.

---

## SESSION START PROMPTS

### SESSION F01 — PROJECT SCAFFOLD (FRESH BUILD)
**Duration:** ~25 min | **Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_04_DEPENDENCIES.md

### Prompt:
> This session has not been built — confirmed live, no `components.json`, no shadcn components, and `package.json` is missing every dependency this session requires. Set up the AEGIS SAP Helpdesk AI frontend from scratch.
> Follow FRONTEND_04_DEPENDENCIES.md exactly.
> Create the Next.js 15 project, install all dependencies, run shadcn init,
> and add all shadcn components listed. Use Node.js 22 and engines: "node": ">=22.0.0".
> Do not create any application files yet — only the project scaffold.

### Files created:
- `package.json`, `next.config.js`, `tsconfig.json`, `postcss.config.js`, `.eslintrc.json`, `components.json`, all shadcn UI components in `src/components/ui/`

### Verify:
```bash
npm run dev  # Must compile with 0 errors
npx tsc --noEmit
```

---

### SESSION F02 — DESIGN SYSTEM & GLOBALS (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, AMENDMENT_GENERALIZATION_FRONTEND

### Prompt:
> This session has not been built. Build the design system and global styles per FRONTEND_01_DESIGN_SYSTEM.md. In `src/app/layout.tsx`, the Next.js metadata object's `description` field must read from `orgName` (see `src/lib/constants.ts`, created in this or the prior session) from the first version of the file — do not hardcode any company name, per AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 6.

### Verify:
```bash
grep -n "Sona Comstar" src/app/layout.tsx   # expect no output
npx tsc --noEmit
```

---

### SESSION F03 — ARCHITECTURE & INFRASTRUCTURE (FRESH BUILD — verify 5 real pre-existing files first)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_02_ARCHITECTURE.md, AMENDMENT_GENERALIZATION_FRONTEND, FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF

### Prompt:
> This session has not been built as a whole, but **5 real files already exist and must be checked before writing anything new**: `src/lib/auth.ts` and `src/app/api/auth/{login,refresh,set-token,ws-token}/route.ts` (added in commit `07cb029`, "Session 21," built ad hoc to support real backend/Keycloak testing — never produced by a proper F03 run, and never actually executed: `npm run dev` has never run against this codebase). Read each of these 5 files, compare against FRONTEND_02_ARCHITECTURE.md's real specification for this infrastructure, and complete/correct them in place rather than discarding and rewriting from scratch — they represent real, if unverified, work.
>
> Build the remainder of this session's infrastructure from FRONTEND_02_ARCHITECTURE.md. Ensure `.env.local`'s `NEXT_PUBLIC_ORG_NAME` default, `sessionExport.ts`'s PDF footer text, and the login page's logo alt text and subtitle all read from `orgName` from the start (AMENDMENT_GENERALIZATION_FRONTEND.md FILE 1/2/3).
>
> Before building `sessionExport.ts`, read FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF.md's `SessionDocument` component — it is a more complete version of this same PDF-export feature (it includes confidence-badge styling the original spec doesn't). Build the PDF export as `SUPPLEMENT_02`'s version from the start (with FILE 11's fix already applied), not the thinner original, unless they are genuinely two separate PDF outputs — if so, build both independently.

### Verify:
```bash
grep -rn "Sona Comstar" frontend/.env.local frontend/src/lib/sessionExport.ts "frontend/src/app/(auth)/login/page.tsx"
# expect no output
npx tsc --noEmit
```

---

### SESSION F04 — TAILWIND PATTERNS & SHADCN OVERRIDES (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_03_TAILWIND_GLOBALS.md
*(Not built. No amendment applies — build per the original spec.)*

---

### SESSION F05 — CORE & DATA COMPONENTS, Part 1 (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_05_CORE_COMPONENTS.md, AMENDMENT_GENERALIZATION_FRONTEND

### Prompt:
> This session has not been built. Build `src/components/shared/LoadingScreen.tsx` and the rest of FRONTEND_05_CORE_COMPONENTS.md's scope from scratch. The logo `Image` element's `alt` text must read `alt={orgName}` from the first version of the file, per AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 7 — never hardcode `alt="Sona Comstar"` even temporarily.

### Verify:
```bash
grep -n "Sona Comstar" src/components/shared/LoadingScreen.tsx   # expect no output
```

---

### SESSION F05b — CORE & DATA COMPONENTS, Part 2 (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_06_DATA_COMPONENTS.md, FRONTEND_07_OVERLAY_COMPONENTS.md
*(Not built. No amendment applies — build per the original spec.)*

---

### SESSION F06 — CHAT COMPONENTS (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_08_CHAT_COMPONENTS.md, AMENDMENT_GENERALIZATION_FRONTEND

### Prompt:
> This session has not been built. Build `src/components/chat/ChatEmptyState.tsx` and the rest of FRONTEND_08_CHAT_COMPONENTS.md's scope from scratch. The logo `Image` element's `alt` text must read `alt={orgName}` from the first version of the file, per AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 8.

### Verify:
```bash
grep -n "Sona Comstar" src/components/chat/ChatEmptyState.tsx   # expect no output
```

---

### SESSION F07 — LAYOUT COMPONENTS & STORES (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_09_LAYOUT_COMPONENTS.md, AMENDMENT_GENERALIZATION_FRONTEND

### Prompt:
> This session has not been built. Build `src/components/shared/EmployeeTopbar.tsx` and the rest of FRONTEND_09_LAYOUT_COMPONENTS.md's scope from scratch. This is the persistent header shown on every employee-facing page — the single most visible branding touchpoint found in the entire generalization sweep. Its doc comment must describe an org-configurable logo + AEGIS brand name (never hardcode "Sona Comstar" in the comment or the code), and its `Image` element's `alt` text must read `alt={orgName}` from the first version of the file, per AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 9.

### Verify:
```bash
grep -n "Sona Comstar" src/components/shared/EmployeeTopbar.tsx   # expect no output
# Manually load any employee page and confirm the header shows the configured org name
```

---

### SESSION F08 — TANSTACK QUERY HOOKS (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_10_QUERY_HOOKS.md, FRONTEND_11_MUTATION_HOOKS.md
*(Not built. No amendment applies — build per the original spec. Requires `@tanstack/react-query` to actually be installed, confirmed absent from the current `package.json` — F01 must land first.)*

---

### SESSION F09 — EMPLOYEE CHAT INTERFACE (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_12_EMPLOYEE_CHAT.md, FRONTEND_13_EMPLOYEE_CHAT_FEATURES.md, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING

### Prompt:
> This session has not been built. Build the employee chat interface from FRONTEND_12/13, with FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md's Part 1 (multi-tab WebSocket coordination — `useWebSocket.ts`, `uiStore` extension, `MultiTabWarningBanner` component, wired into the employee layout) and Part 2 (partial stream error handling — `chatStore` extension, `AIResponseBubble` update, `useWebSocket` recovery from a stream that errors mid-response) built in from the start, as part of the same components, not added afterward. Real backend WebSocket streaming is confirmed working end-to-end as of `DEC-059` (`ws://.../ws/chat?token=<JWT>`, message types `token`/`stream_complete`/`validation_result`/`error`/`ping`) — build against that real, live contract, not an assumed one.

### Verify:
```bash
# Open the chat in two browser tabs simultaneously — confirm the warning banner appears
# Manually interrupt a streaming response (kill backend mid-stream) — confirm graceful partial-response handling, not a crash
npx tsc --noEmit
```

---

### SESSION F10 — EMPLOYEE HISTORY & ONBOARDING (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_14_EMPLOYEE_HISTORY.md, FRONTEND_15_EMPLOYEE_ONBOARDING.md, AMENDMENT_GENERALIZATION_FRONTEND, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING, FRONTEND_SUPPLEMENT_01

### Prompt:
> This session has not been built. Build `src/components/onboarding/OnboardingStep.tsx` and the rest of FRONTEND_14/15's scope, with three things correct from the start, not patched in afterward:
> (1) The logo `alt` text and the "AEGIS answers your SAP questions instantly using [org]'s..." copy both read from the `orgName` constant (AMENDMENT_GENERALIZATION_FRONTEND.md FILE 5).
> (2) `src/lib/utils.ts` is built with `NEXT_PUBLIC_DEPLOY_LOCALE`/`NEXT_PUBLIC_DEPLOY_TIMEZONE`-driven date formatting from the start (`formatDateLocalized`), not a hardcoded `Asia/Kolkata`/`en-IN` version — `formatDateIST` exists only as a deprecated alias for compatibility (AMENDMENT_GENERALIZATION_FRONTEND.md FILE 10, from FRONTEND_SUPPLEMENT_01).
> (3) Session history cards use `formatDateLocalized` for their timestamp display from the start (FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md Part 3's session-history-card subsection).

### Verify:
```bash
grep -n "Sona Comstar" src/components/onboarding/OnboardingStep.tsx   # expect no output
grep -n "formatDateIST\|formatDateLocalized" src/lib/utils.ts   # expect both present
```

---

### SESSION F11 — ADMIN SHELL & DASHBOARD (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_16_ADMIN_SHELL.md, FRONTEND_17_ADMIN_DASHBOARD.md, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING

### Prompt:
> This session has not been built. **Note on an earlier version of this guide's own reasoning, preserved for context:** an earlier pass checked this session only against `SUPPLEMENT_05`'s Part 3 (audit trail, registry timestamps — which do belong to F13/F12, not here) and concluded no action was needed here; that missed Part 4 (Import Path Standardisation), which does belong here. This has no bearing on today's correction (nothing in this session exists to retrofit either way), but the underlying content requirement stands: build `src/components/admin/EmptyState.tsx` as the **one and only** canonical location for this component from the start, per `FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md`'s Part 4. Never create it at `@/components/shared/EmptyState` or `@/components/ui/empty-state` — both are explicitly confirmed non-existent paths that must never be introduced. Every admin page that needs an empty state imports from `@/components/admin/EmptyState` from the moment that page is written. Confirm the component's props: `icon` (a `LucideIcon` component, not a string), `title`, optional `description`, optional `action`, and a `variant` prop.

### Verify:
```bash
grep -rn "components/shared/EmptyState\|components/ui/empty-state" src/
# expect no output — both are confirmed non-existent paths
grep -rln "components/admin/EmptyState" src/app/\(admin\)/
# confirm every admin page using an empty state imports from the canonical path
```

---

### SESSION F12 — ADMIN DOCUMENTS & REGISTRY (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_18_ADMIN_DOCUMENTS.md, FRONTEND_19_ADMIN_REGISTRY_CONFIG.md, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING

### Prompt:
> This session has not been built. Build the admin documents and registry pages from FRONTEND_18/19. The registry page's `created_at` column must use `formatDateLocalized` from the start (see F10 for where this function is defined — build F10 first if it hasn't landed yet), per `FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md`'s Part 3.

### Verify:
```bash
grep -n "formatDateLocalized\|formatDateIST" "src/app/(admin)/admin/registry/page.tsx"
```

---

### SESSION F13 — ADMIN GAPS, AUDIT, REVIEW & TICKETS (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_20_ADMIN_GAPS_AUDIT.md, FRONTEND_21_ADMIN_REVIEW_TICKETS.md, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING

### Prompt:
> This session has not been built. Build the admin gaps/audit/review/tickets pages from FRONTEND_20/21. The audit trail timeline and the knowledge gap "last seen" display both use `formatDateLocalized` from the start, per `FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md`'s Part 3.

### Verify:
```bash
grep -rn "formatDateLocalized\|formatDateIST" src/components/admin/AuditTimeline.tsx
```

---

### SESSION F14 — ADMIN HEALTH & ANALYTICS (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_22_ADMIN_HEALTH.md, FRONTEND_23_ADMIN_ANALYTICS.md
*(Not built. No amendment applies — build per the original spec. Real backend admin endpoints to build against — `pipeline-health`, `inference-health`, knowledge-entries feedback-summary — are confirmed live and correct as of `DEC-059`/`DEC-060`.)*

---

### SESSION F15 — ANIMATIONS & MICRO-INTERACTIONS (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_24_ANIMATIONS.md
*(Not built. No amendment applies — build per the original spec. Requires an animation library to actually be installed, confirmed absent from the current `package.json` — F01 must land first.)*

---

### SESSION F16 — DARK MODE, ERROR HANDLING & POLISH (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_25_DARK_MODE.md, FRONTEND_26_ERROR_HANDLING.md

### Prompt:
> This session has not been built. Build dark mode and error handling per FRONTEND_25/26. Note: FRONTEND_25_DARK_MODE.md's "Sona Comstar logo" section header is a documentation label only — the actual technique it describes (a `brightness-0 invert` CSS filter on the logo for dark mode) is already generic and needs no branding-specific handling. No amendment applies beyond following the spec as written.

*(Checked directly — cosmetic documentation heading only in the source spec, no functional generalization fix required.)*

---

### SESSION F17 — ACCESSIBILITY & PERFORMANCE (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_27_ACCESSIBILITY.md, FRONTEND_28_PERFORMANCE.md
*(Not built. No amendment applies — build per the original spec.)*

---

### SESSION F18 — BACKEND API PROXY & FINAL VERIFICATION (FRESH BUILD — verify 1 real pre-existing file first)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_34_VERIFICATION.md, FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF, FRONTEND_SUPPLEMENT_03_SESSION_API, FRONTEND_SUPPLEMENT_04_BACKEND_APIS_30_33

### Prompt:
> This session has not been built. **One real file already exists and must be checked first:** `src/app/api/proxy/[...path]/route.ts` (added in commit `07cb029`, "Session 21" — built ad hoc, never executed against a running frontend). Read it, compare against `FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF.md`'s proxy-route portion and this session's real spec, and complete/correct it rather than discarding it.
>
> This session's original attach-list (`FRONTEND_29_33_BACKEND_API_CONTRACTS.md`) is stale — build against `FRONTEND_SUPPLEMENT_03` (supersedes `FRONTEND_29`'s session API contract, described in the supplement's own header as "too thin") and `FRONTEND_SUPPLEMENT_04` (supersedes the combined `FRONTEND_29-33` document for backend APIs 30-33: metrics aggregation, analytics bucketing, health checks, preferences + WebSocket) from the start, not the original document.
>
> **This is the first session in the whole sequence where `FRONTEND_34_VERIFICATION.md`'s full pass is actually meaningful** — every prior session's real output exists to verify for the first time here, rather than being assumed already built. Run through it in full: every page, every feature. Fix any failures. When all checks pass, run the final TypeScript audit.

### Verify:
```bash
npx tsc --noEmit              # 0 errors
npx next lint                 # 0 errors
npm run build                 # Builds successfully
ANALYZE=true npm run build    # Bundle analysis — @react-pdf not in initial chunk
npm start                     # Production server starts on :3000
grep -rn "Sona Comstar" src/  # Final full-codebase check — expect no output anywhere
```

---

### SESSION F19 — ADMIN QUICK ENTRY (FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_36_ADMIN_QUICK_ENTRY_LIST.md, FRONTEND_37_ADMIN_QUICK_ENTRY_FORM.md, FRONTEND_38_ADMIN_QUICK_ENTRY_FORM_FIELDS.md, FRONTEND_39_ADMIN_QUICK_ENTRY_SCREENSHOT.md, FRONTEND_40_EMPLOYEE_ATTRIBUTION_SCREENSHOTS.md

### Prompt:
> Implement the complete Quick Entry admin interface from FRONTEND_36 through FRONTEND_39, and the employee-facing screenshot attribution display from FRONTEND_40. This is a fresh build — none of these five documents were covered by any session in the original 18-session guide. Build the Quick Entry list page, the multi-step entry form and its field components, the screenshot upload/review UI, and the employee-side component that displays attributed screenshots in AI responses. Cross-check each file against AMENDMENT_GENERALIZATION_FRONTEND.md for any Sona Comstar references not yet identified in this newer spec set, since these five documents were not part of the original sweep that produced that amendment. The real Quick Entry backend (`IMPL_23-29`) is confirmed complete and re-verified live — build against its actual endpoints (`/api/admin/knowledge-entries`, `/api/admin/knowledge-screenshots`, per `DEC-057`/`DEC-059`), not an assumed contract.

### Files created:
- Quick Entry list, form, and form-field components (per FRONTEND_36-38)
- Screenshot upload/review UI (per FRONTEND_39)
- Employee-side screenshot attribution component (per FRONTEND_40)

### Verify:
```bash
npx tsc --noEmit
grep -rn "Sona Comstar" src/components/admin/quick-entry/ 2>/dev/null
# expect no output — if anything is found, it is a genuinely new touchpoint not
# covered by AMENDMENT_GENERALIZATION_FRONTEND.md and should be added to it
```

---

## FILE COUNT SUMMARY (files still to be created — none of these exist yet, per the 2026-07-19 re-audit)

| Session | Files To Create | Cumulative |
|---|---|---|
| F01-F18 | ~197 (unchanged estimate from v1.0 — 6 of these may already exist as unverified Session-21 groundwork, see F03/F18 above) | 197 |
| F19 | ~15-20 (estimate — Quick Entry admin + employee attribution) | ~212-217 |

---

## IMPLEMENTATION TIPS (UNCHANGED FROM v1.0)

**Context management:** Each session creates 5-15 files. Split large sessions at natural boundaries.

**Error recovery:** Fix TypeScript errors before starting the next session. Import path aliases (`@/`) are the most common source of errors.

**Mock data:** Sessions F11-F14 create admin pages — use the mock data objects in each spec document until the backend is connected.

**Backend connection:** Connect the real backend in F18, after all UI is built and verified, to avoid debugging frontend and backend simultaneously. **Note (2026-07-19):** the real backend is now confirmed working end-to-end against live inference (`DEC-059`), so F18's backend-connection step has real, working endpoints to connect to for the first time — this was not true when v1.0/v2.0 were originally written.

---

## WHEN ALL SESSIONS COMPLETE

Update `DECISIONS_LOG.md` with the date this guide's sessions were completed. Run the final F18 verification block once more with F19's files included, then proceed to whatever comes next in the overall project plan (production deployment, per `docs/CLOUD_DEPLOYMENT_GUIDE.md`).

---

*Document version 2.0 | AEGIS Frontend Specification Set | Supersedes v1.0 (FRONTEND_35) in full | Retrofit-status corrected 2026-07-19, DEC-062*
