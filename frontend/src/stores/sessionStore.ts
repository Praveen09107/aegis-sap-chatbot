import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { Session } from "@/types"
import { STORAGE_KEYS } from "@/lib/constants"
import { createSafeLocalStorage } from "./safeLocalStorage"

interface SessionState {
  // ── Session list (from server, managed by TanStack Query) ──
  /** Mirror of the server session list — kept in sync by useSessions() (see
   * src/hooks/queries/sessions.ts), which pushes its query data in here via
   * an effect. TanStack Query v5 removed useQuery's onSuccess callback (the
   * mechanism this store's own spec assumed), so the sync can't live inside
   * this store — "never fetch inside a Zustand store" still holds; this is
   * the query hook pushing its result in, not the store pulling. */
  sessions: Session[]
  setSessions: (sessions: Session[]) => void

  // ── Active session ───────────────────────────────────────
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void

  // ── Search ───────────────────────────────────────────────
  searchQuery: string
  setSearchQuery: (query: string) => void

  // ── Pinned sessions (persisted to localStorage) ──────────
  pinnedIds: Set<string>
  togglePin: (id: string) => void
  isPinned: (id: string) => boolean

  // ── Optimistic updates ───────────────────────────────────
  /** Optimistically rename a session before server confirms */
  renameSession: (id: string, newTitle: string) => void

  /** Optimistically remove a session before server confirms */
  removeSession: (id: string) => void

  // ── Derived ──────────────────────────────────────────────
  /** Get the currently active session object */
  getActiveSession: () => Session | undefined

  /** Get sessions sorted with pinned first, then by updated_at desc */
  getSortedSessions: () => Session[]

  /** Filter sessions by current search query */
  getFilteredSessions: () => Session[]
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      searchQuery: "",
      pinnedIds: new Set<string>(),

      setSessions: (sessions) => set({ sessions }),

      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      togglePin: (id) =>
        set((state) => {
          const next = new Set(state.pinnedIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { pinnedIds: next }
        }),

      isPinned: (id) => get().pinnedIds.has(id),

      renameSession: (id, newTitle) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, topic_summary: newTitle } : s)),
        })),

      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        })),

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        return sessions.find((s) => s.id === activeSessionId)
      },

      getSortedSessions: () => {
        const { sessions, pinnedIds } = get()
        return [...sessions].sort((a, b) => {
          const aPinned = pinnedIds.has(a.id)
          const bPinned = pinnedIds.has(b.id)
          if (aPinned && !bPinned) return -1
          if (!aPinned && bPinned) return 1
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })
      },

      getFilteredSessions: () => {
        const { searchQuery } = get()
        const sorted = get().getSortedSessions()
        if (!searchQuery.trim()) return sorted
        const q = searchQuery.toLowerCase()
        return sorted.filter(
          (s) => s.topic_summary.toLowerCase().includes(q) || s.module_tags.some((t) => t.toLowerCase().includes(q))
        )
      },
    }),
    {
      name: STORAGE_KEYS.PINNED_SESSIONS,
      storage: createJSONStorage(createSafeLocalStorage),
      // Only persist the pinned IDs and active session — not the sessions list
      // (sessions list comes fresh from the server on each mount)
      partialize: (state) => ({
        pinnedIds: Array.from(state.pinnedIds), // Set → Array for JSON
        activeSessionId: state.activeSessionId,
      }),
      // Rehydrate: convert Array back to Set
      merge: (persisted: unknown, current) => {
        const p = persisted as { pinnedIds?: string[]; activeSessionId?: string | null }
        return {
          ...current,
          pinnedIds: new Set(p.pinnedIds ?? []),
          activeSessionId: p.activeSessionId ?? null,
        }
      },
    }
  )
)
