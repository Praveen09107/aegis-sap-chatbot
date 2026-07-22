"use client"

import { useState, useCallback } from "react"
import { AnimatePresence, motion } from "motion/react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OnboardingProgress } from "./OnboardingProgress"
import { OnboardingStep, ONBOARDING_STEPS } from "./OnboardingStep"
import { cn } from "@/lib/utils"
import { ONBOARDING_STEP } from "@/lib/animations"
import { useChatStore } from "@/stores/chatStore"

interface OnboardingModalProps {
  open: boolean
  onComplete: () => void
}

/**
 * Full-screen onboarding modal for first-time employees.
 *
 * State management:
 * - currentStep: 0-indexed step position
 * - direction: +1 (forward) / -1 (back) for the slide animation
 *
 * Dismissal:
 * - "Skip for now" button → marks complete, closes
 * - "Start using AEGIS" on step 5 → marks complete, closes
 * - Backdrop click → does NOT close (prevents accidental dismissal)
 * - Escape key → does NOT close
 *
 * Starter question handling:
 * - On step 5, starter chips carry a data-starter-question attribute
 * - Clicking a chip: pre-fills the compose bar with that question + onComplete()
 */
export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const setComposeValue = useChatStore((s) => s.setComposeValue)

  const totalSteps = ONBOARDING_STEPS.length
  const step = ONBOARDING_STEPS[currentStep]
  const isLastStep = currentStep === totalSteps - 1

  const goNext = useCallback(() => {
    setCurrentStep((s) => {
      if (s >= totalSteps - 1) return s
      setDirection(1)
      return s + 1
    })
  }, [totalSteps])

  const goPrev = useCallback(() => {
    setCurrentStep((s) => {
      if (s <= 0) return s
      setDirection(-1)
      return s - 1
    })
  }, [])

  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  const handleFinish = useCallback(() => {
    onComplete()
  }, [onComplete])

  // Handle starter question chip click on step 5
  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      const questionEl = target.closest("[data-starter-question]") as HTMLElement | null
      if (questionEl) {
        const question = questionEl.getAttribute("data-starter-question") ?? ""
        setComposeValue(question)
        onComplete()
      }
    },
    [onComplete, setComposeValue]
  )

  // Keyboard navigation — Escape intentionally does NOT close the modal
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext()
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop — does NOT close on click */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Skip button — always visible */}
      <button
        onClick={handleSkip}
        className={cn(
          "absolute top-4 right-4",
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
          "text-xs font-medium text-white/70 hover:text-white",
          "hover:bg-white/10",
          "transition-all duration-[var(--duration-normal)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        )}
        aria-label="Skip onboarding walkthrough"
      >
        <X className="w-3 h-3" aria-hidden="true" />
        Skip for now
      </button>

      {/* Modal card */}
      <div
        className={cn(
          "relative z-10 w-full max-w-lg",
          "bg-bg-card border border-border-primary rounded-2xl shadow-xl",
          "overflow-hidden"
        )}
      >
        {/* Progress area */}
        <div className="flex items-center justify-center pt-5 pb-2">
          <OnboardingProgress totalSteps={totalSteps} currentStep={currentStep} />
        </div>

        {/* Step content with slide animation */}
        <div className="overflow-hidden px-6 pb-2" style={{ minHeight: 360 }} onClick={handleContentClick}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={ONBOARDING_STEP}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <div id="onboarding-title" className="sr-only">
                Step {currentStep + 1} of {totalSteps}: {step.title}
              </div>
              <OnboardingStep step={step} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-primary">
          {/* Back button */}
          <Button variant="ghost" size="sm" onClick={goPrev} disabled={currentStep === 0} aria-label="Previous step">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            Back
          </Button>

          {/* Step label (centre) */}
          <span className="text-xs text-text-tertiary tabular-nums" aria-hidden="true">
            Step {currentStep + 1} of {totalSteps}
          </span>

          {/* Next / Finish button */}
          {isLastStep ? (
            <Button size="sm" onClick={handleFinish} className="gap-1.5" aria-label="Finish onboarding and start using AEGIS">
              Start using AEGIS
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button size="sm" onClick={goNext} aria-label="Next step">
              Next
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
