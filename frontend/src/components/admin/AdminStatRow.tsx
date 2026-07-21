import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface StatItem {
  label: string
  value: string | number
  color?: "default" | "green" | "amber" | "red" | "info"
  suffix?: string
}

interface AdminStatRowProps {
  stats: StatItem[]
  isLoading?: boolean
  className?: string
}

const VALUE_COLORS: Record<NonNullable<StatItem["color"]>, string> = {
  default: "text-text-primary",
  green: "text-success",
  amber: "text-warning",
  red: "text-danger",
  info: "text-info",
}

/**
 * Horizontal row of inline statistics.
 * Used on pages that need quick stats without full metric cards.
 * Lighter than MetricCardGrid — for secondary stats or summary rows.
 *
 * @example
 * // In documents page header:
 * <AdminStatRow stats={[
 *   { label: 'Active', value: 47, color: 'green' },
 *   { label: 'Deprecated', value: 12 },
 *   { label: 'Processing', value: 3, color: 'info' },
 *   { label: 'Failed', value: 1, color: 'red' },
 * ]} />
 */
export function AdminStatRow({ stats, isLoading, className }: AdminStatRowProps) {
  return (
    <div className={cn("flex items-center gap-6 flex-wrap", className)} role="group" aria-label="Statistics">
      {stats.map((stat, i) => (
        <div key={i} className="flex items-baseline gap-2">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-3 w-14" />
            </>
          ) : (
            <>
              <span className={cn("text-xl font-bold tabular-nums tracking-tight", VALUE_COLORS[stat.color ?? "default"])}>
                {stat.value}
                {stat.suffix}
              </span>
              <span className="text-xs text-text-tertiary font-medium">{stat.label}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
