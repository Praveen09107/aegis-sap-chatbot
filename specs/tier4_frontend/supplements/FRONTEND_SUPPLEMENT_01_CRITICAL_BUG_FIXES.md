# FRONTEND_SUPPLEMENT_01: CRITICAL BUG FIXES
## Fixes for C1–C5, M2–M10 — Apply Before Any Implementation Session
## Must be read alongside FRONTEND_MASTER_REFERENCE.md

---

## HOW TO APPLY THIS DOCUMENT

This supplement patches **seven source documents**. When implementing:

| Session | Apply patch from this doc |
|---------|--------------------------|
| F02 (Design system) | Section A: types/index.ts additions, utils.ts additions, globals.css additions |
| F05 (Core components) | Section B: useAuth fix |
| F07 (Stores) | Section C: adminStore fix |
| F09 (Chat features) | Section D: ⌘N mid-stream guard |
| F11 (Admin shell) | Section E: AdminNav icon rendering |
| F15 (Animations) | Section F: ChartTooltip dark mode |

---

## SECTION A — TYPE SYSTEM FIXES (FRONTEND_01 / types/index.ts)

Add these missing types to `src/types/index.ts`. They are referenced
across FRONTEND_11, FRONTEND_14, FRONTEND_18, FRONTEND_19, FRONTEND_20 but
never formally declared.

```typescript
// ── ADD to src/types/index.ts ──────────────────────────────

/**
 * Session list filters — used by useSessions() and history page.
 * ALL fields are optional (no field is required for an unfiltered fetch).
 * date_from and date_to must be YYYY-MM-DD strings in IST (Asia/Kolkata).
 */
export interface SessionFilters {
  search?: string              // Full-text search across topic_summary + message content
  module?: string              // SAP module tag: "SD" | "FI" | "MM" | "HR" | "PP" | "CO" | "BASIS"
  confidence_badge?: 'green' | 'amber' | 'none'
  date_from?: string           // YYYY-MM-DD (IST) — sessions updated on or after
  date_to?: string             // YYYY-MM-DD (IST) — sessions updated on or before
  is_unresolved?: boolean      // true = only sessions with a confidence_badge of 'none' that have no linked resolved ticket
  is_pinned?: boolean
  page?: number                // 1-indexed, default 1
  page_size?: number           // default 50, max 200
}

/**
 * Document filter type for admin documents page.
 */
export interface DocFilters {
  module?: string
  content_type?: 'error_guide' | 'procedure' | 'config'
  status?: 'active' | 'processing' | 'failed' | 'deprecated'
}

/**
 * Audit trail filters.
 */
export interface AuditFilters {
  date_from?: string
  date_to?: string
  module?: string
  confidence_badge?: 'green' | 'amber' | 'none'
  request_type?: 'standard' | 'vision' | 'cached'
}

/**
 * Filter chip — rendered by FilterChips component (FRONTEND_06).
 * Used on Documents, Config Snapshot, and Audit Trail pages.
 */
export interface FilterChip {
  id: string           // Key for onRemove callback
  label: string        // Category label shown before the colon: "Module: SD"
  value: string        // The active filter value
}

/**
 * User preferences stored in the backend and locally.
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  panel_collapsed: boolean
  onboarding_complete: boolean
  pinned_session_ids: string[]
  notification_prefs: {
    email_on_ticket_resolved: boolean
  }
}
```

---

## SECTION B — utils.ts ADDITIONS (FRONTEND_01 / lib/utils.ts)

Add these missing utilities to `src/lib/utils.ts`.
They are imported by UploadDropZone, IngestionProgressRow, and csvExport.

```typescript
// ── ADD to src/lib/utils.ts ────────────────────────────────

/**
 * Format a byte count as a human-readable file size string.
 * Uses binary units (1 KB = 1024 bytes).
 *
 * @example
 * formatFileSize(0)           → "0 B"
 * formatFileSize(1024)        → "1.0 KB"
 * formatFileSize(52428800)    → "50.0 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / Math.pow(1024, unitIndex)
  const formatted = unitIndex === 0
    ? value.toFixed(0)
    : value.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}

/**
 * Format a date string or Date object for display in the Indian locale.
 * Returns: "28 Mar 2024, 02:30 PM"
 */
export function formatDateIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * Convert a UTC ISO string to an IST date string (YYYY-MM-DD).
 * Used for date_from/date_to filter params sent to the backend.
 *
 * @example
 * toISTDateString(new Date())  → "2024-03-28"
 */
export function toISTDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', {  // en-CA gives YYYY-MM-DD format
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * Returns the start of "today" in IST as a UTC Date object.
 * Used for "Today" date range filters.
 */
export function startOfTodayIST(): Date {
  const now = new Date()
  const istString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  // istString is "2024-03-28" — interpret as IST midnight
  const [y, m, d] = istString.split('-').map(Number)
  // IST is UTC+5:30, so IST midnight = UTC 18:30 the previous day
  return new Date(Date.UTC(y, m - 1, d) - 5.5 * 60 * 60 * 1000)
}
```

---

## SECTION C — globals.css ADDITIONS (FRONTEND_03)

Add these missing CSS classes to `src/app/globals.css` inside the `@layer components` block.

```css
/* ── ADD inside @layer components in globals.css ─────────── */

/**
 * divider-label — section title with horizontal rules on each side.
 * Used in AuditTimeline to separate date groups.
 *
 * Usage:  <div class="divider-label"><span>Today</span></div>
 *         <p class="section-label">Today</p>   ← simpler alternative if no rules needed
 */
.divider-label {
  @apply flex items-center gap-3 text-xs text-text-tertiary;
  @apply uppercase tracking-widest font-semibold;
}
.divider-label::before,
.divider-label::after {
  content: '';
  @apply flex-1 h-px bg-border-primary;
}

/**
 * animate-pulse-subtle — slower, gentler pulse than Tailwind's animate-pulse.
 * Used for ServiceTile healthy dot, IngestionProgressRow processing indicator.
 * Never use on danger/warning elements — only on "actively working" states.
 */
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.55; transform: scale(0.88); }
}

.animate-pulse-subtle {
  animation: pulse-subtle 2.2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .animate-pulse-subtle {
    animation: none;
  }
}

/**
 * surface-sunken — inset/recessed surface for code blocks, quote areas, example cards.
 * Slightly darker than surface-card to indicate "contained" content.
 */
.surface-sunken {
  @apply bg-bg-secondary border border-border-primary rounded-xl;
}

/**
 * truncate-2 — clamp text to exactly 2 lines.
 * Use on session card titles, session history titles.
 */
.truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/**
 * info-bg, info-border, info-text — informational (blue) status tokens.
 * Used in IngestionProgressRow for active upload/processing state.
 */
.bg-info-bg    { background-color: rgb(239 246 255); }
.border-info-border { border-color: rgb(191 219 254); }
.text-info-text { color: rgb(29 78 216); }
.text-info      { color: rgb(59 130 246); }
.bg-info        { background-color: rgb(59 130 246); }

.dark .bg-info-bg    { background-color: rgb(23 37 84 / 0.4); }
.dark .border-info-border { border-color: rgb(29 78 216 / 0.5); }
.dark .text-info-text { color: rgb(147 197 253); }
.dark .text-info      { color: rgb(96 165 250); }
.dark .bg-info        { background-color: rgb(37 99 235); }

/**
 * purple — used in CachePerformanceChart line colour.
 * Not a semantic token — only for charting.
 */
.bg-purple { background-color: rgb(139 92 246); }
```

---

## SECTION D — useAuth FIX (FRONTEND_05 / hooks/useAuth.ts)

**Bug:** `initializing` is used in both layout components but not returned by the hook.
**Result:** Layout redirects fire before auth state is determined — causes flash or wrong redirect.

```typescript
// REPLACE the useAuth implementation in src/hooks/useAuth.ts:

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthState, refreshAccessToken, logout } from '@/lib/auth'
import { TIMING } from '@/lib/constants'

interface AuthState {
  isAuthenticated: boolean
  role: string | null
}

/**
 * Authentication hook.
 *
 * initializing: true on first render while cookie state is being read.
 *   → Layout components show <LoadingScreen /> while initializing.
 *   → Redirects only fire once initializing is false.
 *
 * NOTE: Cookie reads are synchronous, so initializing resolves in the
 * first useEffect tick (typically < 5ms). The LoadingScreen flash is
 * essentially imperceptible but prevents incorrect redirects.
 */
export function useAuth() {
  const router = useRouter()

  // Start with unknown state — don't read cookies during SSR
  const [authState, setAuthState] = useState<AuthState>({ isAuthenticated: false, role: null })
  const [initializing, setInitializing] = useState(true)

  // Hydrate auth state from cookies on mount (client only)
  useEffect(() => {
    const state = getAuthState()
    setAuthState(state)
    setInitializing(false)
  }, [])

  // Refresh auth state (called after login callback or manual trigger)
  const refreshAuthState = useCallback(() => {
    const state = getAuthState()
    setAuthState(state)
  }, [])

  // Silent token refresh every 12 minutes
  useEffect(() => {
    if (!authState.isAuthenticated || initializing) return

    const interval = setInterval(async () => {
      const ok = await refreshAccessToken()
      if (!ok) {
        await logout()
        router.replace('/login')
      }
    }, TIMING.TOKEN_REFRESH_MS)

    return () => clearInterval(interval)
  }, [authState.isAuthenticated, initializing, router])

  return {
    isAuthenticated: authState.isAuthenticated,
    role: authState.role,
    isEmployee: authState.isAuthenticated && authState.role === 'employee',
    isAdmin: authState.isAuthenticated && authState.role === 'it-admin',
    initializing,
    refreshAuthState,
    logout,
  }
}
```

**Also remove all `useAuth() as any` casts** in both layout files — the type now includes `initializing`.

---

## SECTION E — adminStore FIX (FRONTEND_10 / stores/adminStore.ts)

**Bug:** `advanceReviewQueue()` is called in review queue page but not defined in the store.

```typescript
// ADD to the adminStore state interface and implementation:

// In the interface:
interface AdminStoreState {
  // ... existing fields ...
  reviewQueueIndex: number
  setReviewQueueIndex: (index: number) => void
  advanceReviewQueue: () => void          // ← ADD THIS
  resetReviewQueueIndex: () => void       // ← ADD THIS
}

// In the store create() implementation:
reviewQueueIndex: 0,

setReviewQueueIndex: (index) => set({ reviewQueueIndex: index }),

/**
 * Advance to the next review item.
 * Does NOT cap at items.length — the page component owns that logic
 * (it reads items from TanStack Query). If index exceeds items.length,
 * the ReviewItemDetail receives null and shows "Select an item".
 */
advanceReviewQueue: () =>
  set((state) => ({ reviewQueueIndex: state.reviewQueueIndex + 1 })),

/**
 * Reset to first item — call when navigating away from review queue
 * or when the queue is empty.
 */
resetReviewQueueIndex: () => set({ reviewQueueIndex: 0 }),
```

**Also add to logout reset** (the logout clear pattern in adminStore):
```typescript
// In the logout event listener (or the resetAdminStore function):
resetReviewQueueIndex()
```

---

## SECTION F — AdminNav ICON RENDERING (FRONTEND_09 / admin/AdminNav.tsx)

**Issue:** `ADMIN_NAV_ITEMS` has an `icon` string field that AdminNav ignores.
**Fix:** Render lucide icons dynamically from the string name.

```typescript
// ADD this icon map to AdminNav.tsx (before the component function):

import {
  LayoutDashboard, FileText, Link as LinkIcon, Settings, Search,
  ClipboardList, CheckSquare, Ticket, Activity, BarChart2,
  type LucideIcon,
} from 'lucide-react'

const NAV_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Link: LinkIcon,
  Settings,
  Search,
  ClipboardList,
  CheckSquare,
  Ticket,
  Activity,
  BarChart2,
}

// UPDATE the nav item render in AdminNav.tsx:
{ADMIN_NAV_ITEMS.map((item) => {
  const isActive = /* existing logic */
  const badgeCount = /* existing logic */
  const isNew = /* existing logic */
  const Icon = NAV_ICONS[item.icon] ?? LayoutDashboard  // fallback

  return (
    <Link key={item.href} href={item.href} className={cn('nav-item w-full', isActive && 'active')}>
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />   {/* ← ADD icon */}
      <span className="flex-1 text-sm">{item.label}</span>
      {/* ... existing badges ... */}
    </Link>
  )
})}
```

**Update AdminNav nav-item CSS** in globals.css to accommodate the icon:
```css
/* Already: flex items-center gap-3 — icon + text layout works without changes */
```

---

## SECTION G — ⌘N MID-STREAM GUARD (FRONTEND_13 / hooks/useChatKeyboardShortcuts.ts)

**Bug:** Pressing ⌘N during streaming clears the in-progress AI response.

```typescript
// UPDATE handleNewSession in useChatKeyboardShortcuts.ts:

const handleNewSession = useCallback(() => {
  // GUARD: Do not allow new session while streaming is active
  const { streamingState } = useChatStore.getState()
  if (
    streamingState === 'streaming' ||
    streamingState === 'thinking' ||
    streamingState === 'retrieving' ||
    streamingState === 'generating' ||
    streamingState === 'validating'
  ) {
    // Provide feedback that the action was blocked
    import('@/lib/toast').then(({ toastError }) => {
      toastError('Wait for the current response to complete before starting a new chat.')
    })
    return
  }

  // Safe to reset
  disconnect()
  resetForNewSession()
  setActiveSessionId(null)
  const url = new URL(window.location.href)
  url.searchParams.delete('session')
  window.history.replaceState({}, '', url.toString())
}, [disconnect, resetForNewSession, setActiveSessionId])
```

---

## SECTION H — ChartTooltip DARK MODE FIX (FRONTEND_17, 22 / charts/)

**Bug:** `CHART_TICK_STYLE` is a static object with `fill: '#64748B'` (light mode only).
In dark mode, axis labels appear in wrong colour.

```typescript
// UPDATE src/components/admin/charts/ChartTooltip.tsx:

// ADD this hook (replaces the static CHART_TICK_STYLE constant):
import { useTheme } from 'next-themes'
import { useMemo } from 'react'

/**
 * Returns theme-aware tick styles for Recharts XAxis/YAxis.
 * Must be called inside a component (it's a hook).
 *
 * @example
 * const tickStyle = useChartTickStyle()
 * <XAxis tick={tickStyle} />
 */
export function useChartTickStyle() {
  const { resolvedTheme } = useTheme()
  return useMemo(() => ({
    fontSize: 11,
    fontFamily: 'var(--font-geist-sans)',
    fill: resolvedTheme === 'dark' ? CHART_COLORS.tickDark : CHART_COLORS.tickLight,
  }), [resolvedTheme])
}

// KEEP the static export for backwards compat (used in loading skeletons):
export const CHART_TICK_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-geist-sans)',
  fill: '#64748B',  // static — only use where useTheme is unavailable
} as const
```

**UPDATE all chart components** to use the hook instead of the static constant:

```typescript
// In ValidationScoreChart.tsx, ConfidenceDistChart.tsx, QueryVolumeChart.tsx,
// CachePerformanceChart.tsx, TopModulesChart.tsx:

// BEFORE:
const gridColor = theme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine
// ... <XAxis tick={CHART_TICK_STYLE} />

// AFTER:
const { resolvedTheme } = useTheme()
const tickStyle = useChartTickStyle()   // ← hook call
const gridColor = resolvedTheme === 'dark' ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine
// ... <XAxis tick={tickStyle} />       // ← use hook result
```

---

## SECTION I — KANBAN COLUMN COLOR FIX (FRONTEND_21 / admin/KanbanColumn.tsx)

**Bug:** `COLUMN_ACCENT.resolved` references `CHART_COLORS.purple` from the charts directory.
Kanban should not import from charts.

```typescript
// FIX in KanbanColumn.tsx — replace COLUMN_ACCENT with inline classes:

// BEFORE:
const COLUMN_ACCENT: Record<TicketStatus, string> = {
  open:        'border-t-danger/50',
  in_progress: 'border-t-warning/50',
  resolved:    'border-t-success/50',    // ← was incorrectly purple before
}

// AFTER (keep as-is — this is already correct):
// The resolved column should be green (success), not purple.
// If your earlier implementation had purple, fix it to:
const COLUMN_ACCENT: Record<TicketStatus, string> = {
  open:        'border-t-2 border-t-danger/50',
  in_progress: 'border-t-2 border-t-warning/50',
  resolved:    'border-t-2 border-t-success/50',
}
```

---

## SECTION J — is_unresolved BUSINESS RULE (clarifies FRONTEND_14, 29)

**Gap:** What makes a session "unresolved" was never defined.

**Rule (authoritative):**

A session `is_unresolved = true` when **all** of the following are true:
1. The most recent AI response in the session has `confidence_badge = 'none'` (insufficient)
2. No subsequent message in the session has `confidence_badge = 'green'` or `'amber'`
3. The session has no linked resolved ticket (`Ticket.status = 'resolved'`)

This is computed server-side when the session is written. The frontend treats it as a read-only flag.

**Employee portal display:** Unresolved sessions show `● Unresolved` in amber text in `HistorySessionCard`.

**Filter behaviour:** `is_unresolved: true` in `SessionFilters` shows only sessions matching the above rule.

```typescript
// UPDATE HistorySessionCard.tsx to show the indicator:
{session.is_unresolved && (
  <span className="text-xs font-medium text-warning" aria-label="Session unresolved">
    ● Unresolved
  </span>
)}
```

---

## SECTION K — MISSING CONSTANTS FIX (FRONTEND_02 / lib/constants.ts)

Add the IST timezone constant and the analytics ranges (verify they exist):

```typescript
// ADD to constants.ts (FRONTEND_02) if not already present:

/** Indian Standard Time — used for all date-based filtering and display */
export const TIMEZONE = 'Asia/Kolkata' as const

/** Analytics page date range options */
export const ANALYTICS_RANGES = [
  { label: '7d',  value: '7d',  days: 7   },
  { label: '30d', value: '30d', days: 30  },
  { label: '90d', value: '90d', days: 90  },
  { label: 'All', value: 'all', days: null },
] as const

/** Gzip sizes of heavy dependencies — for bundle analysis reference */
export const BUNDLE_BUDGET_KB = {
  INITIAL_EMPLOYEE: 300,  // gzipped
  INITIAL_ADMIN: 350,
  RECHARTS_CHUNK: 210,
  DND_KIT_CHUNK: 30,
  REACT_PDF_CHUNK: 360,
} as const

/** TanStack DevTools — enable in development via env var */
export const SHOW_QUERY_DEVTOOLS =
  process.env.NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS === 'true'

// ADD to .env.local:
// NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS=true    ← development
// NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS=false   ← production
```

---

## VERIFICATION

```bash
# After applying all sections:
npx tsc --noEmit
# Expected: 0 errors
# Previously: 4–6 type errors from missing SessionFilters, FilterChip,
# initializing not on useAuth return type, advanceReviewQueue not on store

# Verify formatFileSize:
# node -e "const {formatFileSize} = require('./src/lib/utils'); console.log(formatFileSize(52428800))"
# → "50.0 MB"

# Verify IST date helper:
# node -e "const {toISTDateString} = require('./src/lib/utils'); console.log(toISTDateString(new Date()))"
# → "2024-03-28" (current IST date)

# Verify CSS classes exist:
# grep -n "divider-label\|animate-pulse-subtle\|surface-sunken" src/app/globals.css
```

---

*FRONTEND_SUPPLEMENT_01 | Gap Resolution Document | AEGIS Frontend Specification Set*
