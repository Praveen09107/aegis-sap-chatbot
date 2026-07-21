"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import type { GapEvent } from "@/types"

interface GapEventsListProps {
  events: GapEvent[]
  isLoading?: boolean
  maxItems?: number
  className?: string
}

const SEVERITY_DOT: Record<GapEvent["severity"], string> = {
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-purple",
}

/**
 * Knowledge gap events list — shown on the admin dashboard.
 * Shows top N gap patterns with frequency and quick navigation.
 *
 * Full analysis is available on the Knowledge Gaps page.
 */
export function GapEventsList({ events, isLoading, maxItems = 5, className }: GapEventsListProps) {
  if (isLoading) {
    return (
      <div className={cn("chart-card", className)}>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-16" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-t border-border-primary">
            <Skeleton className="w-2 h-2 rounded-full shrink-0" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-20 shrink-0" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn("chart-card flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <p className="chart-title">Knowledge gap events</p>
        <Link
          href="/admin/knowledge-gaps"
          className={cn("text-xs text-accent hover:text-accent-hover transition-colors", "flex items-center gap-1")}
        >
          View all
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <p className="text-xs text-text-tertiary py-4 text-center">No recurring gap events this week</p>
      ) : (
        <div role="list" aria-label="Top knowledge gap events">
          {events.slice(0, maxItems).map((event, i) => (
            <Link
              key={i}
              href="/admin/knowledge-gaps"
              className={cn(
                "flex items-center gap-3 py-2.5",
                "border-t border-border-primary first:border-t-0",
                "hover:bg-bg-secondary -mx-4 px-4 transition-colors",
                "group"
              )}
              role="listitem"
            >
              {/* Severity dot */}
              <span className={cn("w-2 h-2 rounded-full shrink-0", SEVERITY_DOT[event.severity])} aria-hidden="true" />

              {/* Pattern text */}
              <span className="flex-1 text-sm text-text-primary truncate group-hover:text-accent transition-colors">
                {event.query_pattern}
              </span>

              {/* Module tag */}
              <span className="text-xs font-mono text-text-tertiary bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5 shrink-0">
                {event.module}
              </span>

              {/* Count */}
              <span className="text-xs text-text-tertiary tabular-nums shrink-0 w-20 text-right">
                {event.count_this_week} this week
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
