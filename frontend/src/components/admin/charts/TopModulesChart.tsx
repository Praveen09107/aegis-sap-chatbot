"use client"

import { useTheme } from "next-themes"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts"
import { ChartTooltip } from "./ChartTooltip"
import { ResponsiveChart, CHART_COLORS, CHART_TICK_STYLE } from "./ResponsiveChart"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface ModuleData {
  module: string
  query_count: number
  avg_score: number
}

interface TopModulesChartProps {
  data: ModuleData[]
  isLoading?: boolean
  className?: string
}

function getBarColor(avgScore: number): string {
  if (avgScore >= 0.85) return CHART_COLORS.green
  if (avgScore >= 0.7) return CHART_COLORS.amber
  return CHART_COLORS.red
}

/**
 * Horizontal bar chart showing query count per SAP module.
 * Bar colour reflects average ValidationScore for that module
 * (green = high confidence, amber = moderate, red = low).
 */
export function TopModulesChart({ data, isLoading, className }: TopModulesChartProps) {
  const { theme } = useTheme()
  const gridColor = theme === "dark" ? CHART_COLORS.darkGrid : CHART_COLORS.gridLine

  if (isLoading) {
    return (
      <div className={cn("chart-card", className)}>
        <Skeleton className="h-3 w-32 mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-10 shrink-0" />
              <Skeleton className="h-5 rounded-sm" style={{ width: `${40 + i * 10}%` }} />
              <Skeleton className="h-3 w-10 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Sort by query count descending, take top 6
  const sorted = [...data].sort((a, b) => b.query_count - a.query_count).slice(0, 6)

  return (
    <div className={cn("chart-card", className)}>
      <p className="chart-title">Top SAP modules</p>
      <ResponsiveChart height={sorted.length * 36 + 20} aria-label="Query volume and average confidence score per SAP module">
        <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis type="number" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="module" tick={{ ...CHART_TICK_STYLE, fontWeight: 600 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            content={
              <ChartTooltip formatter={(v, name) => (name === "query_count" ? `${v} queries` : `${(Number(v) * 100).toFixed(1)}% avg score`)} />
            }
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          <Bar dataKey="query_count" name="Queries" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {sorted.map((entry, i) => (
              <Cell key={i} fill={getBarColor(entry.avg_score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveChart>

      {/* Score legend */}
      <div className="flex items-center gap-4 mt-2">
        {[
          { color: CHART_COLORS.green, label: "≥ 85%" },
          { color: CHART_COLORS.amber, label: "70–85%" },
          { color: CHART_COLORS.red, label: "< 70%" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
            <span className="text-xs text-text-tertiary">{label} avg score</span>
          </div>
        ))}
      </div>
    </div>
  )
}
