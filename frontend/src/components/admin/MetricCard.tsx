"use client"

import { useEffect, useRef, useState } from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery"

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
  const prefersReducedMotion = usePrefersReducedMotion()
  // Only animated numeric values need local state at all — when not
  // animating, `value` is rendered directly (see renderedValue below)
  // rather than syncing a copy into state, which would mean calling
  // setState unconditionally inside the effect on every non-animated
  // render (flagged by eslint-plugin-react-hooks v7's
  // react-hooks/set-state-in-effect rule).
  const isAnimating = typeof value === "number" && animateCount && !prefersReducedMotion
  const [animatedValue, setAnimatedValue] = useState(0)
  const animationRef = useRef<number | undefined>(undefined)

  // Count-up animation
  useEffect(() => {
    if (!isAnimating) return

    const end = value as number
    const duration = 600
    const startTime = performance.now()

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedValue(end * eased)
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [value, isAnimating])

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

  if (isLoading) {
    return (
      <div className={cn("bg-bg-card border border-border-primary rounded-xl p-4", "flex flex-col gap-2", className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-2.5 w-28" />
      </div>
    )
  }

  return (
    <div className={cn("bg-bg-card border border-border-primary rounded-xl p-4", "flex flex-col gap-1.5", "shadow-sm", className)}>
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
