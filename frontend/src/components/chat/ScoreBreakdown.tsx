"use client"

import { cn } from "@/lib/utils"

interface ScoreBreakdownProps {
  /** Overall ValidationScore for this turn — ChatMessage.validationScore. */
  score: number | null | undefined
  className?: string
}

/**
 * Confidence score display.
 *
 * NOTE: the original design called for a 3-way decomposition (NLI
 * entailment / faithfulness / completeness), but AttributionPanel (the
 * type) carries no per-component scores — only the single overall
 * ValidationScore lives on ChatMessage. Rendering three invented numbers
 * would be exactly the kind of fake-looking-real UI CLAUDE.md's "no
 * placeholder code" rule exists to prevent, so this shows the one real
 * number the backend actually provides.
 */
export function ScoreBreakdown({ score, className }: ScoreBreakdownProps) {
  if (score == null) return null

  const percentage = Math.round(score * 100)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <span className="section-label">Validation score</span>
      <div className="flex items-center gap-2">
        <div
          className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Validation score: ${percentage}%`}
        >
          <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
        </div>
        <span className="text-xs font-semibold text-text-primary tabular-nums w-10 text-right">{percentage}%</span>
      </div>
    </div>
  )
}
