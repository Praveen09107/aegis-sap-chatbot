"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { TIMING } from "@/lib/constants"

interface UsePollingOptions {
  /** Query key to invalidate/refetch on each interval */
  queryKey: readonly unknown[]
  /** Polling interval in ms. Default: 30s (TIMING.ADMIN_POLL_INTERVAL_MS) */
  intervalMs?: number
  /** Whether polling is active. Set to false to pause. */
  enabled?: boolean
}

/**
 * TanStack Query polling hook. Invalidates a query key on a fixed interval
 * to trigger a background refetch.
 *
 * Used for: admin dashboard metrics (30s), review queue badge count (30s),
 * system health grid (30s).
 *
 * @example
 * usePolling({
 *   queryKey: queryKeys.admin.metrics(),
 *   intervalMs: TIMING.ADMIN_POLL_INTERVAL_MS,
 *   enabled: isAdminUser,
 * })
 */
export function usePolling({ queryKey, intervalMs = TIMING.ADMIN_POLL_INTERVAL_MS, enabled = true }: UsePollingOptions) {
  const queryClient = useQueryClient()
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return

    intervalRef.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey })
    }, intervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [queryClient, queryKey, intervalMs, enabled])
}

/**
 * Returns a function reporting seconds until the next scheduled poll.
 * Used to display "Updated Xs ago / Next refresh in Ys" in the admin topbar.
 */
export function usePollingCountdown(intervalMs: number) {
  // Initialized to 0 (a pure value), then set to the real start time inside
  // an effect — calling Date.now() directly during render is impure and
  // flagged by eslint-plugin-react-hooks v7's react-hooks/purity rule.
  const startRef = useRef(0)

  useEffect(() => {
    startRef.current = Date.now()
  }, [intervalMs])

  function getSecondsUntilNext(): number {
    const elapsed = (Date.now() - startRef.current) % intervalMs
    return Math.ceil((intervalMs - elapsed) / 1000)
  }

  return getSecondsUntilNext
}
