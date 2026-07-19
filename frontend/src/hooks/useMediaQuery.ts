"use client"

import { useCallback, useSyncExternalStore } from "react"
import { LAYOUT } from "@/lib/constants"

/**
 * Tracks whether a CSS media query is currently matched.
 * Built on useSyncExternalStore — the correct primitive for subscribing to
 * an external browser API like matchMedia (avoids a setState-in-effect,
 * which eslint-plugin-react-hooks v7's react-hooks/set-state-in-effect
 * rule now flags), and gives a well-defined SSR snapshot for free.
 *
 * @example
 * const isWide = useMediaQuery('(min-width: 1440px)')
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query]
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Returns true if the viewport is at the optimal AEGIS width (>=1440px).
 */
export function useIsOptimalWidth(): boolean {
  return useMediaQuery(`(min-width: ${LAYOUT.OPTIMAL_VIEWPORT_WIDTH}px)`)
}

/**
 * Returns true if the user prefers reduced motion.
 * RULE: every Framer Motion component must check this.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)")
}
