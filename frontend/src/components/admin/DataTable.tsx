"use client"

import * as React from "react"
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"

// ── Column definition ──────────────────────────────────────
//
// Named AegisColumnDef, not ColumnDef — @tanstack/react-table (a real
// dependency of this project, per FRONTEND_MASTER_REFERENCE) exports its
// own ColumnDef type, and this file's own consumers import both in some
// admin pages; a same-named export would collide (SUPPLEMENT_05 Part 4).

export interface AegisColumnDef<TRow> {
  /** Unique identifier — used as sort key */
  id: string
  /** Column header label */
  header: string
  /** Cell renderer: receives the row and returns React content */
  cell: (row: TRow) => React.ReactNode
  /** Plain-value accessor for CSV export — cell() returns a React node,
   * which can't be serialized to CSV, so exports need this separate,
   * string/number-producing accessor instead (SUPPLEMENT_05 Part 7). */
  accessor?: (row: TRow) => string | number
  /** Whether this column is sortable. Default: false */
  sortable?: boolean
  /** Fixed width (e.g. '120px', '10%'). Omit for auto. */
  width?: string
  /** Text alignment. Default: 'left' */
  align?: "left" | "center" | "right"
  /** Additional className on the <td> */
  className?: string
}

// ── Sort state ──────────────────────────────────────────────

export interface SortState {
  column: string
  direction: "asc" | "desc"
}

// ── Pagination state ────────────────────────────────────────

export interface PaginationConfig {
  page: number // 1-indexed
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

// ── Props ───────────────────────────────────────────────────

export interface DataTableProps<TRow extends { [K in IdField]: string }, IdField extends keyof TRow = keyof TRow> {
  data: TRow[]
  columns: AegisColumnDef<TRow>[]
  /** The field on TRow that uniquely identifies each row */
  keyField: IdField

  isLoading?: boolean
  /** Number of skeleton rows to show while loading. Default: 5 */
  skeletonRows?: number

  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode

  selectable?: boolean
  selectedKeys?: Set<string>
  onSelectionChange?: (keys: Set<string>) => void

  onRowClick?: (row: TRow) => void
  /** Adds cursor-pointer and hover highlight when set */
  clickable?: boolean

  sortState?: SortState | null
  onSortChange?: (state: SortState) => void

  pagination?: PaginationConfig

  className?: string
  tableClassName?: string

  /** ARIA label for the table (for screen readers) */
  "aria-label"?: string
}

// ── Sort icon component ──────────────────────────────────────

function SortIcon({ column, sortState }: { column: string; sortState?: SortState | null }) {
  if (!sortState || sortState.column !== column) {
    return (
      <ChevronsUpDown
        className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden="true"
      />
    )
  }
  return sortState.direction === "asc" ? (
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
  emptyTitle = "No results",
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
  "aria-label": ariaLabel,
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

  // ⌘A selects/deselects all rows (FRONTEND_27_ACCESSIBILITY.md's keyboard
  // map lists this; FRONTEND_SUPPLEMENT_02 confirmed it was never wired up).
  // useKeyboardShortcuts' default ignoreInInput already skips this while
  // focus is in a text input/textarea, so a user selecting text in an
  // admin page's search box still gets the browser's native select-all-text
  // behavior instead of this being hijacked. Registered as an empty array
  // (rather than just checking `selectable` inside the handler) when this
  // table isn't selectable at all, so preventDefault never fires and ⌘A's
  // native "select all page text" behavior is left alone on non-selectable
  // tables (Registry, Config Snapshot, etc. don't use row selection).
  useKeyboardShortcuts(
    selectable && onSelectionChange
      ? [
          {
            key: "a",
            meta: true,
            preventDefault: true,
            handler: () => {
              onSelectionChange(allSelected ? new Set() : new Set(allKeys))
            },
          },
        ]
      : []
  )

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
      onSortChange({ column: columnId, direction: "asc" })
    } else if (sortState.direction === "asc") {
      onSortChange({ column: columnId, direction: "desc" })
    } else {
      // Third click: reset sort (re-sort asc)
      onSortChange({ column: columnId, direction: "asc" })
    }
  }

  // ── Keyboard navigation on rows ─────────────────────────────

  function handleRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, row: TRow) {
    const tr = e.currentTarget
    if (e.key === "ArrowDown") {
      e.preventDefault()
      const next = tr.nextElementSibling as HTMLElement | null
      next?.focus()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const prev = tr.previousElementSibling as HTMLElement | null
      prev?.focus()
    } else if (e.key === "Enter" && onRowClick) {
      e.preventDefault()
      onRowClick(row)
    } else if (e.key === " " && selectable) {
      e.preventDefault()
      const key = String(row[keyField])
      handleSelectRow(key, !selectedKeys.has(key))
    }
  }

  // ── Loading skeleton ────────────────────────────────────────

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-border-primary overflow-hidden", className)}>
        <Table className={tableClassName} aria-label={ariaLabel ?? "Loading data"} aria-busy="true">
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
                    <Skeleton className="h-3" style={{ width: `${60 + ((i + j) % 3) * 15}%` }} />
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
      <div className={cn("rounded-xl border border-border-primary overflow-hidden", className)}>
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
          {emptyDescription && <p className="text-sm text-text-tertiary max-w-xs leading-relaxed">{emptyDescription}</p>}
          {emptyAction && <div className="mt-3">{emptyAction}</div>}
        </div>
      </div>
    )
  }

  // ── Main table ──────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col gap-0", className)}>
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
                    data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                    className="data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent"
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  style={{ width: col.width }}
                  className={cn(
                    "text-xs font-semibold text-text-tertiary uppercase tracking-wider",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right"
                  )}
                  // aria-sort belongs on the columnheader cell itself, not
                  // the inner toggle button — jsx-a11y/role-supports-aria-props
                  // correctly flags aria-sort on a plain button (implicit
                  // role="button", which doesn't support aria-sort at all).
                  aria-sort={
                    col.sortable && onSortChange
                      ? sortState?.column === col.id
                        ? sortState.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                >
                  {col.sortable && onSortChange ? (
                    <button
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        "group inline-flex items-center gap-1.5",
                        "hover:text-text-primary transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded",
                        sortState?.column === col.id && "text-text-primary"
                      )}
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
                  role={isClickable ? "button" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={isClickable ? (e) => handleRowKeyDown(e, row) : undefined}
                  className={cn(
                    "border-b border-border-primary last:border-0",
                    "transition-colors duration-100",
                    isSelected && "bg-accent-subtle",
                    isClickable && !isSelected && "hover:bg-bg-secondary cursor-pointer",
                    !isClickable && "hover:bg-bg-secondary/50",
                    "focus-visible:outline-none focus-visible:bg-bg-secondary",
                    "animate-fade-in"
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
                        "text-sm text-text-primary",
                        col.align === "center" && "text-center",
                        col.align === "right" && "text-right",
                        col.className
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
      {pagination && <TablePagination pagination={pagination} />}
    </div>
  )
}

// ── Pagination sub-component ─────────────────────────────────

function TablePagination({ pagination }: { pagination: PaginationConfig }) {
  const { page, pageSize, total, onPageChange } = pagination
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between px-2 py-3">
      <p className="text-xs text-text-tertiary">
        Showing{" "}
        <span className="font-medium text-text-secondary">
          {start}–{end}
        </span>{" "}
        of <span className="font-medium text-text-secondary">{total}</span> results
      </p>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => onPageChange(1)} disabled={page === 1} aria-label="First page">
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
