import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { toastError } from "@/lib/toast"
import { useSessionStore } from "@/stores/sessionStore"
import type { Session, SessionFilters } from "@/types"

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
      const response = await api.get<SessionListResponse>(`sessions${query ? `?${query}` : ""}`)
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
    mutationFn: (id: string) => api.delete(`sessions/${id}`),
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
