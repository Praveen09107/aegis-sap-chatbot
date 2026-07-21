"use client"

import { CHART_COLORS } from "./ResponsiveChart"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface RetrievalModeChartProps {
  modeA: number // 0–1 fraction
  modeB: number
  modeC: number
  cacheHitRate: number
  isLoading?: boolean
  className?: string
}

/**
 * Retrieval mode breakdown.
 * Mode A = CRAG-corrected answer (best)
 * Mode B = Standard retrieval answer
 * Mode C = Insufficient / escalated
 * Cache = Cached response (no retrieval needed)
 *
 * Design: horizontal progress-bar rows, one per mode/cache stat.
 */
export function RetrievalModeChart({ modeA, modeB, modeC, cacheHitRate, isLoading, className }: RetrievalModeChartProps) {
  if (isLoading) {
    return (
      <div className={cn("chart-card", className)}>
        <Skeleton className="h-3 w-32 mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-2.5 flex-1 rounded-full" />
              <Skeleton className="h-3 w-8 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const modes = [
    { label: "Mode A", sublabel: "CRAG-corrected", value: modeA, color: CHART_COLORS.cyan },
    { label: "Mode B", sublabel: "Standard", value: modeB, color: CHART_COLORS.blue },
    { label: "Mode C", sublabel: "Insufficient", value: modeC, color: CHART_COLORS.red },
    { label: "Cache", sublabel: "Hit", value: cacheHitRate, color: CHART_COLORS.purple },
  ]

  return (
    <div className={cn("chart-card", className)}>
      <p className="chart-title">Retrieval mode breakdown</p>

      <div className="space-y-3 mt-2" role="list" aria-label="Retrieval mode percentages">
        {modes.map(({ label, sublabel, value, color }) => {
          const pct = Math.round(value * 100)
          return (
            <div key={label} className="flex items-center gap-3" role="listitem">
              <div className="w-16 shrink-0">
                <p className="text-xs font-semibold text-text-primary">{label}</p>
                <p className="text-[10px] text-text-tertiary">{sublabel}</p>
              </div>

              <div
                className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label}: ${pct}%`}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>

              <span className="text-xs font-semibold tabular-nums text-text-secondary w-8 text-right shrink-0">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
