"use client"

import { useState, useEffect } from "react"
import { TIMING } from "@/lib/constants"

/**
 * Returns seconds since last data update and seconds until next poll.
 * Used in Admin Dashboard to show "Updated 22s ago · Next in 8s".
 *
 * @param dataUpdatedAt - Timestamp of last successful fetch (from useQuery result)
 * @param intervalMs - Polling interval (default: 30s)
 */
export function usePollingCountdown(dataUpdatedAt: number, intervalMs: number = TIMING.ADMIN_POLL_INTERVAL_MS) {
  const [secondsSince, setSecondsSince] = useState(0)

  useEffect(() => {
    const tick = () => {
      setSecondsSince(Math.floor((Date.now() - dataUpdatedAt) / 1000))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [dataUpdatedAt])

  const secondsUntilNext = Math.max(0, Math.round(intervalMs / 1000) - secondsSince)

  return { secondsSince, secondsUntilNext }
}
