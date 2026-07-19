# AEGIS Frontend Session Guide — Part 1 of 3: Foundation
## Sessions F01–F08 — Scaffold through Query Hooks
## Target stack: Next.js 16 + React 19 (see FRONTEND_RECONCILIATION_FINDINGS.md for why)
## Every session references FRONTEND_VERIFICATION_STANDARDS.md — read that first, once

---

## BEFORE YOU START — CONFIRMED, NOT ASSUMED

- **Fresh build, all of F01–F19.** `frontend/src` is empty except 6 real, unexecuted auth/proxy files from Session 21 — verified directly, no retrofit anywhere in this guide.
- **Stack:** Next.js 16, React 19, TypeScript 5.6+, shadcn/ui, TanStack Query v5, Zustand, `motion` (not `framer-motion` — same library, renamed; import from `motion/react`).
- **Company branding is never hardcoded, from the first line of any file** — every touchpoint routes through `orgName` (`NEXT_PUBLIC_ORG_NAME`), correct from initial authorship per `AMENDMENT_GENERALIZATION_FRONTEND.md`, not patched in later.
- **AEGIS is desktop-only** (≥1280px, Chrome/Firefox) — confirmed in `FRONTEND_28_PERFORMANCE.md`; don't build mobile-responsive layouts unless a session explicitly says to.

---

# SESSION F01 — PROJECT SCAFFOLD

### Branch
```bash
cd ~/projects/aegis-project
git checkout main && git checkout -b session/build-f01-scaffold
```

### In Claude Code
```
/rename session-f01-scaffold
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md and FRONTEND_04_DEPENDENCIES.md completely.

This is a fresh build — frontend/src has no application files. Build the scaffold
with this confirmed, current stack, not FRONTEND_04's literal pinned versions
(which specify Next.js 15/React 18 — since confirmed one major version behind
current stable):

- Next.js 16 (npx create-next-app@latest, App Router, TypeScript, Tailwind)
- React 19, react-dom 19
- Node.js 22, "engines": { "node": ">=22.0.0" }
- shadcn/ui: npx shadcn@latest init, then add every component
  FRONTEND_04_DEPENDENCIES.md lists
- @tanstack/react-query v5, @tanstack/react-query-devtools v5
- zustand (current v4.x/v5 — confirm via npm view zustand version at build time)
- motion (NOT framer-motion — same library, renamed; verify package.json shows
  "motion", and every future import uses "motion/react")
- @react-pdf/renderer (confirmed compatible with React 19 since v4.1.0)

Set up FRONTEND_VERIFICATION_STANDARDS.md's Part 1 tooling in this same session:
Vitest, React Testing Library, Playwright (with axe-core), and the config files
shown there exactly.

Do not create any application files yet — scaffold and tooling only.
```

### Verify
```
npm run dev          # 0 errors
npx tsc --noEmit      # 0 errors
npx vitest run        # runs clean (no tests yet, but the runner must work)
npx playwright test   # runs clean (no tests yet, but the runner must work)
```
Also confirm directly: `cat package.json | grep -E "next|react\"|motion"` — expect `next@16.x`, `react@19.x`, `motion` (not `framer-motion`) present.

### Commit
```bash
git add -A && git commit -m "F01: Project scaffold — Next.js 16, React 19, shadcn/ui, test tooling"
git checkout main && git merge session/build-f01-scaffold && git push origin main
```

---

# SESSION F02 — DESIGN SYSTEM & GLOBALS

### Branch
```bash
git checkout -b session/build-f02-design-system
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and
AMENDMENT_GENERALIZATION_FRONTEND.md completely.

Build the design system and global styles per FRONTEND_01_DESIGN_SYSTEM.md.
In src/app/layout.tsx, the Next.js metadata object's description field must
read from orgName (src/lib/constants.ts) from the file's first version — per
AMENDMENT_GENERALIZATION_FRONTEND.md FILE 6, never hardcode a company name
even temporarily.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4 (Vitest for any new utility, Playwright visual baseline for `globals.css` token rendering, axe-core on the root layout). Plus:
```bash
grep -n "Sona Comstar" src/app/layout.tsx   # expect no output
npx tsc --noEmit
```

### Commit
```bash
git add -A && git commit -m "F02: Design system and globals, orgName-templated metadata"
git checkout main && git merge session/build-f02-design-system && git push origin main
```

---

# SESSION F03 — ARCHITECTURE & INFRASTRUCTURE

**Note: 5 real files already exist here — verify and complete, don't discard.**

### Branch
```bash
git checkout -b session/build-f03-architecture
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_02_ARCHITECTURE.md,
AMENDMENT_GENERALIZATION_FRONTEND.md, and FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF.md
completely.

5 real files already exist: src/lib/auth.ts and src/app/api/auth/{login,refresh,
set-token,ws-token}/route.ts (Session 21, ad hoc, never executed). Read each,
compare against FRONTEND_02_ARCHITECTURE.md's real spec, complete/correct in
place — do not discard.

Build the remainder of this session's infrastructure. Ensure .env.local's
NEXT_PUBLIC_ORG_NAME default, sessionExport.ts's PDF footer, and the login
page's logo alt text/subtitle all read from orgName from the start (FILE 1/2/3).

Before building sessionExport.ts: FRONTEND_SUPPLEMENT_02's SessionDocument
component is a more complete version of the same PDF export (includes
confidence-badge styling the original lacks). Build the supplement's version
from the start (with FILE 11's fix applied), not the thinner original.

Confirm @react-pdf/renderer's actual React 19 compatibility live — run a real
render, not just install the package — since this is the one library this
project's research flagged as historically lagging major React versions.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Part 6 (security — cookie flags on the real auth routes, confirm no token in `localStorage`) plus Part 2 for `auth.ts`'s functions. Plus:
```bash
grep -rn "Sona Comstar" frontend/.env.local frontend/src/lib/sessionExport.ts "frontend/src/app/(auth)/login/page.tsx"
npx tsc --noEmit
```

### Commit
```bash
git add -A && git commit -m "F03: Architecture, infrastructure, 5 pre-existing auth files verified and completed"
git checkout main && git merge session/build-f03-architecture && git push origin main
```

---

# SESSION F04 — TAILWIND PATTERNS & SHADCN OVERRIDES

### Branch
```bash
git checkout -b session/build-f04-tailwind
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md and FRONTEND_03_TAILWIND_GLOBALS.md
completely. No amendment applies. Build per the original spec.
```

### Verify
`npx tsc --noEmit`, Playwright visual baseline captured for the shadcn override components per `FRONTEND_VERIFICATION_STANDARDS.md` Part 3.

### Commit
```bash
git add -A && git commit -m "F04: Tailwind patterns and shadcn overrides"
git checkout main && git merge session/build-f04-tailwind && git push origin main
```

---

# SESSION F05 — CORE COMPONENTS

### Branch
```bash
git checkout -b session/build-f05-core-components
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_05_CORE_COMPONENTS.md, and
AMENDMENT_GENERALIZATION_FRONTEND.md completely.

Build src/components/shared/LoadingScreen.tsx and the rest of this session's
scope. The logo Image element's alt text must read alt={orgName} from the
first version of the file, per FILE 7 — never hardcode alt="Sona Comstar"
even temporarily.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4 for every new component (Button, Input, Badge, Card, Avatar, Spinner, LoadingScreen). Plus:
```bash
grep -n "Sona Comstar" src/components/shared/LoadingScreen.tsx   # expect no output
```

### Commit
```bash
git add -A && git commit -m "F05: Core components, orgName-templated LoadingScreen"
git checkout main && git merge session/build-f05-core-components && git push origin main
```

---

# SESSION F05b — DATA & OVERLAY COMPONENTS

### Branch
```bash
git checkout -b session/build-f05b-data-overlay
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_06_DATA_COMPONENTS.md, and
FRONTEND_07_OVERLAY_COMPONENTS.md completely. No amendment applies. Build
DataTable, MetricCard, Charts, StatusGrid, Modal, Drawer, CommandPalette,
Toast, Tooltip per the original specs.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4 for every component — DataTable's sort/filter/pagination logic specifically needs the race-condition test pattern (Part 2) given it will drive TanStack Query-backed admin tables later.

### Commit
```bash
git add -A && git commit -m "F05b: Data and overlay components"
git checkout main && git merge session/build-f05b-data-overlay && git push origin main
```

---

# SESSION F06 — CHAT COMPONENTS

### Branch
```bash
git checkout -b session/build-f06-chat-components
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_08_CHAT_COMPONENTS.md, and
AMENDMENT_GENERALIZATION_FRONTEND.md completely.

Build src/components/chat/ChatEmptyState.tsx and the rest of this session's
scope. The logo Image element's alt text must read alt={orgName} from the
first version of the file, per FILE 8.

This session includes the markdown-rendering component for AI responses —
per FRONTEND_VERIFICATION_STANDARDS.md Part 6, any markdown rendering of
LLM-generated content must route through a sanitizer (e.g. rehype-sanitize),
never a raw dangerouslySetInnerHTML. Build this correctly from the start,
this is a real injection surface, not a theoretical one.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4, plus Part 6's XSS check specifically on the markdown-rendering component:
```bash
grep -n "Sona Comstar" src/components/chat/ChatEmptyState.tsx   # expect no output
grep -rn "dangerouslySetInnerHTML" src/components/chat/   # any match must go through a confirmed sanitizer
```

### Commit
```bash
git add -A && git commit -m "F06: Chat components, sanitized markdown rendering, orgName ChatEmptyState"
git checkout main && git merge session/build-f06-chat-components && git push origin main
```

---

# SESSION F07 — LAYOUT COMPONENTS & STORES

### Branch
```bash
git checkout -b session/build-f07-layout
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_09_LAYOUT_COMPONENTS.md, and
AMENDMENT_GENERALIZATION_FRONTEND.md completely.

Build src/components/shared/EmployeeTopbar.tsx and the rest of this session's
scope (AppShell, ThreePanel, AdminShell, Navigation). EmployeeTopbar is the
persistent header on every employee page — the single most visible branding
touchpoint in the whole generalization sweep. Its Image alt text must read
alt={orgName} from the first version of the file, per FILE 9, and its doc
comment must describe an org-configurable logo, never hardcode "Sona Comstar"
anywhere including comments.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Parts 2–4. Plus:
```bash
grep -n "Sona Comstar" src/components/shared/EmployeeTopbar.tsx   # expect no output
```
Manual residual check (Part 7): load any employee page, confirm the header visually shows the configured org name correctly.

### Commit
```bash
git add -A && git commit -m "F07: Layout components and stores, orgName EmployeeTopbar"
git checkout main && git merge session/build-f07-layout && git push origin main
```

---

# SESSION F08 — TANSTACK QUERY HOOKS

### Branch
```bash
git checkout -b session/build-f08-query-hooks
```

### Read and Build
```
Read FRONTEND_MASTER_REFERENCE.md, FRONTEND_10_ZUSTAND_STORES.md, and
FRONTEND_11_TANSTACK_QUERY.md completely. No amendment applies.

Build all 5 Zustand stores and the TanStack Query hooks/QueryClient/polling
config. Given Next.js 16's explicit caching model (a real, confirmed
behavioral change from Next.js 15's implicit default caching, which this
spec's original design predates) — confirm the QueryClient's own cache
strategy is not silently double-caching or conflicting with Next.js 16's
route-level caching. Test this directly with a real query against a route,
not assumed compatible.
```

### Verify
Per `FRONTEND_VERIFICATION_STANDARDS.md` Part 2 — this is the session where the race-condition test pattern matters most (a mutation firing while a related query is in flight). Every store and hook needs success/error/race-condition coverage, no exceptions.
```bash
npx vitest run --coverage   # confirm thresholds met for all 5 stores + hooks
```

### Commit
```bash
git add -A && git commit -m "F08: Zustand stores, TanStack Query hooks, confirmed Next.js 16 cache interaction"
git checkout main && git merge session/build-f08-query-hooks && git push origin main
```

---

## PART 1 GATE — FOUNDATION COMPLETE WHEN

- [ ] All 9 sessions (F01–F08 + F05b) merged to `main`.
- [ ] `npx tsc --noEmit` — 0 errors across the whole tree.
- [ ] `npx vitest run --coverage` — thresholds met.
- [ ] `npx playwright test` — passes on Chromium + Firefox.
- [ ] Zero `grep` hits for "Sona Comstar" anywhere in `src/`.
- [ ] `next.config` and `package.json` confirm Next.js 16 / React 19 throughout — no accidental React 18 transitive dependency pulled in by any package.

**Part 2 (F09–F14, Employee + Admin features) continues in the next document.**
