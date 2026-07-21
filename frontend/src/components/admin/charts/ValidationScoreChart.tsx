"use client"

import { useTheme } from "next-themes"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { ChartTooltip } from "./ChartTooltip"
import { ResponsiveChart, CHART_COLORS, CHART_TICK_STYLE } from "./ResponsiveChart"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface ValidationScoreChartProps {
  data: Array<{ date: string; score: number }>
  isLoading?: boolean
  className?: string
}

// Gradient ID for the area fill — unique per chart instance
const GRADIENT_ID = "aegis-vs-gradient"

/**
 * ValidationScore 7-day trend — AreaChart with gradient fill.
 *
 * Design:
 * - Cyan line (#06B6D4) with 2.5px stroke
 * - Gradient fill: cyan ~25% opacity → transparent
 * - No data dots (activeDot only on hover: radius 4)
 * - Y axis: 0.60–1.00 range (don't show full 0–1)
 * - X axis: short day labels (Mon, Tue...)
 * - Tooltip: custom AEGIS tooltip
 *
 * @example
 * <ValidationScoreChart
 *   data={metrics.validation_score_7d}
 *   isLoading={isLoading}
 * />
 */
export function ValidationScoreChart({ data, isLoading, className }: ValidationScoreChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === "dark" ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn("chart-card", className)}>
        <Skeleton className="h-3 w-40 mb-4" />
        <div className="flex items-end gap-1 h-40">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${55 + i * 6}%` }} />
          ))}
        </div>
        <div className="flex gap-1 mt-2">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="flex-1 h-2.5" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("chart-card", className)}>
      <p className="chart-title">ValidationScore — 7-day trend</p>

      <ResponsiveChart height={160} aria-label="ValidationScore trend over the last 7 days">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.cyan} stopOpacity={0.25} />
              <stop offset="100%" stopColor={CHART_COLORS.cyan} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />

          <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} dy={6} />

          <YAxis
            domain={[0.6, 1.0]}
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v.toFixed(1)}
            ticks={[0.6, 0.7, 0.85, 1.0]}
          />

          <Tooltip
            content={<ChartTooltip formatter={(value) => Number(value).toFixed(3)} labelFormatter={(l) => `${l}`} />}
            cursor={{ stroke: CHART_COLORS.cyan, strokeWidth: 1, strokeDasharray: "4 2" }}
          />

          <Area
            type="monotone"
            dataKey="score"
            name="Score"
            stroke={CHART_COLORS.cyan}
            strokeWidth={2.5}
            fill={`url(#${GRADIENT_ID})`}
            dot={false}
            activeDot={{ r: 4, fill: CHART_COLORS.cyan, stroke: "transparent", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveChart>

      {/* Threshold legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <span
            className="w-6 h-0.5 opacity-60"
            style={{ borderTop: `1.5px dashed ${CHART_COLORS.green}` }}
            aria-hidden="true"
          />
          <span className="text-xs text-text-tertiary">0.85 threshold</span>
        </div>
        {data.length > 0 && (
          <span className="text-xs text-text-tertiary ml-auto tabular-nums">
            Latest: <span className="font-semibold text-accent">{data[data.length - 1]?.score.toFixed(3)}</span>
          </span>
        )}
      </div>
    </div>
  )
}
