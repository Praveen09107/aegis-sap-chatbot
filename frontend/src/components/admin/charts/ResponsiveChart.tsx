"use client"

import { ResponsiveContainer } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface ResponsiveChartProps {
  children: React.ReactElement
  height?: number
  isLoading?: boolean
  loadingRows?: number
  className?: string
  "aria-label"?: string
}

/**
 * Wrapper for all Recharts charts in the AEGIS admin portal. Provides
 * consistent sizing, loading state, and accessibility attributes.
 *
 * @example
 * <ResponsiveChart height={200} aria-label="ValidationScore trend for the last 7 days">
 *   <LineChart data={data}>
 *     ...
 *   </LineChart>
 * </ResponsiveChart>
 */
export function ResponsiveChart({ children, height = 180, isLoading = false, className, "aria-label": ariaLabel }: ResponsiveChartProps) {
  if (isLoading) {
    return (
      <div className={cn("flex items-end gap-1 px-2", className)} style={{ height }} aria-hidden="true">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${40 + ((i * 37) % 50)}%` }} />
        ))}
      </div>
    )
  }

  return (
    <div className={cn("w-full", className)} style={{ height }} role="img" aria-label={ariaLabel ?? "Chart"}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

// ── Shared Recharts axis/grid styling ────────────────────────

/**
 * Consistent axis tick style for all AEGIS charts. Apply to XAxis and
 * YAxis via the tick prop.
 */
export const CHART_TICK_STYLE = {
  fontSize: 11,
  fill: "rgb(148 163 184)", // text-text-tertiary approximation
  fontFamily: "var(--font-geist)",
}

/**
 * Shared chart color palette. Maps confidence badge levels and other
 * semantic categories.
 */
export const CHART_COLORS = {
  green: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  cyan: "#06B6D4",
  blue: "#3B82F6",
  purple: "#8B5CF6",
  gray: "#64748B",
  gridLine: "rgba(226, 232, 240, 0.6)", // light mode grid
  darkGrid: "rgba(30, 42, 61, 0.8)", // dark mode grid
} as const
