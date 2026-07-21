"use client"

import { cn } from "@/lib/utils"

interface OnboardingProgressProps {
  totalSteps: number
  currentStep: number // 0-indexed
  className?: string
}

/**
 * Step progress dots shown at the top of the onboarding modal.
 * Current step shows a filled pill; others show plain dots.
 *
 * @example
 * <OnboardingProgress totalSteps={5} currentStep={1} />
 * // Renders: ● ○ ○ ○ ○   (step 2 of 5, 0-indexed)
 */
export function OnboardingProgress({ totalSteps, currentStep, className }: OnboardingProgressProps) {
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="tablist"
      aria-label={`Onboarding step ${currentStep + 1} of ${totalSteps}`}
    >
      {[...Array(totalSteps)].map((_, i) => (
        <span
          key={i}
          role="tab"
          aria-selected={i === currentStep}
          aria-label={`Step ${i + 1}`}
          className={cn(
            "rounded-full transition-all duration-[var(--duration-slow)]",
            i === currentStep
              ? "w-5 h-2 bg-accent" // active: wider pill shape
              : i < currentStep
                ? "w-2 h-2 bg-accent/40" // completed: smaller, dimmed
                : "w-2 h-2 bg-border-secondary" // upcoming: neutral
          )}
        />
      ))}
      <span className="ml-1 text-xs text-text-tertiary tabular-nums">
        {currentStep + 1} / {totalSteps}
      </span>
    </div>
  )
}
