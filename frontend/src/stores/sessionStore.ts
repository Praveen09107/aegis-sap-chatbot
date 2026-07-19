import { create } from "zustand"

/**
 * sessionStore — STUB version (FRONTEND_09_LAYOUT_COMPONENTS.md's
 * SessionSidebar/SessionCard need this subset at minimum: active session,
 * search query, and pinned-id tracking). Full implementation:
 * FRONTEND_10_ZUSTAND_STORES.md (session F08). Do NOT rename these exports.
 *
 * Deliberately does NOT include renameSession/removeSession: the spec's own
 * SessionContextMenu.tsx calls those "optimistically," but the session list
 * itself lives in TanStack Query's cache (useSessions()), not in this
 * store — an optimistic update needs queryClient.setQueryData(), which is
 * F08's job (FRONTEND_11_TANSTACK_QUERY.md). Faking no-op functions here
 * would silently do nothing while looking like it worked, which is worse
 * than the real, disclosed gap: SessionContextMenu calls the API directly
 * and relies on useSessions()'s own refetch to pick up the change.
 */
interface SessionState {
  activeSessionId: string | null
  searchQuery: string
  pinnedIds: Set<string>
  setActiveSessionId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  togglePin: (id: string) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  activeSessionId: null,
  searchQuery: "",
  pinnedIds: new Set<string>(),

  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  togglePin: (id) =>
    set((s) => {
      const next = new Set(s.pinnedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { pinnedIds: next }
    }),
}))
