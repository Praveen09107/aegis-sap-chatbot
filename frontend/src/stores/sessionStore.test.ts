import { describe, it, expect, beforeEach } from "vitest"
import { useSessionStore } from "./sessionStore"

describe("sessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({
      activeSessionId: null,
      searchQuery: "",
      pinnedIds: new Set<string>(),
    })
  })

  it("starts with no active session, empty search, no pins", () => {
    const state = useSessionStore.getState()
    expect(state.activeSessionId).toBeNull()
    expect(state.searchQuery).toBe("")
    expect(state.pinnedIds.size).toBe(0)
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

  it("togglePin() adds then removes a session id", () => {
    useSessionStore.getState().togglePin("s1")
    expect(useSessionStore.getState().pinnedIds.has("s1")).toBe(true)

    useSessionStore.getState().togglePin("s1")
    expect(useSessionStore.getState().pinnedIds.has("s1")).toBe(false)
  })

  it("togglePin() on an id that was never pinned is a no-op error case, not a crash", () => {
    // "Error path" for a synchronous store: an invalid/edge-case call
    // (toggling an id the caller has no record of) must not throw or
    // corrupt state for other ids.
    useSessionStore.getState().togglePin("unknown-id")
    expect(useSessionStore.getState().pinnedIds.has("unknown-id")).toBe(true)
    useSessionStore.getState().togglePin("unknown-id")
    expect(useSessionStore.getState().pinnedIds.size).toBe(0)
  })

  it("resolves correctly when two togglePin calls for different ids fire in the same tick (no lost update)", () => {
    // Each togglePin() derives the next Set from the previous state (s),
    // not a captured outer variable, so pinning two different sessions
    // "simultaneously" must not lose either update.
    const { togglePin } = useSessionStore.getState()
    togglePin("s1")
    togglePin("s2")

    const pinned = useSessionStore.getState().pinnedIds
    expect(pinned.has("s1")).toBe(true)
    expect(pinned.has("s2")).toBe(true)
    expect(pinned.size).toBe(2)
  })
})
