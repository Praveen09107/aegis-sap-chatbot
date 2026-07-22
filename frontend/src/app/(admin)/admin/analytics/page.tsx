"use client"

import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { ValidationScoreChart } from "@/components/admin/charts/ValidationScoreChart"
import { ConfidenceDistChart } from "@/components/admin/charts/ConfidenceDistChart"
import { QueryVolumeChart } from "@/components/admin/charts/QueryVolumeChart"
import { CachePerformanceChart } from "@/components/admin/charts/CachePerformanceChart"
import { TopModulesChart } from "@/components/admin/charts/TopModulesChart"
import { RetrievalModeChart } from "@/components/admin/charts/RetrievalModeChart"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { useAdminAnalytics } from "@/hooks/queries"
import { useAdminStore } from "@/stores/adminStore"
import { ANALYTICS_RANGES } from "@/lib/constants"
import { cn } from "@/lib/utils"

/**
 * Analytics page — multi-chart quality trend reporting.
 *
 * NOTE: GET /admin/analytics (confirmed 2026-07-22) still does not exist on
 * the real backend — same disclosed gap as the dashboard's /admin/metrics
 * (F11) and this page's own sibling /admin/system-health. Built fully per
 * FRONTEND_22 anyway (real code, honest degraded/empty state via the api
 * client's own error handling, ready to light up the moment a backend
 * session adds this endpoint) — same precedent, not an invented workaround.
 *
 * Charts (6 total, arranged in 3 rows of 2):
 * Row 1: ValidationScore trend + Query volume
 * Row 2: Confidence distribution + Cache performance
 * Row 3: Top modules + Retrieval mode breakdown
 *
 * No live polling — data refreshes when the date range changes.
 */
export default function AdminAnalyticsPage() {
  const { analyticsRange, setAnalyticsRange } = useAdminStore()
  const { data: analytics, isLoading } = useAdminAnalytics(analyticsRange)

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Analytics"
        description="Quality trend reporting"
        actions={
          <div className="flex items-center gap-1.5">
            {ANALYTICS_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => setAnalyticsRange(range.value)}
                className={cn(
                  "text-xs font-medium px-3 h-8 rounded-lg border transition-colors",
                  analyticsRange === range.value
                    ? "bg-accent-subtle border-border-focus text-accent-text"
                    : "bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary"
                )}
                aria-pressed={analyticsRange === range.value}
              >
                {range.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Row 1: Score trend + Query volume */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <ErrorBoundary section="ValidationScore trend chart">
          <ValidationScoreChart data={analytics?.validation_score_trend ?? []} isLoading={isLoading} />
        </ErrorBoundary>

        <ErrorBoundary section="query volume chart">
          <QueryVolumeChart data={analytics?.query_volume ?? []} isLoading={isLoading} />
        </ErrorBoundary>
      </div>

      {/* Row 2: Confidence distribution + Cache performance */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <ErrorBoundary section="confidence distribution chart">
          <ConfidenceDistChart data={analytics?.confidence_distribution ?? []} isLoading={isLoading} />
        </ErrorBoundary>

        <ErrorBoundary section="cache performance chart">
          <CachePerformanceChart data={analytics?.cache_performance ?? []} isLoading={isLoading} />
        </ErrorBoundary>
      </div>

      {/* Row 3: Top modules + Retrieval mode */}
      <div className="grid grid-cols-2 gap-3">
        <ErrorBoundary section="top modules chart">
          <TopModulesChart data={analytics?.top_modules ?? []} isLoading={isLoading} />
        </ErrorBoundary>

        <ErrorBoundary section="retrieval mode chart">
          <RetrievalModeChart
            modeA={analytics?.retrieval_mode_usage?.at(-1)?.mode_a ?? 0}
            modeB={analytics?.retrieval_mode_usage?.at(-1)?.mode_b ?? 0}
            modeC={analytics?.retrieval_mode_usage?.at(-1)?.mode_c ?? 0}
            cacheHitRate={analytics?.cache_performance?.at(-1)?.hit_rate ?? 0}
            isLoading={isLoading}
          />
        </ErrorBoundary>
      </div>
    </AdminPageWrapper>
  )
}
