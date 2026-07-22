"use client"

import { motion, AnimatePresence } from "motion/react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SLIDE_UP_FROM_BOTTOM } from "@/lib/animations"

interface BulkAction {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: "default" | "destructive" | "secondary"
  loading?: boolean
}

interface BulkActionBarProps {
  selectedCount: number
  actions: BulkAction[]
  onClearSelection: () => void
  className?: string
}

/**
 * Bulk operation toolbar that slides up from the bottom when rows are
 * selected. Used on Documents, Registry, Tickets, and Audit Trail admin
 * pages.
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
export function BulkActionBar({ selectedCount, actions, onClearSelection, className }: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          variants={SLIDE_UP_FROM_BOTTOM}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-sticky",
            "flex items-center gap-3",
            "bg-bg-card border border-border-primary",
            "rounded-xl shadow-lg px-4 py-2.5",
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
            <span className="text-sm text-text-secondary">{selectedCount === 1 ? "item" : "items"} selected</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {actions.map((action, i) => (
              <Button
                key={i}
                variant={action.variant === "destructive" ? "destructive" : (action.variant ?? "outline")}
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
              "ml-1 p-1 rounded-md text-text-tertiary",
              "hover:text-text-primary hover:bg-bg-secondary",
              "transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
