# FRONTEND MASTER REFERENCE
## Attach to Every Frontend Agent Session — The Authority Document
## Version 1.0 — Defines all constants, paths, rules, and integration points

---

## SYSTEM IDENTITY

**Product:** AEGIS — SAP Helpdesk AI, Sona Comstar, Chennai
**Frontend:** Next.js 15 App Router, TypeScript, Tailwind v3.4
**Employee portal:** Light theme, chat-first, desktop only
**Admin portal:** Dark theme, monitoring console, desktop only
**Logo:** Sona Comstar SVG logo at `public/logo.svg` — developer provides this file
**Minimum viewport:** 1280px width | Optimised for 1440px
**Browsers:** Chrome + Firefox

---

## TECH STACK — EXACT VERSIONS (never deviate)

```json
{
  "next": "15.x",
  "react": "18.x",
  "typescript": "5.x",
  "tailwindcss": "3.4.x",
  "framer-motion": "11.x",
  "zustand": "4.x",
  "@tanstack/react-query": "5.x",
  "@tanstack/react-query-devtools": "5.x",
  "cmdk": "1.x",
  "sonner": "1.x",
  "recharts": "2.x",
  "@dnd-kit/core": "6.x",
  "@dnd-kit/sortable": "8.x",
  "react-hook-form": "7.x",
  "zod": "3.x",
  "@hookform/resolvers": "3.x",
  "@react-pdf/renderer": "3.x",
  "date-fns": "3.x",
  "next-themes": "0.3.x",
  "tailwindcss-animate": "1.x",
  "@tailwindcss/typography": "0.5.x",
  "@radix-ui/react-dialog": "1.x",
  "@radix-ui/react-dropdown-menu": "2.x",
  "@radix-ui/react-popover": "1.x",
  "@radix-ui/react-scroll-area": "1.x",
  "@radix-ui/react-select": "2.x",
  "@radix-ui/react-separator": "1.x",
  "@radix-ui/react-slot": "1.x",
  "@radix-ui/react-tabs": "1.x",
  "@radix-ui/react-tooltip": "1.x",
  "lucide-react": "0.x",
  "class-variance-authority": "0.7.x",
  "clsx": "2.x",
  "tailwind-merge": "2.x"
}
```

---

## COMPLETE DIRECTORY STRUCTURE

Every file listed here will be created across the 35-session implementation. Agent must follow this structure exactly — no deviations.

```
frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (employee)/
│   │   │   ├── layout.tsx                  ← Employee shell (light theme)
│   │   │   ├── page.tsx                    ← Chat interface
│   │   │   ├── loading.tsx                 ← Chat loading skeleton
│   │   │   ├── history/
│   │   │   │   ├── page.tsx
│   │   │   │   └── loading.tsx
│   │   │   └── onboarding/
│   │   │       └── page.tsx
│   │   ├── (admin)/
│   │   │   ├── layout.tsx                  ← Admin shell (dark theme)
│   │   │   └── admin/
│   │   │       ├── page.tsx                ← Redirects to /admin/dashboard
│   │   │       ├── dashboard/
│   │   │       │   ├── page.tsx
│   │   │       │   └── loading.tsx
│   │   │       ├── documents/
│   │   │       │   ├── page.tsx
│   │   │       │   └── loading.tsx
│   │   │       ├── registry/page.tsx
│   │   │       ├── config-snapshot/page.tsx
│   │   │       ├── knowledge-gaps/page.tsx
│   │   │       ├── audit-trail/page.tsx
│   │   │       ├── review-queue/page.tsx
│   │   │       ├── tickets/page.tsx
│   │   │       ├── system-health/page.tsx
│   │   │       └── analytics/page.tsx
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── set-token/route.ts      ← Sets HttpOnly JWT cookies
│   │   │   │   ├── refresh/route.ts        ← Silent token refresh
│   │   │   │   └── ws-token/route.ts       ← WS auth token for WebSocket
│   │   │   ├── proxy/
│   │   │   │   └── [...path]/route.ts      ← Proxies to FastAPI with auth
│   │   │   ├── sessions/
│   │   │   │   ├── route.ts                ← GET /api/sessions (history list)
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts            ← GET/PUT/DELETE /api/sessions/:id
│   │   │   │       └── export/route.ts     ← GET PDF export
│   │   │   └── preferences/route.ts        ← GET/PUT user preferences
│   │   ├── layout.tsx                      ← Root layout (fonts, providers)
│   │   ├── globals.css                     ← CSS variables + Tailwind base
│   │   ├── error.tsx                       ← Global error boundary UI
│   │   └── not-found.tsx                   ← 404 page
│   ├── components/
│   │   ├── ui/                             ← shadcn/ui base components
│   │   │   ├── button.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── tooltip.tsx
│   │   │   └── progress.tsx
│   │   ├── chat/                           ← Employee chat components
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── UserBubble.tsx
│   │   │   ├── AIResponseBubble.tsx
│   │   │   ├── StreamingCursor.tsx
│   │   │   ├── StreamingProgress.tsx
│   │   │   ├── EntityChip.tsx
│   │   │   ├── SAPEntityHighlighter.tsx
│   │   │   ├── ConfidenceBadge.tsx
│   │   │   ├── AttributionPanel.tsx
│   │   │   ├── ScoreBreakdown.tsx
│   │   │   ├── FreshnessIndicator.tsx
│   │   │   ├── ResponseActions.tsx
│   │   │   ├── RelatedQuestions.tsx
│   │   │   ├── ScreenshotDropZone.tsx
│   │   │   ├── ScreenshotThumbnail.tsx
│   │   │   ├── ComposeBar.tsx
│   │   │   └── ChatEmptyState.tsx
│   │   ├── sessions/                       ← Session management
│   │   │   ├── SessionSidebar.tsx
│   │   │   ├── SessionCard.tsx
│   │   │   ├── SessionGroup.tsx
│   │   │   ├── SessionSearch.tsx
│   │   │   └── SessionContextMenu.tsx
│   │   ├── admin/                          ← Admin portal components
│   │   │   ├── AdminShell.tsx
│   │   │   ├── AdminNav.tsx
│   │   │   ├── AdminTopbar.tsx
│   │   │   ├── MetricCard.tsx
│   │   │   ├── ServiceStatusGrid.tsx
│   │   │   ├── ServiceTile.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── TableFilters.tsx
│   │   │   ├── BulkActionBar.tsx
│   │   │   ├── UploadDropZone.tsx
│   │   │   ├── IngestionProgress.tsx
│   │   │   ├── StalenessIndicator.tsx
│   │   │   ├── GapCard.tsx
│   │   │   ├── AuditTimeline.tsx
│   │   │   ├── ReviewSplitPane.tsx
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── KanbanColumn.tsx
│   │   │   ├── KanbanCard.tsx
│   │   │   ├── CircuitBreakerBadge.tsx
│   │   │   └── charts/
│   │   │       ├── ValidationScoreChart.tsx
│   │   │       ├── ConfidenceDistChart.tsx
│   │   │       ├── CachePerformanceChart.tsx
│   │   │       ├── RetrievalModeChart.tsx
│   │   │       ├── AnalyticsTrendChart.tsx
│   │   │       └── ChartTooltip.tsx
│   │   ├── onboarding/                     ← First-time employee flow
│   │   │   ├── OnboardingModal.tsx
│   │   │   ├── OnboardingStep.tsx
│   │   │   └── OnboardingProgress.tsx
│   │   └── shared/                         ← Cross-cutting components
│   │       ├── CommandPalette.tsx
│   │       ├── ThemeToggle.tsx
│   │       ├── KeyboardShortcutsOverlay.tsx
│   │       ├── ConfirmDialog.tsx
│   │       ├── LoadingScreen.tsx
│   │       ├── ErrorBoundary.tsx
│   │       ├── OfflineBanner.tsx
│   │       ├── PageTransition.tsx
│   │       └── providers/
│   │           ├── ThemeProvider.tsx
│   │           ├── QueryProvider.tsx
│   │           └── ToastProvider.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useAuth.ts
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useCommandPalette.ts
│   │   ├── useSessionExport.ts
│   │   ├── useDragDrop.ts
│   │   ├── useDebounce.ts
│   │   ├── useVirtualList.ts
│   │   ├── usePolling.ts
│   │   └── useLocalStorage.ts
│   ├── stores/
│   │   ├── chatStore.ts
│   │   ├── sessionStore.ts
│   │   ├── panelStore.ts
│   │   ├── uiStore.ts
│   │   └── adminStore.ts
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── api.ts
│   │   ├── constants.ts
│   │   ├── utils.ts
│   │   ├── sapEntityDetector.ts
│   │   ├── sessionExport.ts
│   │   └── queryKeys.ts
│   └── types/
│       ├── index.ts
│       ├── chat.ts
│       ├── session.ts
│       ├── admin.ts
│       └── api.ts
├── public/
│   ├── logo.svg                            ← DEVELOPER PROVIDES THIS FILE
│   └── favicon.ico
├── middleware.ts                           ← Edge auth (from IMPL_21 — already exists)
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── components.json                         ← shadcn/ui config
├── .env.local
└── package.json
```

---

## DESIGN TOKEN QUICK REFERENCE

**Do not hardcode hex values in component code. Always use these Tailwind classes which map to CSS variables.**

### Background Classes
```
bg-bg-primary      → white (light) / navy-900 (dark)
bg-bg-secondary    → gray-50 (light) / navy-800 (dark)
bg-bg-tertiary     → gray-100 (light) / navy-700 (dark)
bg-bg-card         → white (light) / navy-800 (dark)
bg-bg-elevated     → gray-50 (light) / navy-700 (dark)
```

### Text Classes
```
text-text-primary     → gray-900 (light) / gray-100 (dark)
text-text-secondary   → gray-600 (light) / gray-400 (dark)
text-text-tertiary    → gray-400 (light) / gray-500 (dark)
text-text-disabled    → gray-300 (light) / navy-500 (dark)
```

### Border Classes
```
border-border-primary    → gray-200 (light) / navy-600 (dark)
border-border-secondary  → gray-300 (light) / navy-500 (dark)
border-border-focus      → cyan-500 (both modes)
```

### Accent Classes
```
bg-accent            → cyan-500 (#06B6D4)
text-accent          → cyan-500 (light) / cyan-400 (dark)
bg-accent-subtle     → cyan-50 (light) / navy-800 tinted (dark)
hover:bg-accent-hover → cyan-400
```

### Confidence Color System (THE MOST IMPORTANT SEMANTIC COLORS)
```
GREEN (High confidence ≥ 0.85):
  bg-success-bg        → green-100 (light) / dark green overlay (dark)
  border-success-border → green-300 (light) / dark green border (dark)
  text-success-text    → green-800 (light) / green-300 (dark)
  text-success         → #10B981 (same both modes)

AMBER (Moderate confidence 0.70–0.84):
  bg-warning-bg        → amber-50 (light) / dark amber overlay (dark)
  border-warning-border → amber-200 (light) / dark amber border (dark)
  text-warning-text    → amber-800 (light) / amber-300 (dark)

DANGER/NONE (<0.70 or escalated):
  bg-danger-bg         → red-50 (light) / dark red overlay (dark)
  border-danger-border → red-200 (light) / dark red border (dark)
  text-danger-text     → red-800 (light) / red-300 (dark)
```

### SAP Entity Chip Colors
```
Error code chip (VL150, F5201):
  bg: danger-bg  border: danger-border  text: danger-text
  font-family: font-mono

Transaction code chip (VL01N, MM02):
  bg: info-bg  border: info-border  text: info-text
  font-family: font-mono

Document number chip (4500012345):
  bg: bg-tertiary  border: border-primary  text: text-secondary
  font-family: font-mono
```

### SAP Entity Detection Regex (from lib/sapEntityDetector.ts)
```typescript
const ERROR_CODE_PATTERN = /\b([A-Z]{1,2}\d{4}[A-Z]?)\b/g       // VL150, F5201
const TCODE_PATTERN = /\b([A-Z]{2,6}\d{0,3}[A-Z]?)\b/g           // VL01N, MMBE, MM02
const DOC_NUMBER_PATTERN = /\b(\d{10,12})\b/g                      // 4500012345
```

---

## LAYOUT CONSTANTS

These values are fixed throughout the frontend. Do not change them.

```typescript
// src/lib/constants.ts
export const LAYOUT = {
  // Employee portal
  EMPLOYEE_TOPBAR_HEIGHT: 52,          // px
  EMPLOYEE_SIDEBAR_WIDTH: 180,         // px (open)
  EMPLOYEE_SIDEBAR_COLLAPSED: 0,       // px (hidden on mobile — N/A desktop)
  EMPLOYEE_SOURCE_PANEL_WIDTH: 210,    // px (open)
  EMPLOYEE_SOURCE_PANEL_ICON: 48,      // px (collapsed icon strip)
  EMPLOYEE_COMPOSE_HEIGHT: 64,         // px
  SESSION_CARD_HEIGHT: 68,             // px
  
  // Admin portal
  ADMIN_TOPBAR_HEIGHT: 52,             // px
  ADMIN_SIDEBAR_WIDTH: 220,            // px
  ADMIN_NAV_ITEM_HEIGHT: 40,           // px
  ADMIN_METRIC_CARD_HEIGHT: 100,       // px
  
  // Shared
  MIN_VIEWPORT_WIDTH: 1280,            // px
  OPTIMAL_VIEWPORT_WIDTH: 1440,        // px
} as const

export const TIMING = {
  ADMIN_POLL_INTERVAL_MS: 30_000,      // 30s dashboard polling
  NOTIFICATION_POLL_MS: 60_000,        // 60s notification polling (not in demo)
  WS_RECONNECT_DELAY_MS: 3_000,        // 3s before reconnect attempt
  SEARCH_DEBOUNCE_MS: 300,             // 300ms search debounce
  TOAST_DURATION_MS: 4_000,            // 4s auto-dismiss toasts
  TOKEN_REFRESH_MS: 720_000,           // 12 min token refresh
  ANIMATION_FAST_MS: 100,              // fast micro-interactions
  ANIMATION_NORMAL_MS: 150,            // standard transitions
  ANIMATION_SLOW_MS: 250,              // page transitions
} as const

export const LIMITS = {
  MAX_SESSION_SEARCH_RESULTS: 50,
  MAX_SESSION_SIDEBAR_ITEMS: 30,       // visible in sidebar (rest paginated)
  MAX_ADMIN_TABLE_PAGE_SIZE: 50,
  MAX_SCREENSHOT_MB: 10,
  MAX_DOCUMENT_MB: 50,
  MIN_SCREEN_WIDTH: 1280,
  ONBOARDING_STEPS: 5,
} as const

export const STORAGE_KEYS = {
  DARK_MODE: 'aegis:dark-mode',
  PANEL_COLLAPSED: 'aegis:panel-collapsed',
  ONBOARDING_COMPLETE: 'aegis:onboarding-complete',
  ONBOARDING_STEP: 'aegis:onboarding-step',
  PINNED_SESSIONS: 'aegis:pinned-sessions',
  COMMAND_PALETTE_HISTORY: 'aegis:cmd-history',
} as const

export const BACKEND = {
  API_BASE: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  WS_BASE: process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000',
  WS_CHAT_PATH: '/ws/chat',
} as const
```

---

## ZUSTAND STORE REGISTRY

Every store lives in `src/stores/`. Agent must import from these paths — never create ad-hoc local state for shared concerns.

```
chatStore      → messages[], streaming state, current session ID, WebSocket ref
sessionStore   → session list, pinned sessions, search query, active session
panelStore     → source panel collapse state, active panel tab
uiStore        → dark mode, command palette open, shortcuts overlay, toast queue
adminStore     → polling data, selected table rows, filter state, upload progress
```

---

## TANSTACK QUERY KEY FACTORY

All server state uses these keys for consistent caching and invalidation:

```typescript
// src/lib/queryKeys.ts
export const queryKeys = {
  sessions: {
    all: () => ['sessions'] as const,
    list: (filters?: SessionFilters) => ['sessions', 'list', filters] as const,
    detail: (id: string) => ['sessions', 'detail', id] as const,
  },
  admin: {
    metrics: () => ['admin', 'metrics'] as const,
    documents: (filters?: DocFilters) => ['admin', 'documents', filters] as const,
    registry: (status?: string) => ['admin', 'registry', status] as const,
    gaps: (days: number) => ['admin', 'gaps', days] as const,
    auditTrail: (filters?: AuditFilters) => ['admin', 'audit', filters] as const,
    reviewQueue: (status: string) => ['admin', 'review', status] as const,
    tickets: (status?: string) => ['admin', 'tickets', status] as const,
    systemHealth: () => ['admin', 'health'] as const,
    analytics: (range: string) => ['admin', 'analytics', range] as const,
    configSnapshot: () => ['admin', 'config'] as const,
  },
  preferences: {
    all: () => ['preferences'] as const,
  },
} as const
```

---

## ROUTE MAP (14 pages)

```
/login                    → Login page (shared entry)
/                         → Chat interface (employee)
/history                  → Session history (employee)
/onboarding               → Guided walkthrough (employee, first-time)
/admin                    → Redirect → /admin/dashboard
/admin/dashboard          → Live quality overview
/admin/documents          → Document management
/admin/registry           → Known patterns registry
/admin/config-snapshot    → SAP configuration values
/admin/knowledge-gaps     → Gap analysis
/admin/audit-trail        → Employee audit log
/admin/review-queue       → Human review workflow
/admin/tickets            → Mock ticket management
/admin/system-health      → 19 Docker service monitor
/admin/analytics          → Quality trend reporting
```

---

## BACKEND INTEGRATION CONSTANTS

The frontend integrates with the AEGIS FastAPI backend (from IMPL_01–IMPL_22 + FRONTEND_29–33):

```typescript
// Authentication: HttpOnly cookies set via /api/auth/set-token (IMPL_21 pattern)
// Cookie names: access_token, refresh_token, user_role
// All API calls: route through /api/proxy/[...path] which reads HttpOnly cookie
// WebSocket: /ws/chat?token=<ws_token> (from /api/auth/ws-token)

// Example API call pattern (correct):
const data = await fetch('/api/proxy/admin/documents')

// Example API call pattern (WRONG — do not use):
const data = await fetch('/admin/documents', { headers: { Authorization: `Bearer ${getAccessToken()}` } })
```

### Backend endpoints consumed by frontend

From existing backend (IMPL_09–IMPL_22):
```
POST /api/upload/document     → Document ingestion
POST /api/upload/screenshot   → Screenshot upload
GET  /admin/documents         → Documents list
POST /admin/registry/:id/approve → Registry approval
GET  /admin/knowledge-gaps    → Gap analysis data
GET  /admin/audit-trail       → Audit log
GET  /admin/review-queue      → Review items
POST /admin/review-queue/:id/resolve → Submit correction
GET  /admin/tickets           → Ticket list
PATCH /admin/tickets/:id      → Update ticket
GET  /admin/config-snapshot   → Config values
PUT  /admin/config-snapshot/:cat/:key → Update config
GET  /admin/registry          → Registry entries
GET  /health                  → FastAPI health
GET  /metrics                 → Prometheus metrics
WS   /ws/chat                 → Chat WebSocket
```

From new backend (FRONTEND_29–FRONTEND_33, built before these frontend pages):
```
GET  /api/sessions            → Session history list
GET  /api/sessions/:id        → Session detail
PUT  /api/sessions/:id        → Update session (pin/rename)
DELETE /api/sessions/:id      → Delete session
GET  /api/sessions/:id/export → PDF export
GET  /api/admin/metrics       → Live dashboard metrics
GET  /api/admin/analytics     → Analytics time-series
GET  /api/admin/system-health → 19 service statuses
GET  /api/preferences         → User preferences
PUT  /api/preferences         → Update preferences
```

---

## 7 FRONTEND RULES — NEVER BROKEN

1. **CSS variables only for colors.** Never write hex values or rgb() in component code. Always use Tailwind classes that map to CSS variables. Violation example: `style={{ color: '#10B981' }}` — wrong. Correct: `className="text-success"`.

2. **All animations respect `prefers-reduced-motion`.** Every Framer Motion component checks `useReducedMotion()`. Every CSS animation wraps in `@media (prefers-reduced-motion: no-preference)`.

3. **Every data-fetching surface has a skeleton.** No loading spinner alone. Every page and every data table renders a skeleton that matches the final layout before data arrives.

4. **Dark mode uses `.dark` class on `<html>`, managed by `next-themes`.** Never use `@media (prefers-color-scheme: dark)` for component styling — only the ThemeProvider does OS detection.

5. **Every destructive admin action has a `<ConfirmDialog>`.** Deprecating a document, deleting a session, resolving a ticket — all require explicit confirmation.

6. **The confidence color system is never decorative.** Green = high confidence (≥0.85). Amber = moderate (0.70–0.84). Danger/Red = escalated or insufficient (<0.70). These colors appear on badges, left borders, metric cards, and chart segments — always with this semantic meaning.

7. **All admin tables support keyboard navigation.** Tab between interactive elements, arrow keys to navigate rows, Space/Enter to select, Escape to deselect. This is the WCAG 2.1 AA requirement and is non-negotiable.

---

## WEBSOCKET MESSAGE TYPES (complete protocol)

From existing backend (IMPL_11) + extensions (FRONTEND_33):

### Existing messages (backend already sends these):
```typescript
type: "session_ready"         → { session_id: string }
type: "token"                 → { token: string }
type: "stream_complete"       → {}
type: "validation_result"     → { validation_score, confidence_badge, attribution_panel }
type: "vision_refined_answer" → { message, diagnostic_summary, error_code? }
type: "error"                 → { message, error_code, ticket_id? }
type: "pong"                  → {}
```

### New messages (FRONTEND_33 adds to backend):
```typescript
type: "retrieval_progress"   → { stage: "retrieving" | "crag" | "generating" | "validating" }
```

### Messages frontend sends:
```typescript
type: "message"   → { message: string, session_id: string }
type: "feedback"  → { signal: "positive" | "negative", session_id: string, turn_index: number }
type: "ping"      → {}
```

---

## SHADCN/UI CONFIGURATION

File `components.json` at project root:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

The `cn()` utility in `src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## DOCUMENT INVENTORY (39 numbered content documents + this reference + 5 supplements + 1 amendment = 46 total)

**Correction (2026-07-19):** this table originally proposed a session grouping that predates the real, final session structure — `FRONTEND_35_AGENT_SESSION_GUIDE.md` (written a full day later, after all other `FRONTEND_XX` documents already existed) reflects what actually got built into the operative session guide and is the authoritative grouping. This table is corrected to match it, not the reverse — a stale early-planning table should never contradict the detailed guide every session actually follows.

| Document | Real session | What it produces |
|---|---|---|
| FRONTEND_MASTER_REFERENCE | Every session | Attached every time |
| FRONTEND_01_DESIGN_SYSTEM | F02 | globals.css, tailwind.config.js, fonts.ts |
| FRONTEND_02_ARCHITECTURE | F03 | Providers, infrastructure, auth plumbing |
| FRONTEND_03_TAILWIND_GLOBALS | F04 | Tailwind patterns, shadcn overrides |
| FRONTEND_04_DEPENDENCIES | F01 | package.json, project scaffold |
| FRONTEND_05_CORE_COMPONENTS | F05 | Button, Input, Badge, Card, Avatar, Spinner |
| FRONTEND_06_DATA_COMPONENTS | F05b | DataTable, MetricCard, Charts, StatusGrid |
| FRONTEND_07_OVERLAY_COMPONENTS | F05b | Modal, Drawer, CommandPalette, Toast, Tooltip |
| FRONTEND_08_CHAT_COMPONENTS | F06 | All chat-specific components |
| FRONTEND_09_LAYOUT_COMPONENTS | F07 | AppShell, ThreePanel, AdminShell, Navigation |
| FRONTEND_10_ZUSTAND_STORES | F08 | All 5 stores complete |
| FRONTEND_11_TANSTACK_QUERY | F08 | QueryClient, hooks, polling config |
| FRONTEND_12_EMPLOYEE_CHAT | F09 | Chat page, layout, WebSocket integration |
| FRONTEND_13_EMPLOYEE_CHAT_FEATURES | F09 | Drag-drop, entity chips, keyboard shortcuts |
| FRONTEND_14_EMPLOYEE_HISTORY | F10 | Session history page |
| FRONTEND_15_EMPLOYEE_ONBOARDING | F10 | 5-step modal walkthrough |
| FRONTEND_16_ADMIN_SHELL | F11 | Admin sidebar, topbar, navigation |
| FRONTEND_17_ADMIN_DASHBOARD | F11 | Live metrics page |
| FRONTEND_18_ADMIN_DOCUMENTS | F12 | Upload zone, ingestion tracking |
| FRONTEND_19_ADMIN_REGISTRY_CONFIG | F12 | Registry workflow + config snapshot |
| FRONTEND_20_ADMIN_GAPS_AUDIT | F13 | Gap cards + audit timeline |
| FRONTEND_21_ADMIN_REVIEW_TICKETS | F13 | Review split-pane + kanban |
| FRONTEND_22_ADMIN_HEALTH_ANALYTICS | F14 | System health grid + analytics charts |
| FRONTEND_23_FRAMER_MOTION | F15 | Page transitions and animations |
| FRONTEND_24_MICRO_INTERACTIONS | F15 | Hover, focus, loading states |
| FRONTEND_25_DARK_MODE | F16 | Complete dark mode system |
| FRONTEND_26_ERROR_HANDLING | F16 | Error boundaries, offline, reconnection |
| FRONTEND_27_ACCESSIBILITY | F17 | ARIA, keyboard nav, focus management |
| FRONTEND_28_PERFORMANCE | F17 | Lazy loading, virtualization, bundles |
| FRONTEND_29_33_BACKEND_API_CONTRACTS | F18 (superseded by SUPPLEMENT_03/04) | Original backend API contracts |
| FRONTEND_34_VERIFICATION | F18 | Test checklist + visual QA |
| FRONTEND_35_AGENT_SESSION_GUIDE | Every | Session prompts (this is the authoritative session structure) |
| FRONTEND_36_ADMIN_QUICK_ENTRY_LIST | F19 | Quick Entry list page |
| FRONTEND_37_ADMIN_QUICK_ENTRY_FORM | F19 | Quick Entry multi-step form |
| FRONTEND_38_ADMIN_QUICK_ENTRY_FORM_FIELDS | F19 | Quick Entry field components |
| FRONTEND_39_ADMIN_QUICK_ENTRY_SCREENSHOT | F19 | Screenshot upload/review UI |
| FRONTEND_40_EMPLOYEE_ATTRIBUTION_SCREENSHOTS | F19 | Employee-side screenshot attribution |
| AMENDMENT_GENERALIZATION_FRONTEND | F02/F03/F05/F06/F07/F10/F11/F12/F13 | 11 branding-touchpoint fixes, woven into each session |
| FRONTEND_SUPPLEMENT_01_CRITICAL_BUG_FIXES | F10 | Onboarding fixes |
| FRONTEND_SUPPLEMENT_02_PROXY_ROUTE_PDF | F03, F18 | Proxy route + complete PDF export |
| FRONTEND_SUPPLEMENT_03_SESSION_API_COMPLETE | F18 | Supersedes FRONTEND_29 |
| FRONTEND_SUPPLEMENT_04_BACKEND_APIS_30_33 | F18 | Supersedes FRONTEND_30-33 |
| FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING | F09/F10/F11/F12/F13 | Multi-tab coordination, stream recovery, timestamp/import-path fixes |

---

## CONFIDENCE AURA SYSTEM — IMPLEMENTATION REFERENCE

The AI response card's left border color is the primary visual confidence signal. This system runs on every AI message.

```typescript
type ConfidenceBadge = 'green' | 'amber' | 'none' | null

const AURA_CONFIG = {
  green: {
    borderClass: 'border-l-success',
    badgeBg: 'bg-success-bg',
    badgeBorder: 'border-success-border',
    badgeText: 'text-success-text',
    dotBg: 'bg-success',
    label: 'High confidence',
  },
  amber: {
    borderClass: 'border-l-warning',
    badgeBg: 'bg-warning-bg',
    badgeBorder: 'border-warning-border',
    badgeText: 'text-warning-text',
    dotBg: 'bg-warning',
    label: 'Moderate confidence',
  },
  none: {
    borderClass: 'border-l-border-primary',
    badgeBg: null,
    badgeBorder: null,
    badgeText: null,
    dotBg: null,
    label: null,
  },
} as const
```

The AI response card always has `border-l-4` — color depends on confidence badge. When badge is null (streaming not yet complete), use `border-l-border-primary`.

---

## STREAMING STATE MACHINE

The chat UI shows progressive states during generation. All states must be visible to the user.

```typescript
type StreamingState =
  | 'idle'           // No request in flight
  | 'thinking'       // Request sent, waiting for first token
  | 'retrieving'     // backend: retrieval_progress stage=retrieving
  | 'generating'     // backend: retrieval_progress stage=generating
  | 'streaming'      // tokens arriving (type: "token" messages)
  | 'validating'     // backend: retrieval_progress stage=validating
  | 'complete'       // type: "stream_complete" received
  | 'error'          // type: "error" received

// UI text for each state (shown below AEGIS label):
const STATE_LABELS: Record<StreamingState, string | null> = {
  idle: null,
  thinking: 'Thinking...',
  retrieving: 'Retrieving SAP documentation...',
  generating: 'Generating response...',
  streaming: null,            // cursor handles this
  validating: 'Validating answer...',
  complete: null,
  error: null,
}
```

---

## INTEGRATION WITH BACKEND SPEC DOCUMENTS

These backend implementation documents are the authority for backend behavior. Frontend must not assume anything not specified there.

| Backend concern | Authoritative document |
|---|---|
| Auth cookies (set-token, refresh, ws-token) | IMPL_21 |
| WebSocket protocol | IMPL_11 |
| Admin API endpoints | IMPL_PATCH_01 + admin_handler.py |
| Upload endpoints | IMPL_13, IMPL_18 |
| Session management (Redis) | IMPL_08, IMPL_11 |
| Document ingestion | IMPL_18 |
| Validation + confidence | IMPL_17 |

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Tier 4*
