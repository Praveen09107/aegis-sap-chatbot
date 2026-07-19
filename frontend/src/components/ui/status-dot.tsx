"use client"

import { cn } from "@/lib/utils"

type StatusType = "online" | "offline" | "connecting" | "error" | "warning"

interface StatusDotProps {
  status: StatusType
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  className?: string
}

const STATUS_CONFIG: Record<StatusType, { color: string; pulse: boolean; label: string }> = {
  online: { color: "bg-success", pulse: true, label: "Connected" },
  offline: { color: "bg-text-tertiary", pulse: false, label: "Offline" },
  connecting: { color: "bg-warning", pulse: true, label: "Connecting..." },
  error: { color: "bg-danger", pulse: false, label: "Error" },
  warning: { color: "bg-warning", pulse: false, label: "Degraded" },
}

const SIZE_CLASSES = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
}

/**
 * Animated status indicator dot. Used in the employee topbar (WebSocket
 * connection status) and the admin system health grid (per-service status).
 */
export function StatusDot({ status, size = "md", showLabel = false, className }: StatusDotProps) {
  const config = STATUS_CONFIG[status]

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} role="status" aria-label={config.label}>
      <span className="relative inline-flex">
        {config.pulse && (
          <span
            className={cn("absolute inline-flex rounded-full opacity-75 animate-status-pulse", config.color, SIZE_CLASSES[size])}
            aria-hidden="true"
          />
        )}
        <span className={cn("relative inline-flex rounded-full", config.color, SIZE_CLASSES[size])} aria-hidden="true" />
      </span>

      {showLabel && <span className="text-xs text-text-secondary font-medium">{config.label}</span>}
    </span>
  )
}
