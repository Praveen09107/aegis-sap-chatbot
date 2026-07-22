"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useCountUp } from "@/hooks/useCountUp"
import { LAYOUT } from "@/lib/constants"

type MetricColor = "white" | "green" | "amber" | "red" | "info" | "purple"
type TrendDirection = "up" | "down" | "neutral"

interface MetricCardProps {
  label: string
  value: number | string
  /** If numeric, animate from 0 to value on mount */
  animateCount?: boolean
  /** Display format for numeric values */
  format?: "integer" | "percentage" | "score" | "string"
  /** Color of the main value display */
  color?: MetricColor
  trend?: {
    value: string // e.g. "↑ 18%", "3 new today"
    direction: TrendDirection
    /** Is "up" direction a positive thing? Default: true */
    upIsPositive?: boolean
  }
  isLoading?: boolean
  className?: string
}

const VALUE_COLORS: Record<MetricColor, string> = {
  white: "text-text-primary",
  green: "text-success",
  amber: "text-warning",
  red: "text-danger",
  info: "text-info",
  purple: "text-purple",
}

const TREND_COLORS: Record<TrendDirection, (upIsPositive: boolean) => string> = {
  up: (pos) => (pos ? "text-success" : "text-danger"),
  down: (pos) => (pos ? "text-danger" : "text-success"),
  neutral: () => "text-text-tertiary",
}

/**
 * Admin dashboard KPI card with animated counter on mount. Uses
 * requestAnimationFrame for smooth count-up animation and respects
 * prefers-reduced-motion.
 *
 * @example
 * <MetricCard
 *   label="Queries today"
 *   value={247}
 *   color="white"
 *   trend={{ value: "↑ 18% vs yesterday", direction: "up" }}
 * />
 *
 * <MetricCard
 *   label="Green badge rate"
 *   value={0.71}
 *   format="percentage"
 *   color="green"
 *   animateCount
 * />
 */
export function MetricCard({
  label,
  value,
  animateCount = true,
  format = "string",
  color = "white",
  trend,
  isLoading = false,
  className,
}: MetricCardProps) {
  // useCountUp checks prefers-reduced-motion internally — MetricCard only
  // needs to gate on the value actually being numeric and animateCount
  // being requested. When not animating, `value` is read directly (see
  // displayValue below) rather than the hook's output, so a non-animating
  // card never risks a "0" flash from the hook's own initial state.
  const isAnimating = typeof value === "number" && animateCount
  const animatedValue = useCountUp({
    target: typeof value === "number" ? value : 0,
    duration: 600,
    enabled: isAnimating,
  })

  const displayValue = isAnimating ? animatedValue : value

  function formatValue(v: number | string): string {
    if (typeof v !== "number") return String(v)
    switch (format) {
      case "integer":
        return Math.round(v).toLocaleString("en-IN")
      case "percentage":
        return `${Math.round(v * 100)}%`
      case "score":
        return v.toFixed(2)
      default:
        return typeof value === "number" ? Math.round(v).toLocaleString("en-IN") : String(v)
    }
  }

  // Fixed min-height (LAYOUT.ADMIN_METRIC_CARD_HEIGHT) on both the loading
  // and loaded branches prevents layout shift when a card's skeleton
  // resolves into its real content — a CLS-prevention requirement from
  // FRONTEND_28_PERFORMANCE.md.
  if (isLoading) {
    return (
      <div
        className={cn("bg-bg-card border border-border-primary rounded-xl p-4", "flex flex-col gap-2", className)}
        style={{ minHeight: LAYOUT.ADMIN_METRIC_CARD_HEIGHT }}
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-2.5 w-28" />
      </div>
    )
  }

  return (
    <div
      className={cn("bg-bg-card border border-border-primary rounded-xl p-4", "flex flex-col gap-1.5", "shadow-sm", className)}
      style={{ minHeight: LAYOUT.ADMIN_METRIC_CARD_HEIGHT }}
    >
      {/* Label */}
      <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">{label}</p>

      {/* Value */}
      <p
        className={cn("text-4xl font-bold tabular-nums leading-none tracking-tight", VALUE_COLORS[color])}
        aria-label={`${label}: ${formatValue(typeof displayValue === "number" ? value : displayValue)}`}
      >
        {formatValue(displayValue)}
      </p>

      {/* Trend */}
      {trend && (
        <div className={cn("flex items-center gap-1 text-xs font-medium", TREND_COLORS[trend.direction](trend.upIsPositive !== false))}>
          {trend.direction === "up" && <TrendingUp className="w-3 h-3" aria-hidden="true" />}
          {trend.direction === "down" && <TrendingDown className="w-3 h-3" aria-hidden="true" />}
          {trend.direction === "neutral" && <Minus className="w-3 h-3" aria-hidden="true" />}
          <span>{trend.value}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Grid wrapper for the 4-card admin dashboard metric row.
 */
export function MetricCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-4 gap-3" role="region" aria-label="Key metrics">
      {children}
    </div>
  )
}
