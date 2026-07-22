import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { usePipelineHealth, useInferenceHealth, useAttentionEntries } from "./adminHealth"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"

const apiGetMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGetMock(...args) },
}))

function createWrapper() {
  return createQueryWrapper().Wrapper
}

describe("usePipelineHealth", () => {
  it("fetches the real pipeline-health endpoint", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ badge: "green" })
    renderHook(() => usePipelineHealth(), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("api/admin/knowledge-entries/pipeline-health"))
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => usePipelineHealth(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useInferenceHealth", () => {
  it("fetches the real inference-health endpoint", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ badge: "green", chains: {}, last_health_check: null })
    renderHook(() => useInferenceHealth(), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("api/admin/inference-health"))
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useInferenceHealth(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useAttentionEntries", () => {
  it("filters to entries with negative feedback, sorted most-negative-net first, capped at 5", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({
      entries: [
        { id: "a", feedback_summary: { positive: 0, negative: 0, net: 0, period_days: 30, last_negative_at: null } },
        { id: "b", feedback_summary: { positive: 1, negative: 4, net: -3, period_days: 30, last_negative_at: null } },
        { id: "c", feedback_summary: { positive: 0, negative: 1, net: -1, period_days: 30, last_negative_at: null } },
      ],
      total: 3,
      page: 1,
      page_size: 100,
      total_pages: 1,
    })
    const { result } = renderHook(() => useAttentionEntries(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((e) => e.id)).toEqual(["b", "c"])
  })

  it("requests the list endpoint with a page_size of 100", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ entries: [], total: 0, page: 1, page_size: 100, total_pages: 0 })
    renderHook(() => useAttentionEntries(), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("api/admin/knowledge-entries?page_size=100"))
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAttentionEntries(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
