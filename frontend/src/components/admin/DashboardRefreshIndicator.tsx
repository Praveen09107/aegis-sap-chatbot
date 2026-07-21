"use client"

import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePollingCountdown } from "@/hooks/usePollingCountdown"
import { TIMING } from "@/lib/constants"

interface DashboardRefreshIndicatorProps {
  /** Timestamp of last successful data fetch (from TanStack Query's dataUpdatedAt) */
  dataUpdatedAt: number
  /** Polling interval in ms — shown as "Next in Xs" */
  intervalMs?: number
  className?: string
}

/**
 * Shows live "Updated Xs ago · Next in Ys" in the admin dashboard.
 * Countdown logic itself lives in usePollingCountdown — this component is
 * purely presentational.
 *
 * @example
 * const { data, dataUpdatedAt } = useAdminMetrics()
 * <DashboardRefreshIndicator dataUpdatedAt={dataUpdatedAt} />
 */
export function DashboardRefreshIndicator({
  dataUpdatedAt,
  intervalMs = TIMING.ADMIN_POLL_INTERVAL_MS,
  className,
}: DashboardRefreshIndicatorProps) {
  const { secondsSince, secondsUntilNext } = usePollingCountdown(dataUpdatedAt, intervalMs)

  return (
    <div
      className={cn("flex items-center gap-1.5 text-xs text-text-tertiary", className)}
      role="status"
      aria-live="polite"
      aria-label={`Data updated ${secondsSince} seconds ago`}
    >
      <RefreshCw className={cn("w-3 h-3 shrink-0", secondsUntilNext === 0 && "animate-spin text-accent")} aria-hidden="true" />
      <span className="tabular-nums">
        Updated {secondsSince}s ago
        <span className="opacity-60 ml-1">· Next in {secondsUntilNext}s</span>
      </span>
    </div>
  )
}
