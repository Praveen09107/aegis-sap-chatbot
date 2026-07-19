import { cn } from "@/lib/utils"

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number | string
    color?: string
    dataKey?: string
  }>
  label?: string
  formatter?: (value: number | string, name: string) => string
  labelFormatter?: (label: string) => string
  className?: string
}

/**
 * Recharts custom tooltip with AEGIS styling. Apply to any Recharts chart
 * via the content prop.
 *
 * @example
 * <LineChart data={data}>
 *   <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} />} />
 * </LineChart>
 */
export function ChartTooltip({ active, payload, label, formatter, labelFormatter, className }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  const formattedLabel = label ? (labelFormatter ? labelFormatter(String(label)) : String(label)) : null

  return (
    <div className={cn("bg-bg-card border border-border-primary rounded-xl", "shadow-lg px-3 py-2.5", "text-xs", className)}>
      {formattedLabel && <p className="text-text-tertiary font-medium mb-1.5">{formattedLabel}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => {
          const displayValue = formatter
            ? formatter(entry.value, entry.name)
            : typeof entry.value === "number"
              ? entry.value.toFixed(3)
              : String(entry.value)

          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                {entry.color && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                )}
                <span className="text-text-secondary capitalize">{entry.name}</span>
              </div>
              <span className="font-semibold text-text-primary tabular-nums">{displayValue}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
