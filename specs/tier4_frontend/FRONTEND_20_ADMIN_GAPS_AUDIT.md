# FRONTEND_20: ADMIN KNOWLEDGE GAPS & AUDIT TRAIL
## Gap Analysis Cards and Audit Trail with Timeline/Table Toggle
## Session F13 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F13: Knowledge gaps and audit trail admin pages.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates:**
```
src/app/(admin)/admin/knowledge-gaps/
├── page.tsx
└── loading.tsx

src/app/(admin)/admin/audit-trail/
├── page.tsx
└── loading.tsx

src/components/admin/
├── GapCard.tsx              ← Individual gap analysis card
└── AuditTimeline.tsx        ← Vertical timeline view for audit entries
```

---

## KNOWLEDGE GAPS PAGE LAYOUT

```
Knowledge gaps      Unanswered query analysis
                        [7d] [30d ✓] [90d]    🔍 Search

Module: [All ▾]   Severity: [All ▾]      47 gaps · 30-day window

┌─── HIGH PRIORITY ──────────────────────────────────────────┐
│  🔴 VL150 delivery creation error                 SD        │
│  23 queries this period · Priority score: 8.4               │
│  Sample: "How do I fix VL150 in VL01N?"                     │
│          "VL150 appears when I try to create delivery..."   │
│                                    [Create document] [Hide] │
└────────────────────────────────────────────────────────────┘
┌─── MEDIUM PRIORITY ────────────────────────────────────────┐
│  🟡 YDSA scheduling agreement creation            SD        │
│  11 queries this period · Priority score: 4.1               │
│  ...                                                        │
└────────────────────────────────────────────────────────────┘
```

Gap cards are ranked by `priority_score` (frequency × recency weight from backend).
Grouped into HIGH (score > 6), MEDIUM (2–6), LOW (< 2).

---

## AUDIT TRAIL PAGE LAYOUT

```
Audit trail       Employee interaction history
                                          [Timeline] [Table]

Date: [Last 7d ▾]  Module: [All ▾]  Badge: [All ▾]

── Today ────────────────────────────────────────────────────
  │  14:32  [🟢]  "How do I fix VL150 in VL01N?"   SD-ERR-001
  │  11:15  [🟡]  "What is safety stock in SAP?"   MM-CFG-001
  │  09:40  [🔴]  "How do I process backflush?"    —

── Yesterday ────────────────────────────────────────────────
  │  16:20  [🟢]  "YDSA scheduling agreement steps" SD-PROC-01
  ...
```

Two view modes — timeline (default) and table — toggled by a button pair.
The same data renders in both views.

---

## FILE 1: src/components/admin/GapCard.tsx (COMPLETE)

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface GapEntry {
  id: string
  query_text: string
  frequency: number
  last_seen_at: string
  module_tags: string[]
  sample_queries: string[]
  priority_score: number
}

type Severity = 'high' | 'medium' | 'low'

const SEVERITY_CONFIG: Record<Severity, {
  dot: string; label: string; bg: string; border: string;
}> = {
  high:   { dot: 'bg-danger',  label: 'High priority',   bg: 'bg-danger-bg/50',  border: 'border-danger-border/40' },
  medium: { dot: 'bg-warning', label: 'Medium priority', bg: 'bg-warning-bg/50', border: 'border-warning-border/40' },
  low:    { dot: 'bg-text-tertiary', label: 'Low priority', bg: '', border: '' },
}

function getSeverity(score: number): Severity {
  if (score > 6) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

interface GapCardProps {
  entry: GapEntry
  onHide: (id: string) => void
}

/**
 * Knowledge gap analysis card.
 * Shows pattern, module, frequency, priority score, and sample queries.
 * "Create document" navigates to documents page for follow-up action.
 * "Hide" removes the card from the current view (localStorage preference).
 */
export function GapCard({ entry, onHide }: GapCardProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const severity = getSeverity(entry.priority_score)
  const config = SEVERITY_CONFIG[severity]
  const moduleTags = entry.module_tags.slice(0, 2)

  return (
    <div
      className={cn(
        'surface-card p-4 space-y-3',
        config.bg,
        config.border && `border ${config.border}`,
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {/* Severity dot */}
          <span
            className={cn('w-2.5 h-2.5 rounded-full shrink-0 mt-1', config.dot)}
            aria-label={config.label}
          />
          {/* Pattern text */}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary leading-snug">
              {entry.query_text}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {moduleTags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-semibold bg-bg-tertiary border border-border-primary text-text-secondary rounded px-1.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-text-primary tabular-nums">
            {entry.frequency}
          </p>
          <p className="text-xs text-text-tertiary">queries</p>
        </div>
      </div>

      {/* Priority score row */}
      <div className="flex items-center gap-3 text-xs text-text-tertiary">
        <span>
          Priority score:{' '}
          <span className="font-semibold text-text-secondary tabular-nums">
            {entry.priority_score.toFixed(1)}
          </span>
        </span>
        <span>·</span>
        <span>
          Last seen:{' '}
          <span className="text-text-secondary">
            {new Date(entry.last_seen_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short',
            })}
          </span>
        </span>
      </div>

      {/* Sample queries (expandable) */}
      {entry.sample_queries.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            )}
            {entry.sample_queries.length} example quer{entry.sample_queries.length === 1 ? 'y' : 'ies'}
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5 overflow-hidden"
              >
                {entry.sample_queries.slice(0, 3).map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <span className="text-text-tertiary shrink-0">·</span>
                    <span className="leading-relaxed italic">"{q}"</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-border-primary">
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push('/admin/documents')}
          className="gap-1.5"
        >
          <FileText className="w-3.5 h-3.5" />
          Create document
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onHide(entry.id)}
          className="gap-1.5 text-text-tertiary"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Hide
        </Button>
        <span className="ml-auto text-xs text-text-tertiary">{config.label}</span>
      </div>
    </div>
  )
}
```

---

## FILE 2: src/components/admin/AuditTimeline.tsx (COMPLETE)

```typescript
'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ConfidenceBadge } from '@/components/chat/ConfidenceBadge'

interface AuditEntry {
  id: string
  session_id: string
  query_text: string
  response_summary: string
  confidence_badge: string | null
  validation_score: number | null
  primary_document_id: string | null
  sap_module: string | null
  request_type: 'standard' | 'vision' | 'cached'
  created_at: string
}

interface AuditTimelineProps {
  entries: AuditEntry[]
  className?: string
}

/**
 * Vertical timeline view of audit entries.
 * Groups entries by date (Today, Yesterday, date labels).
 * Each entry shows: time, confidence badge, query preview, doc reference.
 * Clicking a row navigates to the session in the employee chat view.
 */
export function AuditTimeline({ entries, className }: AuditTimelineProps) {
  // Group entries by date label
  const grouped = useMemo(() => {
    const groups = new Map<string, AuditEntry[]>()
    for (const entry of entries) {
      const date = new Date(entry.created_at)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      let label: string
      if (date.toDateString() === today.toDateString()) label = 'Today'
      else if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday'
      else label = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(entry)
    }
    return Array.from(groups.entries())
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-16 text-sm text-text-tertiary', className)}>
        No audit entries for the selected filters
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {grouped.map(([dateLabel, dayEntries]) => (
        <div key={dateLabel}>
          {/* Date group header */}
          <div className="divider-label mb-3">
            <span className="section-label">{dateLabel}</span>
          </div>

          {/* Entries */}
          <div className="relative">
            {/* Vertical connecting line */}
            <div
              className="absolute left-[7px] top-2 bottom-2 w-px bg-border-primary"
              aria-hidden="true"
            />

            <div className="space-y-1">
              {dayEntries.map((entry) => (
                <AuditTimelineRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Individual timeline row ──────────────────────────────────

function AuditTimelineRow({ entry }: { entry: AuditEntry }) {
  const time = new Date(entry.created_at).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  const badge = entry.confidence_badge as 'green' | 'amber' | 'none' | null

  // Request type indicator
  const typeIcon = entry.request_type === 'vision'
    ? '📸'
    : entry.request_type === 'cached'
    ? '⚡'
    : null

  return (
    <Link
      href={`/?session=${entry.session_id}`}
      className={cn(
        'flex items-start gap-3 pl-5 pr-4 py-2 rounded-lg relative',
        'hover:bg-bg-secondary transition-colors group',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
      )}
    >
      {/* Timeline dot */}
      <div
        className={cn(
          'absolute left-[3px] top-3.5 w-3 h-3 rounded-full border-2 shrink-0',
          'bg-bg-card',
          badge === 'green' ? 'border-success' :
          badge === 'amber' ? 'border-warning' :
          badge === 'none'  ? 'border-danger' :
          'border-border-primary',
        )}
        aria-hidden="true"
      />

      {/* Time */}
      <span className="text-xs text-text-tertiary tabular-nums mt-0.5 shrink-0 w-16">
        {time}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-start gap-2">
          <p className="text-sm text-text-primary truncate flex-1 group-hover:text-accent transition-colors">
            {typeIcon && <span className="mr-1" aria-label={`${entry.request_type} query`}>{typeIcon}</span>}
            {entry.query_text}
          </p>
        </div>
        {entry.primary_document_id && (
          <p className="text-xs text-text-tertiary font-mono">{entry.primary_document_id}</p>
        )}
      </div>

      {/* Badge */}
      <div className="shrink-0 mt-0.5">
        <ConfidenceBadge badge={badge} showTooltip={false} size="sm" />
      </div>
    </Link>
  )
}
```

---

## FILE 3: src/app/(admin)/admin/knowledge-gaps/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function GapsLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          {['7d','30d','90d'].map((r) => <Skeleton key={r} className="h-8 w-12 rounded-lg" />)}
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 flex-1 max-w-xs rounded-lg ml-auto" />
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface-card p-4 space-y-3">
            <div className="flex justify-between">
              <div className="flex gap-2 flex-1">
                <Skeleton className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" />
                <Skeleton className="h-4 flex-1 max-w-sm" />
              </div>
              <Skeleton className="h-8 w-8 shrink-0" />
            </div>
            <Skeleton className="h-3 w-56" />
            <div className="flex gap-2 pt-1 border-t border-border-primary">
              <Skeleton className="h-8 w-32 rounded-lg" />
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 4: src/app/(admin)/admin/knowledge-gaps/page.tsx (COMPLETE)

```typescript
'use client'

import { useState, useMemo } from 'react'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { GapCard } from '@/components/admin/GapCard'
import { EmptyState } from '@/components/admin/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Badge } from '@/components/ui/badge'
import { useAdminGaps } from '@/hooks/queries'
import { useAdminStore } from '@/stores/adminStore'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { ANALYTICS_RANGES, STORAGE_KEYS } from '@/lib/constants'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const RANGE_OPTIONS = ANALYTICS_RANGES.filter((r) => r.value !== 'all')

type GapSeverity = 'high' | 'medium' | 'low'

function getSeverity(score: number): GapSeverity {
  if (score > 6) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

export default function AdminGapsPage() {
  const { gapsRangeDays, setGapsRangeDays } = useAdminStore()
  const [moduleFilter, setModuleFilter] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<GapSeverity | null>(null)
  const [search, setSearch] = useState('')

  // Hidden gap IDs stored in localStorage
  const [hiddenIds, setHiddenIds] = useLocalStorage<string[]>('aegis:hidden-gap-ids', [])

  const { data: allGaps = [], isLoading } = useAdminGaps(gapsRangeDays)

  // Available modules from data
  const modules = useMemo(
    () => Array.from(new Set(allGaps.flatMap((g) => g.module_tags))).sort(),
    [allGaps]
  )

  // Filtered + sorted gaps
  const visible = useMemo(() => {
    let result = allGaps.filter((g) => !hiddenIds.includes(g.id))
    if (moduleFilter) result = result.filter((g) => g.module_tags.includes(moduleFilter))
    if (severityFilter) result = result.filter((g) => getSeverity(g.priority_score) === severityFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (g) => g.query_text.toLowerCase().includes(q) ||
          g.sample_queries.some((sq) => sq.toLowerCase().includes(q))
      )
    }
    return result.sort((a, b) => b.priority_score - a.priority_score)
  }, [allGaps, hiddenIds, moduleFilter, severityFilter, search])

  // Group into severity bands
  const high   = visible.filter((g) => getSeverity(g.priority_score) === 'high')
  const medium = visible.filter((g) => getSeverity(g.priority_score) === 'medium')
  const low    = visible.filter((g) => getSeverity(g.priority_score) === 'low')

  function handleHide(id: string) {
    setHiddenIds((prev) => [...prev, id])
  }

  const currentRange = RANGE_OPTIONS.find((r) => r.days === gapsRangeDays)

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Knowledge gaps"
        description="Query patterns AEGIS could not answer confidently"
        actions={
          <div className="flex items-center gap-1.5">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setGapsRangeDays(r.days ?? 30)}
                className={cn(
                  'text-xs font-medium px-3 h-8 rounded-lg border transition-colors',
                  gapsRangeDays === r.days
                    ? 'bg-accent-subtle border-border-focus text-accent-text'
                    : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Filters row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {/* Module filter */}
        <select
          value={moduleFilter ?? ''}
          onChange={(e) => setModuleFilter(e.target.value || null)}
          className="h-8 px-3 rounded-lg bg-bg-secondary border border-border-primary text-sm text-text-secondary focus:outline-none focus:border-border-focus"
          aria-label="Filter by module"
        >
          <option value="">All modules</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Severity filter */}
        {(['high', 'medium', 'low'] as const).map((sev) => (
          <button
            key={sev}
            onClick={() => setSeverityFilter(sev === severityFilter ? null : sev)}
            className={cn(
              'text-xs font-medium px-3 h-8 rounded-lg border capitalize transition-colors',
              severityFilter === sev
                ? sev === 'high'   ? 'bg-danger-bg  border-danger-border  text-danger-text'
                : sev === 'medium' ? 'bg-warning-bg border-warning-border text-warning-text'
                : 'bg-bg-tertiary border-border-secondary text-text-secondary'
                : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary',
            )}
          >
            {sev}
          </button>
        ))}

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gap patterns..."
            className="h-8 pl-8 pr-3 w-64 rounded-lg bg-bg-secondary border border-border-primary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus"
          />
        </div>
      </div>

      {/* Results summary */}
      <p className="text-xs text-text-tertiary mb-4">
        {visible.length} gap{visible.length !== 1 ? 's' : ''} in {currentRange?.label ?? `${gapsRangeDays}-day`} window
        {hiddenIds.length > 0 && (
          <button
            onClick={() => setHiddenIds([])}
            className="ml-3 underline hover:text-text-secondary transition-colors"
          >
            Show {hiddenIds.length} hidden
          </button>
        )}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No gaps found"
          description="No unanswered query patterns in the selected time window and filters."
          variant="page"
        />
      ) : (
        <ErrorBoundary section="gap cards">
          <div className="space-y-4">
            {high.length > 0 && (
              <GapSection title="High priority" count={high.length} entries={high} onHide={handleHide} />
            )}
            {medium.length > 0 && (
              <GapSection title="Medium priority" count={medium.length} entries={medium} onHide={handleHide} />
            )}
            {low.length > 0 && (
              <GapSection title="Low priority" count={low.length} entries={low} onHide={handleHide} />
            )}
          </div>
        </ErrorBoundary>
      )}
    </AdminPageWrapper>
  )
}

function GapSection({ title, count, entries, onHide }: {
  title: string
  count: number
  entries: any[]
  onHide: (id: string) => void
}) {
  return (
    <div>
      <p className="section-label mb-2 flex items-center gap-2">
        {title}
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-bg-tertiary border border-border-primary text-text-tertiary text-[10px] font-bold">
          {count}
        </span>
      </p>
      <div className="space-y-3">
        {entries.map((entry) => (
          <GapCard key={entry.id} entry={entry} onHide={onHide} />
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 5: src/app/(admin)/admin/audit-trail/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function AuditLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-lg" />)}
      </div>
      {/* Timeline skeleton */}
      <div className="space-y-6">
        {['Today', 'Yesterday'].map((label) => (
          <div key={label} className="space-y-1">
            <Skeleton className="h-2.5 w-20 mb-3" />
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 pl-5 py-2">
                <Skeleton className="h-2.5 w-16 shrink-0" />
                <Skeleton className="h-3 flex-1 max-w-md" />
                <Skeleton className="h-5 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 6: src/app/(admin)/admin/audit-trail/page.tsx (COMPLETE)

```typescript
'use client'

import { useState, useMemo } from 'react'
import { LayoutList, Clock, Download } from 'lucide-react'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AuditTimeline } from '@/components/admin/AuditTimeline'
import { DataTable, type ColumnDef } from '@/components/admin/DataTable'
import { FilterChips, type FilterChip } from '@/components/admin/FilterChips'
import { ConfidenceBadge } from '@/components/chat/ConfidenceBadge'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Button } from '@/components/ui/button'
import { useAdminAuditTrail } from '@/hooks/queries'
import { useAdminStore } from '@/stores/adminStore'
import { exportToCSV } from '@/lib/csvExport'
import { cn } from '@/lib/utils'

type ViewMode = 'timeline' | 'table'

// Date range options for filter
const DATE_RANGES = [
  { label: 'Today',        value: 'today',  days: 1  },
  { label: 'Last 7 days',  value: '7d',     days: 7  },
  { label: 'Last 30 days', value: '30d',    days: 30 },
  { label: 'Last 90 days', value: '90d',    days: 90 },
]

const TABLE_COLUMNS: ColumnDef<any>[] = [
  {
    id: 'created_at',
    header: 'Time',
    cell: (row) => (
      <span className="text-xs text-text-secondary tabular-nums">
        {new Date(row.created_at).toLocaleString('en-IN', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })}
      </span>
    ),
    sortable: true,
    width: '150px',
  },
  {
    id: 'query_text',
    header: 'Query',
    cell: (row) => (
      <p className="text-sm text-text-primary line-clamp-2 max-w-sm">{row.query_text}</p>
    ),
    sortable: false,
  },
  {
    id: 'confidence_badge',
    header: 'Badge',
    cell: (row) => (
      <ConfidenceBadge badge={row.confidence_badge} showTooltip={false} size="sm" />
    ),
    width: '130px',
  },
  {
    id: 'primary_document_id',
    header: 'Document',
    cell: (row) => (
      <span className="font-mono text-xs text-text-tertiary">
        {row.primary_document_id ?? '—'}
      </span>
    ),
    width: '130px',
  },
  {
    id: 'request_type',
    header: 'Type',
    cell: (row) => (
      <span className="text-xs text-text-tertiary capitalize">{row.request_type}</span>
    ),
    width: '80px',
  },
]

export default function AdminAuditTrailPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [dateRange, setDateRange] = useState('7d')
  const [moduleFilter, setModuleFilter] = useState<string | null>(null)
  const [badgeFilter, setBadgeFilter] = useState<string | null>(null)

  const { auditFilters, setAuditFilters } = useAdminStore()

  // Build date_from from selected range
  const dateFrom = useMemo(() => {
    const range = DATE_RANGES.find((r) => r.value === dateRange)
    if (!range) return undefined
    const d = new Date()
    d.setDate(d.getDate() - range.days)
    return d.toISOString().split('T')[0]
  }, [dateRange])

  const { data: entries = [], isLoading } = useAdminAuditTrail({
    date_from: dateFrom,
    module: moduleFilter ?? undefined,
    confidence_badge: badgeFilter as any ?? undefined,
  })

  // Filter chips
  const chips: FilterChip[] = [
    ...(moduleFilter ? [{ id: 'module', label: 'Module', value: moduleFilter }] : []),
    ...(badgeFilter ? [{ id: 'badge', label: 'Badge', value: badgeFilter }] : []),
  ]

  function handleExport() {
    exportToCSV({
      filename: 'aegis-audit-trail',
      columns: [
        { header: 'Time',           accessor: (r: any) => new Date(r.created_at).toLocaleString('en-IN') },
        { header: 'Query',          accessor: (r: any) => r.query_text },
        { header: 'Badge',          accessor: (r: any) => r.confidence_badge ?? 'none' },
        { header: 'Score',          accessor: (r: any) => r.validation_score?.toFixed(3) ?? '' },
        { header: 'Document',       accessor: (r: any) => r.primary_document_id ?? '' },
        { header: 'Module',         accessor: (r: any) => r.sap_module ?? '' },
        { header: 'Request type',   accessor: (r: any) => r.request_type },
      ],
      data: entries,
    })
  }

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Audit trail"
        description="Employee interaction history"
        actions={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border-primary overflow-hidden bg-bg-secondary">
              <button
                onClick={() => setViewMode('timeline')}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-9 text-xs font-medium transition-colors',
                  viewMode === 'timeline'
                    ? 'bg-bg-card text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
                aria-pressed={viewMode === 'timeline'}
              >
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                Timeline
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-9 text-xs font-medium transition-colors border-l border-border-primary',
                  viewMode === 'table'
                    ? 'bg-bg-card text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
                aria-pressed={viewMode === 'table'}
              >
                <LayoutList className="w-3.5 h-3.5" aria-hidden="true" />
                Table
              </button>
            </div>

            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {/* Date range */}
        {DATE_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setDateRange(r.value)}
            className={cn(
              'text-xs font-medium px-3 h-8 rounded-lg border transition-colors',
              dateRange === r.value
                ? 'bg-accent-subtle border-border-focus text-accent-text'
                : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary',
            )}
          >
            {r.label}
          </button>
        ))}

        {/* Badge filter */}
        <select
          value={badgeFilter ?? ''}
          onChange={(e) => setBadgeFilter(e.target.value || null)}
          className="h-8 px-3 rounded-lg bg-bg-secondary border border-border-primary text-sm text-text-secondary focus:outline-none focus:border-border-focus ml-2"
          aria-label="Filter by confidence badge"
        >
          <option value="">All badges</option>
          <option value="green">🟢 High</option>
          <option value="amber">🟡 Moderate</option>
          <option value="none">🔴 Insufficient</option>
        </select>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <FilterChips
          chips={chips}
          onRemove={(id) => {
            if (id === 'module') setModuleFilter(null)
            if (id === 'badge') setBadgeFilter(null)
          }}
          className="mb-3"
        />
      )}

      {/* Results count */}
      {!isLoading && (
        <p className="text-xs text-text-tertiary mb-4">
          <span className="font-medium text-text-secondary">{entries.length}</span> entries
        </p>
      )}

      {/* Content: timeline or table */}
      <ErrorBoundary section="audit trail">
        {viewMode === 'timeline' ? (
          <AuditTimeline entries={entries} />
        ) : (
          <DataTable
            data={entries}
            columns={TABLE_COLUMNS}
            keyField="id"
            isLoading={isLoading}
            emptyTitle="No entries found"
            emptyDescription="No audit entries match your current filters."
            sortState={null}
            onSortChange={() => {}}
            aria-label="Audit trail table"
          />
        )}
      </ErrorBoundary>
    </AdminPageWrapper>
  )
}
```

---

## VERIFICATION STEPS

```bash
# Knowledge Gaps
# Step 1: Gap cards render with severity grouping
# → High priority section: red dots
# → Medium: amber dots
# → Low: gray dots
# → Sorted by priority_score within each group

# Step 2: Expand sample queries
# → Click "N example queries" → animates open showing sample questions

# Step 3: "Create document" navigates to documents page
# Step 4: "Hide" removes card; "Show N hidden" link restores

# Audit Trail
# Step 5: Timeline view shows entries grouped by date
# → Each entry has connecting vertical line
# → Colored dots match confidence badge (green/amber/red)
# → Click entry → navigates to /?session=<id>

# Step 6: Switch to table view
# → Toggle "Table" button → DataTable renders same data
# → Toggle back → timeline returns

# Step 7: Date range filter
# → "Today" → only today's entries
# → "Last 7 days" → entries from past week

# Step 8: CSV export
# → Exports all currently filtered entries

npx tsc --noEmit  # Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F13: Gaps + audit trail — GapCard, AuditTimeline, gap priority grouping, timeline/table toggle"
```

---
## QUICK ENTRY INTEGRATION (Added in IMPL_29)

GapCard receives two new props:
  addressed_by_entry_id: string | null
  addressed_entry_title: string | null

These come from a backend join on the gaps list endpoint.
The backend must join knowledge_form_entries on gap_id to populate these.

Rendering rules:

  If addressed_by_entry_id is NULL:
    Show [Create Quick Entry] secondary button in the card footer.
    Button text: "Create Quick Entry for this gap"
    On click: navigate to /admin/quick-entry/new with URL query params:
      ?gap_id={gap.id}
      &issue_description={encodeURIComponent(gap.query_pattern)}
      &module={gap.module}
    The Quick Entry form reads these params at mount and pre-populates fields.
    Styling: outline variant, small size — not the primary CTA.

  If addressed_by_entry_id is NOT NULL:
    Show green badge in card footer:
    "✓ Addressed by {addressed_entry_title}"
    On hover: tooltip shows "Created {addressed_at relative time}"
    No Create Quick Entry button shown when badge is present.
    Clicking badge navigates to: /admin/quick-entry/{addressed_by_entry_id}

Backend gaps list endpoint change needed:
  JOIN knowledge_form_entries kfe ON kfe.gap_id = ge.id AND kfe.status = 'active'
  Return: addressed_by_entry_id, addressed_entry_title (from form_data title field)


---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F13*
