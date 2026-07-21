"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { CONFIDENCE } from "@/lib/constants"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface StalenessIndicatorProps {
  verifiedDate: string // ISO date string
  daysSince?: number // Alternative: pass days directly
  /**
   * Server-computed staleness level (e.g. GET /admin/config-snapshot's real
   * `staleness` field) — when provided, takes precedence over client-side
   * threshold recomputation from daysSince/verifiedDate. Avoids drift
   * between the backend's own authoritative thresholds and this
   * component's CONFIDENCE.FRESHNESS_*_DAYS, which may not match.
   */
  staleness?: "fresh" | "warning" | "critical"
  className?: string
}

/**
 * Shows config/document staleness with a color-coded indicator.
 * Uses CONFIDENCE.FRESHNESS_WARN_DAYS (35) and CONFIDENCE.FRESHNESS_CRIT_DAYS (70)
 * when no server-computed `staleness` is given.
 *
 * Green:  < 35 days  → Fresh
 * Amber: 35–70 days  → Review recommended
 * Red:   > 70 days   → Stale — needs re-verification
 */
export function StalenessIndicator({ verifiedDate, daysSince, staleness, className }: StalenessIndicatorProps) {
  // Captured once at mount via the lazy-initializer form — reading Date.now()
  // directly in the render body on every render is flagged by the React
  // Compiler's purity rule (react-hooks/purity); a "days since verification"
  // display doesn't need per-render freshness the way a live countdown would.
  const [now] = useState(() => Date.now())
  const days = daysSince ?? Math.floor((now - new Date(verifiedDate).getTime()) / (1000 * 60 * 60 * 24))

  const isStale = staleness ? staleness === "critical" : days > CONFIDENCE.FRESHNESS_CRIT_DAYS
  const isAging = staleness ? staleness === "warning" : days > CONFIDENCE.FRESHNESS_WARN_DAYS

  const config = isStale
    ? {
        color: "text-danger",
        bg: "bg-danger-bg",
        border: "border-danger-border",
        label: "Stale",
        detail: `${days} days since last verification — update recommended`,
      }
    : isAging
      ? {
          color: "text-warning",
          bg: "bg-warning-bg",
          border: "border-warning-border",
          label: "Aging",
          detail: `${days} days since last verification`,
        }
      : {
          color: "text-success",
          bg: "bg-success-bg",
          border: "border-success-border",
          label: "Fresh",
          detail: `${days} days since last verification`,
        }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2 py-0.5 cursor-default",
              config.bg,
              config.border,
              config.color,
              className
            )}
          >
            <span
              className={cn("w-1.5 h-1.5 rounded-full shrink-0", {
                "bg-danger": isStale,
                "bg-warning": isAging && !isStale,
                "bg-success": !isAging,
              })}
              aria-hidden="true"
            />
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
