"use client"

import { cn, formatScore } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { ConfidenceBadge as ConfidenceBadgeType } from "@/types"
import { CONFIDENCE } from "@/lib/constants"

interface ConfidenceBadgeProps {
  badge: ConfidenceBadgeType
  score?: number | null
  showScore?: boolean
  showTooltip?: boolean
  size?: "sm" | "md"
  className?: string
}

const BADGE_CONFIG = {
  green: {
    label: "High confidence",
    dotClass: "bg-success",
    containerClass: "bg-success-bg border-success-border text-success-text",
    tooltipText: `ValidationScore ≥ ${CONFIDENCE.GREEN_THRESHOLD * 100}%. The answer is strongly supported by verified documentation.`,
  },
  amber: {
    label: "Moderate confidence",
    dotClass: "bg-warning",
    containerClass: "bg-warning-bg border-warning-border text-warning-text",
    tooltipText: `ValidationScore between ${CONFIDENCE.AMBER_THRESHOLD * 100}–${CONFIDENCE.GREEN_THRESHOLD * 100}%. Review the source document to verify.`,
  },
  none: {
    label: "Insufficient",
    dotClass: "bg-danger",
    containerClass: "bg-danger-bg border-danger-border text-danger-text",
    tooltipText: "AEGIS could not find sufficient documentation to answer this question. A support ticket has been created.",
  },
} as const

/**
 * Confidence badge — the primary quality signal for AI responses.
 * RULE: this color system must never be used decoratively. Green = high
 * confidence (>=0.85), Amber = moderate (0.70-0.84), None = insufficient.
 *
 * @example
 * <ConfidenceBadge badge="green" score={0.91} showScore />
 * <ConfidenceBadge badge="amber" score={0.74} showScore showTooltip />
 * <ConfidenceBadge badge={null} />  // renders nothing (streaming in progress)
 */
export function ConfidenceBadge({ badge, score, showScore = false, showTooltip = true, size = "sm", className }: ConfidenceBadgeProps) {
  if (!badge) return null

  const config = BADGE_CONFIG[badge]

  const badgeEl = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium select-none",
        size === "sm" ? "text-xs px-2.5 py-0.5" : "text-sm px-3 py-1",
        config.containerClass,
        className
      )}
      role="status"
      aria-label={`${config.label}${score ? ` · ${formatScore(score)}` : ""}`}
    >
      {/* Animated dot */}
      <span
        className={cn("rounded-full shrink-0", size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2", config.dotClass, badge === "green" && "animate-status-pulse")}
        aria-hidden="true"
      />
      {config.label}
      {showScore && score != null && <span className="tabular-nums opacity-75">· {formatScore(score)}</span>}
    </span>
  )

  if (!showTooltip) return badgeEl

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badgeEl}</TooltipTrigger>
        <TooltipContent side="top" className="bg-bg-card border border-border-primary text-text-primary text-xs max-w-[260px]">
          <p className="font-semibold mb-0.5">{config.label}</p>
          <p className="text-text-secondary leading-relaxed">{config.tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
