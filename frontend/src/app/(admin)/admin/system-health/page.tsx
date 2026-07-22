"use client"

import { useState } from "react"
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { DashboardRefreshIndicator } from "@/components/admin/DashboardRefreshIndicator"
import { ServiceStatusGrid } from "@/components/admin/ServiceStatusGrid"
import { QuickEntryPipelineHealth } from "@/components/admin/QuickEntryPipelineHealth"
import { InferenceHealthPanel } from "@/components/admin/InferenceHealthPanel"
import { Drawer } from "@/components/ui/drawer"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { useSystemHealth, usePipelineHealth, useInferenceHealth, useAttentionEntries } from "@/hooks/queries"
import { cn, formatDateLocalized } from "@/lib/utils"
import type { ServiceHealth } from "@/types"

const OVERALL_CONFIG = {
  healthy: { bg: "bg-success-bg border-success-border", icon: CheckCircle2, text: "All services healthy", color: "text-success-text" },
  degraded: { bg: "bg-warning-bg border-warning-border", icon: AlertTriangle, text: "Some services degraded", color: "text-warning-text" },
  critical: { bg: "bg-danger-bg border-danger-border", icon: XCircle, text: "Critical services down", color: "text-danger-text" },
} as const

/**
 * System health page — the 19-service Docker grid (below) still runs
 * against the disclosed-gap useSystemHealth() hook (GET /admin/system-health
 * confirmed, 2026-07-22, still does not exist on the real backend — same
 * gap found in F11) — built fully per FRONTEND_22, ready to activate the
 * moment a backend session adds it, honest degraded state until then.
 *
 * The two sections below the grid are new, real, and confirmed live:
 * Quick Entry pipeline health (IMPL_29's addendum, real endpoint) and
 * Inference orchestration health (DEC-058, didn't exist when FRONTEND_22
 * was written at all).
 */
export default function AdminSystemHealthPage() {
  const { data: health, isLoading, dataUpdatedAt } = useSystemHealth()
  const { data: pipelineHealth, isLoading: pipelineLoading } = usePipelineHealth()
  const { data: inferenceHealth, isLoading: inferenceLoading } = useInferenceHealth()
  const { data: attentionEntries = [] } = useAttentionEntries()
  const [selectedService, setSelectedService] = useState<ServiceHealth | null>(null)

  const overallStatus = health?.overall_status ?? "healthy"
  const config = OVERALL_CONFIG[overallStatus] ?? OVERALL_CONFIG.healthy
  const Icon = config.icon

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="System health"
        description="19-service Docker status monitor"
        actions={!isLoading && <DashboardRefreshIndicator dataUpdatedAt={dataUpdatedAt} />}
      />

      {/* Overall status banner */}
      {!isLoading && health && (
        <div className={cn("flex items-center justify-between", "rounded-xl border px-4 py-3 mb-5", config.bg)} role="status" aria-live="polite">
          <div className="flex items-center gap-2.5">
            <Icon className={cn("w-4 h-4 shrink-0", config.color)} aria-hidden="true" />
            <span className={cn("text-sm font-semibold", config.color)}>{config.text}</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-success font-medium tabular-nums">{health.total_healthy} healthy</span>
            {health.total_unhealthy > 0 && <span className="text-danger font-medium tabular-nums">{health.total_unhealthy} down</span>}
            <span className="text-text-tertiary tabular-nums">{health.services.length} total</span>
          </div>
        </div>
      )}

      {/* Service grid */}
      <ErrorBoundary section="service status grid">
        <ServiceStatusGrid services={health?.services ?? []} isLoading={isLoading} onServiceClick={setSelectedService} />
      </ErrorBoundary>

      {/* Real health sections */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <ErrorBoundary section="Quick Entry pipeline health">
          <QuickEntryPipelineHealth data={pipelineHealth} attentionEntries={attentionEntries} isLoading={pipelineLoading} />
        </ErrorBoundary>
        <ErrorBoundary section="inference orchestration health">
          <InferenceHealthPanel data={inferenceHealth} isLoading={inferenceLoading} />
        </ErrorBoundary>
      </div>

      {/* Service detail drawer */}
      <Drawer
        open={!!selectedService}
        onOpenChange={(open) => !open && setSelectedService(null)}
        title={selectedService?.name ?? ""}
        description={selectedService ? `Status: ${selectedService.status}` : ""}
        width="md"
      >
        {selectedService && <ServiceDetailContent service={selectedService} />}
      </Drawer>
    </AdminPageWrapper>
  )
}

// ── Service detail drawer content ─────────────────────────────

function ServiceDetailContent({ service }: { service: ServiceHealth }) {
  const statusColorClass =
    service.status === "healthy" ? "text-success" : service.status === "degraded" ? "text-warning" : service.status === "unhealthy" ? "text-danger" : "text-text-tertiary"

  return (
    <div className="space-y-5">
      {/* Status */}
      <div>
        <p className="section-label mb-1.5">Current status</p>
        <p className={cn("text-base font-semibold capitalize", statusColorClass)}>{service.status}</p>
      </div>

      {/* Response time */}
      {service.response_time_ms != null && (
        <div>
          <p className="section-label mb-1.5">Response time</p>
          <p className="text-sm text-text-primary tabular-nums">{service.response_time_ms}ms</p>
        </div>
      )}

      {/* Last checked */}
      <div>
        <p className="section-label mb-1.5">Last checked</p>
        <p className="text-sm text-text-secondary">{formatDateLocalized(service.last_checked_at)}</p>
      </div>

      {/* Error message (if unhealthy/degraded) */}
      {service.error_message && (
        <div>
          <p className="section-label mb-1.5 text-danger-text">Error message</p>
          <div className="bg-danger-bg border border-danger-border rounded-xl p-3">
            <p className="text-xs font-mono text-danger-text leading-relaxed whitespace-pre-wrap break-all">{service.error_message}</p>
          </div>
        </div>
      )}

      {/* Health check tip */}
      <div className="pt-2 border-t border-border-primary">
        <p className="text-xs text-text-tertiary leading-relaxed">
          Health status is checked via HTTP GET to each service&apos;s{" "}
          <code className="font-mono bg-bg-tertiary px-1 py-0.5 rounded text-[10px]">/health</code> endpoint every 30 seconds. Response
          time includes network latency within the Docker network.
        </p>
      </div>
    </div>
  )
}
