"use client"

import { useTheme } from "next-themes"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { ChartTooltip } from "./ChartTooltip"
import { ResponsiveChart, CHART_COLORS, CHART_TICK_STYLE } from "./ResponsiveChart"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface ConfidenceDistChartProps {
  data: Array<{ date: string; green: number; amber: number; none: number }>
  isLoading?: boolean
  className?: string
}

/**
 * Confidence distribution — 7-day stacked bar chart.
 * Shows proportion of Green / Amber / None responses per day.
 *
 * Design:
 * - Stacked bars: green on bottom, amber in middle, none on top
 * - Y axis: 0–100 (percentage of responses per day)
 * - Rounded top on the topmost visible bar
 * - Custom legend below chart
 */
export function ConfidenceDistChart({ data, isLoading, className }: ConfidenceDistChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === "dark" ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn("chart-card", className)}>
        <Skeleton className="h-3 w-44 mb-4" />
        <div className="flex items-end gap-1.5 h-40">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: "90%" }} />
          ))}
        </div>
        <div className="flex gap-3 mt-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn("chart-card", className)}>
      <p className="chart-title">Confidence distribution — 7 days</p>

      <ResponsiveChart height={160} aria-label="Confidence badge distribution over the last 7 days">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />

          <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} dy={6} />

          <YAxis
            domain={[0, 100]}
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
            ticks={[0, 25, 50, 75, 100]}
          />

          <Tooltip
            content={<ChartTooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />

          {/* Stacked bars: green (bottom) → amber → none (top) */}
          <Bar dataKey="green" name="Green" stackId="confidence" fill={CHART_COLORS.green} radius={[0, 0, 2, 2]} />
          <Bar dataKey="amber" name="Amber" stackId="confidence" fill={CHART_COLORS.amber} radius={[0, 0, 0, 0]} />
          <Bar dataKey="none" name="Insufficient" stackId="confidence" fill={CHART_COLORS.gray} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveChart>

      {/* Custom legend */}
      <div className="flex items-center gap-4 mt-2">
        {[
          { color: CHART_COLORS.green, label: "Green" },
          { color: CHART_COLORS.amber, label: "Amber" },
          { color: CHART_COLORS.gray, label: "Insufficient" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
            <span className="text-xs text-text-tertiary">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
