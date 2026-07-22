import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { TIMING } from "@/lib/constants"
import type { MetricsData, SystemHealthData } from "@/types"

/**
 * Admin dashboard live metrics — polls every 30 seconds.
 * Shows: query counts, confidence distributions, cache hit rate, open tickets.
 *
 * staleTime: 0 — always considered stale so refetchInterval works correctly.
 * refetchIntervalInBackground: false — stops polling when tab is not focused.
 *
 * @example
 * const { data: metrics, isLoading, dataUpdatedAt } = useAdminMetrics()
 */
export function useAdminMetrics() {
  return useQuery({
    queryKey: queryKeys.admin.metrics(),
    // silent: true — dashboard shows degraded ("--") state inline instead of
    // a toast. This codebase's toast suppression is a per-request api.get()
    // option, not a query `meta` flag read by some global QueryCache
    // handler (no such handler exists here) — `meta` alone would do nothing.
    queryFn: () => api.get<MetricsData>("admin/metrics", { silent: true }),
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

/**
 * System health — polls every 30 seconds.
 * Shows the health status of all 19 Docker services.
 *
 * @example
 * const { data: health, isLoading } = useSystemHealth()
 * health?.services.forEach(svc => console.log(svc.name, svc.status))
 */
export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.admin.systemHealth(),
    queryFn: () => api.get<SystemHealthData>("admin/system-health"),
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

/**
 * Review queue pending count — used for AdminNav badge.
 * Polls every 30 seconds.
 *
 * @example
 * const { data: count = 0 } = useReviewQueueCount()
 */
export function useReviewQueueCount() {
  return useQuery({
    queryKey: queryKeys.admin.reviewQueue("pending-count"),
    queryFn: () => api.get<{ count: number }>("admin/review-queue/count", { silent: true }),
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    select: (data) => data.count,
  })
}
