# FRONTEND_35: AGENT SESSION GUIDE
## Complete 18-Session Implementation Roadmap — Exact Prompts and File Lists
## The Master Execution Plan for the AEGIS Frontend

---

## HOW TO USE THIS GUIDE

Each session below is one agent conversation. Start a fresh conversation for each session.
Always attach the listed documents at the start of the prompt.

**Before session F01:** Clone the repo, ensure Node.js 22 LTS is installed, and verify
the FastAPI backend is running on `http://localhost:8000`.

**Session dependency:** Each session depends on the previous completing successfully.
Run `npx tsc --noEmit` at the end of every session before starting the next.

---

## PRE-FLIGHT CHECKLIST

```bash
node --version    # Must be v22.x
npm --version     # Must be v10.x
git --version     # Any recent version
# Backend running:
curl http://localhost:8000/health  # Must return {"status": "healthy"}
# Frontend directory created:
mkdir -p aegis-frontend && cd aegis-frontend
```

---

## SESSION F01 — PROJECT SCAFFOLD
**Duration:** ~25 min | **Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_04_DEPENDENCIES.md

### Prompt:
> You are setting up the AEGIS SAP Helpdesk AI frontend from scratch.
> Follow FRONTEND_04_DEPENDENCIES.md exactly.
> Create the Next.js 15 project, install all dependencies, run shadcn init,
> and add all shadcn components listed. Use Node.js 22 and engines: "node": ">=22.0.0".
> Do not create any application files yet — only the project scaffold.

### Files created:
- `package.json` (all deps pinned)
- `next.config.js`
- `tsconfig.json`
- `postcss.config.js`
- `.eslintrc.json`
- `components.json` (shadcn config)
- All shadcn UI components in `src/components/ui/`

### Verify:
```bash
npm run dev  # Must compile with 0 errors
npx tsc --noEmit
```

---

## SESSION F02 — DESIGN SYSTEM & GLOBALS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md

### Prompt:
> Implement the AEGIS design system from FRONTEND_01_DESIGN_SYSTEM.md.
> Create globals.css with all CSS custom properties (light + dark mode),
> tailwind.config.js extending the design tokens, fonts.ts for Geist + JetBrains Mono,
> root layout.tsx with all providers, and utils.ts with all utility functions.
> Also create src/types/index.ts with the complete type system.

### Files created:
- `src/app/globals.css`
- `tailwind.config.js`
- `src/lib/fonts.ts`
- `src/app/layout.tsx`
- `src/components/shared/providers/` (QueryProvider, ThemeProvider, ToastProvider)
- `src/lib/utils.ts`
- `src/types/index.ts`

### Verify:
```bash
npm run dev  # Light mode renders with correct navy/cyan tokens
```

---

## SESSION F03 — ARCHITECTURE & INFRASTRUCTURE
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_02_ARCHITECTURE.md

### Prompt:
> Implement the AEGIS frontend architecture from FRONTEND_02_ARCHITECTURE.md.
> Create: next.config.js, .env.local, middleware.ts (auth redirects), constants.ts,
> auth.ts, api.ts (typed proxy client), queryKeys.ts, sapEntityDetector.ts,
> sessionExport.ts (@react-pdf), error.tsx, not-found.tsx, and the login page.

### Files created:
- `.env.local`
- `src/middleware.ts`
- `src/lib/constants.ts`
- `src/lib/auth.ts`
- `src/lib/api.ts`
- `src/lib/queryKeys.ts`
- `src/lib/sapEntityDetector.ts`
- `src/lib/sessionExport.ts`
- `src/app/error.tsx`
- `src/app/not-found.tsx`
- `src/app/login/page.tsx`

### Verify:
```bash
npx tsc --noEmit
# Navigate to http://localhost:3000/ → redirects to /login (middleware working)
```

---

## SESSION F04 — TAILWIND PATTERNS & SHADCN OVERRIDES
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_03_TAILWIND_GLOBALS.md

### Prompt:
> Implement the AEGIS Tailwind component layer from FRONTEND_03_TAILWIND_GLOBALS.md.
> Add all @layer components classes to globals.css (chip-base, chip-error, chip-tcode,
> nav-item, surface-card, aegis-prose, section-label, chart-card, chart-title etc.).
> Also create the shadcn AEGIS overrides for Button, Badge, Input, Skeleton, Card.

### Files modified:
- `src/app/globals.css` (adds @layer components)
- `src/components/ui/button.tsx` (AEGIS variants)
- `src/components/ui/badge.tsx` (status variants)
- `src/components/ui/input.tsx`
- `src/components/ui/skeleton.tsx`

### Verify:
```bash
# Create a test page using surface-card and nav-item classes
# Verify colors and tokens render correctly
```

---

## SESSION F05 — CORE & DATA COMPONENTS (Part 1)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_05_CORE_COMPONENTS.md

### Prompt:
> Implement all core shared components from FRONTEND_05_CORE_COMPONENTS.md.
> Create: Spinner, StatusDot, ThemeToggle, ConfirmDialog, OfflineBanner, LoadingScreen,
> ErrorBoundary, and all hooks: useLocalStorage, useDebounce, useMediaQuery,
> usePrefersReducedMotion, useKeyboardShortcuts, usePolling, useAuth.
> Also create the employee portal loading.tsx skeleton.

### Files created:
- `src/components/shared/` (Spinner, StatusDot, ThemeToggle, ConfirmDialog, OfflineBanner, LoadingScreen, ErrorBoundary)
- `src/hooks/` (useLocalStorage, useDebounce, useMediaQuery, usePrefersReducedMotion, useKeyboardShortcuts, usePolling, useAuth)
- `src/app/(employee)/loading.tsx`

---

## SESSION F05b — CORE & DATA COMPONENTS (Part 2)
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_06_DATA_COMPONENTS.md, FRONTEND_07_OVERLAY_COMPONENTS.md

### Prompt:
> Implement all data components from FRONTEND_06 and overlay components from FRONTEND_07.
> From F06: DataTable, BulkActionBar, EmptyState, FilterChips, MetricCard, MetricCardGrid,
> ChartTooltip, ResponsiveChart, CHART_COLORS, exportToCSV.
> From F07: CommandPalette, useCommandPalette, KeyboardShortcutsOverlay, Drawer, toast.ts.

### Files created:
- `src/components/admin/` (DataTable, BulkActionBar, EmptyState, FilterChips, MetricCard)
- `src/components/admin/charts/` (ChartTooltip, ResponsiveChart)
- `src/components/shared/` (CommandPalette, KeyboardShortcutsOverlay)
- `src/components/ui/drawer.tsx`
- `src/lib/toast.ts`
- `src/lib/csvExport.ts`

---

## SESSION F06 — CHAT COMPONENTS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_08_CHAT_COMPONENTS.md

### Prompt:
> Implement all chat-specific UI components from FRONTEND_08_CHAT_COMPONENTS.md.
> Create: EntityChip, SAPEntityHighlighter, ConfidenceBadge, StreamingCursor,
> StreamingProgress, UserBubble, AIResponseBubble, ResponseActions, RelatedQuestions,
> AttributionPanel, ScoreBreakdown, FreshnessIndicator, ScreenshotDropZone,
> ComposeBar, ScreenshotThumbnail, ChatEmptyState.

### Files created:
- `src/components/chat/` (all 15 components)

### Verify:
```bash
npx tsc --noEmit
# Render EntityChip in isolation → correct chip colours
# Render AIResponseBubble with a mock message → streaming states work
```

---

## SESSION F07 — LAYOUT COMPONENTS & STORES
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_09_LAYOUT_COMPONENTS.md, FRONTEND_10_ZUSTAND_STORES.md

### Prompt:
> Implement all layout components from FRONTEND_09 and all Zustand stores from FRONTEND_10.
> From F09: Create the query hook stub (src/hooks/queries/index.ts), employee layout,
> EmployeeTopbar, SessionSidebar, SessionCard, SessionContextMenu, AttributionPanelShell,
> admin layout, AdminNav, AdminTopbar.
> From F10: chatStore, sessionStore, panelStore, uiStore, adminStore — all with correct
> middleware (persist where specified), selectors, and reset patterns.

### Files created:
- `src/app/(employee)/layout.tsx`
- `src/app/(admin)/layout.tsx`
- `src/components/shared/EmployeeTopbar.tsx`
- `src/components/sessions/` (SessionSidebar, SessionCard, SessionContextMenu)
- `src/components/chat/AttributionPanelShell.tsx`
- `src/components/admin/` (AdminNav, AdminTopbar)
- `src/hooks/queries/index.ts` (stub)
- `src/stores/` (chatStore, sessionStore, panelStore, uiStore, adminStore)

---

## SESSION F08 — TANSTACK QUERY HOOKS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_11_TANSTACK_QUERY.md

### Prompt:
> Implement the complete TanStack Query data layer from FRONTEND_11.
> Replace the stub src/hooks/queries/index.ts with the full implementation.
> Create: hooks/queries/sessions.ts, adminMetrics.ts, adminData.ts, adminAnalytics.ts,
> mutations.ts, preferences.ts, index.ts (re-exporting all).
> Also create src/hooks/usePollingCountdown.ts.

### Files created/replaced:
- `src/hooks/queries/` (6 files + index)
- `src/hooks/usePollingCountdown.ts`

### Verify:
```bash
npm run dev
# Open /admin/dashboard (mock data) → useAdminMetrics() fires in Network tab
# Open / → useSessions() fires in Network tab
npx tsc --noEmit
```

---

## SESSION F09 — EMPLOYEE CHAT INTERFACE
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_12_EMPLOYEE_CHAT.md, FRONTEND_13_EMPLOYEE_CHAT_FEATURES.md

### Prompt:
> Implement the complete employee chat experience from FRONTEND_12 and FRONTEND_13.
> From F12: ws-token API route, useWebSocket hook, MessageList, ChatInterface, chat page.tsx.
> From F13: useChatKeyboardShortcuts, SessionSearch, complete screenshot integration,
> SAP entity preview in compose bar, related questions, session history loading edge cases.
> Mount useChatKeyboardShortcuts in page.tsx and wire all shortcuts.

### Files created:
- `src/app/api/auth/ws-token/route.ts`
- `src/hooks/useWebSocket.ts`
- `src/components/chat/` (MessageList, ChatInterface)
- `src/app/(employee)/page.tsx`
- `src/hooks/useChatKeyboardShortcuts.ts`
- `src/components/sessions/SessionSearch.tsx`

### Verify:
```bash
# With backend running:
npm run dev
# Send a message → WebSocket connects → streaming response appears
# ⌘N → chat resets
# Drag PNG → thumbnail appears, send → thumbnail clears
```

---

## SESSION F10 — EMPLOYEE HISTORY & ONBOARDING
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_14_EMPLOYEE_HISTORY.md, FRONTEND_15_EMPLOYEE_ONBOARDING.md

### Prompt:
> Implement the session history page from FRONTEND_14 and the 5-step onboarding modal
> from FRONTEND_15.
> From F14: HistoryFilterState, HistoryFilters, HistorySessionCard, history page.tsx, loading.tsx.
> From F15: OnboardingProgress, OnboardingStep with all 5 step contents,
> OnboardingModal with AnimatePresence direction-aware slide transitions.
> Wire onboarding into the chat page.tsx (already has the mount check — just confirm).

### Files created:
- `src/app/(employee)/history/` (page.tsx, loading.tsx)
- `src/components/sessions/` (HistoryFilters, HistorySessionCard)
- `src/components/onboarding/` (OnboardingModal, OnboardingStep, OnboardingProgress)

---

## SESSION F11 — ADMIN SHELL & DASHBOARD
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_16_ADMIN_SHELL.md, FRONTEND_17_ADMIN_DASHBOARD.md

### Prompt:
> Implement the admin shell components from FRONTEND_16 and the complete dashboard
> from FRONTEND_17. From F16: AdminPageHeader, AdminPageWrapper, DashboardRefreshIndicator,
> AdminStatRow, AdminEmptyPage. From F17: ValidationScoreChart, ConfidenceDistChart,
> RetrievalModeChart, GapEventsList, dashboard page.tsx and loading.tsx.
> Use mock data from FRONTEND_17 for development if backend is not ready.

### Files created:
- `src/components/admin/` (AdminPageHeader, AdminPageWrapper, DashboardRefreshIndicator, AdminStatRow)
- `src/components/admin/charts/` (ValidationScoreChart, ConfidenceDistChart, RetrievalModeChart)
- `src/components/admin/GapEventsList.tsx`
- `src/app/(admin)/admin/dashboard/` (page.tsx, loading.tsx)

---

## SESSION F12 — ADMIN DOCUMENTS & REGISTRY
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_18_ADMIN_DOCUMENTS.md, FRONTEND_19_ADMIN_REGISTRY_CONFIG.md

### Prompt:
> Implement the documents page from FRONTEND_18 and the registry + config snapshot
> pages from FRONTEND_19. From F18: UploadDropZone, DocumentMetadataModal,
> IngestionProgressRow, documents page.tsx and loading.tsx.
> From F19: StalenessIndicator, InlineEditCell, registry page.tsx, config-snapshot page.tsx,
> both with loading.tsx files.

### Files created:
- `src/components/admin/` (UploadDropZone, DocumentMetadataModal, IngestionProgressRow, StalenessIndicator, InlineEditCell)
- `src/app/(admin)/admin/documents/` (page.tsx, loading.tsx)
- `src/app/(admin)/admin/registry/` (page.tsx, loading.tsx)
- `src/app/(admin)/admin/config-snapshot/` (page.tsx, loading.tsx)

---

## SESSION F13 — ADMIN GAPS, AUDIT, REVIEW & TICKETS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_20_ADMIN_GAPS_AUDIT.md, FRONTEND_21_ADMIN_REVIEW_TICKETS.md

### Prompt:
> Implement knowledge gaps + audit trail pages from FRONTEND_20 and review queue +
> tickets pages from FRONTEND_21.
> From F20: GapCard, AuditTimeline, knowledge-gaps page, audit-trail page (with timeline/table toggle).
> From F21: ClaimHighlighter, ReviewItemList, ReviewItemDetail, review-queue page
> (J/K/A/X shortcuts), KanbanCard, KanbanColumn, tickets page (dnd-kit kanban).

### Files created:
- `src/components/admin/` (GapCard, AuditTimeline, ClaimHighlighter, ReviewItemList, ReviewItemDetail, KanbanCard, KanbanColumn)
- `src/app/(admin)/admin/knowledge-gaps/` (page.tsx, loading.tsx)
- `src/app/(admin)/admin/audit-trail/` (page.tsx, loading.tsx)
- `src/app/(admin)/admin/review-queue/` (page.tsx, loading.tsx)
- `src/app/(admin)/admin/tickets/` (page.tsx, loading.tsx)

### Verify:
```bash
# Review queue: J/K/A/X shortcuts work, even in textarea
# Kanban: drag card between columns → optimistic move + rollback on error
```

---

## SESSION F14 — ADMIN HEALTH & ANALYTICS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_22_ADMIN_HEALTH_ANALYTICS.md

### Prompt:
> Implement the system health and analytics pages from FRONTEND_22.
> Create: ServiceTile, ServiceStatusGrid, QueryVolumeChart, CachePerformanceChart,
> TopModulesChart, system-health page.tsx (with DashboardRefreshIndicator + service
> detail Drawer), analytics page.tsx (6-chart 2×2+2 grid with date range selector).

### Files created:
- `src/components/admin/` (ServiceTile, ServiceStatusGrid)
- `src/components/admin/charts/` (QueryVolumeChart, CachePerformanceChart, TopModulesChart)
- `src/app/(admin)/admin/system-health/` (page.tsx, loading.tsx)
- `src/app/(admin)/admin/analytics/` (page.tsx, loading.tsx)

---

## SESSION F15 — ANIMATIONS & MICRO-INTERACTIONS
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_23_FRAMER_MOTION.md, FRONTEND_24_MICRO_INTERACTIONS.md

### Prompt:
> Implement the animation system from FRONTEND_23 and micro-interactions from FRONTEND_24.
> From F23: Create src/lib/animations.ts with all named Framer Motion variants.
> Create PageTransition component. Audit all components from F06–F14 to ensure they
> import variants from animations.ts (not inline). Add CHAT_MESSAGE variant to chat bubbles,
> SLIDE_UP_FROM_BOTTOM to BulkActionBar, GAP_EXPAND to GapCard sample queries.
> From F24: Create useCountUp hook, wire into MetricCard for count-up animation.
> Add streaming cursor CSS to globals.css. Verify status pulse CSS is in globals.css.

### Files created/modified:
- `src/lib/animations.ts`
- `src/components/shared/PageTransition.tsx`
- `src/hooks/useCountUp.ts`
- `src/app/globals.css` (streaming-cursor, animate-status-pulse keyframes)
- All chat bubble components (add CHAT_MESSAGE variant)

---

## SESSION F16 — DARK MODE, ERROR HANDLING & POLISH
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_25_DARK_MODE.md, FRONTEND_26_ERROR_HANDLING.md

### Prompt:
> Implement dark mode verification from FRONTEND_25 and the full error handling system
> from FRONTEND_26. From F25: Verify next-themes config, audit all components for
> hardcoded colours, ensure Recharts charts use useTheme() for grid/tick colours.
> From F26: Create errorCodes.ts, update api.ts with error classification and custom
> error classes, update ErrorBoundary with section/page variants, create employee and
> admin error.tsx pages, update OfflineBanner with reconnect lifecycle,
> add WebSocket reconnection backoff to useWebSocket.ts.

### Files created/modified:
- `src/lib/errorCodes.ts`
- `src/lib/api.ts` (add error classes + request() function)
- `src/components/shared/ErrorBoundary.tsx` (update)
- `src/components/shared/OfflineBanner.tsx` (update)
- `src/app/(employee)/error.tsx`
- `src/app/(admin)/error.tsx`
- `src/hooks/useWebSocket.ts` (add reconnection backoff)

---

## SESSION F17 — ACCESSIBILITY & PERFORMANCE
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_27_ACCESSIBILITY.md, FRONTEND_28_PERFORMANCE.md

### Prompt:
> Complete accessibility pass from FRONTEND_27 and performance optimisations from FRONTEND_28.
> From F27: Add lang="en" to root layout, audit all interactive components for aria-label,
> add aria-live regions to MessageList and StreamingProgress, add skip links to both portals,
> add DataTable keyboard selection (Space to toggle row), verify CommandPalette focus trap.
> From F28: Create src/components/admin/charts/index.ts with dynamic exports for all charts,
> add dynamic import for KanbanBoard in tickets page, verify @react-pdf is dynamic in
> sessionExport.ts, add dynamic import for OnboardingModal in employee page.tsx.
> Add useVirtualizer to SessionSidebar for >100 sessions.

### Files modified:
- `src/app/layout.tsx` (add lang="en")
- `src/components/admin/charts/index.ts` (dynamic barrel)
- `src/app/(admin)/admin/tickets/page.tsx` (dynamic KanbanBoard)
- `src/app/(employee)/page.tsx` (dynamic OnboardingModal)
- `src/components/shared/EmployeeTopbar.tsx` (skip link)
- `src/components/admin/DataTable.tsx` (keyboard selection)

---

## SESSION F18 — BACKEND API PROXY & FINAL VERIFICATION
**Documents:** FRONTEND_MASTER_REFERENCE.md, FRONTEND_29_33_BACKEND_API_CONTRACTS.md, FRONTEND_34_VERIFICATION.md

### Prompt:
> Complete the backend API proxy and run the full verification checklist.
> Verify the catch-all proxy route at src/app/api/proxy/[...path]/route.ts handles
> GET, POST, PUT, PATCH, DELETE and forwards the auth cookie correctly.
> Run through FRONTEND_34_VERIFICATION.md — every page, every feature.
> Fix any failures. When all checks pass, run the final TypeScript audit.

### Files verified/fixed:
- `src/app/api/proxy/[...path]/route.ts`
- Any component fixes identified during verification

### Final verification:
```bash
npx tsc --noEmit              # 0 errors
npx next lint                 # 0 errors
npm run build                 # Builds successfully
ANALYZE=true npm run build    # Bundle analysis — @react-pdf not in initial chunk
npm start                     # Production server starts on :3000
```

---

## IMPLEMENTATION TIPS

**Context management:**
Each session creates 5–15 files. If a session is large, split it at a natural boundary
(e.g., F05 has a Part 2 creating data + overlay components in the same session).

**Error recovery:**
If TypeScript errors appear at the end of a session, fix them before starting the next.
Import paths are the most common source of errors — verify `@/` aliases resolve correctly.

**Mock data:**
Sessions F11–F14 create admin pages. Use the mock data objects provided in each spec
document until the FastAPI backend is connected. TanStack Query's `initialData` option
can seed charts during development.

**Backend connection:**
Connect the real backend in session F18 once all UI components are built and verified.
This avoids debugging frontend + backend issues simultaneously.

---

## FILE COUNT SUMMARY

| Session | Files Created | Cumulative |
|---------|--------------|------------|
| F01 | ~30 (shadcn components) | 30 |
| F02 | 8 | 38 |
| F03 | 12 | 50 |
| F04 | 5 | 55 |
| F05 | 15 | 70 |
| F05b | 12 | 82 |
| F06 | 15 | 97 |
| F07 | 12 | 109 |
| F08 | 8 | 117 |
| F09 | 8 | 125 |
| F10 | 8 | 133 |
| F11 | 10 | 143 |
| F12 | 12 | 155 |
| F13 | 14 | 169 |
| F14 | 7 | 176 |
| F15 | 6 | 182 |
| F16 | 8 | 190 |
| F17 | 6 | 196 |
| F18 | 1 | **197** |

**Estimated total: ~197 source files** across 18 sessions.

---

*Document version 1.0 | AEGIS Frontend Specification Set | FRONTEND_35 — Final Document*
