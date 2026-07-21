import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import type { UserPreferences } from "@/types"

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
