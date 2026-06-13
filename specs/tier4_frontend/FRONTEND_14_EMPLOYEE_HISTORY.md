# FRONTEND_14: EMPLOYEE HISTORY
## Session History Page — Search, Filter, Sort, Export
## Session F09 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F09: Employee session history page.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Sessions F01–F08 complete.

**What this session creates:**
```
src/app/(employee)/history/
├── page.tsx               ← Session history page
└── loading.tsx            ← Skeleton loading state

src/components/sessions/
├── HistorySessionCard.tsx ← Expanded session card for history view
└── HistoryFilters.tsx     ← Filter and sort controls
```

---

## PAGE DESIGN

The history page shows all historical sessions with rich filtering and search.
Unlike the sidebar (compact, 180px), this page has full space to show session details.

```
┌─────────────────────────────────────────────────────────────┐
│  Session history                            [Export CSV]     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  🔍 Search sessions...                               │   │
│  └──────────────────────────────────────────────────────┘   │
│  Module: [All ▾]  Badge: [All ▾]  Date: [All time ▾]        │
│  Sort: [Most recent ▾]  ☐ Unresolved only    [Clear all]    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🟢 VL150 delivery error resolution          SD      │   │
│  │  "How do I fix VL150 when creating delivery..."      │   │
│  │  2 turns · 91% avg · 28 Mar 2024 14:32              │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🟡 YDSA scheduling agreement creation       SD      │   │
│  │  "What are the steps to create a YDSA..."            │   │
│  │  4 turns · 78% avg · 27 Mar 2024 09:15              │   │
│  └─────────────────────────────────────────────────────┘   │
│  ...                                                        │
│  Showing 1–50 of 247   [← Prev]  Page 1 / 5  [Next →]     │
└─────────────────────────────────────────────────────────────┘
```

---

## FILE 1: src/app/(employee)/history/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function HistoryLoading() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Search skeleton */}
      <Skeleton className="h-10 w-full rounded-lg" />

      {/* Filter row skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>

      {/* Session card skeletons */}
      {[...Array(6)].map((_, i) => (
        <div key={i} className="surface-card p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full ml-4 shrink-0" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## FILE 2: src/components/sessions/HistoryFilters.tsx (COMPLETE)

```typescript
'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// ── Filter state type ────────────────────────────────────────

export interface HistoryFilterState {
  search: string
  module: string | null
  badge: 'green' | 'amber' | 'none' | null
  dateRange: 'today' | '7d' | '30d' | '90d' | 'all'
  unresolvedOnly: boolean
  sortBy: 'date' | 'confidence' | 'turns'
}

export const DEFAULT_FILTERS: HistoryFilterState = {
  search: '',
  module: null,
  badge: null,
  dateRange: 'all',
  unresolvedOnly: false,
  sortBy: 'date',
}

interface HistoryFiltersProps {
  filters: HistoryFilterState
  onChange: (filters: Partial<HistoryFilterState>) => void
  onClearAll: () => void
  totalResults: number
  isLoading?: boolean
}

const MODULES = ['SD', 'FI', 'MM', 'HR', 'PP', 'CO', 'BASIS']
const DATE_RANGES = [
  { label: 'All time', value: 'all' as const },
  { label: 'Today', value: 'today' as const },
  { label: 'Last 7 days', value: '7d' as const },
  { label: 'Last 30 days', value: '30d' as const },
  { label: 'Last 90 days', value: '90d' as const },
]
const SORT_OPTIONS = [
  { label: 'Most recent', value: 'date' as const },
  { label: 'Highest confidence', value: 'confidence' as const },
  { label: 'Most turns', value: 'turns' as const },
]

const hasActiveFilters = (f: HistoryFilterState) =>
  f.module !== null ||
  f.badge !== null ||
  f.dateRange !== 'all' ||
  f.unresolvedOnly ||
  f.sortBy !== 'date'

/**
 * Filter and sort controls for the session history page.
 * Rendered as a compact toolbar row with dropdowns and checkboxes.
 */
export function HistoryFilters({
  filters,
  onChange,
  onClearAll,
  totalResults,
  isLoading,
}: HistoryFiltersProps) {
  const active = hasActiveFilters(filters)

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Module filter */}
        <FilterSelect
          label="Module"
          value={filters.module ?? ''}
          options={[
            { label: 'All modules', value: '' },
            ...MODULES.map((m) => ({ label: m, value: m })),
          ]}
          onChange={(v) => onChange({ module: v || null })}
        />

        {/* Badge filter */}
        <FilterSelect
          label="Confidence"
          value={filters.badge ?? ''}
          options={[
            { label: 'All levels', value: '' },
            { label: '🟢 High', value: 'green' },
            { label: '🟡 Moderate', value: 'amber' },
            { label: '🔴 Insufficient', value: 'none' },
          ]}
          onChange={(v) => onChange({ badge: (v || null) as HistoryFilterState['badge'] })}
        />

        {/* Date range filter */}
        <FilterSelect
          label="Date"
          value={filters.dateRange}
          options={DATE_RANGES.map((d) => ({ label: d.label, value: d.value }))}
          onChange={(v) => onChange({ dateRange: v as HistoryFilterState['dateRange'] })}
        />

        {/* Sort by */}
        <FilterSelect
          label="Sort"
          value={filters.sortBy}
          options={SORT_OPTIONS.map((s) => ({ label: s.label, value: s.value }))}
          onChange={(v) => onChange({ sortBy: v as HistoryFilterState['sortBy'] })}
        />

        {/* Unresolved only */}
        <label
          className={cn(
            'flex items-center gap-2 px-3 h-8 rounded-lg cursor-pointer select-none',
            'border text-sm font-medium',
            'transition-colors duration-[var(--duration-normal)]',
            filters.unresolvedOnly
              ? 'bg-warning-bg border-warning-border text-warning-text'
              : 'bg-bg-secondary border-border-primary text-text-secondary hover:border-border-secondary hover:text-text-primary',
          )}
        >
          <input
            type="checkbox"
            checked={filters.unresolvedOnly}
            onChange={(e) => onChange({ unresolvedOnly: e.target.checked })}
            className="w-3.5 h-3.5 rounded accent-warning"
            aria-label="Show unresolved sessions only"
          />
          Unresolved
        </label>

        {/* Clear all (only shown when filters are active) */}
        {active && (
          <button
            onClick={onClearAll}
            className="text-xs text-text-tertiary hover:text-text-secondary underline transition-colors ml-1"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-xs text-text-tertiary">
          {totalResults === 0 ? 'No sessions found' : (
            <>
              <span className="font-medium text-text-secondary">{totalResults}</span>
              {' '}session{totalResults !== 1 ? 's' : ''}
              {active ? ' matching your filters' : ' total'}
            </>
          )}
        </p>
      )}
    </div>
  )
}

// ── FilterSelect sub-component ────────────────────────────────

interface FilterSelectProps {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const selectedLabel = options.find((o) => o.value === value)?.label ?? label
  const isActive = value !== '' && value !== 'all' && value !== 'date'

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"  // Hidden — we use a custom styled wrapper
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <label
        className={cn(
          'flex items-center gap-1.5 px-3 h-8 rounded-lg cursor-pointer select-none',
          'border text-sm font-medium',
          'transition-colors duration-[var(--duration-normal)]',
          isActive
            ? 'bg-accent-subtle border-border-focus text-accent-text'
            : 'bg-bg-secondary border-border-primary text-text-secondary hover:border-border-secondary hover:text-text-primary',
        )}
      >
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label={label}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {selectedLabel}
        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" aria-hidden="true" />
      </label>
    </div>
  )
}
```

---

## FILE 3: src/components/sessions/HistorySessionCard.tsx (COMPLETE)

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { MessageSquare, Clock, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfidenceBadge } from '@/components/chat/ConfidenceBadge'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import type { Session } from '@/types'

interface HistorySessionCardProps {
  session: Session
  index: number
}

/**
 * Expanded session card for the history page.
 * Shows more detail than the sidebar SessionCard.
 * Clicking opens the session in the chat interface.
 */
export function HistorySessionCard({ session, index }: HistorySessionCardProps) {
  const router = useRouter()
  const reducedMotion = usePrefersReducedMotion()

  const date = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(session.updated_at))

  function handleOpen() {
    router.push(`/?session=${session.id}`)
  }

  return (
    <motion.div
      initial={reducedMotion ? {} : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
    >
      <button
        onClick={handleOpen}
        className={cn(
          'w-full text-left',
          'surface-card p-4',
          'hover:shadow-md',
          'transition-all duration-[var(--duration-slow)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          'group',
          'active:scale-[0.995]',
        )}
        aria-label={`Open session: ${session.topic_summary}`}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Session info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title */}
            <h3 className="text-sm font-semibold text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors">
              {session.topic_summary}
            </h3>

            {/* Module tags */}
            {session.module_tags.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5">
                {session.module_tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-medium bg-bg-tertiary border border-border-primary text-text-tertiary rounded px-1.5 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Meta row */}
            <div className="flex items-center flex-wrap gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" aria-hidden="true" />
                {session.turn_count} {session.turn_count === 1 ? 'turn' : 'turns'}
              </span>

              <span className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3" aria-hidden="true" />
                {date}
              </span>

              {session.is_unresolved && (
                <span className="text-warning font-medium">● Unresolved</span>
              )}
            </div>
          </div>

          {/* Confidence badge */}
          <div className="shrink-0 mt-0.5">
            <ConfidenceBadge
              badge={session.confidence_badge}
              score={session.avg_confidence_score ?? undefined}
              showScore
              showTooltip={false}
            />
          </div>
        </div>
      </button>
    </motion.div>
  )
}
```

---

## FILE 4: src/app/(employee)/history/page.tsx (COMPLETE)

```typescript
'use client'

import { useState, useMemo, useCallback } from 'react'
import { Download, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionSearch } from '@/components/sessions/SessionSearch'
import { HistoryFilters, DEFAULT_FILTERS } from '@/components/sessions/HistoryFilters'
import { HistorySessionCard } from '@/components/sessions/HistorySessionCard'
import { EmptyState } from '@/components/admin/EmptyState'
import { Spinner } from '@/components/ui/spinner'
import { useSessions } from '@/hooks/queries'
import { useDebounce } from '@/hooks/useDebounce'
import { useSessionStore } from '@/stores/sessionStore'
import { exportToCSV } from '@/lib/csvExport'
import { cn } from '@/lib/utils'
import type { Session, SessionFilters } from '@/types'
import type { HistoryFilterState } from '@/components/sessions/HistoryFilters'

const PAGE_SIZE = 50

/**
 * Session history page — /history
 *
 * Shows all historical sessions for the current user with:
 * - Full-text search (PostgreSQL)
 * - Filter by module, badge, date range, unresolved status
 * - Sort by date, confidence, or turn count
 * - Pagination (50 per page)
 * - CSV export of current filtered set
 *
 * Data comes from useSessions() with filters passed to the API.
 * Client-side sorting and pagination applied after fetch.
 */
export default function HistoryPage() {
  const [localFilters, setLocalFilters] = useState<HistoryFilterState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(localFilters.search, 300)

  // Build API filter params
  const apiFilters: SessionFilters = useMemo(() => {
    const filters: SessionFilters = {}
    if (debouncedSearch) filters.search = debouncedSearch
    if (localFilters.module) filters.module = localFilters.module
    if (localFilters.badge) filters.confidence_badge = localFilters.badge
    if (localFilters.unresolvedOnly) filters.is_unresolved = true

    // Date range → date_from
    if (localFilters.dateRange !== 'all') {
      const days: Record<string, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 }
      const d = new Date()
      d.setDate(d.getDate() - (days[localFilters.dateRange] ?? 0))
      filters.date_from = d.toISOString().split('T')[0]
    }

    return filters
  }, [debouncedSearch, localFilters])

  const { data: allSessions = [], isLoading, isFetching } = useSessions(apiFilters)

  // Client-side sort
  const sorted = useMemo(() => {
    const copy = [...allSessions]
    switch (localFilters.sortBy) {
      case 'confidence':
        return copy.sort(
          (a, b) => (b.avg_confidence_score ?? 0) - (a.avg_confidence_score ?? 0)
        )
      case 'turns':
        return copy.sort((a, b) => b.turn_count - a.turn_count)
      case 'date':
      default:
        return copy.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
    }
  }, [allSessions, localFilters.sortBy])

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFilterChange = useCallback(
    (changes: Partial<HistoryFilterState>) => {
      setLocalFilters((prev) => ({ ...prev, ...changes }))
      setPage(1) // Reset to page 1 on filter change
    },
    []
  )

  const handleClearAll = useCallback(() => {
    setLocalFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  // CSV export
  function handleExport() {
    exportToCSV({
      filename: 'aegis-session-history',
      columns: [
        { header: 'Topic', accessor: (s: Session) => s.topic_summary },
        { header: 'Date', accessor: (s: Session) => new Date(s.updated_at).toLocaleString('en-IN') },
        { header: 'Turns', accessor: (s: Session) => s.turn_count },
        { header: 'Avg confidence', accessor: (s: Session) => s.avg_confidence_score?.toFixed(2) ?? '' },
        { header: 'Badge', accessor: (s: Session) => s.confidence_badge ?? 'none' },
        { header: 'Modules', accessor: (s: Session) => s.module_tags.join(', ') },
        { header: 'Unresolved', accessor: (s: Session) => s.is_unresolved ? 'Yes' : 'No' },
      ],
      data: sorted,
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <History className="w-5 h-5 text-text-secondary" aria-hidden="true" />
          <h1 className="text-xl font-bold text-text-primary tracking-tight">
            Session history
          </h1>
          {isFetching && !isLoading && (
            <Spinner size="xs" className="ml-2" label="Refreshing..." />
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={sorted.length === 0}
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      {/* Search */}
      <SessionSearch
        placeholder="Search by topic, error code, or SAP module..."
        autoFocus={false}
      />

      {/* Filters */}
      <HistoryFilters
        filters={localFilters}
        onChange={handleFilterChange}
        onClearAll={handleClearAll}
        totalResults={sorted.length}
        isLoading={isLoading}
      />

      {/* Session list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="surface-card p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-bg-tertiary rounded w-3/4" />
              <div className="h-3 bg-bg-tertiary rounded w-full" />
              <div className="flex gap-4">
                <div className="h-3 bg-bg-tertiary rounded w-16" />
                <div className="h-3 bg-bg-tertiary rounded w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <EmptyState
          icon={History}
          title="No sessions found"
          description={
            debouncedSearch || localFilters.module || localFilters.badge
              ? "Try adjusting your search or filters."
              : "You haven't started any sessions yet. Go to the chat to begin."
          }
          action={
            debouncedSearch || localFilters.module ? (
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3" role="list" aria-label="Session history">
          {paginated.map((session, i) => (
            <HistorySessionCard
              key={session.id}
              session={session}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-text-tertiary tabular-nums">
            Showing{' '}
            <span className="font-medium text-text-secondary">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)}
            </span>{' '}
            of{' '}
            <span className="font-medium text-text-secondary">{sorted.length}</span>
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Previous
            </Button>
            <span className="text-xs text-text-secondary tabular-nums px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: History page loads
# → http://localhost:3000/history
# → Should show: search bar, filter row, session cards

# Step 2: Search filters results
# → Type "VL150" in search bar
# → After 300ms: list filters to only sessions containing "VL150"
# → Results count updates: "N sessions matching your filters"

# Step 3: Module filter
# → Select "SD" from Module dropdown
# → Sessions not tagged SD disappear

# Step 4: Badge filter
# → Select "🟢 High" from Confidence dropdown
# → Only green-badge sessions shown

# Step 5: Clear all
# → With active filters, "Clear all" link appears
# → Clicking it resets all filters and shows all sessions

# Step 6: Card click
# → Click a session card
# → Navigate to /?session=<id>
# → Chat page loads with that session's messages

# Step 7: Export CSV
# → Click "Export CSV"
# → Browser downloads: aegis-session-history-2024-03-28.csv
# → File contains correct columns: Topic, Date, Turns, Avg confidence, Badge, Modules

# Step 8: Pagination
# → If >50 sessions exist, pagination controls appear
# → "Previous" / "Next" navigate correctly
# → Page count shows correctly

# Step 9: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F09: Employee history — session list with search, filters, sort, pagination, CSV export"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F09*
