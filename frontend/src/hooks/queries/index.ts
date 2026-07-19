/**
 * TanStack Query hooks — STUB version (FRONTEND_09_LAYOUT_COMPONENTS.md
 * Step 0). Full implementation: FRONTEND_11_TANSTACK_QUERY.md (session F08).
 * Do NOT rename exports — they are imported by all layout and page
 * components built in this session.
 */

import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryKeys"
import { api } from "@/lib/api"
import { TIMING } from "@/lib/constants"
import type { Session, MetricsData, DocumentRecord, SystemHealthData, SessionFilters, DocFilters } from "@/types"

// ── Session hooks ─────────────────────────────────────────────

export function useSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: queryKeys.sessions.list(filters),
    queryFn: () => api.get<Session[]>("sessions"),
    staleTime: 30_000,
  })
}

export function useSession(id: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(id ?? ""),
    queryFn: () => api.get<Session>(`sessions/${id}`),
    enabled: !!id,
  })
}

// ── Admin metric hooks ────────────────────────────────────────

export function useAdminMetrics() {
  return useQuery({
    queryKey: queryKeys.admin.metrics(),
    queryFn: () => api.get<MetricsData>("admin/metrics"),
    staleTime: 0,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

export function useAdminDocuments(filters?: DocFilters) {
  return useQuery({
    queryKey: queryKeys.admin.documents(filters),
    queryFn: () => api.get<DocumentRecord[]>("admin/documents"),
  })
}

export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.admin.systemHealth(),
    queryFn: () => api.get<SystemHealthData>("admin/system-health"),
    staleTime: 0,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
  })
}

export function useReviewQueueCount() {
  return useQuery({
    queryKey: queryKeys.admin.reviewQueue("pending"),
    queryFn: () => api.get<{ count: number }>("admin/review-queue/count"),
    staleTime: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    select: (data) => data.count,
  })
}

export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences.all(),
    queryFn: () => api.get("preferences"),
    staleTime: Infinity,
  })
}
