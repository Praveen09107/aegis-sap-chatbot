"use client"

import { useTheme } from "next-themes"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { ChartTooltip } from "./ChartTooltip"
import { ResponsiveChart, CHART_COLORS, CHART_TICK_STYLE } from "./ResponsiveChart"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface QueryVolumeChartProps {
  data: Array<{ date: string; value: number }>
  isLoading?: boolean
  className?: string
}

export function QueryVolumeChart({ data, isLoading, className }: QueryVolumeChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === "dark" ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn("chart-card", className)}>
        <Skeleton className="h-3 w-32 mb-4" />
        <div className="flex items-end gap-1.5 h-40">
          {[...Array(14)].map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${35 + ((i * 41) % 55)}%` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("chart-card", className)}>
      <p className="chart-title">Query volume</p>
      <ResponsiveChart height={160} aria-label="Daily query volume over selected period">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} dy={6} />
          <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip formatter={(v) => `${v} queries`} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" name="Queries" fill={CHART_COLORS.blue} radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveChart>
    </div>
  )
}
