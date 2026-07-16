# FRONTEND_19: ADMIN REGISTRY & CONFIG SNAPSHOT
## Registry Approval Workflow and Config Snapshot Inline Editing
## Session F12 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F12: Registry and Config Snapshot admin pages.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates:**
```
src/app/(admin)/admin/registry/
├── page.tsx
└── loading.tsx

src/app/(admin)/admin/config-snapshot/
├── page.tsx
└── loading.tsx

src/components/admin/
├── InlineEditCell.tsx          ← Editable table cell (click to edit, save on blur/button)
└── StalenessIndicator.tsx      ← Document/config freshness badge
```

---

## REGISTRY PAGE DESIGN

The registry contains patterns AEGIS has learned to map to documents.
IT admins review pending entries and approve or reject them.

```
Registry    Known error pattern entries

Status: [All ▾]  🔍 Search...

── Pending review (3) ──────────────────────────────────────────
  "When VL150 occurs in delivery creation, check stock..."   SD-ERR-001  [Approve] [Reject]
  "F5201 billing error occurs when G/L account..."          FI-ERR-001  [Approve] [Reject]

── Active (47) ─────────────────────────────────────────────────
  "VL150 delivery error resolution procedure"               SD-ERR-001  Active    admin1
  "F5201 billing error — account determination"             FI-ERR-001  Active    admin1
  ...

── Rejected (12) ───────────────────────────────────────────────
  "General delivery creation steps"                         SD-PROC-01  Rejected
```

**Pending entries appear first** (they need admin action).
Each pending entry shows full pattern text, linked document, and Approve / Reject buttons.
Reject requires a confirmation (destructive).

---

## FILE 1: src/app/(admin)/admin/registry/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function RegistryLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 flex-1 max-w-sm rounded-lg ml-auto" />
      </div>
      {/* Pending section */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="surface-card p-4 flex items-center gap-4">
            <Skeleton className="flex-1 h-3" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        ))}
      </div>
      {/* Active table */}
      <div className="rounded-xl border border-border-primary overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-border-primary last:border-0 flex gap-4">
            <Skeleton className="flex-1 h-3" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 2: src/app/(admin)/admin/registry/page.tsx (COMPLETE)

```typescript
'use client'

import { useState, useMemo } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminStatRow } from '@/components/admin/AdminStatRow'
import { DataTable, type ColumnDef } from '@/components/admin/DataTable'
import { EmptyState } from '@/components/admin/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAdminRegistry, useApproveRegistry, useRejectRegistry } from '@/hooks/queries'

interface RegistryEntry {
  id: string
  pattern_text: string
  linked_document_id: string
  status: 'pending' | 'active' | 'rejected'
  created_at: string
  approved_by?: string
}

// ── Columns for active/rejected entries table ─────────────────

const activeColumns: ColumnDef<RegistryEntry>[] = [
  {
    id: 'pattern_text',
    header: 'Pattern',
    cell: (row) => (
      <p className="text-sm text-text-primary line-clamp-2 leading-snug max-w-lg">
        {row.pattern_text}
      </p>
    ),
    sortable: false,
  },
  {
    id: 'linked_document_id',
    header: 'Document',
    cell: (row) => (
      <span className="font-mono text-xs text-text-secondary">{row.linked_document_id}</span>
    ),
    width: '120px',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <Badge variant={row.status === 'active' ? 'active' : 'deprecated'}>
        {row.status}
      </Badge>
    ),
    width: '90px',
  },
  {
    id: 'approved_by',
    header: 'Approved by',
    cell: (row) => (
      <span className="text-xs text-text-tertiary">{row.approved_by ?? '—'}</span>
    ),
    width: '120px',
  },
]

export default function AdminRegistryPage() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const { data: allEntries = [], isLoading } = useAdminRegistry()
  const approve = useApproveRegistry()
  const reject = useRejectRegistry()

  const pending = useMemo(
    () => allEntries.filter((e) => e.status === 'pending'),
    [allEntries]
  )

  const nonPending = useMemo(() => {
    let entries = allEntries.filter((e) => e.status !== 'pending')
    if (statusFilter) entries = entries.filter((e) => e.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      entries = entries.filter(
        (e) =>
          e.pattern_text.toLowerCase().includes(q) ||
          e.linked_document_id.toLowerCase().includes(q)
      )
    }
    return entries
  }, [allEntries, statusFilter, search])

  const stats = {
    pending: pending.length,
    active:  allEntries.filter((e) => e.status === 'active').length,
    rejected: allEntries.filter((e) => e.status === 'rejected').length,
  }

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Registry"
        description="Known error pattern entries"
        leftSlot={
          <AdminStatRow
            stats={[
              { label: 'Pending review', value: stats.pending, color: stats.pending > 0 ? 'amber' : 'green' },
              { label: 'Active', value: stats.active, color: 'green' },
              { label: 'Rejected', value: stats.rejected },
            ]}
            isLoading={isLoading}
          />
        }
      />

      {/* ── Pending entries ── */}
      {pending.length > 0 && (
        <ErrorBoundary section="pending entries">
          <div className="mb-6">
            <p className="section-label mb-3 flex items-center gap-2">
              Pending review
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-warning-bg border border-warning-border text-warning-text text-[10px] font-bold">
                {pending.length}
              </span>
            </p>

            <div className="space-y-2">
              {pending.map((entry) => (
                <PendingEntryCard
                  key={entry.id}
                  entry={entry}
                  onApprove={() => approve.mutate(entry.id)}
                  onReject={() => reject.mutate(entry.id)}
                  approving={approve.isPending}
                  rejecting={reject.isPending}
                />
              ))}
            </div>
          </div>
        </ErrorBoundary>
      )}

      {/* ── Filter + search ── */}
      <div className="flex items-center gap-3 mb-3">
        {['', 'active', 'rejected'].map((status) => (
          <button
            key={status || 'all'}
            onClick={() => setStatusFilter(status)}
            className={`text-xs font-medium px-3 h-8 rounded-lg border transition-colors ${
              statusFilter === status
                ? 'bg-accent-subtle border-border-focus text-accent-text'
                : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary'
            }`}
          >
            {status || 'All'}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patterns..."
          className="ml-auto h-8 px-3 rounded-lg bg-bg-secondary border border-border-primary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus w-64"
        />
      </div>

      {/* ── Non-pending table ── */}
      <ErrorBoundary section="registry table">
        <DataTable
          data={nonPending}
          columns={activeColumns}
          keyField="id"
          isLoading={isLoading}
          emptyTitle="No registry entries"
          emptyDescription="Registry entries are generated automatically when documents are ingested."
          aria-label="Registry entries table"
        />
      </ErrorBoundary>
    </AdminPageWrapper>
  )
}

// ── PendingEntryCard ──────────────────────────────────────────

interface PendingEntryCardProps {
  entry: RegistryEntry
  onApprove: () => void
  onReject: () => void
  approving: boolean
  rejecting: boolean
}

function PendingEntryCard({ entry, onApprove, onReject, approving, rejecting }: PendingEntryCardProps) {
  return (
    <div className="surface-card p-4 flex items-start gap-4">
      {/* Pattern text */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm text-text-primary leading-snug line-clamp-3">
          {entry.pattern_text}
        </p>
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span className="font-mono">{entry.linked_document_id}</span>
          <span>·</span>
          <span>{new Date(entry.created_at).toLocaleDateString('en-IN')}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="success"
          onClick={onApprove}
          loading={approving}
          className="gap-1.5"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Approve
        </Button>

        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5 border-danger-border/50 text-danger-text hover:bg-danger-bg">
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </Button>
          }
          title="Reject this pattern?"
          description="This pattern will be rejected and not used in AI responses. You can review it again later."
          confirmLabel="Reject"
          variant="destructive"
          onConfirm={onReject}
        />
      </div>
    </div>
  )
}
```

---

## FILE 3: src/components/admin/StalenessIndicator.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import { CONFIDENCE } from '@/lib/constants'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface StalenessIndicatorProps {
  verifiedDate: string   // ISO date string
  daysSince?: number     // Alternative: pass days directly
  className?: string
}

/**
 * Shows config/document staleness with color-coded indicator.
 * Uses CONFIDENCE.FRESHNESS_WARN_DAYS (35) and CONFIDENCE.FRESHNESS_CRIT_DAYS (70).
 *
 * Green:  < 35 days  → Fresh
 * Amber: 35–70 days  → Review recommended
 * Red:   > 70 days   → Stale — needs re-verification
 */
export function StalenessIndicator({ verifiedDate, daysSince, className }: StalenessIndicatorProps) {
  const days = daysSince ??
    Math.floor((Date.now() - new Date(verifiedDate).getTime()) / (1000 * 60 * 60 * 24))

  const isStale = days > CONFIDENCE.FRESHNESS_CRIT_DAYS
  const isAging = days > CONFIDENCE.FRESHNESS_WARN_DAYS

  const config = isStale
    ? { color: 'text-danger',  bg: 'bg-danger-bg',  border: 'border-danger-border',  label: 'Stale',  detail: `${days} days since last verification — update recommended` }
    : isAging
    ? { color: 'text-warning', bg: 'bg-warning-bg', border: 'border-warning-border', label: 'Aging',  detail: `${days} days since last verification` }
    : { color: 'text-success', bg: 'bg-success-bg', border: 'border-success-border', label: 'Fresh',  detail: `${days} days since last verification` }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2 py-0.5 cursor-default',
              config.bg, config.border, config.color,
              className,
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', {
              'bg-danger':  isStale,
              'bg-warning': isAging && !isStale,
              'bg-success': !isAging,
            })} aria-hidden="true" />
            {days}d
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs max-w-[200px]">
          <p className="font-semibold">{config.label}</p>
          <p className="text-text-secondary mt-0.5">{config.detail}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

---

## FILE 4: src/components/admin/InlineEditCell.tsx (COMPLETE)

```typescript
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Check, X, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InlineEditCellProps {
  value: string
  onSave: (newValue: string) => Promise<void>
  disabled?: boolean
  placeholder?: string
  className?: string
}

/**
 * Inline editable table cell for the Config Snapshot page.
 * UX pattern:
 * - Shows value as static text with an edit icon on hover
 * - Click anywhere on cell OR the edit icon → transforms to input
 * - Enter or blur → triggers save (if value changed)
 * - Escape → cancels, restores original value
 * - Shows spinner while saving
 *
 * @example
 * <InlineEditCell
 *   value={config.value}
 *   onSave={(newVal) => updateConfig.mutateAsync({ category, key, value: newVal })}
 * />
 */
export function InlineEditCell({
  value,
  onSave,
  disabled = false,
  placeholder = 'Enter value...',
  className,
}: InlineEditCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync draft when external value changes
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  // Focus input on edit start
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEdit = useCallback(() => {
    if (disabled || saving) return
    setDraft(value)
    setEditing(true)
  }, [disabled, saving, value])

  const cancelEdit = useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  const commitSave = useCallback(async () => {
    const trimmed = draft.trim()
    if (trimmed === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch {
      // Error toast shown by mutation's onError handler
      // Restore original value on error
      setDraft(value)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }, [draft, value, onSave])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); commitSave() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  if (editing || saving) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Small delay to allow Save/Cancel button clicks to register
            setTimeout(() => {
              if (document.activeElement !== inputRef.current) {
                commitSave()
              }
            }, 150)
          }}
          placeholder={placeholder}
          disabled={saving}
          className={cn(
            'flex-1 min-w-0 h-7 px-2 text-sm',
            'bg-bg-secondary border border-border-focus rounded-md',
            'text-text-primary',
            'focus:outline-none focus:ring-1 focus:ring-border-focus',
            'disabled:opacity-50',
          )}
        />
        {/* Save button */}
        <button
          onClick={commitSave}
          disabled={saving}
          className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success-bg transition-colors disabled:opacity-40"
          aria-label="Save"
        >
          {saving ? (
            <span className="w-3 h-3 rounded-full border-2 border-success border-t-transparent animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
        </button>
        {/* Cancel button */}
        <button
          onClick={cancelEdit}
          disabled={saving}
          className="w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:bg-bg-tertiary transition-colors disabled:opacity-40"
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className={cn(
        'group flex items-center gap-2 w-full text-left',
        'rounded px-2 py-1 -mx-2 -my-1',
        'hover:bg-bg-secondary',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
      aria-label={`Edit value: ${value}`}
    >
      <span className="text-sm text-text-primary font-mono flex-1 truncate">{value || placeholder}</span>
      <Pencil
        className="w-3 h-3 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        aria-hidden="true"
      />
    </button>
  )
}
```

---

## FILE 5: src/app/(admin)/admin/config-snapshot/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function ConfigLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-52" />
      </div>
      <div className="flex gap-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      <div className="rounded-xl border border-border-primary overflow-hidden">
        <div className="bg-bg-secondary px-4 py-3 flex gap-6">
          {['Category', 'Key', 'Current value', 'Staleness', 'Last verified', ''].map((h) => (
            <Skeleton key={h} className="h-2.5 w-20" />
          ))}
        </div>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-t border-border-primary flex gap-6 items-center">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-40 rounded-md" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 6: src/app/(admin)/admin/config-snapshot/page.tsx (COMPLETE)

```typescript
'use client'

import { useState, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { InlineEditCell } from '@/components/admin/InlineEditCell'
import { StalenessIndicator } from '@/components/admin/StalenessIndicator'
import { DataTable, type ColumnDef } from '@/components/admin/DataTable'
import { FilterChips, type FilterChip } from '@/components/admin/FilterChips'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfigSnapshot, useUpdateConfig } from '@/hooks/queries'
import { cn } from '@/lib/utils'

interface ConfigEntry {
  category: string
  key: string
  value: string
  last_verified_date: string
  verified_by: string
  is_stale: boolean
  days_since_verified: number
}

export default function AdminConfigSnapshotPage() {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [showStaleOnly, setShowStaleOnly] = useState(false)

  const { data: allConfig = [], isLoading } = useConfigSnapshot()
  const updateConfig = useUpdateConfig()

  // ── Derived: unique categories ─────────────────────────────

  const categories = useMemo(
    () => Array.from(new Set(allConfig.map((c) => c.category))).sort(),
    [allConfig]
  )

  // ── Filtered entries ──────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...allConfig]
    if (categoryFilter) result = result.filter((c) => c.category === categoryFilter)
    if (showStaleOnly) result = result.filter((c) => c.is_stale)
    return result
  }, [allConfig, categoryFilter, showStaleOnly])

  // ── Stats ─────────────────────────────────────────────────

  const staleCount = allConfig.filter((c) => c.is_stale).length

  // ── Column definitions ────────────────────────────────────

  const columns: ColumnDef<ConfigEntry>[] = [
    {
      id: 'category',
      header: 'Category',
      cell: (row) => (
        <span className="text-xs font-semibold text-text-secondary bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5">
          {row.category}
        </span>
      ),
      width: '100px',
      sortable: true,
    },
    {
      id: 'key',
      header: 'Key',
      cell: (row) => (
        <span className="text-sm font-mono text-text-primary">{row.key}</span>
      ),
      width: '180px',
      sortable: true,
    },
    {
      id: 'value',
      header: 'Current value',
      cell: (row) => (
        <InlineEditCell
          value={row.value}
          onSave={(newValue) =>
            updateConfig.mutateAsync({
              category: row.category,
              key: row.key,
              value: newValue,
            })
          }
        />
      ),
    },
    {
      id: 'staleness',
      header: 'Freshness',
      cell: (row) => (
        <StalenessIndicator
          verifiedDate={row.last_verified_date}
          daysSince={row.days_since_verified}
        />
      ),
      width: '80px',
    },
    {
      id: 'last_verified_date',
      header: 'Last verified',
      cell: (row) => (
        <div className="space-y-0.5">
          <p className="text-xs text-text-secondary">{row.last_verified_date}</p>
          <p className="text-xs text-text-tertiary">{row.verified_by}</p>
        </div>
      ),
      width: '140px',
      sortable: true,
    },
  ]

  // ── Filter chips ─────────────────────────────────────────

  const chips: FilterChip[] = [
    ...(categoryFilter ? [{ id: 'category', label: 'Category', value: categoryFilter }] : []),
    ...(showStaleOnly ? [{ id: 'stale', label: 'Filter', value: 'Stale only' }] : []),
  ]

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Config snapshot"
        description="SAP configuration values — click any value to edit"
        actions={
          staleCount > 0 ? (
            <Badge variant="warning" dot>
              {staleCount} stale value{staleCount > 1 ? 's' : ''}
            </Badge>
          ) : (
            <Badge variant="success" dot>
              All values fresh
            </Badge>
          )
        }
      />

      {/* Category filter row */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button
          onClick={() => { setCategoryFilter(null); setShowStaleOnly(false) }}
          className={cn(
            'text-xs font-medium px-3 h-8 rounded-lg border transition-colors',
            !categoryFilter && !showStaleOnly
              ? 'bg-accent-subtle border-border-focus text-accent-text'
              : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary',
          )}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              'text-xs font-medium px-3 h-8 rounded-lg border transition-colors',
              categoryFilter === cat
                ? 'bg-accent-subtle border-border-focus text-accent-text'
                : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary',
            )}
          >
            {cat}
          </button>
        ))}
        {staleCount > 0 && (
          <button
            onClick={() => setShowStaleOnly((v) => !v)}
            className={cn(
              'text-xs font-medium px-3 h-8 rounded-lg border transition-colors ml-1',
              showStaleOnly
                ? 'bg-warning-bg border-warning-border text-warning-text'
                : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary',
            )}
          >
            Stale only ({staleCount})
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <FilterChips
          chips={chips}
          onRemove={(id) => {
            if (id === 'category') setCategoryFilter(null)
            if (id === 'stale') setShowStaleOnly(false)
          }}
          className="mb-3"
        />
      )}

      {/* Config table */}
      <ErrorBoundary section="config snapshot table">
        <DataTable
          data={filtered}
          columns={columns}
          keyField="key"
          isLoading={isLoading}
          emptyTitle="No configuration entries"
          emptyDescription="Config entries are populated when SAP documentation is ingested."
          aria-label="Configuration snapshot table"
        />
      </ErrorBoundary>

      {/* Usage tip */}
      <p className="text-xs text-text-tertiary mt-4 flex items-center gap-1.5">
        <RefreshCw className="w-3 h-3 shrink-0" aria-hidden="true" />
        Click any value in the Current value column to edit it inline.
        Changes are saved immediately per row.
      </p>
    </AdminPageWrapper>
  )
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Registry page
# Step 1: Pending entries appear at top in amber cards
# → Approve button shows ConfirmDialog? No — direct action (non-destructive)
# → Actually: Approve is direct, Reject uses ConfirmDialog
# → Approve: entry moves to active, pending count decreases

# Step 2: Reject with ConfirmDialog
# → Click Reject on a pending entry
# → ConfirmDialog: "Reject this pattern?" appears
# → Confirm → entry moves to rejected section

# Step 3: Status filter tabs
# → Click "Active" → only active entries show
# → Click "Rejected" → only rejected entries show

# Config Snapshot page
# Step 4: Category filter buttons
# → Click "SD" → only SD category rows visible
# → Click "FI" → only FI rows
# → Click "All" → resets

# Step 5: Stale filter
# → If stale items exist, "Stale only (N)" button visible
# → Click it → only stale entries shown

# Step 6: Inline edit
# → Click a value cell → transforms to input with save/cancel buttons
# → Type new value → Enter → saves, cell returns to static
# → Type new value → Escape → cancels, original value restored
# → Type same value as original → no API call, just closes

# Step 7: StalenessIndicator
# → Fresh (< 35 days): green badge "Xd"
# → Aging (35–70): amber badge
# → Stale (> 70): red badge
# → Hover: tooltip shows days + description

# Step 8: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F12: Admin registry + config — PendingEntryCard, InlineEditCell, StalenessIndicator, approval workflow, per-row save"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F12*
