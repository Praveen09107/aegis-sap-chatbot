import { describe, it, expect, beforeEach } from "vitest"
import { useSessionStore } from "./sessionStore"
import type { Session } from "@/types"

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id ?? "s1",
    user_id_hash: "h1",
    topic_summary: "VL150 delivery error",
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    turn_count: 3,
    avg_confidence_score: 0.9,
    confidence_badge: "green",
    module_tags: ["SD"],
    is_pinned: false,
    is_unresolved: false,
    ...overrides,
  }
}

describe("sessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      searchQuery: "",
      pinnedIds: new Set<string>(),
    })
  })

  it("starts with no sessions, no active session, empty search, no pins", () => {
    const state = useSessionStore.getState()
    expect(state.sessions).toEqual([])
    expect(state.activeSessionId).toBeNull()
    expect(state.searchQuery).toBe("")
    expect(state.pinnedIds.size).toBe(0)
  })

  it("setSessions() replaces the mirrored session list", () => {
    const sessions = [makeSession({ id: "s1" }), makeSession({ id: "s2" })]
    useSessionStore.getState().setSessions(sessions)
    expect(useSessionStore.getState().sessions).toEqual(sessions)
  })

  it("setActiveSessionId() sets and clears the active session", () => {
    useSessionStore.getState().setActiveSessionId("s1")
    expect(useSessionStore.getState().activeSessionId).toBe("s1")

    useSessionStore.getState().setActiveSessionId(null)
    expect(useSessionStore.getState().activeSessionId).toBeNull()
  })

  it("setSearchQuery() updates the query", () => {
    useSessionStore.getState().setSearchQuery("VL150")
    expect(useSessionStore.getState().searchQuery).toBe("VL150")
  })

  describe("togglePin / isPinned", () => {
    it("adds then removes a session id", () => {
      useSessionStore.getState().togglePin("s1")
      expect(useSessionStore.getState().isPinned("s1")).toBe(true)

      useSessionStore.getState().togglePin("s1")
      expect(useSessionStore.getState().isPinned("s1")).toBe(false)
    })

    it("toggling an id with no matching session is a no-op error case, not a crash", () => {
      useSessionStore.getState().togglePin("unknown-id")
      expect(useSessionStore.getState().isPinned("unknown-id")).toBe(true)
      useSessionStore.getState().togglePin("unknown-id")
      expect(useSessionStore.getState().pinnedIds.size).toBe(0)
    })

    it("resolves correctly when two togglePin calls for different ids fire in the same tick (no lost update)", () => {
      const { togglePin } = useSessionStore.getState()
      togglePin("s1")
      togglePin("s2")

      const pinned = useSessionStore.getState().pinnedIds
      expect(pinned.has("s1")).toBe(true)
      expect(pinned.has("s2")).toBe(true)
      expect(pinned.size).toBe(2)
    })
  })

  describe("renameSession / removeSession (optimistic)", () => {
    it("renameSession() updates topic_summary for the matching session only", () => {
      useSessionStore.getState().setSessions([makeSession({ id: "s1" }), makeSession({ id: "s2" })])
      useSessionStore.getState().renameSession("s1", "Renamed topic")

      const sessions = useSessionStore.getState().sessions
      expect(sessions.find((s) => s.id === "s1")?.topic_summary).toBe("Renamed topic")
      expect(sessions.find((s) => s.id === "s2")?.topic_summary).toBe("VL150 delivery error")
    })

    it("renameSession() for an unknown id is a no-op, not a crash (error path)", () => {
      useSessionStore.getState().setSessions([makeSession({ id: "s1" })])
      expect(() => useSessionStore.getState().renameSession("unknown", "x")).not.toThrow()
      expect(useSessionStore.getState().sessions[0].topic_summary).toBe("VL150 delivery error")
    })

    it("removeSession() removes the session and clears activeSessionId if it was active", () => {
      useSessionStore.getState().setSessions([makeSession({ id: "s1" }), makeSession({ id: "s2" })])
      useSessionStore.getState().setActiveSessionId("s1")

      useSessionStore.getState().removeSession("s1")

      expect(useSessionStore.getState().sessions.map((s) => s.id)).toEqual(["s2"])
      expect(useSessionStore.getState().activeSessionId).toBeNull()
    })

    it("removeSession() leaves activeSessionId untouched when a different session is removed", () => {
      useSessionStore.getState().setSessions([makeSession({ id: "s1" }), makeSession({ id: "s2" })])
      useSessionStore.getState().setActiveSessionId("s1")

      useSessionStore.getState().removeSession("s2")

      expect(useSessionStore.getState().activeSessionId).toBe("s1")
    })
  })

  describe("getActiveSession / getSortedSessions / getFilteredSessions", () => {
    it("getActiveSession() returns the session matching activeSessionId, or undefined", () => {
      useSessionStore.getState().setSessions([makeSession({ id: "s1" })])
      expect(useSessionStore.getState().getActiveSession()).toBeUndefined()

      useSessionStore.getState().setActiveSessionId("s1")
      expect(useSessionStore.getState().getActiveSession()?.id).toBe("s1")
    })

    it("getSortedSessions() puts pinned sessions first, then sorts by updated_at desc", () => {
      useSessionStore.getState().setSessions([
        makeSession({ id: "older-unpinned", updated_at: "2026-07-18T00:00:00Z" }),
        makeSession({ id: "newer-unpinned", updated_at: "2026-07-19T12:00:00Z" }),
        makeSession({ id: "older-pinned", updated_at: "2026-07-17T00:00:00Z" }),
      ])
      useSessionStore.getState().togglePin("older-pinned")

      const sorted = useSessionStore.getState().getSortedSessions().map((s) => s.id)
      expect(sorted).toEqual(["older-pinned", "newer-unpinned", "older-unpinned"])
    })

    it("getFilteredSessions() filters by topic_summary and module_tags, case-insensitively", () => {
      useSessionStore.getState().setSessions([
        makeSession({ id: "s1", topic_summary: "VL150 delivery error", module_tags: ["SD"] }),
        makeSession({ id: "s2", topic_summary: "MIGO goods receipt", module_tags: ["MM"] }),
      ])

      useSessionStore.getState().setSearchQuery("migo")
      expect(useSessionStore.getState().getFilteredSessions().map((s) => s.id)).toEqual(["s2"])

      useSessionStore.getState().setSearchQuery("sd")
      expect(useSessionStore.getState().getFilteredSessions().map((s) => s.id)).toEqual(["s1"])
    })

    it("getFilteredSessions() returns the full sorted list when the query is blank", () => {
      useSessionStore.getState().setSessions([makeSession({ id: "s1" }), makeSession({ id: "s2" })])
      expect(useSessionStore.getState().getFilteredSessions()).toHaveLength(2)
    })
  })

  it("resolves correctly when setSessions() (from a useSessions() refetch) and removeSession() (from a delete mutation) fire in the same tick — the delete must not be silently undone by a stale refetch", () => {
    // Simulates the real race this store exists to handle: a session-list
    // refetch resolving at nearly the same moment a delete mutation's
    // optimistic-ish removeSession() call fires. removeSession() must win
    // since it's the user's most recent, explicit intent.
    useSessionStore.getState().setSessions([makeSession({ id: "s1" }), makeSession({ id: "s2" })])
    useSessionStore.getState().removeSession("s1")

    expect(useSessionStore.getState().sessions.map((s) => s.id)).toEqual(["s2"])
  })
})
