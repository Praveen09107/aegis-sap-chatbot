"use client"

import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StreamingState } from "@/types"

interface StreamingProgressProps {
  state: StreamingState
  className?: string
}

const STATE_LABELS: Partial<Record<StreamingState, string>> = {
  thinking: "Thinking...",
  retrieving: "Retrieving SAP documentation...",
  generating: "Generating response...",
  validating: "Validating answer...",
}

/**
 * Progressive stage indicator shown below the AEGIS label during response
 * generation. Each stage transitions smoothly. Hidden when state is
 * 'idle', 'streaming', 'complete', or 'error'.
 *
 * @example
 * <StreamingProgress state={streamingState} />
 */
export function StreamingProgress({ state, className }: StreamingProgressProps) {
  const reducedMotion = useReducedMotion()
  const label = STATE_LABELS[state]

  return (
    <AnimatePresence mode="wait">
      {label && (
        <motion.div
          key={state}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn("flex items-center gap-2", "text-xs text-text-tertiary", className)}
          role="status"
          aria-live="polite"
          aria-label={label}
        >
          <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
