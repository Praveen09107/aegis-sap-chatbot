"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { CONFIDENCE } from "@/lib/constants"

interface FreshnessIndicatorProps {
  verifiedDate: string
  className?: string
}

/**
 * Document freshness indicator — shows how stale the source document is.
 * Green: within 35 days (fresh). Amber: 35-70 days (review recommended).
 * Red: >70 days (stale — may need re-verification).
 */
export function FreshnessIndicator({ verifiedDate, className }: FreshnessIndicatorProps) {
  // Date.now() is impure — flagged if called directly during render by
  // eslint-plugin-react-hooks v7's react-hooks/purity rule. A lazy useState
  // initializer runs once, at mount, which the rule treats as the
  // sanctioned place for a one-time impure read; day-level staleness
  // doesn't need to live-update anyway.
  const [now] = useState(() => Date.now())
  const days = Math.floor((now - new Date(verifiedDate).getTime()) / (1000 * 60 * 60 * 24))

  const isFresh = days <= CONFIDENCE.FRESHNESS_WARN_DAYS
  const isStale = days > CONFIDENCE.FRESHNESS_CRIT_DAYS

  const config = isStale
    ? { color: "text-danger", label: `Stale — ${days} days old` }
    : !isFresh
      ? { color: "text-warning", label: `Aging — ${days} days old` }
      : { color: "text-success", label: `Fresh — ${days} days old` }

  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      <span
        className={cn("w-1.5 h-1.5 rounded-full shrink-0", {
          "bg-success": isFresh,
          "bg-warning": !isFresh && !isStale,
          "bg-danger": isStale,
        })}
        aria-hidden="true"
      />
      <span className={config.color}>{config.label}</span>
    </div>
  )
}
