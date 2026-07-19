"use client"

import { cn } from "@/lib/utils"
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery"

interface StreamingCursorProps {
  className?: string
}

/**
 * Blinking text cursor shown while the AI is streaming a response.
 * Rendered inline at the end of the streaming text content. Automatically
 * hidden when streaming completes (parent removes it from the DOM).
 *
 * @example
 * <p className="aegis-prose">
 *   {streamedText}
 *   {isStreaming && <StreamingCursor />}
 * </p>
 */
export function StreamingCursor({ className }: StreamingCursorProps) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <span
      className={cn("inline-block w-[2px] h-[1em] align-text-bottom ml-0.5", "bg-text-tertiary rounded-full", !reducedMotion && "animate-blink", className)}
      aria-hidden="true"
      role="presentation"
    />
  )
}
