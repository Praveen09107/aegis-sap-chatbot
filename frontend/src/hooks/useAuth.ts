"use client"

import { useEffect, useCallback, useSyncExternalStore } from "react"
import { getAuthState, refreshAccessToken, logout } from "@/lib/auth"
import { TIMING } from "@/lib/constants"

// Module-level pub/sub so refreshAuthState() (e.g. after a login callback)
// can force every useAuth() instance to re-read cookies, without a
// setState-in-effect (eslint-plugin-react-hooks v7's react-hooks/set-state-in-effect
// rule flags that pattern — see useMediaQuery.ts for the same fix applied
// to matchMedia). Cookies have no native change event, so this is also how
// components subscribe to auth changes at all, alongside window "focus"
// (a tab regaining focus is the other realistic point where the cookie
// could have changed underneath the app, e.g. a session expiring elsewhere).
const authListeners = new Set<() => void>()

function notifyAuthChanged() {
  authListeners.forEach((listener) => listener())
}

function subscribeAuth(onChange: () => void) {
  authListeners.add(onChange)
  window.addEventListener("focus", onChange)
  return () => {
    authListeners.delete(onChange)
    window.removeEventListener("focus", onChange)
  }
}

function subscribeHydration() {
  // Fires once, immediately after hydration — no ongoing subscription needed.
  return () => {}
}

/**
 * Auth state hook for use in protected page components. Handles silent
 * token refresh on a 12-minute cycle and logs out if a refresh ever fails.
 *
 * initializing: true during SSR and the first client render, false once
 * hydration completes. Layout components show <LoadingScreen /> while
 * initializing, and only fire redirects once it's false.
 *
 * Built on useSyncExternalStore rather than a mount effect + setState: the
 * server snapshot (unauthenticated, not-yet-hydrated) and the client
 * snapshot (real cookie read) differ by design, and useSyncExternalStore is
 * the primitive React ships specifically to reconcile that gap without a
 * visible post-paint flash — the same reasoning as useMediaQuery.ts.
 *
 * @example
 * const { isAuthenticated, initializing } = useAuth()
 * if (initializing) return <LoadingScreen />
 * if (!isAuthenticated) return null
 */
export function useAuth() {
  const isAuthenticated = useSyncExternalStore(
    subscribeAuth,
    () => getAuthState().isAuthenticated,
    () => false
  )
  const role = useSyncExternalStore(
    subscribeAuth,
    () => getAuthState().role,
    () => null
  )
  const initializing = useSyncExternalStore(
    subscribeHydration,
    () => false,
    () => true
  )

  const refreshAuthState = useCallback(() => {
    notifyAuthChanged()
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return

    const interval = setInterval(async () => {
      const ok = await refreshAccessToken()
      if (!ok) {
        // Refresh failed — token expired, go to login
        await logout()
      }
    }, TIMING.TOKEN_REFRESH_MS)

    return () => clearInterval(interval)
  }, [isAuthenticated])

  return {
    isAuthenticated,
    role,
    isEmployee: isAuthenticated && role === "employee",
    isAdmin: isAuthenticated && role === "it-admin",
    initializing,
    refreshAuthState,
    logout,
  }
}
