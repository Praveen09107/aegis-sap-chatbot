import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import type { UserPreferences } from "@/types"

// NOTE (confirmed 2026-07-23, F18): GET/PUT /preferences do not exist on the
// real backend either — no `user_preferences` migration anywhere in
// backend/ (FRONTEND_SUPPLEMENT_04's schema for this was never built). Same
// disclosed-gap precedent as sessions.ts. Not currently called from
// anywhere in the app (dark mode and onboarding-complete are both
// localStorage-only, per F16/F10) — kept here, complete and real, ready to
// wire in once a real backend endpoint exists, rather than wiring it to a
// 404 now for no benefit.
/**
 * Fetch user preferences from the server.
 * Falls back to defaults if the request fails.
 */
export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences.all(),
    queryFn: () => api.get<UserPreferences>("preferences", { silent: true }),
    staleTime: Infinity, // Preferences don't change externally
    gcTime: Infinity,
    retry: 1,
  })
}

/**
 * Update user preferences.
 * Called after dark mode toggle, panel state change, etc.
 *
 * Unlike useQuery, useMutation gives no built-in protection against an
 * earlier call's response resolving after a later one's — two rapid
 * preference updates (e.g. toggling dark mode then panel-collapse in quick
 * succession) could otherwise have the slower first call's onSuccess
 * overwrite the cache after the second, newer update already landed. The
 * attempt counter (bumped synchronously in onMutate, in .mutate() call
 * order) makes onSuccess a no-op for any response that isn't the most
 * recently dispatched attempt.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  const latestAttempt = useRef(0)

  return useMutation({
    mutationFn: (prefs: Partial<UserPreferences>) => api.put<UserPreferences>("preferences", prefs),
    onMutate: () => ({ attemptId: ++latestAttempt.current }),
    onSuccess: (data, _prefs, context) => {
      if (context.attemptId === latestAttempt.current) {
        queryClient.setQueryData(queryKeys.preferences.all(), data)
      }
    },
  })
}
