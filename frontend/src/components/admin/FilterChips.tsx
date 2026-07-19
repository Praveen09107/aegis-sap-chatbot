"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"

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
 * Active filter chips display with remove buttons. Used on Audit Trail,
 * Documents, and Knowledge Gaps pages.
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
    <div className={cn("flex items-center flex-wrap gap-2", className)} role="group" aria-label="Active filters">
      <span className="text-xs text-text-tertiary font-medium">Filters:</span>

      {chips.map((chip) => (
        <div
          key={chip.id}
          className={cn(
            "inline-flex items-center gap-1.5",
            "bg-accent-subtle border border-border-focus/30",
            "text-accent-text text-xs font-medium",
            "rounded-full pl-2.5 pr-1.5 py-0.5"
          )}
        >
          <span className="text-text-tertiary">{chip.label}:</span>
          <span>{chip.value}</span>
          <button
            onClick={() => onRemove(chip.id)}
            className={cn(
              "w-3.5 h-3.5 rounded-full",
              "flex items-center justify-center",
              "text-accent-text/60 hover:text-accent-text",
              "hover:bg-accent/10",
              "transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
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
