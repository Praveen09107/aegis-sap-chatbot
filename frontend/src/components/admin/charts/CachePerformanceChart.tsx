"use client"

import { useTheme } from "next-themes"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { ChartTooltip } from "./ChartTooltip"
import { ResponsiveChart, CHART_COLORS, CHART_TICK_STYLE } from "./ResponsiveChart"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface CachePerformanceChartProps {
  data: Array<{ date: string; hit_rate: number; total_queries: number }>
  isLoading?: boolean
  className?: string
}

export function CachePerformanceChart({ data, isLoading, className }: CachePerformanceChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === "dark" ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn("chart-card", className)}>
        <Skeleton className="h-3 w-36 mb-4" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  }

  // Convert hit_rate 0–1 to 0–100 for display
  const chartData = data.map((d) => ({ ...d, hit_rate_pct: Math.round(d.hit_rate * 100) }))

  return (
    <div className={cn("chart-card", className)}>
      <p className="chart-title">Cache hit rate</p>
      <ResponsiveChart height={160} aria-label="Cache hit rate trend over selected period">
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} dy={6} />
          <YAxis
            domain={[0, 100]}
            tick={CHART_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ stroke: CHART_COLORS.purple, strokeWidth: 1, strokeDasharray: "4 2" }} />
          <Line
            type="monotone"
            dataKey="hit_rate_pct"
            name="Hit rate"
            stroke={CHART_COLORS.purple}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: CHART_COLORS.purple, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveChart>

      {/* Current value */}
      {data.length > 0 && (
        <div className="flex items-center justify-end mt-2">
          <span className="text-xs text-text-tertiary">
            Latest: <span className="font-semibold tabular-nums" style={{ color: CHART_COLORS.purple }}>{Math.round((data[data.length - 1]?.hit_rate ?? 0) * 100)}%</span>
          </span>
        </div>
      )}
    </div>
  )
}
