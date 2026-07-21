import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useAdminMetrics, useSystemHealth, useReviewQueueCount } from "./adminMetrics"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import type { MetricsData, SystemHealthData } from "@/types"

const apiGetMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}))

function createWrapper() {
  return createQueryWrapper().Wrapper
}

const metrics: MetricsData = {
  total_queries_today: 120,
  avg_validation_score: 0.88,
  green_badge_rate: 0.7,
  amber_badge_rate: 0.2,
  none_badge_rate: 0.1,
  open_tickets: 3,
  cache_hit_rate: 0.6,
  crag_insufficient_rate: 0.05,
  mode_a_rate: 0.5,
  mode_b_rate: 0.4,
  mode_c_rate: 0.1,
  last_updated_at: "2026-07-20T00:00:00Z",
}

const health: SystemHealthData = {
  services: [],
  total_healthy: 19,
  total_unhealthy: 0,
  overall_status: "healthy",
  checked_at: "2026-07-20T00:00:00Z",
}

// Mocks are reset inline at the top of each test rather than via a shared
// beforeEach — see the comment in adminData.test.tsx for why.

describe("useAdminMetrics", () => {
  it("fetches metrics with silent:true (dashboard shows degraded state inline, not a toast)", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue(metrics)
    const { result } = renderHook(() => useAdminMetrics(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(metrics)
    expect(apiGetMock).toHaveBeenCalledWith("admin/metrics", { silent: true })
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("503"))
    const { result } = renderHook(() => useAdminMetrics(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it("resolves correctly when refetch() is called while the initial fetch is still in flight — no duplicate request, no inconsistent state (race condition)", async () => {
    // A real race for a fixed single-key polling query isn't "two
    // independent fetches land out of order" (queryKey never changes here,
    // so TanStack Query dedupes concurrent fetches for the same key into
    // the one in-flight request) — the actual risk is a duplicate network
    // call or a torn/inconsistent state if that dedup ever regressed. This
    // pins the real, correct behavior: only one call happens, and the
    // eventual data is exactly what that one call resolved with.
    apiGetMock.mockReset()
    let resolveFirst!: (value: MetricsData) => void
    const firstCall = new Promise<MetricsData>((resolve) => {
      resolveFirst = resolve
    })
    apiGetMock.mockReturnValueOnce(firstCall)

    const { result } = renderHook(() => useAdminMetrics(), { wrapper: createWrapper() })
    // The mount's own fetch is already in flight — this must not start a
    // second, independent request for the same query key.
    result.current.refetch()

    expect(apiGetMock).toHaveBeenCalledTimes(1)

    resolveFirst(metrics)
    await waitFor(() => expect(result.current.data).toEqual(metrics))
    expect(apiGetMock).toHaveBeenCalledTimes(1)
  })
})

describe("useSystemHealth", () => {
  it("fetches system health", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue(health)
    const { result } = renderHook(() => useSystemHealth(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(health)
    expect(apiGetMock).toHaveBeenCalledWith("admin/system-health")
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useSystemHealth(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useReviewQueueCount", () => {
  it("selects the numeric count out of the {count} envelope, with silent:true", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ count: 5 })
    const { result } = renderHook(() => useReviewQueueCount(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(5)
    expect(apiGetMock).toHaveBeenCalledWith("admin/review-queue/count", { silent: true })
  })

  it("surfaces a rejected request as an error state (nav badge just shows nothing)", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useReviewQueueCount(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
