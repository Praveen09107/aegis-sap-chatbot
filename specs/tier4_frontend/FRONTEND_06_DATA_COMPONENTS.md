# FRONTEND_06: DATA COMPONENTS
## Tables, Metrics, Filters, and Chart Primitives — Used Across All Admin Pages
## Session F04 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F04: All data display components.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Sessions F04 (dependencies), F01 (design system), F03 (core components) complete.

**What this session creates:**
```
src/components/admin/
├── DataTable.tsx             ← Generic sortable/selectable/paginated table
├── BulkActionBar.tsx         ← Bulk operations toolbar (appears on row selection)
├── EmptyState.tsx            ← Empty list/table placeholder
├── FilterChips.tsx           ← Active filter display with remove buttons
├── Pagination.tsx            ← Table page controls
├── MetricCard.tsx            ← KPI metric card with animated counter
└── charts/
    ├── ChartTooltip.tsx      ← Recharts tooltip with AEGIS styling
    └── ResponsiveChart.tsx   ← Recharts ResponsiveContainer wrapper

src/lib/
└── csvExport.ts              ← CSV export utility for admin tables
```

---

## FILE 1: src/components/admin/DataTable.tsx (COMPLETE)

The DataTable is used on every admin page. It must handle: sorting, row selection,
pagination, keyboard navigation, loading skeletons, and empty states consistently.

```typescript
'use client'

import * as React from 'react'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ── Column definition ──────────────────────────────────────

export interface ColumnDef<TRow> {
  /** Unique identifier — used as sort key */
  id: string
  /** Column header label */
  header: string
  /** Cell renderer: receives the row and returns React content */
  cell: (row: TRow) => React.ReactNode
  /** Whether this column is sortable. Default: false */
  sortable?: boolean
  /** Fixed width (e.g. '120px', '10%'). Omit for auto. */
  width?: string
  /** Text alignment. Default: 'left' */
  align?: 'left' | 'center' | 'right'
  /** Additional className on the <td> */
  className?: string
}

// ── Sort state ──────────────────────────────────────────────

export interface SortState {
  column: string
  direction: 'asc' | 'desc'
}

// ── Pagination state ────────────────────────────────────────

export interface PaginationConfig {
  page: number            // 1-indexed
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

// ── Props ───────────────────────────────────────────────────

export interface DataTableProps<TRow extends { [K in IdField]: string }, IdField extends keyof TRow = keyof TRow> {
  data: TRow[]
  columns: ColumnDef<TRow>[]
  /** The field on TRow that uniquely identifies each row */
  keyField: IdField

  // Loading state
  isLoading?: boolean
  /** Number of skeleton rows to show while loading. Default: 5 */
  skeletonRows?: number

  // Empty state
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode

  // Selection
  selectable?: boolean
  selectedKeys?: Set<string>
  onSelectionChange?: (keys: Set<string>) => void

  // Row interaction
  onRowClick?: (row: TRow) => void
  /** Adds cursor-pointer and hover highlight when set */
  clickable?: boolean

  // Sorting
  sortState?: SortState | null
  onSortChange?: (state: SortState) => void

  // Pagination
  pagination?: PaginationConfig

  className?: string
  tableClassName?: string

  /** ARIA label for the table (for screen readers) */
  'aria-label'?: string
}

// ── Sort icon component ──────────────────────────────────────

function SortIcon({
  column,
  sortState,
}: {
  column: string
  sortState?: SortState | null
}) {
  if (!sortState || sortState.column !== column) {
    return <ChevronsUpDown className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
  }
  return sortState.direction === 'asc' ? (
    <ChevronUp className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
  ) : (
    <ChevronDown className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
  )
}

// ── Main component ───────────────────────────────────────────

export function DataTable<TRow extends { [K in IdField]: string }, IdField extends keyof TRow = keyof TRow>({
  data,
  columns,
  keyField,
  isLoading = false,
  skeletonRows = 5,
  emptyTitle = 'No results',
  emptyDescription,
  emptyAction,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  onRowClick,
  clickable,
  sortState,
  onSortChange,
  pagination,
  className,
  tableClassName,
  'aria-label': ariaLabel,
}: DataTableProps<TRow, IdField>) {
  const isClickable = clickable || !!onRowClick
  const allKeys = data.map((row) => String(row[keyField]))
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k))
  const someSelected = allKeys.some((k) => selectedKeys.has(k)) && !allSelected

  // ── Selection handlers ──────────────────────────────────────

  function handleSelectAll(checked: boolean) {
    if (!onSelectionChange) return
    if (checked) {
      onSelectionChange(new Set(allKeys))
    } else {
      onSelectionChange(new Set())
    }
  }

  function handleSelectRow(key: string, checked: boolean) {
    if (!onSelectionChange) return
    const next = new Set(selectedKeys)
    if (checked) next.add(key)
    else next.delete(key)
    onSelectionChange(next)
  }

  // ── Sort handler ────────────────────────────────────────────

  function handleSort(columnId: string) {
    if (!onSortChange) return
    if (!sortState || sortState.column !== columnId) {
      onSortChange({ column: columnId, direction: 'asc' })
    } else if (sortState.direction === 'asc') {
      onSortChange({ column: columnId, direction: 'desc' })
    } else {
      // Third click: reset sort (pass null or re-sort asc)
      onSortChange({ column: columnId, direction: 'asc' })
    }
  }

  // ── Keyboard navigation on rows ─────────────────────────────

  function handleRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, row: TRow) {
    const tr = e.currentTarget
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = tr.nextElementSibling as HTMLElement | null
      next?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = tr.previousElementSibling as HTMLElement | null
      prev?.focus()
    } else if (e.key === 'Enter' && onRowClick) {
      e.preventDefault()
      onRowClick(row)
    } else if (e.key === ' ' && selectable) {
      e.preventDefault()
      const key = String(row[keyField])
      handleSelectRow(key, !selectedKeys.has(key))
    }
  }

  // ── Loading skeleton ────────────────────────────────────────

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-border-primary overflow-hidden', className)}>
        <Table className={tableClassName} aria-label={ariaLabel ?? 'Loading data'} aria-busy="true">
          <TableHeader>
            <TableRow className="bg-bg-secondary hover:bg-bg-secondary">
              {selectable && (
                <TableHead className="w-10">
                  <Skeleton className="w-4 h-4 rounded" />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead key={col.id} style={{ width: col.width }}>
                  <Skeleton className="h-3 w-24" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(skeletonRows)].map((_, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                {selectable && (
                  <TableCell className="w-10">
                    <Skeleton className="w-4 h-4 rounded" />
                  </TableCell>
                )}
                {columns.map((col, j) => (
                  <TableCell key={col.id}>
                    <Skeleton
                      className="h-3"
                      style={{ width: `${60 + ((i + j) % 3) * 15}%` }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────

  if (!isLoading && data.length === 0) {
    return (
      <div className={cn('rounded-xl border border-border-primary overflow-hidden', className)}>
        <Table className={tableClassName} aria-label={ariaLabel}>
          <TableHeader>
            <TableRow className="bg-bg-secondary hover:bg-bg-secondary">
              {selectable && <TableHead className="w-10" />}
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  style={{ width: col.width }}
                  className="text-xs font-semibold text-text-tertiary uppercase tracking-wider"
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        </Table>
        <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
          <p className="text-sm font-medium text-text-primary">{emptyTitle}</p>
          {emptyDescription && (
            <p className="text-sm text-text-tertiary max-w-xs leading-relaxed">
              {emptyDescription}
            </p>
          )}
          {emptyAction && <div className="mt-3">{emptyAction}</div>}
        </div>
      </div>
    )
  }

  // ── Main table ──────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      <div className="rounded-xl border border-border-primary overflow-hidden">
        <Table className={tableClassName} aria-label={ariaLabel}>
          <TableHeader>
            <TableRow className="bg-bg-secondary hover:bg-bg-secondary border-b border-border-primary">
              {selectable && (
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all rows"
                    data-state={someSelected ? 'indeterminate' : allSelected ? 'checked' : 'unchecked'}
                    className="data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent"
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  style={{ width: col.width }}
                  className={cn(
                    'text-xs font-semibold text-text-tertiary uppercase tracking-wider',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                  )}
                >
                  {col.sortable && onSortChange ? (
                    <button
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        'group inline-flex items-center gap-1.5',
                        'hover:text-text-primary transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded',
                        sortState?.column === col.id && 'text-text-primary',
                      )}
                      aria-sort={
                        sortState?.column === col.id
                          ? sortState.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {col.header}
                      <SortIcon column={col.id} sortState={sortState} />
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.map((row, rowIndex) => {
              const key = String(row[keyField])
              const isSelected = selectedKeys.has(key)

              return (
                <TableRow
                  key={key}
                  tabIndex={isClickable ? 0 : undefined}
                  role={isClickable ? 'button' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={isClickable ? (e) => handleRowKeyDown(e, row) : undefined}
                  className={cn(
                    'border-b border-border-primary last:border-0',
                    'transition-colors duration-100',
                    isSelected && 'bg-accent-subtle',
                    isClickable && !isSelected && 'hover:bg-bg-secondary cursor-pointer',
                    !isClickable && 'hover:bg-bg-secondary/50',
                    'focus-visible:outline-none focus-visible:bg-bg-secondary',
                    'animate-fade-in',
                  )}
                  style={{ animationDelay: `${rowIndex * 20}ms` }}
                  aria-selected={selectable ? isSelected : undefined}
                >
                  {selectable && (
                    <TableCell className="w-10 px-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleSelectRow(key, !!checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select row ${rowIndex + 1}`}
                      />
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(
                        'text-sm text-text-primary',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right',
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && (
        <TablePagination pagination={pagination} />
      )}
    </div>
  )
}

// ── Pagination sub-component ─────────────────────────────────

function TablePagination({ pagination }: { pagination: PaginationConfig }) {
  const { page, pageSize, total, onPageChange } = pagination
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between px-2 py-3">
      <p className="text-xs text-text-tertiary">
        Showing <span className="font-medium text-text-secondary">{start}–{end}</span> of{' '}
        <span className="font-medium text-text-secondary">{total}</span> results
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          aria-label="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>

        <span className="text-xs text-text-secondary px-2 tabular-nums">
          {page} / {totalPages}
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          aria-label="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
```

---

## FILE 2: src/components/admin/BulkActionBar.tsx (COMPLETE)

```typescript
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BulkAction {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'destructive' | 'secondary'
  loading?: boolean
}

interface BulkActionBarProps {
  selectedCount: number
  actions: BulkAction[]
  onClearSelection: () => void
  className?: string
}

/**
 * Bulk operation toolbar that slides up from the bottom when rows are selected.
 * Used on Documents, Registry, Tickets, and Audit Trail admin pages.
 *
 * @example
 * <BulkActionBar
 *   selectedCount={selectedIds.size}
 *   onClearSelection={() => setSelectedIds(new Set())}
 *   actions={[
 *     { label: 'Deprecate', icon: <Archive />, onClick: handleBulkDeprecate, variant: 'destructive' },
 *     { label: 'Export CSV', icon: <Download />, onClick: handleExport },
 *   ]}
 * />
 */
export function BulkActionBar({
  selectedCount,
  actions,
  onClearSelection,
  className,
}: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-sticky',
            'flex items-center gap-3',
            'bg-bg-card border border-border-primary',
            'rounded-xl shadow-lg px-4 py-2.5',
            className
          )}
          role="toolbar"
          aria-label={`${selectedCount} rows selected`}
        >
          {/* Count */}
          <div className="flex items-center gap-2 pr-3 border-r border-border-primary">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-xs font-bold tabular-nums">
              {selectedCount}
            </span>
            <span className="text-sm text-text-secondary">
              {selectedCount === 1 ? 'item' : 'items'} selected
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {actions.map((action, i) => (
              <Button
                key={i}
                variant={action.variant === 'destructive' ? 'destructive' : action.variant ?? 'outline'}
                size="sm"
                onClick={action.onClick}
                loading={action.loading}
                className="h-8"
              >
                {action.icon && <span className="w-3.5 h-3.5">{action.icon}</span>}
                {action.label}
              </Button>
            ))}
          </div>

          {/* Clear */}
          <button
            onClick={onClearSelection}
            className={cn(
              'ml-1 p-1 rounded-md text-text-tertiary',
              'hover:text-text-primary hover:bg-bg-secondary',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus'
            )}
            aria-label="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

---

## FILE 3: src/components/admin/EmptyState.tsx (COMPLETE)

```typescript
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** 'page' renders larger centered state; 'inline' renders compact version */
  variant?: 'page' | 'inline'
}

/**
 * Consistent empty state for all admin lists, tables, and sections.
 *
 * @example
 * // Full page empty state
 * <EmptyState
 *   icon={FileText}
 *   title="No documents uploaded yet"
 *   description="Upload SAP documentation to start training the knowledge base."
 *   action={<Button onClick={openUpload}>Upload document</Button>}
 * />
 *
 * // Inline empty state (inside a card)
 * <EmptyState variant="inline" title="No items match your filters" />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  variant = 'inline',
}: EmptyStateProps) {
  const isPage = variant === 'page'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        isPage ? 'gap-4 py-20 px-8' : 'gap-3 py-12 px-6',
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-2xl',
            'bg-bg-secondary border border-border-primary',
            isPage ? 'w-16 h-16' : 'w-12 h-12'
          )}
        >
          <Icon
            className={cn(
              'text-text-tertiary',
              isPage ? 'w-8 h-8' : 'w-6 h-6'
            )}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <p
          className={cn(
            'font-semibold text-text-primary',
            isPage ? 'text-lg' : 'text-sm'
          )}
        >
          {title}
        </p>
        {description && (
          <p
            className={cn(
              'text-text-secondary leading-relaxed max-w-sm mx-auto',
              isPage ? 'text-sm' : 'text-xs'
            )}
          >
            {description}
          </p>
        )}
      </div>

      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
```

---

## FILE 4: src/components/admin/FilterChips.tsx (COMPLETE)

```typescript
'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterChip {
  id: string
  label: string
  value: string
}

interface FilterChipsProps {
  chips: FilterChip[]
  onRemove: (id: string) => void
  onClearAll?: () => void
  className?: string
}

/**
 * Active filter chips display with remove buttons.
 * Used on Audit Trail, Documents, and Knowledge Gaps pages.
 *
 * @example
 * const [filters, setFilters] = useState<FilterChip[]>([
 *   { id: 'module', label: 'Module', value: 'SD' },
 *   { id: 'badge', label: 'Confidence', value: 'Green' },
 * ])
 *
 * <FilterChips
 *   chips={filters}
 *   onRemove={(id) => setFilters(f => f.filter(c => c.id !== id))}
 *   onClearAll={() => setFilters([])}
 * />
 */
export function FilterChips({ chips, onRemove, onClearAll, className }: FilterChipsProps) {
  if (chips.length === 0) return null

  return (
    <div
      className={cn('flex items-center flex-wrap gap-2', className)}
      role="group"
      aria-label="Active filters"
    >
      <span className="text-xs text-text-tertiary font-medium">Filters:</span>

      {chips.map((chip) => (
        <div
          key={chip.id}
          className={cn(
            'inline-flex items-center gap-1.5',
            'bg-accent-subtle border border-border-focus/30',
            'text-accent-text text-xs font-medium',
            'rounded-full pl-2.5 pr-1.5 py-0.5',
          )}
        >
          <span className="text-text-tertiary">{chip.label}:</span>
          <span>{chip.value}</span>
          <button
            onClick={() => onRemove(chip.id)}
            className={cn(
              'w-3.5 h-3.5 rounded-full',
              'flex items-center justify-center',
              'text-accent-text/60 hover:text-accent-text',
              'hover:bg-accent/10',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus'
            )}
            aria-label={`Remove ${chip.label} filter`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}

      {chips.length > 1 && onClearAll && (
        <button
          onClick={onClearAll}
          className="text-xs text-text-tertiary hover:text-text-secondary underline transition-colors"
          aria-label="Clear all filters"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
```

---

## FILE 5: src/components/admin/MetricCard.tsx (COMPLETE)

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

type MetricColor = 'white' | 'green' | 'amber' | 'red' | 'info' | 'purple'
type TrendDirection = 'up' | 'down' | 'neutral'

interface MetricCardProps {
  label: string
  value: number | string
  /** If numeric, animate from 0 to value on mount */
  animateCount?: boolean
  /** Display format for numeric values */
  format?: 'integer' | 'percentage' | 'score' | 'string'
  /** Color of the main value display */
  color?: MetricColor
  trend?: {
    value: string           // e.g. "↑ 18%", "3 new today"
    direction: TrendDirection
    /** Is "up" direction a positive thing? Default: true */
    upIsPositive?: boolean
  }
  isLoading?: boolean
  className?: string
}

const VALUE_COLORS: Record<MetricColor, string> = {
  white:  'text-text-primary',
  green:  'text-success',
  amber:  'text-warning',
  red:    'text-danger',
  info:   'text-info',
  purple: 'text-purple',
}

const TREND_COLORS: Record<TrendDirection, (upIsPositive: boolean) => string> = {
  up:      (pos) => pos ? 'text-success' : 'text-danger',
  down:    (pos) => pos ? 'text-danger' : 'text-success',
  neutral: ()    => 'text-text-tertiary',
}

/**
 * Admin dashboard KPI card with animated counter on mount.
 * Uses requestAnimationFrame for smooth count-up animation.
 * Respects prefers-reduced-motion.
 *
 * @example
 * <MetricCard
 *   label="Queries today"
 *   value={247}
 *   color="white"
 *   trend={{ value: "↑ 18% vs yesterday", direction: "up" }}
 * />
 *
 * <MetricCard
 *   label="Green badge rate"
 *   value={0.71}
 *   format="percentage"
 *   color="green"
 *   animateCount
 * />
 */
export function MetricCard({
  label,
  value,
  animateCount = true,
  format = 'string',
  color = 'white',
  trend,
  isLoading = false,
  className,
}: MetricCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [displayValue, setDisplayValue] = useState<number | string>(
    typeof value === 'number' && animateCount && !prefersReducedMotion ? 0 : value
  )
  const animationRef = useRef<number>()

  // Count-up animation
  useEffect(() => {
    if (typeof value !== 'number' || !animateCount || prefersReducedMotion) {
      setDisplayValue(value)
      return
    }

    const start = 0
    const end = value
    const duration = 600
    const startTime = performance.now()

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(start + (end - start) * eased)
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [value, animateCount, prefersReducedMotion])

  function formatValue(v: number | string): string {
    if (typeof v !== 'number') return String(v)
    switch (format) {
      case 'integer':
        return Math.round(v).toLocaleString('en-IN')
      case 'percentage':
        return `${Math.round(v * 100)}%`
      case 'score':
        return v.toFixed(2)
      default:
        return typeof value === 'number' ? Math.round(v).toLocaleString('en-IN') : String(v)
    }
  }

  if (isLoading) {
    return (
      <div className={cn(
        'bg-bg-card border border-border-primary rounded-xl p-4',
        'flex flex-col gap-2',
        className
      )}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-2.5 w-28" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-bg-card border border-border-primary rounded-xl p-4',
        'flex flex-col gap-1.5',
        'shadow-sm',
        className
      )}
    >
      {/* Label */}
      <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
        {label}
      </p>

      {/* Value */}
      <p
        className={cn(
          'text-4xl font-bold tabular-nums leading-none tracking-tight',
          VALUE_COLORS[color]
        )}
        aria-label={`${label}: ${formatValue(typeof displayValue === 'number' ? value : displayValue)}`}
      >
        {formatValue(displayValue)}
      </p>

      {/* Trend */}
      {trend && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            TREND_COLORS[trend.direction](trend.upIsPositive !== false)
          )}
        >
          {trend.direction === 'up' && <TrendingUp className="w-3 h-3" aria-hidden="true" />}
          {trend.direction === 'down' && <TrendingDown className="w-3 h-3" aria-hidden="true" />}
          {trend.direction === 'neutral' && <Minus className="w-3 h-3" aria-hidden="true" />}
          <span>{trend.value}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Grid wrapper for the 4-card admin dashboard metric row.
 */
export function MetricCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-4 gap-3" role="region" aria-label="Key metrics">
      {children}
    </div>
  )
}
```

---

## FILE 6: src/components/admin/charts/ChartTooltip.tsx (COMPLETE)

```typescript
import { cn } from '@/lib/utils'

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number | string
    color?: string
    dataKey?: string
  }>
  label?: string
  formatter?: (value: number | string, name: string) => string
  labelFormatter?: (label: string) => string
  className?: string
}

/**
 * Recharts custom tooltip with AEGIS styling.
 * Apply to any Recharts chart via content prop.
 *
 * @example
 * <LineChart data={data}>
 *   <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} />} />
 * </LineChart>
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  className,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  const formattedLabel = label
    ? labelFormatter ? labelFormatter(String(label)) : String(label)
    : null

  return (
    <div
      className={cn(
        'bg-bg-card border border-border-primary rounded-xl',
        'shadow-lg px-3 py-2.5',
        'text-xs',
        className
      )}
    >
      {formattedLabel && (
        <p className="text-text-tertiary font-medium mb-1.5">{formattedLabel}</p>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => {
          const displayValue = formatter
            ? formatter(entry.value, entry.name)
            : typeof entry.value === 'number'
            ? entry.value.toFixed(3)
            : String(entry.value)

          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                {entry.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden="true"
                  />
                )}
                <span className="text-text-secondary capitalize">
                  {entry.name}
                </span>
              </div>
              <span className="font-semibold text-text-primary tabular-nums">
                {displayValue}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## FILE 7: src/components/admin/charts/ResponsiveChart.tsx (COMPLETE)

```typescript
'use client'

import { ResponsiveContainer } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ResponsiveChartProps {
  children: React.ReactNode
  height?: number
  isLoading?: boolean
  loadingRows?: number
  className?: string
  'aria-label'?: string
}

/**
 * Wrapper for all Recharts charts in AEGIS admin portal.
 * Provides consistent sizing, loading state, and accessibility attributes.
 *
 * @example
 * <ResponsiveChart height={200} aria-label="ValidationScore trend for the last 7 days">
 *   <LineChart data={data}>
 *     ...
 *   </LineChart>
 * </ResponsiveChart>
 */
export function ResponsiveChart({
  children,
  height = 180,
  isLoading = false,
  className,
  'aria-label': ariaLabel,
}: ResponsiveChartProps) {
  if (isLoading) {
    return (
      <div
        className={cn('flex items-end gap-1 px-2', className)}
        style={{ height }}
        aria-hidden="true"
      >
        {[...Array(7)].map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: `${40 + Math.random() * 50}%` }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn('w-full', className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel ?? 'Chart'}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

// ── Shared Recharts axis/grid styling ────────────────────────

/**
 * Consistent axis tick style for all AEGIS charts.
 * Apply to XAxis and YAxis via tick prop.
 */
export const CHART_TICK_STYLE = {
  fontSize: 11,
  fill: 'rgb(148 163 184)',   // text-text-tertiary approximation
  fontFamily: 'var(--font-geist)',
}

/**
 * Shared chart color palette.
 * Maps confidence badge levels and other semantic categories.
 */
export const CHART_COLORS = {
  green:     '#10B981',
  amber:     '#F59E0B',
  red:       '#EF4444',
  cyan:      '#06B6D4',
  blue:      '#3B82F6',
  purple:    '#8B5CF6',
  gray:      '#64748B',
  gridLine:  'rgba(226, 232, 240, 0.6)',   // light mode grid
  darkGrid:  'rgba(30, 42, 61, 0.8)',       // dark mode grid
} as const
```

---

## FILE 8: src/lib/csvExport.ts (COMPLETE)

```typescript
/**
 * CSV export utility for admin data tables.
 * Downloads a CSV file with the given column definitions and data.
 */

export interface CSVColumn<T> {
  header: string
  accessor: (row: T) => string | number
}

/**
 * Generate and trigger a CSV file download.
 *
 * @example
 * exportToCSV({
 *   filename: 'aegis-audit-trail',
 *   columns: [
 *     { header: 'Query', accessor: (r) => r.query_text },
 *     { header: 'Badge', accessor: (r) => r.confidence_badge ?? 'none' },
 *     { header: 'Date', accessor: (r) => r.created_at },
 *   ],
 *   data: auditTrailData,
 * })
 */
export function exportToCSV<T>({
  filename,
  columns,
  data,
}: {
  filename: string
  columns: CSVColumn<T>[]
  data: T[]
}): void {
  // Build header row
  const headerRow = columns.map((col) => escapeCSVCell(col.header)).join(',')

  // Build data rows
  const dataRows = data.map((row) =>
    columns.map((col) => escapeCSVCell(String(col.accessor(row)))).join(',')
  )

  const csvContent = [headerRow, ...dataRows].join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeCSVCell(value: string): string {
  // Wrap in quotes if contains comma, newline, or quote
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
```

---

## ADMIN TABLE USAGE PATTERNS

### Pattern 1: Basic read-only table (Registry page)

```typescript
const columns: ColumnDef<RegistryEntry>[] = [
  {
    id: 'pattern',
    header: 'Pattern',
    cell: (row) => <code className="font-mono text-xs">{row.pattern_text}</code>,
    sortable: true,
    width: '40%',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <Badge variant={row.status === 'active' ? 'active' : 'pending'}>{row.status}</Badge>,
    width: '100px',
  },
  {
    id: 'actions',
    header: '',
    cell: (row) => (
      <div className="flex gap-2 justify-end">
        <Button size="sm" onClick={() => approve(row.id)}>Approve</Button>
        <Button variant="outline" size="sm" onClick={() => reject(row.id)}>Reject</Button>
      </div>
    ),
    align: 'right',
    width: '150px',
  },
]

<DataTable
  data={registryData}
  columns={columns}
  keyField="id"
  isLoading={isLoading}
  emptyTitle="No registry entries"
  emptyDescription="Upload documents to auto-generate registry entries."
  sortState={sort}
  onSortChange={setSort}
  aria-label="Known patterns registry"
/>
```

### Pattern 2: Selectable table with bulk actions (Documents page)

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

<>
  <DataTable
    data={documents}
    columns={docColumns}
    keyField="document_id"
    selectable
    selectedKeys={selectedIds}
    onSelectionChange={setSelectedIds}
    pagination={{ page, pageSize: 50, total, onPageChange: setPage }}
    aria-label="Uploaded documents"
  />

  <BulkActionBar
    selectedCount={selectedIds.size}
    onClearSelection={() => setSelectedIds(new Set())}
    actions={[
      {
        label: 'Deprecate',
        icon: <Archive className="w-3.5 h-3.5" />,
        variant: 'destructive',
        onClick: handleBulkDeprecate,
      },
      {
        label: 'Export CSV',
        icon: <Download className="w-3.5 h-3.5" />,
        onClick: () => exportToCSV({ filename: 'documents', columns: csvColumns, data: selectedRows }),
      },
    ]}
  />
</>
```

### Pattern 3: MetricCard grid (Dashboard)

```typescript
<MetricCardGrid>
  <MetricCard
    label="Queries today"
    value={metrics.total_queries_today}
    format="integer"
    color="white"
    animateCount
    trend={{ value: `↑ ${metrics.query_growth}% vs yesterday`, direction: 'up' }}
  />
  <MetricCard
    label="Avg score"
    value={metrics.avg_validation_score}
    format="score"
    color="green"
    animateCount
    trend={{ value: `↑ ${metrics.score_delta} this week`, direction: 'up' }}
  />
  <MetricCard
    label="Green badge rate"
    value={metrics.green_badge_rate}
    format="percentage"
    color="green"
    animateCount
    trend={{ value: `${metrics.green_delta}% vs last week`, direction: 'up' }}
  />
  <MetricCard
    label="Open tickets"
    value={metrics.open_tickets}
    format="integer"
    color={metrics.open_tickets > 10 ? 'amber' : 'white'}
    trend={{
      value: `${metrics.new_tickets_today} new today`,
      direction: metrics.new_tickets_today > 0 ? 'up' : 'neutral',
      upIsPositive: false,  // more tickets = bad
    }}
  />
</MetricCardGrid>
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: DataTable renders with skeleton
# → Add <DataTable data={[]} columns={[]} keyField="id" isLoading skeletonRows={3} />
# → Should show 3 skeleton rows with shimmer animation

# Step 2: DataTable empty state
# → Add <DataTable data={[]} columns={cols} keyField="id" emptyTitle="No results" />
# → Should show empty state message

# Step 3: DataTable with data and selection
# → Add data={[{id:'1', name:'Test'}]}, selectable
# → Should render row with checkbox, clicking checkbox should update state

# Step 4: MetricCard counter animation
# → Add <MetricCard label="Test" value={247} animateCount />
# → Should count up from 0 to 247 over ~600ms on mount

# Step 5: BulkActionBar appears on selection
# → When selectedIds.size > 0, bar should slide up from bottom
# → When cleared, bar should slide down

# Step 6: ChartTooltip renders in Recharts
# → Add a simple LineChart with <Tooltip content={<ChartTooltip />} />
# → Hovering chart points should show styled tooltip

# Step 7: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F04: Data components — DataTable, MetricCard, BulkActionBar, FilterChips, EmptyState, ChartTooltip, csvExport"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F04*
