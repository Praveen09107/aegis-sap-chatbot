import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import {
  useAdminDocuments,
  useAdminRegistry,
  useConfigSnapshot,
  useAdminGaps,
  useAdminAuditTrail,
  useAdminReviewQueue,
  useAdminTickets,
} from "./adminData"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"

const apiGetMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGetMock(...args) },
}))

function createWrapper() {
  return createQueryWrapper().Wrapper
}

// Resetting inline at the top of each test (rather than via a shared
// beforeEach) is deliberate — empirically, a describe-level
// beforeEach(() => apiGetMock.mockReset()) here causes a stray, unrelated
// unhandled-rejection failure to surface on whichever "rejected request"
// test runs after a "success" test for the same hook, even though each
// test uses its own fresh QueryClient. Resetting inline avoids it.

describe("useAdminDocuments", () => {
  it("unwraps the {documents, total} envelope", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ documents: [{ document_id: "d1" }], total: 1 })
    const { result } = renderHook(() => useAdminDocuments(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ document_id: "d1" }])
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useAdminDocuments(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it("resolves correctly when filters change mid-flight — the newer filter's result must win (race condition)", async () => {
    apiGetMock.mockReset()
    let resolveFirst!: (value: unknown) => void
    const firstCall = new Promise((resolve) => {
      resolveFirst = resolve
    })
    apiGetMock.mockImplementationOnce(() => firstCall) // module=SD
    apiGetMock.mockImplementationOnce(() => Promise.resolve({ documents: [{ document_id: "mm-doc" }], total: 1 })) // module=MM

    const { result, rerender } = renderHook(({ module }: { module: string }) => useAdminDocuments({ module }), {
      wrapper: createWrapper(),
      initialProps: { module: "SD" },
    })

    rerender({ module: "MM" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ document_id: "mm-doc" }])

    resolveFirst({ documents: [{ document_id: "sd-doc-too-late" }], total: 1 })
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.data).toEqual([{ document_id: "mm-doc" }])
  })
})

describe("useAdminRegistry", () => {
  it("fetches registry entries, optionally filtered by status, and unwraps the real {entries: [...]} envelope", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ entries: [{ id: "r1", status: "draft" }] })
    const { result } = renderHook(() => useAdminRegistry("draft"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiGetMock).toHaveBeenCalledWith("admin/registry?status=draft")
    expect(result.current.data).toEqual([{ id: "r1", status: "draft" }])
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminRegistry(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useConfigSnapshot", () => {
  it("fetches the config snapshot and unwraps the real {entries: [...]} envelope", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ entries: [{ config_category: "AR", config_key: "credit_days", config_value: "30" }] })
    const { result } = renderHook(() => useConfigSnapshot(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiGetMock).toHaveBeenCalledWith("admin/config-snapshot")
    expect(result.current.data).toEqual([{ config_category: "AR", config_key: "credit_days", config_value: "30" }])
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useConfigSnapshot(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useAdminGaps", () => {
  it("fetches gaps for the given day range and unwraps the real {clusters: [...]} envelope", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ clusters: [{ gap_id: "g1", gap_description: "VL150 error" }] })
    const { result } = renderHook(() => useAdminGaps(30), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("admin/knowledge-gaps?days=30"))
    await waitFor(() => expect(result.current.data).toEqual([{ gap_id: "g1", gap_description: "VL150 error" }]))
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminGaps(30), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it("resolves correctly when the day range changes mid-flight (race condition)", async () => {
    apiGetMock.mockReset()
    let resolveFirst!: (value: unknown) => void
    const firstCall = new Promise((resolve) => {
      resolveFirst = resolve
    })
    apiGetMock.mockImplementationOnce(() => firstCall)
    apiGetMock.mockImplementationOnce(() => Promise.resolve({ clusters: [{ gap_id: "gap-90d" }] }))

    const { result, rerender } = renderHook(({ days }: { days: number }) => useAdminGaps(days), {
      wrapper: createWrapper(),
      initialProps: { days: 7 },
    })

    rerender({ days: 90 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ gap_id: "gap-90d" }])

    resolveFirst({ clusters: [{ gap_id: "gap-7d-too-late" }] })
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.data).toEqual([{ gap_id: "gap-90d" }])
  })
})

describe("useAdminAuditTrail", () => {
  it("builds query params from the real filter set (days/confidence_badge/page/page_size)", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ entries: [], total: 0 })
    renderHook(() => useAdminAuditTrail({ days: 30, confidence_badge: "green", page: 2, page_size: 50 }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    const path = apiGetMock.mock.calls[0][0] as string
    expect(path).toContain("days=30")
    expect(path).toContain("confidence_badge=green")
    expect(path).toContain("page=2")
    expect(path).toContain("page_size=50")
  })

  it("does not unwrap — real response carries {entries, total} both needed for pagination", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ entries: [{ id: "a1" }], total: 42 })
    const { result } = renderHook(() => useAdminAuditTrail(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ entries: [{ id: "a1" }], total: 42 })
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminAuditTrail(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useAdminReviewQueue", () => {
  it("defaults to status=pending and unwraps the real {items: [...]} envelope", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ items: [{ id: "r1", status: "pending" }] })
    const { result } = renderHook(() => useAdminReviewQueue(), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("admin/review-queue?status=pending"))
    await waitFor(() => expect(result.current.data).toEqual([{ id: "r1", status: "pending" }]))
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminReviewQueue(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useAdminTickets", () => {
  it("fetches tickets, optionally filtered by status, and unwraps the real {tickets: [...]} envelope", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ tickets: [{ ticket_id: "t1", status: "open" }] })
    const { result } = renderHook(() => useAdminTickets("open"), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("admin/tickets?status=open"))
    await waitFor(() => expect(result.current.data).toEqual([{ ticket_id: "t1", status: "open" }]))
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminTickets(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
