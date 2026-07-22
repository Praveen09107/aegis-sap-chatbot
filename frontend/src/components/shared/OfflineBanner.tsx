"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { motion, AnimatePresence } from "motion/react"
import { WifiOff, Wifi } from "lucide-react"
import { cn } from "@/lib/utils"
import { EXPAND_DOWN } from "@/lib/animations"

function subscribe(callback: () => void) {
  window.addEventListener("online", callback)
  window.addEventListener("offline", callback)
  return () => {
    window.removeEventListener("online", callback)
    window.removeEventListener("offline", callback)
  }
}

function getSnapshot() {
  return navigator.onLine
}

function getServerSnapshot() {
  return true // SSR: assume online, corrected on the client immediately after hydration
}

/**
 * Offline detection banner. Appears at the very top of the page when
 * network connection is lost, and automatically dismisses when connection
 * is restored. Mount once in each portal layout (employee + admin).
 *
 * isOnline reads navigator.onLine via useSyncExternalStore rather than a
 * manual useState+useEffect sync — the correct primitive for external
 * browser state, and avoids a setState-in-effect on mount (flagged by
 * eslint-plugin-react-hooks v7's react-hooks/set-state-in-effect rule).
 *
 * Expands down / collapses via the shared EXPAND_DOWN variant (FRONTEND_26)
 * — reduced motion is handled globally by the root layout's
 * <MotionConfig reducedMotion="user"> (F15), no manual check needed here.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [showReconnected, setShowReconnected] = useState(false)
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true
      return
    }
    if (!wasOfflineRef.current) return

    wasOfflineRef.current = false
    setShowReconnected(true)
    const timer = setTimeout(() => setShowReconnected(false), 3000)
    return () => clearTimeout(timer)
  }, [isOnline])

  const show = !isOnline || showReconnected

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          variants={EXPAND_DOWN}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            "fixed top-0 inset-x-0 z-notification",
            "flex items-center justify-center gap-2",
            "py-2 px-4 text-sm font-medium",
            !isOnline ? "bg-danger text-white" : "bg-success text-white"
          )}
          role="status"
          aria-live="assertive"
        >
          {!isOnline ? (
            <>
              <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>No network connection — your work is saved locally</span>
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Connection restored</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
