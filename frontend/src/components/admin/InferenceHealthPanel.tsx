"use client"

import { AlertTriangle, CheckCircle2, XCircle, Zap } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatDateLocalized } from "@/lib/utils"
import type { InferenceHealthData } from "@/hooks/queries/adminHealth"

const BADGE_CONFIG = {
  green: { icon: CheckCircle2, bg: "bg-success-bg border-success-border", text: "text-success-text", label: "All chains healthy" },
  amber: { icon: AlertTriangle, bg: "bg-warning-bg border-warning-border", text: "text-warning-text", label: "Catalog drift detected" },
  red: { icon: XCircle, bg: "bg-danger-bg border-danger-border", text: "text-danger-text", label: "A chain has fully opened" },
} as const

const CIRCUIT_DOT: Record<string, string> = {
  closed: "bg-success",
  open: "bg-danger",
  "half-open": "bg-warning",
  half_open: "bg-warning",
}

const ROLE_LABELS: Record<string, string> = {
  main: "Main reasoning",
  judge: "Judge (CRAG)",
  vision: "Vision",
}

interface InferenceHealthPanelProps {
  data: InferenceHealthData | undefined
  isLoading?: boolean
  className?: string
}

/**
 * Inference gateway (N-tier model orchestration) health panel — new for
 * this session (DEC-058). Shows, per role (main/judge/vision), every tier
 * in that role's real failover chain with its circuit-breaker state and
 * remaining quota where the provider exposes one.
 *
 * Circuit state is per-process/in-memory only (2 uvicorn workers) — this is
 * a real, disclosed backend limitation: two page loads in a row can
 * legitimately show different circuit state for the same tier if they land
 * on different workers, not a rendering bug.
 */
export function InferenceHealthPanel({ data, isLoading, className }: InferenceHealthPanelProps) {
  if (isLoading || !data) {
    return (
      <div className={cn("surface-card p-4 space-y-4", className)}>
        <Skeleton className="h-4 w-44" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  const badge = BADGE_CONFIG[data.badge]
  const BadgeIcon = badge.icon
  const roles = Object.keys(data.chains)

  return (
    <div className={cn("surface-card p-4 space-y-5", className)}>
      {/* Header + badge */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Inference orchestration</p>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2.5 py-1", badge.bg, badge.text)}>
          <BadgeIcon className="w-3.5 h-3.5" aria-hidden="true" />
          {badge.label}
        </span>
      </div>

      {roles.map((role) => (
        <div key={role}>
          <p className="section-label mb-2">{ROLE_LABELS[role] ?? role}</p>
          <div className="space-y-1.5" role="list" aria-label={`${ROLE_LABELS[role] ?? role} tier chain`}>
            {data.chains[role].map((tier) => {
              const dotClass = tier.circuit_state ? (CIRCUIT_DOT[tier.circuit_state] ?? "bg-text-tertiary") : "bg-text-tertiary"
              return (
                <div
                  key={tier.tier_position}
                  role="listitem"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-secondary/50"
                >
                  <span className="text-xs text-text-tertiary tabular-nums w-4 shrink-0">{tier.tier_position}</span>
                  <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {tier.provider} <span className="text-text-tertiary font-normal">/ {tier.model}</span>
                    </p>
                    <p className="text-[11px] text-text-tertiary tabular-nums">
                      {tier.circuit_total_calls} calls · {tier.circuit_total_failures} failures
                      {tier.quota_remaining !== null && <> · {tier.quota_remaining} quota left</>}
                    </p>
                  </div>
                  {tier.last_known_in_catalog === false && (
                    <span className="text-xs text-danger-text shrink-0" title="Model missing from provider catalog">
                      <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {data.last_health_check?.checked_at && (
        <p className="text-xs text-text-tertiary pt-2 border-t border-border-primary">
          Last catalog check: {formatDateLocalized(data.last_health_check.checked_at)}
          {data.last_health_check.drift_found !== null && data.last_health_check.drift_found > 0 && (
            <span className="text-warning-text"> · {data.last_health_check.drift_found} drift(s) found</span>
          )}
        </p>
      )}
    </div>
  )
}
