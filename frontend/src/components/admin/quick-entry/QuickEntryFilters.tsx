import { Search, X, Loader2 } from "lucide-react"
import { QUICK_ENTRY_STATUS_OPTIONS, SAP_MODULES } from "@/lib/constants"

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
  search,
  onSearchChange,
  moduleFilter,
  onModuleChange,
  typeFilter,
  onTypeChange,
  statusFilter,
  onStatusChange,
  includeArchived,
  onIncludeArchivedChange,
  hasActiveFilters,
  onClearFilters,
  resultCount,
  isFetching,
}: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search by ID or title…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-7 pr-3 h-8 text-xs rounded-md border border-border-primary bg-bg-secondary text-text-primary focus:outline-none focus:border-border-focus placeholder:text-text-tertiary"
          aria-label="Search Quick Entries"
        />
      </div>

      {/* Module filter */}
      <select
        value={moduleFilter}
        onChange={(e) => onModuleChange(e.target.value)}
        className="text-xs h-8 px-2 rounded-md border border-border-primary bg-bg-secondary text-text-primary focus:outline-none focus:border-border-focus"
        aria-label="Filter by module"
      >
        <option value="">All modules</option>
        {Object.keys(SAP_MODULES).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {/* Type filter */}
      <select
        value={typeFilter}
        onChange={(e) => onTypeChange(e.target.value)}
        className="text-xs h-8 px-2 rounded-md border border-border-primary bg-bg-secondary text-text-primary focus:outline-none focus:border-border-focus"
        aria-label="Filter by content type"
      >
        <option value="">All types</option>
        <option value="error_guide">Error Guide</option>
        <option value="procedure">Procedure</option>
        <option value="config">Config Reference</option>
      </select>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        className="text-xs h-8 px-2 rounded-md border border-border-primary bg-bg-secondary text-text-primary focus:outline-none focus:border-border-focus"
        aria-label="Filter by status"
      >
        {QUICK_ENTRY_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Include archived checkbox */}
      <label className="flex items-center gap-1.5 text-xs text-text-tertiary cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => onIncludeArchivedChange(e.target.checked)}
          className="rounded border-border-primary"
        />
        Archived
      </label>

      {/* Result count + loading */}
      <div className="ml-auto flex items-center gap-2">
        {isFetching && <Loader2 className="w-3 h-3 animate-spin text-text-tertiary" aria-hidden="true" />}
        {resultCount !== null && (
          <span className="text-[10px] text-text-tertiary">
            {resultCount} result{resultCount !== 1 ? "s" : ""}
          </span>
        )}
        {hasActiveFilters && (
          <button onClick={onClearFilters} className="text-[10px] text-accent hover:underline flex items-center gap-1">
            <X className="w-2.5 h-2.5" aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
