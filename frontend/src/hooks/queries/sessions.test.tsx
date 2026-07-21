import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useSessions, useSession, useDeleteSession, useRenameSession, usePinSession } from "./sessions"
import { useSessionStore } from "@/stores/sessionStore"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import type { Session } from "@/types"

const apiGetMock = vi.fn()
const apiDeleteMock = vi.fn()
const apiPutMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    delete: (...args: unknown[]) => apiDeleteMock(...args),
    put: (...args: unknown[]) => apiPutMock(...args),
  },
}))

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

// Mocks are reset inline at the top of each test (rather than via a shared
// beforeEach) — see the comment in adminData.test.tsx for why: a
// describe-level beforeEach(() => apiGetMock.mockReset()) here caused a
// stray, unrelated unhandled-rejection failure on a "rejected request" test
// that ran after a "success" test for the same hook.

describe("useSessions", () => {
  it("unwraps the {sessions, total, page} envelope into a plain array", async () => {
    apiGetMock.mockReset()
    useSessionStore.setState({ sessions: [] })
    apiGetMock.mockResolvedValue({ sessions: [makeSession({ id: "s1" })], total: 1, page: 1 })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSessions(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([makeSession({ id: "s1" })])
    expect(apiGetMock).toHaveBeenCalledWith("sessions")
  })

  it("builds query params from filters", async () => {
    apiGetMock.mockReset()
    useSessionStore.setState({ sessions: [] })
    apiGetMock.mockResolvedValue({ sessions: [], total: 0, page: 1 })
    const { Wrapper } = createQueryWrapper()
    renderHook(() => useSessions({ search: "VL150", module: "SD" }), { wrapper: Wrapper })

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    const calledPath = apiGetMock.mock.calls[0][0] as string
    expect(calledPath).toContain("search=VL150")
    expect(calledPath).toContain("module=SD")
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    useSessionStore.setState({ sessions: [] })
    apiGetMock.mockRejectedValue(new Error("network down"))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSessions(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it("includes is_unresolved in the query params when set (used by the history page's Unresolved filter)", async () => {
    apiGetMock.mockReset()
    useSessionStore.setState({ sessions: [] })
    apiGetMock.mockResolvedValue({ sessions: [], total: 0, page: 1 })
    const { Wrapper } = createQueryWrapper()
    renderHook(() => useSessions({ is_unresolved: true }), { wrapper: Wrapper })

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    const calledPath = apiGetMock.mock.calls[0][0] as string
    expect(calledPath).toContain("is_unresolved=true")
  })

  it("mirrors a successful fetch into sessionStore.sessions", async () => {
    apiGetMock.mockReset()
    useSessionStore.setState({ sessions: [] })
    const sessions = [makeSession({ id: "s1" })]
    apiGetMock.mockResolvedValue({ sessions, total: 1, page: 1 })
    const { Wrapper } = createQueryWrapper()
    renderHook(() => useSessions(), { wrapper: Wrapper })

    await waitFor(() => expect(useSessionStore.getState().sessions).toEqual(sessions))
  })

  it("resolves correctly when filters change mid-flight — the sessionStore mirror must end up with the newer result, not the stale one (race condition)", async () => {
    apiGetMock.mockReset()
    useSessionStore.setState({ sessions: [] })
    let resolveFirst!: (value: unknown) => void
    const firstCall = new Promise((resolve) => {
      resolveFirst = resolve
    })
    apiGetMock.mockImplementationOnce(() => firstCall) // search=A
    apiGetMock.mockImplementationOnce(() =>
      Promise.resolve({ sessions: [makeSession({ id: "b-result" })], total: 1, page: 1 })
    ) // search=B

    const { Wrapper } = createQueryWrapper()
    const { result, rerender } = renderHook(
      ({ search }: { search: string }) => useSessions({ search }),
      { wrapper: Wrapper, initialProps: { search: "A" } }
    )

    rerender({ search: "B" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([makeSession({ id: "b-result" })])
    expect(useSessionStore.getState().sessions).toEqual([makeSession({ id: "b-result" })])

    // Stale "A" resolves after "B" already won — must not clobber the mirror.
    resolveFirst({ sessions: [makeSession({ id: "a-too-late" })], total: 1, page: 1 })
    await new Promise((r) => setTimeout(r, 0))
    expect(useSessionStore.getState().sessions).toEqual([makeSession({ id: "b-result" })])
  })
})

describe("useSession", () => {
  it("is disabled (no fetch) when id is null", () => {
    apiGetMock.mockReset()
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSession(null), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe("idle")
    expect(apiGetMock).not.toHaveBeenCalled()
  })

  it("fetches the detail envelope for a given id", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ session: makeSession(), messages: [] })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSession("s1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiGetMock).toHaveBeenCalledWith("sessions/s1")
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("404"))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSession("s1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useDeleteSession", () => {
  it("calls DELETE and invalidates the sessions cache on success", async () => {
    apiDeleteMock.mockReset()
    apiDeleteMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeleteSession(), { wrapper: Wrapper })

    result.current.mutate("s1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiDeleteMock).toHaveBeenCalledWith("sessions/s1")
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sessions"] })
  })

  it("surfaces a failed delete as an error state", async () => {
    apiDeleteMock.mockReset()
    apiDeleteMock.mockRejectedValue(new Error("500"))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useDeleteSession(), { wrapper: Wrapper })

    result.current.mutate("s1")

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useRenameSession", () => {
  it("PUTs the new title and invalidates the sessions cache on success", async () => {
    apiPutMock.mockReset()
    apiPutMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useRenameSession(), { wrapper: Wrapper })

    result.current.mutate({ id: "s1", title: "New topic" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPutMock).toHaveBeenCalledWith("sessions/s1", { topic_summary: "New topic" })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sessions"] })
  })

  it("surfaces a failed rename as an error state", async () => {
    apiPutMock.mockReset()
    apiPutMock.mockRejectedValue(new Error("500"))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useRenameSession(), { wrapper: Wrapper })

    result.current.mutate({ id: "s1", title: "New topic" })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("usePinSession", () => {
  it("PUTs is_pinned and invalidates the sessions cache on success", async () => {
    apiPutMock.mockReset()
    apiPutMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => usePinSession(), { wrapper: Wrapper })

    result.current.mutate({ id: "s1", pinned: true })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPutMock).toHaveBeenCalledWith("sessions/s1", { is_pinned: true })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sessions"] })
  })

  it("surfaces a failed pin update as an error state", async () => {
    apiPutMock.mockReset()
    apiPutMock.mockRejectedValue(new Error("500"))
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => usePinSession(), { wrapper: Wrapper })

    result.current.mutate({ id: "s1", pinned: true })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
