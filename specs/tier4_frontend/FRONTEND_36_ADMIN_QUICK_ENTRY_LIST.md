# FRONTEND_36 — ADMIN QUICK ENTRY: LIST PAGE
## AEGIS SAP Helpdesk AI — Quick Entry List and Navigation
## Depends on: IMPL_23, IMPL_24, IMPL_25, FRONTEND_16, FRONTEND_MASTER_REFERENCE

---

## 1. OVERVIEW

This document specifies the Quick Entry list page — the primary landing page
for IT admins managing knowledge form entries. It covers:
- Page route and navigation
- All list components and card variants
- Filter, search, and pagination UI
- Coverage search (pre-creation knowledge check)
- Badge state rendering for every possible entry status
- TanStack Query hooks for list operations
- All empty states, loading states, and error states

The list page is at `/admin/quick-entry`.
All components follow the existing AEGIS design system (FRONTEND_01, FRONTEND_03).

---

## 2. FILE STRUCTURE

```
src/
└── app/
    └── admin/
        └── quick-entry/
            ├── page.tsx                  ← list page (this document)
            ├── new/
            │   └── page.tsx              ← new entry (FRONTEND_37)
            └── [id]/
                ├── page.tsx              ← edit entry (FRONTEND_37)
                └── layout.tsx            ← entry layout wrapper

src/
└── components/
    └── quick-entry/
        ├── QuickEntryListCard.tsx        ← entry card (this document)
        ├── QuickEntryStatusBadge.tsx     ← status badge
        ├── QuickEntrySourceBadge.tsx     ← source type badge (coverage search)
        ├── QuickEntryFeedbackBadge.tsx   ← feedback indicator
        ├── CoverageSearchBar.tsx         ← pre-creation search
        ├── CoverageSearchResults.tsx     ← search results dropdown
        └── QuickEntryFilters.tsx         ← filter controls
```

---

## 3. ROUTE REGISTRATION

Add to `ADMIN_NAV_ITEMS` constant in `src/lib/constants.ts`:
```typescript
// After the existing Documents nav item:
{ label: 'Quick Entry', href: '/admin/quick-entry', icon: 'PenLine' }
```

Add to admin sidebar rendering in `AdminShell.tsx` (FRONTEND_16) — the
existing `ADMIN_NAV_ITEMS` map handles rendering automatically if the constant
is updated.

---

## 4. PAGE COMPONENT

**File:** `src/app/admin/quick-entry/page.tsx`

```typescript
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PenLine, Plus, Search, X, Filter } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { QuickEntryListCard } from '@/components/quick-entry/QuickEntryListCard'
import { QuickEntryFilters } from '@/components/quick-entry/QuickEntryFilters'
import { CoverageSearchBar } from '@/components/quick-entry/CoverageSearchBar'
import { useQuickEntryList } from '@/hooks/useQuickEntry'
import { useDebounce } from '@/hooks/useDebounce'
import { QuickEntryListSkeleton } from '@/components/quick-entry/QuickEntryListCard'

export default function QuickEntryListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Filter state ──────────────────────────────────────────────────────
  const [search, setSearch]             = useState(searchParams.get('search') ?? '')
  const [moduleFilter, setModuleFilter] = useState(searchParams.get('module') ?? '')
  const [typeFilter, setTypeFilter]     = useState(searchParams.get('content_type') ?? '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage]                 = useState(1)

  // ── Coverage search state ─────────────────────────────────────────────
  const [showCoverageSearch, setShowCoverageSearch] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  // ── Data ──────────────────────────────────────────────────────────────
  const { data, isLoading, isError, isFetching } = useQuickEntryList({
    search:           debouncedSearch,
    module:           moduleFilter,
    content_type:     typeFilter,
    status:           statusFilter,
    include_archived: includeArchived,
    page,
    page_size:        20,
  })

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, moduleFilter, typeFilter, statusFilter])

  const handleNewEntry = useCallback(() => {
    if (showCoverageSearch) {
      // Coverage search visible — scroll to it as a reminder
      document.getElementById('coverage-search')?.scrollIntoView({ behavior: 'smooth' })
    } else {
      router.push('/admin/quick-entry/new')
    }
  }, [showCoverageSearch, router])

  const hasActiveFilters = Boolean(
    debouncedSearch || moduleFilter || typeFilter ||
    (statusFilter && statusFilter !== '') || includeArchived
  )

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PenLine size={20} className="text-[var(--color-accent)]" />
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Quick Entry
            </h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Structured knowledge entries — no document required
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCoverageSearch(v => !v)}
            aria-expanded={showCoverageSearch}
          >
            <Search size={14} className="mr-1.5" />
            Check coverage first
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push('/admin/quick-entry/new')}
          >
            <Plus size={14} className="mr-1.5" />
            New Entry
          </Button>
        </div>
      </div>

      {/* ── Coverage search (conditional) ───────────────────────────── */}
      {showCoverageSearch && (
        <div
          id="coverage-search"
          className="px-6 py-4 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)]"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Check existing knowledge before creating
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Searches all Quick Entries and uploaded documents
              </p>
            </div>
            <button
              onClick={() => setShowCoverageSearch(false)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <X size={16} />
            </button>
          </div>
          <CoverageSearchBar onNavigateToNew={() => router.push('/admin/quick-entry/new')} />
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-[var(--color-border)]">
        <QuickEntryFilters
          search={search}
          onSearchChange={setSearch}
          moduleFilter={moduleFilter}
          onModuleChange={setModuleFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          includeArchived={includeArchived}
          onIncludeArchivedChange={setIncludeArchived}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={() => {
            setSearch('')
            setModuleFilter('')
            setTypeFilter('')
            setStatusFilter('')
            setIncludeArchived(false)
          }}
          resultCount={data?.total ?? null}
          isFetching={isFetching}
        />
      </div>

      {/* ── List body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && <QuickEntryListSkeleton count={6} />}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[var(--color-text-muted)] text-sm">
              Failed to load Quick Entry list. Please refresh.
            </p>
          </div>
        )}

        {!isLoading && !isError && data?.entries.length === 0 && (
          <QuickEntryEmptyState
            hasFilters={hasActiveFilters}
            onClearFilters={() => {
              setSearch('')
              setModuleFilter('')
              setTypeFilter('')
              setStatusFilter('')
            }}
            onNewEntry={() => router.push('/admin/quick-entry/new')}
          />
        )}

        {!isLoading && !isError && data && data.entries.length > 0 && (
          <div className="flex flex-col gap-3">
            {data.entries.map(entry => (
              <QuickEntryListCard
                key={entry.id}
                entry={entry}
                onEdit={() => router.push(`/admin/quick-entry/${entry.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="xs"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >Previous</Button>
            <span className="text-xs text-[var(--color-text-muted)]">
              {page} / {data.total_pages}
            </span>
            <Button
              variant="outline" size="xs"
              disabled={page >= data.total_pages}
              onClick={() => setPage(p => p + 1)}
            >Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## 5. QUICKENTRYLISTCARD COMPONENT

**File:** `src/components/quick-entry/QuickEntryListCard.tsx`

```typescript
'use client'

import { useState } from 'react'
import {
  FileText, Settings, List, Calendar, Camera,
  AlertTriangle, ChevronRight, MoreVertical,
  ThumbsDown, Clock, CheckCircle
} from 'lucide-react'
import type { QuickEntryListItem } from '@/types'
import { QuickEntryStatusBadge } from './QuickEntryStatusBadge'
import { QuickEntryFeedbackBadge } from './QuickEntryFeedbackBadge'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { formatRelativeDate } from '@/lib/utils'
import { CONTENT_TYPE_LABELS, MODULE_LABELS } from '@/lib/constants'

interface Props {
  entry: QuickEntryListItem
  onEdit: () => void
}

const CONTENT_TYPE_ICONS = {
  error_guide: FileText,
  procedure:   List,
  config:      Settings,
}

export function QuickEntryListCard({ entry, onEdit }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  const Icon = CONTENT_TYPE_ICONS[entry.content_type] ?? FileText

  // Determine card highlight state
  const isAttentionNeeded = (
    entry.status === 'review_required' ||
    entry.status === 'partial_index' ||
    entry.has_failed_screenshots ||
    entry.feedback_summary.net < -2
  )

  const isActionRequired = (
    entry.status === 'failed' ||
    entry.status === 'low_quality'
  )

  return (
    <div
      className={[
        'group relative flex items-start gap-3 px-4 py-3 rounded-lg border',
        'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]',
        'transition-colors duration-150 cursor-pointer',
        isActionRequired
          ? 'border-[var(--color-danger-border)]'
          : isAttentionNeeded
            ? 'border-[var(--color-warning-border)]'
            : 'border-[var(--color-border)]',
      ].join(' ')}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onEdit()}
      aria-label={`Edit Quick Entry: ${entry.issue_title}`}
    >
      {/* Content type icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-md bg-[var(--color-surface-elevated)] flex items-center justify-center mt-0.5">
        <Icon size={14} className="text-[var(--color-text-muted)]" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Title and status badge */}
        <div className="flex items-start gap-2 mb-1">
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate flex-1">
            {entry.issue_title || entry.document_id}
          </span>
          <QuickEntryStatusBadge status={entry.status} />
        </div>

        {/* Row 2: Meta info */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--color-text-muted)]">
          <span className="font-mono text-[10px] bg-[var(--color-surface-elevated)] px-1.5 py-0.5 rounded">
            {entry.document_id}
          </span>
          <span>{MODULE_LABELS[entry.module] ?? entry.module}</span>
          <span>{CONTENT_TYPE_LABELS[entry.content_type]}</span>
          <span>v{entry.version}</span>
          <span>Verified: {entry.verified_by_name} · {entry.verified_date}</span>
        </div>

        {/* Row 3: Badges row */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Chunk count */}
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {entry.chunk_count} chunks
          </span>

          {/* Screenshot badge */}
          {entry.screenshot_count > 0 && (
            <span className={[
              'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded',
              entry.has_failed_screenshots
                ? 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]'
            ].join(' ')}>
              <Camera size={9} />
              {entry.screenshot_count}
              {entry.has_failed_screenshots && ' — vision failed'}
            </span>
          )}

          {/* Review date badge for config entries */}
          {entry.next_review_date && (
            <ReviewDateBadge
              nextReviewDate={entry.next_review_date}
              status={entry.status}
            />
          )}

          {/* Knowledge Gap badge */}
          {entry.gap_id && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
              From gap
            </span>
          )}

          {/* Feedback badge */}
          <QuickEntryFeedbackBadge summary={entry.feedback_summary} />

          {/* Partial index warning */}
          {entry.status === 'partial_index' && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-warning-subtle)] text-[var(--color-warning)]">
              <AlertTriangle size={9} />
              Partial index
            </span>
          )}
        </div>
      </div>

      {/* Right: Updated time + chevron */}
      <div className="flex-shrink-0 flex flex-col items-end gap-2 pl-2">
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {formatRelativeDate(entry.updated_at)}
        </span>
        <ChevronRight
          size={14}
          className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors"
        />
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function ReviewDateBadge({
  nextReviewDate, status
}: {
  nextReviewDate: string
  status: string
}) {
  const reviewDate = new Date(nextReviewDate)
  const today = new Date()
  const daysUntilReview = Math.ceil(
    (reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (status === 'review_required') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-warning-subtle)] text-[var(--color-warning)] font-medium">
        <Clock size={9} />
        Review overdue
      </span>
    )
  }

  if (daysUntilReview <= 14) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-warning-subtle)] text-[var(--color-warning)]">
        <Calendar size={9} />
        Review in {daysUntilReview}d
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">
      <Calendar size={9} />
      Review {nextReviewDate}
    </span>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────

export function QuickEntryListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <div className="w-8 h-8 rounded-md bg-[var(--color-skeleton)] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[var(--color-skeleton)] rounded w-3/5 animate-pulse" />
            <div className="h-3 bg-[var(--color-skeleton)] rounded w-2/5 animate-pulse" />
            <div className="h-3 bg-[var(--color-skeleton)] rounded w-1/4 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## 6. STATUS BADGE COMPONENT

**File:** `src/components/quick-entry/QuickEntryStatusBadge.tsx`

Every possible status with its visual variant:

```typescript
import type { QuickEntryStatus } from '@/types'

interface Props { status: QuickEntryStatus; size?: 'sm' | 'xs' }

const STATUS_CONFIG: Record<QuickEntryStatus, {
  label:  string
  color:  string  // CSS variable references
}> = {
  draft:          { label: 'Draft',          color: 'text-[var(--color-text-muted)] bg-[var(--color-surface-elevated)]' },
  processing:     { label: 'Processing…',    color: 'text-[var(--color-accent)] bg-[var(--color-accent-subtle)] animate-pulse' },
  active:         { label: 'Active',         color: 'text-[var(--color-success)] bg-[var(--color-success-subtle)]' },
  archived:       { label: 'Archived',       color: 'text-[var(--color-text-muted)] bg-[var(--color-surface-elevated)] line-through' },
  low_quality:    { label: 'Low quality',    color: 'text-[var(--color-danger)] bg-[var(--color-danger-subtle)]' },
  failed:         { label: 'Failed',         color: 'text-[var(--color-danger)] bg-[var(--color-danger-subtle)] font-medium' },
  partial_index:  { label: 'Partial index',  color: 'text-[var(--color-warning)] bg-[var(--color-warning-subtle)]' },
  review_required:{ label: 'Review required',color: 'text-[var(--color-warning)] bg-[var(--color-warning-subtle)] font-medium' },
}

export function QuickEntryStatusBadge({ status, size = 'xs' }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG['draft']
  return (
    <span className={[
      'inline-flex items-center px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0',
      size === 'xs' ? 'text-[10px]' : 'text-xs',
      config.color,
    ].join(' ')}>
      {config.label}
    </span>
  )
}
```

---

## 7. FEEDBACK BADGE COMPONENT

**File:** `src/components/quick-entry/QuickEntryFeedbackBadge.tsx`

```typescript
import type { FeedbackSummary } from '@/types'

export function QuickEntryFeedbackBadge({ summary }: { summary: FeedbackSummary }) {
  const { positive, negative, net } = summary

  // Only show badge if there is any feedback
  if (positive === 0 && negative === 0) return null

  // Threshold exceeded: net negative
  if (net < -1) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-danger-subtle)] text-[var(--color-danger)]">
        {negative} negative (30d)
      </span>
    )
  }

  // Healthy feedback
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">
      {positive > 0 && `${positive}↑`}
      {negative > 0 && ` ${negative}↓`}
    </span>
  )
}
```

---

## 8. FILTER COMPONENT

**File:** `src/components/quick-entry/QuickEntryFilters.tsx`

```typescript
import { Search, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { MODULES, CONTENT_TYPE_OPTIONS, QUICK_ENTRY_STATUS_OPTIONS } from '@/lib/constants'

// CONTENT_TYPE_OPTIONS for filter:
// [{ value: '', label: 'All types' }, { value: 'error_guide', label: 'Error Guide' },
//  { value: 'procedure', label: 'Procedure' }, { value: 'config', label: 'Config Reference' }]

// QUICK_ENTRY_STATUS_OPTIONS for filter:
// [{ value: '', label: 'All statuses' }, { value: 'draft', label: 'Draft' },
//  { value: 'active', label: 'Active' }, { value: 'processing', label: 'Processing' },
//  { value: 'review_required', label: 'Review required' }, ...]

interface Props {
  search: string
  onSearchChange: (v: string) => void
  moduleFilter: string
  onModuleChange: (v: string) => void
  typeFilter: string
  onTypeChange: (v: string) => void
  statusFilter: string
  onStatusChange: (v: string) => void
  includeArchived: boolean
  onIncludeArchivedChange: (v: boolean) => void
  hasActiveFilters: boolean
  onClearFilters: () => void
  resultCount: number | null
  isFetching: boolean
}

export function QuickEntryFilters({
  search, onSearchChange,
  moduleFilter, onModuleChange,
  typeFilter, onTypeChange,
  statusFilter, onStatusChange,
  includeArchived, onIncludeArchivedChange,
  hasActiveFilters, onClearFilters,
  resultCount, isFetching,
}: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <input
          type="text"
          placeholder="Search by ID or title…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-muted)]"
        />
      </div>

      {/* Module filter */}
      <select
        value={moduleFilter}
        onChange={e => onModuleChange(e.target.value)}
        className="text-xs py-1.5 px-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        <option value="">All modules</option>
        {['FI','MM','SD','HR','PP','CO','BASIS'].map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      {/* Type filter */}
      <select
        value={typeFilter}
        onChange={e => onTypeChange(e.target.value)}
        className="text-xs py-1.5 px-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        <option value="">All types</option>
        <option value="error_guide">Error Guide</option>
        <option value="procedure">Procedure</option>
        <option value="config">Config Reference</option>
      </select>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={e => onStatusChange(e.target.value)}
        className="text-xs py-1.5 px-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="processing">Processing</option>
        <option value="review_required">Review required</option>
        <option value="partial_index">Partial index</option>
        <option value="failed">Failed</option>
        <option value="low_quality">Low quality</option>
      </select>

      {/* Include archived checkbox */}
      <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={e => onIncludeArchivedChange(e.target.checked)}
          className="rounded border-[var(--color-border)]"
        />
        Archived
      </label>

      {/* Result count + loading */}
      <div className="ml-auto flex items-center gap-2">
        {isFetching && <Loader2 size={12} className="animate-spin text-[var(--color-text-muted)]" />}
        {resultCount !== null && (
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {resultCount} result{resultCount !== 1 ? 's' : ''}
          </span>
        )}
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-[10px] text-[var(--color-accent)] hover:underline flex items-center gap-1"
          >
            <X size={10} />
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
```

---

## 9. COVERAGE SEARCH COMPONENTS

**File:** `src/components/quick-entry/CoverageSearchBar.tsx`

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, ExternalLink } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { useCoverageSearch } from '@/hooks/useQuickEntry'
import { QuickEntrySourceBadge } from './QuickEntrySourceBadge'

interface Props {
  onNavigateToNew: () => void
  initialModule?: string
}

export function CoverageSearchBar({ onNavigateToNew, initialModule }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [module, setModule] = useState(initialModule ?? '')
  const [showResults, setShowResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 400)

  const { data, isLoading } = useCoverageSearch(
    { query: debouncedQuery, module },
    { enabled: debouncedQuery.length >= 3 }
  )

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          {isLoading
            ? <Loader2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] animate-spin" />
            : <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          }
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowResults(true) }}
            onFocus={() => query.length >= 3 && setShowResults(true)}
            placeholder="Describe the issue or topic you want to add knowledge for…"
            className="w-full pl-7 pr-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        {/* Module filter for coverage search */}
        <select
          value={module}
          onChange={e => setModule(e.target.value)}
          className="text-xs py-2 px-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
        >
          <option value="">All modules</option>
          {['FI','MM','SD','HR','PP','CO','BASIS'].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Proceed anyway button */}
        <button
          onClick={onNavigateToNew}
          className="text-xs text-[var(--color-accent)] hover:underline whitespace-nowrap"
        >
          Create new entry →
        </button>
      </div>

      {/* Results dropdown */}
      {showResults && data && data.results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <p className="text-[10px] text-[var(--color-text-muted)]">
              {data.results.length} similar entries found across {data.total_searched.toLocaleString()} knowledge chunks
            </p>
          </div>
          {data.results.map(result => (
            <div
              key={result.document_id}
              className="px-3 py-2.5 hover:bg-[var(--color-surface)] border-b border-[var(--color-border)] last:border-0 cursor-pointer"
              onClick={() => {
                setShowResults(false)
                router.push(`/admin/quick-entry?search=${encodeURIComponent(result.document_id)}`)
              }}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {result.title}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)] flex-shrink-0">
                      {result.document_id}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                    {result.preview}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <QuickEntrySourceBadge sourceType={result.source_type} />
                    <span className="text-[10px] text-[var(--color-text-muted)]">{result.module}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{result.status}</span>
                    <span className="text-[10px] text-[var(--color-accent)]">
                      {Math.round(result.similarity_score * 100)}% similar
                    </span>
                  </div>
                </div>
                <ExternalLink size={12} className="flex-shrink-0 text-[var(--color-text-muted)] mt-1" />
              </div>
            </div>
          ))}
          <div className="px-3 py-2 border-t border-[var(--color-border)]">
            <button
              onClick={onNavigateToNew}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              These don't cover my topic — Create new entry anyway →
            </button>
          </div>
        </div>
      )}

      {/* No results */}
      {showResults && debouncedQuery.length >= 3 && !isLoading && data?.results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 px-4 py-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            No existing knowledge found for this topic.
          </p>
          <button
            onClick={onNavigateToNew}
            className="text-xs text-[var(--color-accent)] hover:underline mt-1"
          >
            Create a new entry →
          </button>
        </div>
      )}
    </div>
  )
}
```

**File:** `src/components/quick-entry/QuickEntrySourceBadge.tsx`

```typescript
export function QuickEntrySourceBadge({ sourceType }: { sourceType: 'form_entry' | 'document' }) {
  if (sourceType === 'form_entry') {
    return (
      <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
        Quick Entry
      </span>
    )
  }
  return (
    <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">
      Document
    </span>
  )
}
```

---

## 10. EMPTY STATE COMPONENT

```typescript
function QuickEntryEmptyState({
  hasFilters,
  onClearFilters,
  onNewEntry,
}: {
  hasFilters: boolean
  onClearFilters: () => void
  onNewEntry: () => void
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Search size={32} className="text-[var(--color-text-muted)] mb-3" />
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
          No entries match your filters
        </p>
        <button
          onClick={onClearFilters}
          className="text-xs text-[var(--color-accent)] hover:underline"
        >
          Clear all filters
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <PenLine size={36} className="text-[var(--color-text-muted)] mb-4" />
      <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
        No Quick Entries yet
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mb-4 max-w-sm">
        Quick Entry lets you add knowledge directly through a form —
        no document required.
      </p>
      <button
        onClick={onNewEntry}
        className="text-sm text-[var(--color-accent)] hover:underline flex items-center gap-1"
      >
        <Plus size={14} />
        Create your first Quick Entry
      </button>
    </div>
  )
}
```

---

## 11. TANSTACK QUERY HOOKS

**File:** `src/hooks/useQuickEntry.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  QuickEntryListItem, QuickEntryFull,
  DuplicateCheckResult, QuickEntryPipelineHealth
} from '@/types'
import { apiClient } from '@/lib/apiClient'

// ── Query keys ────────────────────────────────────────────────────────────

export const quickEntryKeys = {
  all:      () => ['quick-entry'] as const,
  lists:    () => [...quickEntryKeys.all(), 'list'] as const,
  list:     (filters: object) => [...quickEntryKeys.lists(), filters] as const,
  detail:   (id: string) => [...quickEntryKeys.all(), 'detail', id] as const,
  versions: (id: string) => [...quickEntryKeys.all(), 'versions', id] as const,
  feedback: (id: string) => [...quickEntryKeys.all(), 'feedback', id] as const,
  coverage: (query: string, module: string) => [...quickEntryKeys.all(), 'coverage', query, module] as const,
  health:   () => [...quickEntryKeys.all(), 'health'] as const,
}

// ── List hook ──────────────────────────────────────────────────────────────

interface ListParams {
  search?: string; module?: string; content_type?: string
  status?: string; include_archived?: boolean; page?: number; page_size?: number
}

export function useQuickEntryList(params: ListParams) {
  return useQuery({
    queryKey: quickEntryKeys.list(params),
    queryFn: () => apiClient.get<{
      entries: QuickEntryListItem[]; total: number; page: number;
      page_size: number; total_pages: number
    }>('/api/admin/knowledge-entries', { params }),
    staleTime: 30_000,
  })
}

// ── Single entry hook ──────────────────────────────────────────────────────

export function useQuickEntry(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: quickEntryKeys.detail(id),
    queryFn: () => apiClient.get<QuickEntryFull>(`/api/admin/knowledge-entries/${id}`),
    enabled: options?.enabled !== false && Boolean(id),
    staleTime: 10_000,
  })
}

// ── Processing status poll ─────────────────────────────────────────────────

export function useQuickEntryPoll(id: string, enabled: boolean) {
  return useQuery({
    queryKey: quickEntryKeys.detail(id),
    queryFn: () => apiClient.get<QuickEntryFull>(`/api/admin/knowledge-entries/${id}`),
    enabled,
    refetchInterval: (data) => {
      // Stop polling when terminal state reached
      const status = data?.status
      if (!status || ['active', 'archived', 'low_quality', 'failed'].includes(status)) {
        return false
      }
      return 3_000  // poll every 3 seconds while processing
    },
    refetchIntervalInBackground: true,
  })
}

// ── Coverage search hook ───────────────────────────────────────────────────

export function useCoverageSearch(
  params: { query: string; module?: string },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: quickEntryKeys.coverage(params.query, params.module ?? ''),
    queryFn: () => apiClient.post<{
      results: DuplicateMatch[]; total_searched: number
    }>('/api/admin/knowledge-entries/coverage-search', params),
    enabled: options?.enabled !== false && params.query.length >= 3,
    staleTime: 60_000,
  })
}

// ── Pipeline health hook ───────────────────────────────────────────────────

export function useQuickEntryPipelineHealth() {
  return useQuery({
    queryKey: quickEntryKeys.health(),
    queryFn: () => apiClient.get<QuickEntryPipelineHealth>(
      '/api/admin/knowledge-entries/pipeline-health'
    ),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })
}

// ── Mutation hooks ────────────────────────────────────────────────────────

export function useCreateQuickEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: object) =>
      apiClient.post<{ id: string; status: string }>('/api/admin/knowledge-entries', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickEntryKeys.lists() })
    },
  })
}

export function useUpdateQuickEntry(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: object) =>
      apiClient.put<{ id: string; version: number; status: string }>(
        `/api/admin/knowledge-entries/${id}`, data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickEntryKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: quickEntryKeys.lists() })
    },
  })
}

export function useArchiveQuickEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, confirmedDocumentId }: { id: string; confirmedDocumentId: string }) =>
      apiClient.delete(`/api/admin/knowledge-entries/${id}`, {
        data: { confirmed_document_id: confirmedDocumentId }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickEntryKeys.lists() })
    },
  })
}

export function useConfirmCurrent(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ status: string }>(`/api/admin/knowledge-entries/${id}/confirm-current`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickEntryKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: quickEntryKeys.lists() })
    },
  })
}
```

---

*FRONTEND_36 — Admin Quick Entry List Page | AEGIS v1.0 | Sona Comstar*
