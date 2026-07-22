"use client"

import { useRouter } from "next/navigation"
import { Upload, CheckSquare, Activity } from "lucide-react"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { DashboardRefreshIndicator } from "@/components/admin/DashboardRefreshIndicator"
import { MetricCard, MetricCardGrid } from "@/components/admin/MetricCard"
import { ValidationScoreChart, ConfidenceDistChart, RetrievalModeChart } from "@/components/admin/charts"
import { GapEventsList } from "@/components/admin/GapEventsList"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { useAdminMetrics } from "@/hooks/queries"
import { cn } from "@/lib/utils"

/**
 * Admin Dashboard — the live quality command centre.
 *
 * Data source: useAdminMetrics() polling every 30 seconds, against
 * GET /admin/metrics.
 *
 * NOTE: confirmed (2026-07-21) this endpoint does not exist on the real
 * backend yet (see MetricsData's own doc comment in src/types/index.ts).
 * This page is built complete and production-grade against the spec'd
 * contract — until a backend session adds the matching endpoint, every
 * card/chart below shows its own real isLoading state (never fake data),
 * matching the precedent already established for the F09 screenshot-upload
 * backend gap.
 */
export default function AdminDashboardPage() {
  const router = useRouter()
  const { data: metrics, isLoading, dataUpdatedAt } = useAdminMetrics()

  return (
    <AdminPageWrapper>
      {/* Page header with refresh indicator */}
      <AdminPageHeader
        title="Dashboard"
        description="Live quality overview"
        actions={
          // Nothing meaningful to show a countdown against before the first
          // fetch resolves — dataUpdatedAt is 0 until then. Calling
          // Date.now() as a render-time fallback would violate the React
          // Compiler's purity rule (impure call during render); waiting for
          // isLoading to clear avoids needing one at all.
          !isLoading ? <DashboardRefreshIndicator dataUpdatedAt={dataUpdatedAt} /> : undefined
        }
      />

      {/* ── Row 1: KPI metric cards ── */}
      <ErrorBoundary section="metrics">
        <MetricCardGrid>
          <MetricCard
            label="Queries today"
            value={metrics?.total_queries_today ?? 0}
            format="integer"
            color="white"
            isLoading={isLoading}
            animateCount
            trend={metrics ? { value: "Live count", direction: "neutral" } : undefined}
          />
          <MetricCard
            label="Avg ValidationScore"
            value={metrics?.avg_validation_score ?? 0}
            format="score"
            color={
              !metrics
                ? "white"
                : metrics.avg_validation_score >= 0.85
                  ? "green"
                  : metrics.avg_validation_score >= 0.7
                    ? "amber"
                    : "red"
            }
            isLoading={isLoading}
            animateCount
            trend={
              metrics
                ? { value: `${(metrics.green_badge_rate * 100).toFixed(0)}% green`, direction: "neutral" }
                : undefined
            }
          />
          <MetricCard
            label="Green badge rate"
            value={metrics?.green_badge_rate ?? 0}
            format="percentage"
            color={
              !metrics
                ? "white"
                : metrics.green_badge_rate >= 0.7
                  ? "green"
                  : metrics.green_badge_rate >= 0.5
                    ? "amber"
                    : "red"
            }
            isLoading={isLoading}
            animateCount
            trend={
              metrics
                ? { value: `${(metrics.cache_hit_rate * 100).toFixed(0)}% cache hit`, direction: "neutral" }
                : undefined
            }
          />
          <MetricCard
            label="Open tickets"
            value={metrics?.open_tickets ?? 0}
            format="integer"
            color={!metrics ? "white" : metrics.open_tickets === 0 ? "green" : metrics.open_tickets <= 5 ? "white" : "amber"}
            isLoading={isLoading}
            animateCount
            trend={
              metrics?.open_tickets && metrics.open_tickets > 0
                ? { value: "Needs review", direction: "up", upIsPositive: false }
                : undefined
            }
          />
        </MetricCardGrid>
      </ErrorBoundary>

      {/* ── Row 2: Charts ── */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <ErrorBoundary section="ValidationScore chart">
          <ValidationScoreChart data={metrics?.validation_score_7d ?? []} isLoading={isLoading} />
        </ErrorBoundary>

        <ErrorBoundary section="confidence distribution chart">
          <ConfidenceDistChart data={metrics?.confidence_dist_7d ?? []} isLoading={isLoading} />
        </ErrorBoundary>
      </div>

      {/* ── Row 3: Retrieval mode + Gap events ── */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        <ErrorBoundary section="retrieval mode chart">
          <RetrievalModeChart
            modeA={metrics?.mode_a_rate ?? 0}
            modeB={metrics?.mode_b_rate ?? 0}
            modeC={metrics?.mode_c_rate ?? 0}
            cacheHitRate={metrics?.cache_hit_rate ?? 0}
            isLoading={isLoading}
          />
        </ErrorBoundary>

        <div className="col-span-2">
          <ErrorBoundary section="gap events list">
            <GapEventsList events={metrics?.gap_events ?? []} isLoading={isLoading} maxItems={5} />
          </ErrorBoundary>
        </div>
      </div>

      {/* ── Review queue alert banner ── */}
      {!isLoading && metrics && metrics.open_tickets > 0 && (
        <div
          className={cn("mt-3 flex items-center justify-between", "bg-warning-bg border border-warning-border rounded-xl px-4 py-3")}
          role="alert"
        >
          <div className="flex items-center gap-2.5">
            <CheckSquare className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
            <span className="text-sm text-warning-text font-medium">
              {metrics.open_tickets} ticket{metrics.open_tickets > 1 ? "s" : ""} need
              {metrics.open_tickets === 1 ? "s" : ""} review
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/admin/review-queue")}
            className="border-warning-border text-warning-text hover:bg-warning-bg"
          >
            Review now
          </Button>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className="mt-4 flex items-center gap-3">
        <p className="text-xs text-text-tertiary">Quick actions:</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/admin/documents")}>
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          Upload document
        </Button>
        <Button variant="outline" size="sm" onClick={() => router.push("/admin/system-health")}>
          <Activity className="w-3.5 h-3.5" aria-hidden="true" />
          System health
        </Button>
      </div>
    </AdminPageWrapper>
  )
}
