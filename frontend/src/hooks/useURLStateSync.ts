"use client"

import { useEffect, useRef } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

/**
 * Mirrors a flat filter/range state object into the URL query string so it
 * survives a page refresh (FRONTEND_SUPPLEMENT_02 Part 4). The object itself
 * (a Zustand store slice, typically) stays the single source of truth for
 * reads — the URL is purely a persistence/shareable-link mirror, written via
 * `router.replace` (no history entry, no scroll).
 *
 * On mount: applies whichever of `values`' keys are present in the URL via
 * `hydrate`, once. Every later change to `values` rewrites the URL to match.
 *
 * The one-render gap between "hydrate() is called" and "the store's own
 * state actually reflects it" (state updates aren't synchronous) would
 * otherwise let the very next persist effect immediately overwrite the URL
 * with the OLD pre-hydration values — `skipNextPersist` suppresses exactly
 * that one write.
 *
 * @param values Current state as a flat record of primitives. `undefined`/""
 *   entries are omitted from the URL.
 * @param hydrate Called once on mount with whatever keys were found in the
 *   URL (raw strings — caller coerces to number/enum as needed).
 */
export function useURLStateSync<T extends Record<string, string | number | undefined>>(
  values: T,
  hydrate: (fromUrl: Record<string, string>) => void
) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const didHydrate = useRef(false)
  const skipNextPersist = useRef(false)

  // Hydrate once from the URL on mount.
  useEffect(() => {
    if (didHydrate.current) return
    didHydrate.current = true

    const fromUrl: Record<string, string> = {}
    for (const key of Object.keys(values)) {
      const raw = searchParams.get(key)
      if (raw !== null) fromUrl[key] = raw
    }
    if (Object.keys(fromUrl).length > 0) {
      skipNextPersist.current = true
      hydrate(fromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirror the current values into the URL whenever they change.
  useEffect(() => {
    if (!didHydrate.current) return
    if (skipNextPersist.current) {
      skipNextPersist.current = false
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    for (const key of Object.keys(values)) {
      const value = values[key]
      if (value === undefined || value === "") params.delete(key)
      else params.set(key, String(value))
    }

    const next = params.toString()
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)])
}
