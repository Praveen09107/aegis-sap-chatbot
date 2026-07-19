import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import {
  useSessions,
  useSession,
  useAdminMetrics,
  useAdminDocuments,
  useSystemHealth,
  useReviewQueueCount,
  usePreferences,
} from "./index"

const apiGetMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

describe("query hooks (STUB — FRONTEND_09 Step 0)", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
  })

  it("useSessions resolves with the fetched list", async () => {
    apiGetMock.mockResolvedValue([{ id: "s1" }])
    const { result } = renderHook(() => useSessions(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: "s1" }])
    expect(apiGetMock).toHaveBeenCalledWith("sessions")
  })

  it("useSessions surfaces a rejected request as an error state", async () => {
    apiGetMock.mockRejectedValue(new Error("network down"))
    const { result } = renderHook(() => useSessions(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it("useSession is disabled (no fetch) when id is null", () => {
    const { result } = renderHook(() => useSession(null), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe("idle")
    expect(apiGetMock).not.toHaveBeenCalled()
  })

  it("useSession fetches the given session id", async () => {
    apiGetMock.mockResolvedValue({ id: "s1" })
    const { result } = renderHook(() => useSession("s1"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiGetMock).toHaveBeenCalledWith("sessions/s1")
  })

  it("useAdminMetrics, useSystemHealth, usePreferences each resolve their own endpoint", async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path === "admin/metrics") return Promise.resolve({ totalQueries: 1 })
      if (path === "admin/system-health") return Promise.resolve({ services: [] })
      if (path === "preferences") return Promise.resolve({ theme: "dark" })
      return Promise.reject(new Error(`unexpected path ${path}`))
    })
    const wrapper = createWrapper()

    const metrics = renderHook(() => useAdminMetrics(), { wrapper })
    const health = renderHook(() => useSystemHealth(), { wrapper })
    const prefs = renderHook(() => usePreferences(), { wrapper })

    await waitFor(() => expect(metrics.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(health.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(prefs.result.current.isSuccess).toBe(true))

    expect(metrics.result.current.data).toEqual({ totalQueries: 1 })
    expect(health.result.current.data).toEqual({ services: [] })
    expect(prefs.result.current.data).toEqual({ theme: "dark" })
  })

  it("useReviewQueueCount selects the numeric count out of the response envelope", async () => {
    apiGetMock.mockResolvedValue({ count: 7 })
    const { result } = renderHook(() => useReviewQueueCount(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(7)
  })

  it("useAdminDocuments resolves the document list for the given filters", async () => {
    apiGetMock.mockResolvedValue([{ id: "d1" }])
    const { result } = renderHook(() => useAdminDocuments({ status: "active" }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: "d1" }])
  })

  it("resolves correctly when filters change mid-flight — the stale in-flight response must not overwrite the newer query's result (race condition)", async () => {
    // Simulates a user changing a filter dropdown before the first request
    // has returned. TanStack Query keys the cache by queryKey (which
    // includes filters), so the earlier in-flight call resolving late must
    // not clobber the later, correct result — even though it resolves
    // second in wall-clock time here.
    let resolveFirst!: (value: unknown[]) => void
    const firstCall = new Promise<unknown[]>((resolve) => {
      resolveFirst = resolve
    })

    apiGetMock.mockImplementationOnce(() => firstCall) // filters=A
    apiGetMock.mockImplementationOnce(() => Promise.resolve([{ id: "b-result" }])) // filters=B

    const wrapper = createWrapper()
    const { result, rerender } = renderHook(
      ({ filters }: { filters?: { status: string } }) => useAdminDocuments(filters),
      { wrapper, initialProps: { filters: { status: "A" } } }
    )

    rerender({ filters: { status: "B" } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: "b-result" }])

    // The stale "A" request finally resolves after "B" already won — it
    // must not overwrite the current, correct "B" result.
    resolveFirst([{ id: "a-result-too-late" }])
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.data).toEqual([{ id: "b-result" }])
  })
})
