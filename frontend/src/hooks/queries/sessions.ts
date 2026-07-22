import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { toastError } from "@/lib/toast"
import { useSessionStore } from "@/stores/sessionStore"
import type { Session, SessionFilters } from "@/types"

// NOTE (confirmed 2026-07-23, F18): GET/PUT/DELETE /sessions/* do not exist
// on the real backend — no `sessions_handler.py`, no `sessions`/
// `session_messages` migration anywhere in backend/ (FRONTEND_SUPPLEMENT_03's
// full Postgres schema + endpoint spec for this feature was never built).
// Same disclosed-gap precedent as /admin/metrics and /admin/analytics: built
// fully per spec anyway, degrades honestly (api.ts's own error handling
// surfaces the real 404 rather than faking data), ready to activate the
// moment a backend session adds this endpoint. Employee session history is
// NOT persisted across browser sessions until then.

// ── Response types ────────────────────────────────────────────

interface SessionListResponse {
  sessions: Session[]
  total: number
  page: number
}

interface SessionDetailResponse {
  session: Session
  messages: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    timestamp: string
    confidence_badge?: string | null
    validation_score?: number | null
    attribution_doc_id?: string | null
  }>
}

// ── Session list ──────────────────────────────────────────────

/**
 * Fetches the user's session history.
 * Used by SessionSidebar and Session History page.
 *
 * Also mirrors the result into sessionStore.sessions (see
 * FRONTEND_10_ZUSTAND_STORES.md's "mirror of the server session list"
 * design) via an effect, not useQuery's onSuccess — TanStack Query v5
 * removed onSuccess/onError/onSettled from useQuery entirely (a real,
 * confirmed v4→v5 change; only useMutation still has them), so an effect
 * watching `data` is the v5-correct way to push query results into an
 * external store.
 *
 * @param filters - Optional filters (search, module, date range)
 * @example
 * const { data: sessions = [], isLoading } = useSessions()
 * const { data, isLoading } = useSessions({ search: 'VL150', module: 'SD' })
 */
export function useSessions(filters?: SessionFilters) {
  const query = useQuery({
    queryKey: queryKeys.sessions.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.search) params.set("search", filters.search)
      if (filters?.module) params.set("module", filters.module)
      if (filters?.confidence_badge) params.set("confidence_badge", filters.confidence_badge)
      if (filters?.date_from) params.set("date_from", filters.date_from)
      if (filters?.date_to) params.set("date_to", filters.date_to)
      if (filters?.is_pinned !== undefined) params.set("is_pinned", String(filters.is_pinned))
      if (filters?.is_unresolved !== undefined) params.set("is_unresolved", String(filters.is_unresolved))

      const query = params.toString()
      // silent: true — this fires automatically on every employee page load
      // (SessionSidebar, history page), not from a user action; while the
      // backend endpoint doesn't exist yet (see the module-level NOTE
      // above), an error toast on every single page view would be far more
      // disruptive than the sidebar's own empty-state already is.
      const response = await api.get<SessionListResponse>(`sessions${query ? `?${query}` : ""}`, { silent: true })
      return response.sessions
    },
    staleTime: 30_000, // 30s — sessions don't change mid-chat
    gcTime: 5 * 60_000, // 5min cache retention
    placeholderData: (prev) => prev, // keep previous data while refetching
  })

  const { data } = query
  useEffect(() => {
    if (data) useSessionStore.getState().setSessions(data)
  }, [data])

  return query
}

/**
 * Fetches a single session with its full message history.
 * Used when loading a historical session into the chat interface.
 *
 * @param id - Session ID, or null if no session is active
 */
export function useSession(id: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(id ?? ""),
    queryFn: () => api.get<SessionDetailResponse>(`sessions/${id}`),
    enabled: !!id,
    staleTime: 5 * 60_000, // Historical sessions rarely change
  })
}

// ── Session mutations ─────────────────────────────────────────

export function useDeleteSession() {
  const queryClient = useQueryClient()

  return useMutation({
    // silent: true — api.delete() would otherwise also toast its own
    // generic "Request failed" message, stacking a second toast on top of
    // this mutation's own, more specific onError below every single time.
    mutationFn: (id: string) => api.delete(`sessions/${id}`, { silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
    },
    onError: () => {
      toastError("Failed to delete session")
    },
  })
}

export function useRenameSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.put(`sessions/${id}`, { topic_summary: title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
    },
  })
}

export function usePinSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.put(`sessions/${id}`, { is_pinned: pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
    },
  })
}
