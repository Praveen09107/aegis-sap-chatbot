"use client"

import { useEffect, useRef, useState } from "react"

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error"

interface UseAutoSaveOptions {
  enabled: boolean
  intervalMs: number
  onSave: () => Promise<void>
  /** Whenever this array's serialized contents change, the next interval tick saves. */
  dependencies: unknown[]
}

/**
 * Periodic auto-save for the Quick Entry form (FRONTEND_37). Only saves when
 * something actually changed since the last tick (tracked via a dirty ref
 * from watching `dependencies`), so an idle admin doesn't generate a PUT
 * every interval for no reason.
 */
export function useAutoSave({ enabled, intervalMs, onSave, dependencies }: UseAutoSaveOptions) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isDirtyRef = useRef(false)
  const prevDepsRef = useRef<string>("")
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  const currentDepsStr = JSON.stringify(dependencies)

  // Mark dirty when dependencies change (but not on the very first render,
  // which would otherwise mark a freshly-loaded/created form dirty for no reason).
  useEffect(() => {
    if (prevDepsRef.current && prevDepsRef.current !== currentDepsStr) {
      isDirtyRef.current = true
    }
    prevDepsRef.current = currentDepsStr
  }, [currentDepsStr])

  useEffect(() => {
    if (!enabled) return

    timerRef.current = setInterval(async () => {
      if (!isDirtyRef.current) return

      isDirtyRef.current = false
      setStatus("saving")

      try {
        await onSaveRef.current()
        setStatus("saved")
        setTimeout(() => setStatus("idle"), 3000)
      } catch {
        isDirtyRef.current = true // retry on the next tick — the edit is still unsaved
        setStatus("error")
        setTimeout(() => setStatus("idle"), 5000)
      }
    }, intervalMs)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, intervalMs])

  return { saveStatus: status }
}
