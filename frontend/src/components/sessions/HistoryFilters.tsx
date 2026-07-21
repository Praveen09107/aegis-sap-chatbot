"use client"

import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ConfidenceBadge } from "@/types"

// ── Filter state type ────────────────────────────────────────
//
// No `search` field here — the history page's search box is the real,
// already-built SessionSearch component (F09), which reads/writes
// sessionStore.searchQuery directly rather than threading a value/onChange
// pair through a parent-owned filter object. Building a parallel `search`
// field here that nothing ever populates would be dead state.

export interface HistoryFilterState {
  module: string | null
  badge: ConfidenceBadge
  dateRange: "today" | "7d" | "30d" | "90d" | "all"
  unresolvedOnly: boolean
  sortBy: "date" | "confidence" | "turns"
}

export const DEFAULT_FILTERS: HistoryFilterState = {
  module: null,
  badge: null,
  dateRange: "all",
  unresolvedOnly: false,
  sortBy: "date",
}

interface HistoryFiltersProps {
  filters: HistoryFilterState
  onChange: (filters: Partial<HistoryFilterState>) => void
  onClearAll: () => void
  totalResults: number
  isLoading?: boolean
}

const MODULES = ["SD", "FI", "MM", "HR", "PP", "CO", "BASIS"]
const DATE_RANGES = [
  { label: "All time", value: "all" as const },
  { label: "Today", value: "today" as const },
  { label: "Last 7 days", value: "7d" as const },
  { label: "Last 30 days", value: "30d" as const },
  { label: "Last 90 days", value: "90d" as const },
]
const SORT_OPTIONS = [
  { label: "Most recent", value: "date" as const },
  { label: "Highest confidence", value: "confidence" as const },
  { label: "Most turns", value: "turns" as const },
]

const hasActiveFilters = (f: HistoryFilterState) =>
  f.module !== null || f.badge !== null || f.dateRange !== "all" || f.unresolvedOnly || f.sortBy !== "date"

/**
 * Filter and sort controls for the session history page.
 * Rendered as a compact toolbar row with dropdowns and a checkbox.
 */
export function HistoryFilters({ filters, onChange, onClearAll, totalResults, isLoading }: HistoryFiltersProps) {
  const active = hasActiveFilters(filters)

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Module filter */}
        <FilterSelect
          label="Module"
          value={filters.module ?? ""}
          options={[{ label: "All modules", value: "" }, ...MODULES.map((m) => ({ label: m, value: m }))]}
          onChange={(v) => onChange({ module: v || null })}
        />

        {/* Badge filter */}
        <FilterSelect
          label="Confidence"
          value={filters.badge ?? ""}
          options={[
            { label: "All levels", value: "" },
            { label: "🟢 High", value: "green" },
            { label: "🟡 Moderate", value: "amber" },
            { label: "🔴 Insufficient", value: "none" },
          ]}
          onChange={(v) => onChange({ badge: (v || null) as HistoryFilterState["badge"] })}
        />

        {/* Date range filter */}
        <FilterSelect
          label="Date"
          value={filters.dateRange}
          options={DATE_RANGES.map((d) => ({ label: d.label, value: d.value }))}
          onChange={(v) => onChange({ dateRange: v as HistoryFilterState["dateRange"] })}
        />

        {/* Sort by */}
        <FilterSelect
          label="Sort"
          value={filters.sortBy}
          options={SORT_OPTIONS.map((s) => ({ label: s.label, value: s.value }))}
          onChange={(v) => onChange({ sortBy: v as HistoryFilterState["sortBy"] })}
        />

        {/* Unresolved only */}
        <label
          className={cn(
            "flex items-center gap-2 px-3 h-8 rounded-lg cursor-pointer select-none",
            "border text-sm font-medium",
            "transition-colors duration-[var(--duration-normal)]",
            filters.unresolvedOnly
              ? "bg-warning-bg border-warning-border text-warning-text"
              : "bg-bg-secondary border-border-primary text-text-secondary hover:border-border-secondary hover:text-text-primary"
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
          {totalResults === 0 ? (
            "No sessions found"
          ) : (
            <>
              <span className="font-medium text-text-secondary">{totalResults}</span>{" "}
              session{totalResults !== 1 ? "s" : ""}
              {active ? " matching your filters" : " total"}
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
  const isActive = value !== "" && value !== "all" && value !== "date"

  return (
    <div className="relative">
      <label
        className={cn(
          "flex items-center gap-1.5 px-3 h-8 rounded-lg cursor-pointer select-none",
          "border text-sm font-medium",
          "transition-colors duration-[var(--duration-normal)]",
          isActive
            ? "bg-accent-subtle border-border-focus text-accent-text"
            : "bg-bg-secondary border-border-primary text-text-secondary hover:border-border-secondary hover:text-text-primary"
        )}
      >
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label={label}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {selectedLabel}
        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" aria-hidden="true" />
      </label>
    </div>
  )
}
