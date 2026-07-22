import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"

// ── Analytics response types ──────────────────────────────────

interface TimeSeriesPoint {
  date: string
  value: number
}

interface AnalyticsResponse {
  // {date, score} — not the generic TimeSeriesPoint {date, value} shape,
  // to match ValidationScoreChart's real prop type (and the dashboard's own
  // validation_score_7d field naming, FRONTEND_17) exactly.
  validation_score_trend: Array<{ date: string; score: number }>
  confidence_distribution: {
    date: string
    green: number
    amber: number
    none: number
  }[]
  cache_performance: {
    date: string
    hit_rate: number
    total_queries: number
  }[]
  retrieval_mode_usage: {
    date: string
    mode_a: number // CRAG-corrected
    mode_b: number // standard retrieval
    mode_c: number // insufficient
  }[]
  top_modules: Array<{ module: string; query_count: number; avg_score: number }>
  query_volume: TimeSeriesPoint[]
}

/**
 * Analytics time-series data.
 * Used by: Admin Analytics page (FRONTEND_22).
 *
 * @param range - '7d' | '30d' | '90d' | 'all'
 */
export function useAdminAnalytics(range: string) {
  return useQuery({
    queryKey: queryKeys.admin.analytics(range),
    queryFn: () => api.get<AnalyticsResponse>(`admin/analytics?range=${range}`),
    staleTime: 5 * 60_000, // Analytics is heavy — cache for 5 min
    gcTime: 15 * 60_000,
    // Keep previous data visible while new range loads
    placeholderData: (prev) => prev,
  })
}
