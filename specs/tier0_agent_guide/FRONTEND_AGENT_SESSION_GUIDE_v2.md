# FRONTEND AGENT SESSION GUIDE v2.0
## Complete Implementation Roadmap — Exact Prompts and File Lists
## Extends v1.0 (FRONTEND_35, Sessions F01-F18) — Adds Quick Entry (F19), Reconciles Supplements 01-05, Weaves In Generalization Fixes
## This document replaces v1.0 entirely — do not use v1.0 alongside this version

---

## WHAT CHANGED FROM v1.0 — READ THIS FIRST

v1.0 (`FRONTEND_35_AGENT_SESSION_GUIDE.md`) covered 18 sessions (F01-F18) built entirely around Sona Comstar branding, with no session ever attaching any of the five `FRONTEND_SUPPLEMENT_01-05` documents. Since v1.0 was written:

1. **`AMENDMENT_GENERALIZATION_FRONTEND.md`** now exists in `specs/tier1_amendments/`, with 11 file-level touchpoints across 7 different sessions — woven into each affected session's prompt text below, not left as a separate table.
2. **The five `FRONTEND_SUPPLEMENT_01-05` documents were never referenced anywhere in v1.0**, despite two of them (`SUPPLEMENT_03`, `SUPPLEMENT_04`) explicitly declaring themselves replacements for a document `F18` still attaches, and a third (`SUPPLEMENT_05`) explicitly stating which sessions it applies to. All five are reconciled into the relevant sessions below.
3. **Session F19 (Quick Entry) is new** — `FRONTEND_36-40` did not exist when v1.0 was written and are not covered by any of its 18 sessions.
4. **`SUPPLEMENT_05`'s F09/F10/F11 header claim is fully accurate, once all four of its Parts are checked, not just Part 3.** Part 3 (audit trail, registry timestamps) maps to F13/F12, not F11 — but Part 4 (Import Path Standardisation) does belong to F11, resolving what first looked like a discrepancy in the supplement's own stated scope. Worth recording as a reminder: confirming a claim requires checking *all* of a source's relevant content, not stopping once part of it fails to match.
5. **`DECISIONS_LOG.md`** (in `specs/tier3_verification/`) is the authoritative record of every generalization decision's full reasoning — this guide states what to do at each session; it does not re-argue why.

---

## CRITICAL READING BEFORE STARTING

All 18 original sessions are already fully built (unlike the backend, where several sessions remain unbuilt) — every session below except **F19** is therefore a **RETROFIT**, applying corrections to existing code, not a fresh build. Apply the diffs shown; do not recreate any file from scratch unless a diff block explicitly says to replace the whole file.

**Company branding is no longer hardcoded.** Every fix below routes through the existing `NEXT_PUBLIC_ORG_NAME` environment variable (via an `orgName` constant in `src/lib/constants.ts`) rather than introducing a new mechanism.

---

## RETROFIT STATUS AND SUPPLEMENT RECONCILIATION

| Session | Status | What's applied |
|---|---|---|
| F01 | Already built | None |
| F02 | Already built | RETROFIT: `AMENDMENT_GENERALIZATION_FRONTEND.md` FILE 6 (`layout.tsx` metadata) |
| F03 | Already built | RETROFIT: FILE 1/2/3 (env var, `sessionExport.ts`, login page) + `SUPPLEMENT_02`'s more complete PDF component (FILE 11) |
| F04 | Already built | None |
| F05 / F05b | Already built | RETROFIT: FILE 7 (`LoadingScreen.tsx`) |
| F06 | Already built | RETROFIT: FILE 8 (`ChatEmptyState.tsx`) |
| F07 | Already built | RETROFIT: FILE 9 (`EmployeeTopbar.tsx`) |
| F08 | Already built | None |
| F09 | Already built | RETROFIT: `SUPPLEMENT_05` Parts 1-2 (multi-tab WebSocket coordination, partial stream error handling) |
| F10 | Already built | RETROFIT: FILE 5 (`OnboardingStep.tsx`) + `SUPPLEMENT_05` Part 3 partial (session history card timestamps) + FILE 10 (`formatDateIST` → `formatDateLocalized`) |
| F11 | Already built | RETROFIT: `SUPPLEMENT_05` Part 4 (`EmptyState.tsx` canonical import path) |
| F12 | Already built | RETROFIT: `SUPPLEMENT_05` Part 3 partial (registry `created_at` display) |
| F13 | Already built | RETROFIT: `SUPPLEMENT_05` Part 3 partial (audit trail timeline display) |
| F14-F17 | Already built | None |
| F18 | Already built | RETROFIT: `SUPPLEMENT_03`, `SUPPLEMENT_04` (supersede the "too thin" `FRONTEND_29_33_BACKEND_API_CONTRACTS.md` this session currently attaches), `SUPPLEMENT_02`'s proxy route portion |
| F19 | **New — fresh build** | `FRONTEND_36-40` (Quick Entry) |

---

## SESSION START PROMPTS

### SESSION F01 — PROJECT SCAFFOLD
**Duration:** ~25 min | **Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_04_DEPENDENCIES.md

### Prompt:
> You are setting up the AEGIS SAP Helpdesk AI frontend from scratch.
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
*(Already built. No amendment applies.)*

---

### SESSION F02 — DESIGN SYSTEM & GLOBALS (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, AMENDMENT_GENERALIZATION_FRONTEND

### Prompt:
> This session is already built. Apply AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 6 to the existing src/app/layout.tsx — the Next.js metadata object's `description` field hardcodes "SAP ERP Helpdesk AI — Sona Comstar"; replace with a template string reading `orgName` from src/lib/constants.ts. Do not re-run the rest of Session F02.

### Verify:
```bash
grep -n "Sona Comstar" src/app/layout.tsx   # expect no output
npx tsc --noEmit
```

---

### SESSION F03 — ARCHITECTURE & INFRASTRUCTURE (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_02_ARCHITECTURE.md, AMENDMENT_GENERALIZATION_FRONTEND, FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF

### Prompt:
> This session is already built. Apply AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 1 (change NEXT_PUBLIC_ORG_NAME's default in .env.local), FILE 2 (sessionExport.ts's PDF footer text), and FILE 3 (login page's logo alt text and subtitle) to the existing files.
>
> Separately, check whether FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF.md's `SessionDocument` component is the same underlying PDF-export feature as this session's sessionExport.ts, at a more complete stage of development (it includes confidence-badge styling not present in the original). If so, treat SUPPLEMENT_02's version as authoritative and apply AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 11 to it instead of — not in addition to — FILE 2. If they are genuinely two separate PDF outputs, apply both FILE 2 and FILE 11 independently.
>
> Do not re-run the rest of Session F03.

### Verify:
```bash
grep -rn "Sona Comstar" frontend/.env.local frontend/src/lib/sessionExport.ts "frontend/src/app/(auth)/login/page.tsx"
# expect no output
npx tsc --noEmit
```

---

### SESSION F04 — TAILWIND PATTERNS & SHADCN OVERRIDES
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_03_TAILWIND_GLOBALS.md
*(Already built. No amendment applies. Original F04 content unchanged.)*

---

### SESSION F05 — CORE & DATA COMPONENTS, Part 1 (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_05_CORE_COMPONENTS.md, AMENDMENT_GENERALIZATION_FRONTEND

### Prompt:
> This session is already built. Apply AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 7 to the existing src/components/shared/LoadingScreen.tsx — its logo Image element hardcodes alt="Sona Comstar"; replace with alt={orgName}. Do not re-run the rest of Session F05.

### Verify:
```bash
grep -n "Sona Comstar" src/components/shared/LoadingScreen.tsx   # expect no output
```

---

### SESSION F05b — CORE & DATA COMPONENTS, Part 2
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_06_DATA_COMPONENTS.md, FRONTEND_07_OVERLAY_COMPONENTS.md
*(Already built. No amendment applies.)*

---

### SESSION F06 — CHAT COMPONENTS (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_08_CHAT_COMPONENTS.md, AMENDMENT_GENERALIZATION_FRONTEND

### Prompt:
> This session is already built. Apply AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 8 to the existing src/components/chat/ChatEmptyState.tsx — its logo Image element hardcodes alt="Sona Comstar"; replace with alt={orgName}. Do not re-run the rest of Session F06.

### Verify:
```bash
grep -n "Sona Comstar" src/components/chat/ChatEmptyState.tsx   # expect no output
```

---

### SESSION F07 — LAYOUT COMPONENTS & STORES (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_09_LAYOUT_COMPONENTS.md, AMENDMENT_GENERALIZATION_FRONTEND

### Prompt:
> This session is already built. Apply AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 9 to the existing src/components/shared/EmployeeTopbar.tsx — this is the persistent header shown on every employee-facing page, and the single most visible touchpoint found in the entire generalization sweep. Its doc comment describes "Sona Comstar logo + AEGIS brand name," and its Image element hardcodes alt="Sona Comstar" — fix both. Do not re-run the rest of Session F07.

### Verify:
```bash
grep -n "Sona Comstar" src/components/shared/EmployeeTopbar.tsx   # expect no output
# Manually load any employee page and confirm the header shows the configured org name
```

---

### SESSION F08 — TANSTACK QUERY HOOKS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_10_QUERY_HOOKS.md, FRONTEND_11_MUTATION_HOOKS.md
*(Already built. No amendment applies.)*

---

### SESSION F09 — EMPLOYEE CHAT INTERFACE (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_12_EMPLOYEE_CHAT.md, FRONTEND_13_EMPLOYEE_CHAT_FEATURES.md, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING

### Prompt:
> This session is already built. Apply FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md's Part 1 (multi-tab WebSocket coordination — the useWebSocket.ts extension, uiStore extension, and new MultiTabWarningBanner component, wired into the employee layout) and Part 2 (partial stream error handling — the chatStore extension, AIResponseBubble update, and useWebSocket update for recovering from a stream that errors mid-response). Do not re-run the rest of Session F09.

### Verify:
```bash
# Open the chat in two browser tabs simultaneously — confirm the warning banner appears
# Manually interrupt a streaming response (kill backend mid-stream) — confirm graceful partial-response handling, not a crash
npx tsc --noEmit
```

---

### SESSION F10 — EMPLOYEE HISTORY & ONBOARDING (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_14_EMPLOYEE_HISTORY.md, FRONTEND_15_EMPLOYEE_ONBOARDING.md, AMENDMENT_GENERALIZATION_FRONTEND, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING, FRONTEND_SUPPLEMENT_01

### Prompt:
> This session is already built. Apply three fixes:
> (1) AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 5 to the existing src/components/onboarding/OnboardingStep.tsx — logo alt text and the "AEGIS answers your SAP questions instantly using Sona Comstar's..." copy, both replaced with the orgName constant.
> (2) AMENDMENT_GENERALIZATION_FRONTEND.md's FILE 10 to src/lib/utils.ts (from FRONTEND_SUPPLEMENT_01) — formatDateIST and formatISTDate hardcode Asia/Kolkata timezone and en-IN locale; introduce NEXT_PUBLIC_DEPLOY_LOCALE/NEXT_PUBLIC_DEPLOY_TIMEZONE with formatDateIST kept as a deprecated alias.
> (3) FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md's Part 3 subsection for session history cards specifically — update their timestamp display to use the renamed formatDateLocalized function.
> Do not re-run the rest of Session F10.

### Verify:
```bash
grep -n "Sona Comstar" src/components/onboarding/OnboardingStep.tsx   # expect no output
grep -n "formatDateIST\|formatDateLocalized" src/lib/utils.ts   # expect both present
```

---

### SESSION F11 — ADMIN SHELL & DASHBOARD (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_16_ADMIN_SHELL.md, FRONTEND_17_ADMIN_DASHBOARD.md, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING

### Prompt:
> This session is already built. **Correction to an earlier version of this guide:** F11 was initially checked only against `SUPPLEMENT_05`'s Part 3 (audit trail, registry timestamps — which indeed belong to F13/F12, not here) and marked as having no action needed. This missed Part 4 (Import Path Standardisation), which does belong here — resolving `SUPPLEMENT_05`'s own header claim that F11 is affected, rather than contradicting it as first assumed.
>
> Apply `FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md`'s Part 4: establish `src/components/admin/EmptyState.tsx` as the single canonical location for this component. Search the codebase for any admin page importing it from `@/components/shared/EmptyState` or `@/components/ui/empty-state` (both explicitly do not exist per the supplement) and correct those imports to `@/components/admin/EmptyState`. Confirm the component's props match: `icon` (a `LucideIcon` component, not a string), `title`, optional `description`, optional `action`, and a `variant` prop.
>
> Do not re-run the rest of Session F11.

### Verify:
```bash
grep -rn "components/shared/EmptyState\|components/ui/empty-state" src/
# expect no output — both are confirmed non-existent paths
grep -rln "components/admin/EmptyState" src/app/\(admin\)/
# confirm every admin page using an empty state imports from the canonical path
```

---

### SESSION F12 — ADMIN DOCUMENTS & REGISTRY (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_18_ADMIN_DOCUMENTS.md, FRONTEND_19_ADMIN_REGISTRY_CONFIG.md, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING

### Prompt:
> This session is already built. Apply FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md's Part 3 subsection for the registry page's created_at column — update its timestamp display to use formatDateLocalized (see F10 for where this function is introduced; if F10 has not yet been retrofitted, apply that fix first). Do not re-run the rest of Session F12.

### Verify:
```bash
grep -n "formatDateLocalized\|formatDateIST" "src/app/(admin)/admin/registry/page.tsx"
```

---

### SESSION F13 — ADMIN GAPS, AUDIT, REVIEW & TICKETS (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_20_ADMIN_GAPS_AUDIT.md, FRONTEND_21_ADMIN_REVIEW_TICKETS.md, FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING

### Prompt:
> This session is already built. Apply FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md's Part 3 subsections for the audit trail timeline and the knowledge gap "last seen" display — update both to use formatDateLocalized. Do not re-run the rest of Session F13.

### Verify:
```bash
grep -rn "formatDateLocalized\|formatDateIST" src/components/admin/AuditTimeline.tsx
```

---

### SESSION F14 — ADMIN HEALTH & ANALYTICS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_22_ADMIN_HEALTH.md, FRONTEND_23_ADMIN_ANALYTICS.md
*(Already built. No amendment applies.)*

---

### SESSION F15 — ANIMATIONS & MICRO-INTERACTIONS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_24_ANIMATIONS.md
*(Already built. No amendment applies.)*

---

### SESSION F16 — DARK MODE, ERROR HANDLING & POLISH
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_25_DARK_MODE.md, FRONTEND_26_ERROR_HANDLING.md

### Prompt:
> This session is already built. FRONTEND_25_DARK_MODE.md's "Sona Comstar logo" section is a documentation header only — the actual code beneath it (the brightness-0 invert CSS technique) is already generic and requires no change. No action needed here.

*(Checked directly — cosmetic documentation heading only, no functional fix required.)*

---

### SESSION F17 — ACCESSIBILITY & PERFORMANCE
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_27_ACCESSIBILITY.md, FRONTEND_28_PERFORMANCE.md
*(Already built. No amendment applies.)*

---

### SESSION F18 — BACKEND API PROXY & FINAL VERIFICATION (RETROFIT)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_34_VERIFICATION.md, FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF, FRONTEND_SUPPLEMENT_03_SESSION_API, FRONTEND_SUPPLEMENT_04_BACKEND_APIS_30_33

### Prompt:
> This session's original attach-list (FRONTEND_29_33_BACKEND_API_CONTRACTS.md) is stale. FRONTEND_SUPPLEMENT_03 explicitly supersedes FRONTEND_29 (the session API contract, described in the supplement's own header as "too thin"), and FRONTEND_SUPPLEMENT_04 explicitly supersedes the combined FRONTEND_29-33 document for backend APIs 30-33 (metrics aggregation, analytics bucketing, health checks, preferences + WebSocket). Attach and implement against SUPPLEMENT_03 and SUPPLEMENT_04 instead of the original FRONTEND_29_33 document.
>
> Additionally, apply FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF.md's proxy-route portion to src/app/api/proxy/[...path]/route.ts if it was not already covered when F03 was retrofitted.
>
> Then run through FRONTEND_34_VERIFICATION.md as originally specified — every page, every feature. Fix any failures. When all checks pass, run the final TypeScript audit.

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

### SESSION F19 — ADMIN QUICK ENTRY (NEW — FRESH BUILD)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_36_ADMIN_QUICK_ENTRY_LIST.md, FRONTEND_37_ADMIN_QUICK_ENTRY_FORM.md, FRONTEND_38_ADMIN_QUICK_ENTRY_FORM_FIELDS.md, FRONTEND_39_ADMIN_QUICK_ENTRY_SCREENSHOT.md, FRONTEND_40_EMPLOYEE_ATTRIBUTION_SCREENSHOTS.md

### Prompt:
> Implement the complete Quick Entry admin interface from FRONTEND_36 through FRONTEND_39, and the employee-facing screenshot attribution display from FRONTEND_40. This is a fresh build — none of these five documents were covered by any session in the original 18-session guide. Build the Quick Entry list page, the multi-step entry form and its field components, the screenshot upload/review UI, and the employee-side component that displays attributed screenshots in AI responses. Cross-check each file against AMENDMENT_GENERALIZATION_FRONTEND.md for any Sona Comstar references not yet identified in this newer spec set, since these five documents were not part of the original sweep that produced that amendment.

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

## FILE COUNT SUMMARY (UPDATED)

| Session | Files Created | Cumulative |
|---|---|---|
| F01-F18 | ~197 (unchanged from v1.0) | 197 |
| F19 | ~15-20 (estimate — Quick Entry admin + employee attribution) | ~212-217 |

---

## IMPLEMENTATION TIPS (UNCHANGED FROM v1.0)

**Context management:** Each session creates 5-15 files. Split large sessions at natural boundaries.

**Error recovery:** Fix TypeScript errors before starting the next session. Import path aliases (`@/`) are the most common source of errors.

**Mock data:** Sessions F11-F14 create admin pages — use the mock data objects in each spec document until the backend is connected.

**Backend connection:** Connect the real backend in F18, after all UI is built and verified, to avoid debugging frontend and backend simultaneously.

---

## WHEN ALL SESSIONS COMPLETE

Update `DECISIONS_LOG.md` with the date this guide's retrofits were completed. Run the final F18 verification block once more with F19's files included, then proceed to whatever comes next in the overall project plan (production deployment, per `docs/CLOUD_DEPLOYMENT_GUIDE.md`).

---

*Document version 2.0 | AEGIS Frontend Specification Set | Supersedes v1.0 (FRONTEND_35) in full*
