"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * Type-safe localStorage hook with SSR safety. Synchronises state with
 * localStorage across components and across browser tabs.
 *
 * @example
 * const [collapsed, setCollapsed] = useLocalStorage('aegis:panel-collapsed', false)
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value
        try {
          window.localStorage.setItem(key, JSON.stringify(next))
        } catch (error) {
          console.warn(`localStorage.setItem(${key}) failed:`, error)
        }
        return next
      })
    },
    [key]
  )

  const remove = useCallback(() => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore
    }
    setStoredValue(initialValue)
  }, [key, initialValue])

  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T)
        } catch {
          // Ignore malformed values
        }
      }
    }
    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [key])

  return [storedValue, setValue, remove] as const
}
