"use client"

import { cn } from "@/lib/utils"
import type { ServiceHealth } from "@/types"

interface ServiceTileProps {
  service: ServiceHealth
  onClick: (service: ServiceHealth) => void
}

const STATUS_CONFIG: Record<
  ServiceHealth["status"],
  {
    dot: string
    bg: string
    border: string
    label: string
    textColor: string
  }
> = {
  healthy: { dot: "bg-success", bg: "bg-success-bg/30", border: "border-success-border/40", label: "Healthy", textColor: "text-success-text" },
  degraded: { dot: "bg-warning", bg: "bg-warning-bg/30", border: "border-warning-border/40", label: "Degraded", textColor: "text-warning-text" },
  unhealthy: { dot: "bg-danger", bg: "bg-danger-bg/40", border: "border-danger-border/50", label: "Down", textColor: "text-danger-text" },
  unknown: { dot: "bg-text-tertiary", bg: "bg-bg-tertiary", border: "border-border-primary", label: "Unknown", textColor: "text-text-tertiary" },
}

function formatServiceName(fullName: string): string {
  return fullName.replace(/^aegis-/, "").replace(/-/g, " ")
}

/**
 * Individual service status tile for the system health grid.
 * Color-coded by status. Click opens the service detail drawer.
 */
export function ServiceTile({ service, onClick }: ServiceTileProps) {
  const config = STATUS_CONFIG[service.status]
  const displayName = formatServiceName(service.name)

  return (
    <button
      onClick={() => onClick(service)}
      className={cn(
        "flex flex-col gap-1.5 p-3 rounded-xl border",
        "text-left w-full",
        "transition-all duration-[var(--duration-normal)]",
        "hover:shadow-md hover:scale-[1.02]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        "active:scale-[0.98]",
        config.bg,
        config.border
      )}
      aria-label={`${displayName}: ${config.label}${service.response_time_ms != null ? `, ${service.response_time_ms}ms` : ""}`}
    >
      {/* Status dot + name */}
      <div className="flex items-center gap-2">
        <span
          className={cn("w-2 h-2 rounded-full shrink-0", config.dot, service.status === "healthy" && "animate-status-pulse")}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold text-text-primary truncate capitalize">{displayName}</span>
      </div>

      {/* Response time or status label */}
      <p className={cn("text-xs tabular-nums", config.textColor)}>
        {service.status === "healthy" && service.response_time_ms != null ? `${service.response_time_ms}ms` : config.label}
      </p>
    </button>
  )
}
