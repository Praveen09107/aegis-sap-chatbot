"use client"

import { useEffect, useState, useCallback } from "react"
import { getAuthState, refreshAccessToken, logout, type AuthState } from "@/lib/auth"
import { TIMING } from "@/lib/constants"

/**
 * Auth state hook for use in protected page components. Handles silent
 * token refresh on a 12-minute cycle and logs out if a refresh ever fails.
 *
 * @example
 * const { isAuthenticated } = useAuth()
 * if (!isAuthenticated) return <LoadingScreen />
 */
export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>(() => getAuthState())

  const refreshAuthState = useCallback(() => {
    setAuthState(getAuthState())
  }, [])

  useEffect(() => {
    if (!authState.isAuthenticated) return

    const interval = setInterval(async () => {
      const ok = await refreshAccessToken()
      if (!ok) {
        // Refresh failed — token expired, go to login
        await logout()
      }
    }, TIMING.TOKEN_REFRESH_MS)

    return () => clearInterval(interval)
  }, [authState.isAuthenticated])

  return {
    isAuthenticated: authState.isAuthenticated,
    role: authState.role,
    isEmployee: authState.isAuthenticated && authState.role === "employee",
    isAdmin: authState.isAuthenticated && authState.role === "it-admin",
    refreshAuthState,
    logout,
  }
}
