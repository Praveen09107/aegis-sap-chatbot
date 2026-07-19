"use client"

import { useState, useEffect } from "react"
import { TIMING } from "@/lib/constants"

/**
 * Debounces a value by the given delay. Used for search inputs to avoid
 * excessive API calls.
 *
 * @example
 * const debouncedSearch = useDebounce(searchQuery, 300)
 * // debouncedSearch only updates 300ms after searchQuery stops changing
 */
export function useDebounce<T>(value: T, delay: number = TIMING.SEARCH_DEBOUNCE_MS): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
