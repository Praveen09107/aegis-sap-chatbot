"use client"

import { cn } from "@/lib/utils"
import { Keyboard } from "lucide-react"
import type { ReviewItem } from "@/hooks/queries/adminData"

interface ReviewItemListProps {
  items: ReviewItem[]
  currentIndex: number
  onSelect: (index: number) => void
  totalPending: number
}

/**
 * Left panel of the review queue split-pane.
 * Shows a scrollable list of pending items with active indicator.
 * Below the list: keyboard shortcut hints.
 */
export function ReviewItemList({ items, currentIndex, onSelect, totalPending }: ReviewItemListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-primary shrink-0">
        <p className="section-label">Review queue</p>
        <p className="text-xs text-text-tertiary mt-1">
          {totalPending} item{totalPending !== 1 ? "s" : ""} pending
        </p>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-2" role="list">
        {items.map((item, index) => {
          const isActive = index === currentIndex
          return (
            <button
              key={item.id}
              onClick={() => onSelect(index)}
              className={cn(
                "w-full text-left px-4 py-3 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus",
                isActive
                  ? "bg-bg-secondary border-l-2 border-l-accent"
                  : "hover:bg-bg-secondary/50 border-l-2 border-l-transparent"
              )}
              aria-current={isActive ? "true" : "false"}
              role="listitem"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-colors", isActive ? "bg-accent" : "bg-border-secondary")}
                  aria-hidden="true"
                />
                <span className="text-xs text-text-tertiary tabular-nums w-6 shrink-0">{index + 1}</span>
              </div>
              <p className="text-xs text-text-secondary line-clamp-2 mt-1 leading-snug ml-5">{item.query_text}</p>
            </button>
          )
        })}
      </div>

      {/* Keyboard shortcuts hints */}
      <div className="px-4 py-3 border-t border-border-primary shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5 mb-1">
          <Keyboard className="w-3 h-3 text-text-tertiary" aria-hidden="true" />
          <span className="section-label">Shortcuts</span>
        </div>
        {[
          { key: "J / K", label: "Navigate" },
          { key: "A", label: "Approve" },
          { key: "X", label: "Skip" },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <kbd className="text-[10px] font-medium bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5 text-text-secondary">
              {key}
            </kbd>
            <span className="text-xs text-text-tertiary">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
