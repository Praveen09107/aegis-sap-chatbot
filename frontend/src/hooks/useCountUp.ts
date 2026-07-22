"use client"

import { useState, useEffect, useRef } from "react"
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery"

interface UseCountUpOptions {
  target: number
  /** ms — how long the count-up takes. Default 700. */
  duration?: number
  /** Set false to skip the animation entirely and jump straight to target. */
  enabled?: boolean
}

/**
 * Animates a number from its previous value up (or down) to `target` via
 * requestAnimationFrame, easing out (cubic). Respects prefers-reduced-motion
 * internally — returns `target` immediately when the OS setting is on, so
 * callers never need to check it themselves.
 *
 * Returns the raw animated number, not a pre-formatted string — this is a
 * deliberate deviation from FRONTEND_24's own `useCountUp` spec, which
 * returns `current.toFixed(decimals)`. That spec's own `MetricValue`
 * example passes a percentage's raw 0–1 fraction straight into the hook and
 * only appends "%" afterward (never multiplying by 100 first), which
 * renders "0.7%" for a 71% rate — a real bug in the spec's own example.
 * Percentage/score/integer formatting is display logic that differs per
 * caller (MetricCard's own formatValue() already gets this right and has
 * tests covering it) — the hook's job is only the animation timing.
 *
 * @example
 * const displayValue = useCountUp({ target: 247, duration: 700 })
 * // Renders: 0 → 1 → 5 → 23 → 247 over 700ms using easeOut
 */
export function useCountUp({ target, duration = 700, enabled = true }: UseCountUpOptions): number {
  const reducedMotion = usePrefersReducedMotion()
  const skipAnimation = !enabled || reducedMotion
  // Always starts at 0 — callers that don't want a visible "0" flash (e.g.
  // when animation is disabled) should read the raw `target` prop directly
  // instead of this hook's return value, the same guard MetricCard uses.
  const [current, setCurrent] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const rafRef = useRef<number>(undefined)
  const prevTargetRef = useRef<number>(0)

  // Jump straight to target during render (not in an effect, which would
  // cause an extra cascading render — react-hooks/set-state-in-effect) when
  // animation is disabled or reduced-motion is on — the same
  // adjusting-state-during-render pattern used elsewhere in this codebase
  // (e.g. InlineEditCell.tsx, review-queue's page.tsx). Only state is
  // touched here — ref writes during render are a separate lint violation
  // (react-hooks/refs), so prevTargetRef stays synced via the effect below.
  if (skipAnimation && current !== target) {
    setCurrent(target)
  }

  useEffect(() => {
    if (skipAnimation) {
      prevTargetRef.current = target
      return
    }

    const startValue = prevTargetRef.current
    const diff = target - startValue
    prevTargetRef.current = target

    if (diff === 0) return

    startTimeRef.current = null

    function tick(now: number) {
      // === null, not a falsy check — a legitimate first-frame timestamp of
      // exactly 0 would otherwise be mistaken for "not yet set" (!0 === true)
      // and get overwritten on every subsequent tick, so elapsed never
      // advances. Never observed with real RAF timestamps (always large
      // positive numbers since navigation start) but a real latent bug in
      // FRONTEND_23's own useCountUp spec code, which used `if (!startTimeRef.current)`.
      if (startTimeRef.current === null) startTimeRef.current = now
      const elapsed = now - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(startValue + diff * eased)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setCurrent(target)
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, skipAnimation])

  return current
}
