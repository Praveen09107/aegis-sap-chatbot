# FRONTEND_16: ADMIN SHELL
## Admin Page Architecture, Page Header Component, Templates for All 10 Admin Pages
## Session F10 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F10: Admin shell patterns and shared admin components.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Sessions F01–F09 complete. FRONTEND_09 already created:
- `src/app/(admin)/layout.tsx`
- `src/components/admin/AdminNav.tsx`
- `src/components/admin/AdminTopbar.tsx`

**This session extends what FRONTEND_09 created.** Do NOT recreate those files.
Instead, create these new admin shell components:

**What this session creates:**
```
src/components/admin/
├── AdminPageHeader.tsx        ← Reusable page header (title + subtitle + actions)
├── AdminPageWrapper.tsx       ← Standard content padding/max-width wrapper
├── DashboardRefreshIndicator.tsx ← "Updated Xs ago · Next in Ys" countdown
├── AdminStatRow.tsx           ← Horizontal row of stats (used in multiple pages)
└── AdminEmptyPage.tsx         ← Full-page empty state for admin pages
```

---

## ADMIN PORTAL ARCHITECTURE OVERVIEW

Every admin page (10 pages total) follows the same structural pattern.
The agent must follow this pattern exactly for all admin page files.

### File structure for each admin page

```
src/app/(admin)/admin/<page-name>/
├── page.tsx      ← REQUIRED: The page component
└── loading.tsx   ← REQUIRED: Skeleton loading state matching page layout
```

### Standard admin page structure (template)

```typescript
'use client'

import { useState } from 'react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
// Page-specific imports...

export default function AdminXxxPage() {
  // 1. Store state (selections, filters)
  const { ... } = useAdminStore()

  // 2. Query hooks
  const { data, isLoading } = useAdminXxx()

  // 3. Mutation hooks
  const doSomething = useDoSomething()

  return (
    <AdminPageWrapper>
      {/* Page header: title + optional action buttons */}
      <AdminPageHeader
        title="Page title"
        description="Short description of this page"
        actions={<Button onClick={...}>Primary action</Button>}
      />

      {/* Main content — wrap sections in ErrorBoundary */}
      <ErrorBoundary section="page content">
        {/* DataTable, charts, cards, etc. */}
      </ErrorBoundary>

      {/* Bulk action bar (when rows are selected) */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClearSelection={clearSelection}
        actions={[...]}
      />
    </AdminPageWrapper>
  )
}
```

---

## FILE 1: src/components/admin/AdminPageHeader.tsx (COMPLETE)

```typescript
import { cn } from '@/lib/utils'

interface AdminPageHeaderProps {
  title: string
  description?: string
  /** Action buttons rendered on the right side */
  actions?: React.ReactNode
  /** Optional: left-side supplementary content (e.g. filter chips) */
  leftSlot?: React.ReactNode
  className?: string
}

/**
 * Reusable page header for all admin pages.
 * Renders: title (left) + optional description + actions (right).
 *
 * RULE: Every admin page must have an AdminPageHeader at the top.
 * Do not hardcode page headers in individual pages.
 *
 * @example
 * <AdminPageHeader
 *   title="Documents"
 *   description="Manage the SAP knowledge base documents"
 *   actions={
 *     <Button onClick={openUpload}>
 *       <Upload className="w-4 h-4" /> Upload document
 *     </Button>
 *   }
 * />
 */
export function AdminPageHeader({
  title,
  description,
  actions,
  leftSlot,
  className,
}: AdminPageHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 mb-6',
        className,
      )}
    >
      {/* Left: title + description */}
      <div className="space-y-1 min-w-0">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-text-secondary">{description}</p>
        )}
        {leftSlot && <div className="mt-3">{leftSlot}</div>}
      </div>

      {/* Right: action buttons */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {actions}
        </div>
      )}
    </div>
  )
}
```

---

## FILE 2: src/components/admin/AdminPageWrapper.tsx (COMPLETE)

```typescript
import { cn } from '@/lib/utils'

interface AdminPageWrapperProps {
  children: React.ReactNode
  /** Extra wide pages (system health grid, analytics) use 'wide' */
  width?: 'default' | 'wide' | 'full'
  className?: string
}

/**
 * Standard content padding wrapper for all admin pages.
 * Provides consistent horizontal padding and optional max-width.
 *
 * RULE: Every admin page.tsx wraps its content in AdminPageWrapper.
 *
 * @example
 * <AdminPageWrapper>
 *   <AdminPageHeader title="Documents" />
 *   <DataTable ... />
 * </AdminPageWrapper>
 */
export function AdminPageWrapper({
  children,
  width = 'default',
  className,
}: AdminPageWrapperProps) {
  return (
    <div
      className={cn(
        'px-6 py-5',
        width === 'default' && 'max-w-[1200px]',
        width === 'wide' && 'max-w-[1400px]',
        width === 'full' && 'max-w-none',
        className,
      )}
    >
      {children}
    </div>
  )
}
```

---

## FILE 3: src/components/admin/DashboardRefreshIndicator.tsx (COMPLETE)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIMING } from '@/lib/constants'

interface DashboardRefreshIndicatorProps {
  /** Timestamp of last successful data fetch (from TanStack Query's dataUpdatedAt) */
  dataUpdatedAt: number
  /** Polling interval in ms — shown as "Next in Xs" */
  intervalMs?: number
  className?: string
}

/**
 * Shows live "Updated Xs ago · Next refresh in Ys" in the admin dashboard.
 *
 * Usage: In the dashboard page, pass `dataUpdatedAt` from useAdminMetrics():
 *
 * const { data, dataUpdatedAt } = useAdminMetrics()
 * <DashboardRefreshIndicator dataUpdatedAt={dataUpdatedAt} />
 *
 * The countdown resets automatically whenever dataUpdatedAt changes
 * (i.e. when TanStack Query receives fresh data).
 */
export function DashboardRefreshIndicator({
  dataUpdatedAt,
  intervalMs = TIMING.ADMIN_POLL_INTERVAL_MS,
  className,
}: DashboardRefreshIndicatorProps) {
  const [secondsSince, setSecondsSince] = useState(0)

  useEffect(() => {
    // Recalculate every second
    const tick = () => {
      const elapsed = Math.floor((Date.now() - dataUpdatedAt) / 1000)
      setSecondsSince(Math.max(0, elapsed))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [dataUpdatedAt])

  const intervalSeconds = Math.floor(intervalMs / 1000)
  const secondsUntilNext = Math.max(0, intervalSeconds - secondsSince)

  return (
    <div
      className={cn('flex items-center gap-1.5 text-xs text-text-tertiary', className)}
      role="status"
      aria-live="polite"
      aria-label={`Data updated ${secondsSince} seconds ago`}
    >
      <RefreshCw
        className={cn(
          'w-3 h-3 shrink-0',
          secondsUntilNext === 0 && 'animate-spin text-accent',
        )}
        aria-hidden="true"
      />
      <span className="tabular-nums">
        Updated {secondsSince}s ago
        <span className="opacity-60 ml-1">· Next in {secondsUntilNext}s</span>
      </span>
    </div>
  )
}
```

---

## FILE 4: src/components/admin/AdminStatRow.tsx (COMPLETE)

```typescript
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface StatItem {
  label: string
  value: string | number
  color?: 'default' | 'green' | 'amber' | 'red' | 'info'
  suffix?: string
}

interface AdminStatRowProps {
  stats: StatItem[]
  isLoading?: boolean
  className?: string
}

const VALUE_COLORS = {
  default: 'text-text-primary',
  green:   'text-success',
  amber:   'text-warning',
  red:     'text-danger',
  info:    'text-info',
}

/**
 * Horizontal row of inline statistics.
 * Used on pages that need quick stats without full metric cards.
 * Lighter than MetricCardGrid — for secondary stats or summary rows.
 *
 * @example
 * // In documents page header:
 * <AdminStatRow stats={[
 *   { label: 'Active', value: 47, color: 'green' },
 *   { label: 'Deprecated', value: 12 },
 *   { label: 'Processing', value: 3, color: 'info' },
 *   { label: 'Failed', value: 1, color: 'red' },
 * ]} />
 */
export function AdminStatRow({ stats, isLoading, className }: AdminStatRowProps) {
  return (
    <div
      className={cn('flex items-center gap-6 flex-wrap', className)}
      role="group"
      aria-label="Statistics"
    >
      {stats.map((stat, i) => (
        <div key={i} className="flex items-baseline gap-2">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-3 w-14" />
            </>
          ) : (
            <>
              <span
                className={cn(
                  'text-xl font-bold tabular-nums tracking-tight',
                  VALUE_COLORS[stat.color ?? 'default'],
                )}
              >
                {stat.value}{stat.suffix}
              </span>
              <span className="text-xs text-text-tertiary font-medium">
                {stat.label}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
```

---

## FILE 5: src/components/admin/AdminEmptyPage.tsx

```typescript
import { type LucideIcon } from 'lucide-react'
import { AdminPageWrapper } from './AdminPageWrapper'
import { EmptyState } from './EmptyState'
import { AdminPageHeader } from './AdminPageHeader'

interface AdminEmptyPageProps {
  title: string
  icon?: LucideIcon
  emptyTitle: string
  emptyDescription?: string
  action?: React.ReactNode
}

/**
 * Full admin page empty state — used when a page has no data at all yet.
 * Combines AdminPageHeader + EmptyState in the standard layout.
 */
export function AdminEmptyPage({
  title,
  icon,
  emptyTitle,
  emptyDescription,
  action,
}: AdminEmptyPageProps) {
  return (
    <AdminPageWrapper>
      <AdminPageHeader title={title} />
      <EmptyState
        icon={icon}
        title={emptyTitle}
        description={emptyDescription}
        action={action}
        variant="page"
      />
    </AdminPageWrapper>
  )
}
```

---

## ADMIN PAGE LOADING SKELETON PATTERN

Every admin page needs a `loading.tsx` that matches its layout.
Below is the standard skeleton template — adapt column counts and card sizes per page.

```typescript
// src/app/(admin)/admin/<page>/loading.tsx — TEMPLATE
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminXxxLoading() {
  return (
    <div className="px-6 py-5 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Optional: filter row skeleton */}
      <div className="flex gap-3">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-border-primary overflow-hidden">
        <div className="bg-bg-secondary px-4 py-3 flex gap-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-t border-border-primary flex gap-6 items-center">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## ADMIN PAGE TITLE MAP

This table gives every admin page its canonical title and description for `AdminPageHeader`.
The agent MUST use these exact titles — they match what `AdminTopbar` derives from `ADMIN_NAV_ITEMS`.

| Page route | Title | Description |
|---|---|---|
| `/admin/dashboard` | Dashboard | Live quality overview |
| `/admin/documents` | Documents | SAP knowledge base documents |
| `/admin/registry` | Registry | Known error pattern entries |
| `/admin/config-snapshot` | Config snapshot | SAP configuration values |
| `/admin/knowledge-gaps` | Knowledge gaps | Unanswered query analysis |
| `/admin/audit-trail` | Audit trail | Employee interaction history |
| `/admin/review-queue` | Review queue | Responses flagged for correction |
| `/admin/tickets` | Tickets | Escalated support tickets |
| `/admin/system-health` | System health | 19-service Docker status monitor |
| `/admin/analytics` | Analytics | Quality trend reporting |

---

## ADMIN KEYBOARD SHORTCUT MAP

| Shortcut | Registered in | Action |
|---|---|---|
| `⌘K` | Admin layout.tsx | Command palette |
| `⌘/` | KeyboardShortcutsOverlay | Shortcuts reference |
| `J` | ReviewPage (FRONTEND_21) | Next review queue item |
| `K` | ReviewPage | Previous review queue item |
| `A` | ReviewPage | Approve correction |
| `X` | ReviewPage | Skip item |

---

## DARK MODE VERIFICATION CHECKLIST

Run this check for the admin portal after implementing any admin page:

```bash
# Step 1: Admin portal opens in dark mode
# → http://localhost:3000/admin/dashboard
# → Background should be #060B14 (navy-900)
# → Text should be #F1F5F9 (gray-100)
# → Borders should be #1E2A3D (navy-600)

# Step 2: Charts render correctly in dark mode
# → Recharts axis labels: text-text-tertiary color
# → Grid lines: use CHART_COLORS.darkGrid
# → Chart backgrounds: transparent (falls through to card bg)

# Step 3: Theme toggle works in admin portal
# → Clicking ThemeToggle switches to light mode
# → All admin components render correctly in light mode
# → No hardcoded dark hex values

# Step 4: DataTable in dark mode
# → Table rows: bg-bg-card, bg-bg-secondary on hover
# → Header: bg-bg-secondary
# → Borders: border-border-primary
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: AdminPageHeader renders
# <AdminPageHeader title="Test" description="Description" actions={<button>Action</button>} />
# → Title on left, action button on right

# Step 2: AdminPageWrapper constrains width
# → On 1920px screen, content should be max 1200px wide (default)
# → On 1440px screen, fills naturally

# Step 3: DashboardRefreshIndicator counts down
# → <DashboardRefreshIndicator dataUpdatedAt={Date.now()} />
# → Should show "Updated 0s ago · Next in 30s"
# → After 5 seconds: "Updated 5s ago · Next in 25s"
# → When TanStack Query refetches, dataUpdatedAt changes → counter resets

# Step 4: AdminStatRow
# → <AdminStatRow stats={[{label:'Active', value:47, color:'green'}]} />
# → Should show "47" in green + "Active" in tertiary

# Step 5: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F10: Admin shell — AdminPageHeader, AdminPageWrapper, DashboardRefreshIndicator, admin page patterns"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F10*
