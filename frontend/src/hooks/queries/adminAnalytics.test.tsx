import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useAdminAnalytics } from "./adminAnalytics"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"

const apiGetMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGetMock(...args) },
}))

function createWrapper() {
  return createQueryWrapper().Wrapper
}

describe("useAdminAnalytics", () => {
  it("fetches the analytics response for the given range", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ validation_score_trend: [], query_volume: [] })
    const { result } = renderHook(() => useAdminAnalytics("30d"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiGetMock).toHaveBeenCalledWith("admin/analytics?range=30d")
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminAnalytics("30d"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it("resolves correctly when the range changes mid-flight — the newer range's data must win, and the stale one must not clobber it after the fact (race condition)", async () => {
    apiGetMock.mockReset()
    let resolveFirst!: (value: unknown) => void
    const firstCall = new Promise((resolve) => {
      resolveFirst = resolve
    })
    apiGetMock.mockImplementationOnce(() => firstCall) // range=7d
    apiGetMock.mockImplementationOnce(() =>
      Promise.resolve({ validation_score_trend: [], query_volume: [], range: "90d" })
    ) // range=90d

    const { result, rerender } = renderHook(({ range }: { range: string }) => useAdminAnalytics(range), {
      wrapper: createWrapper(),
      initialProps: { range: "7d" },
    })

    rerender({ range: "90d" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ validation_score_trend: [], query_volume: [], range: "90d" })

    resolveFirst({ validation_score_trend: [], query_volume: [], range: "7d-too-late" })
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.data).toEqual({ validation_score_trend: [], query_volume: [], range: "90d" })
  })

  it("keeps the previous range's data visible while a new range loads (placeholderData)", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValueOnce({ validation_score_trend: [], query_volume: [], range: "7d" })
    let resolveSecond!: (value: unknown) => void
    const secondCall = new Promise((resolve) => {
      resolveSecond = resolve
    })
    apiGetMock.mockImplementationOnce(() => secondCall)

    const { result, rerender } = renderHook(({ range }: { range: string }) => useAdminAnalytics(range), {
      wrapper: createWrapper(),
      initialProps: { range: "7d" },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    rerender({ range: "90d" })

    // Still fetching the new range, but the old data stays visible instead
    // of flashing to undefined.
    expect(result.current.isPlaceholderData).toBe(true)
    expect(result.current.data).toEqual({ validation_score_trend: [], query_volume: [], range: "7d" })

    resolveSecond({ validation_score_trend: [], query_volume: [], range: "90d" })
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
    expect(result.current.data).toEqual({ validation_score_trend: [], query_volume: [], range: "90d" })
  })
})
