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
  it("fetches registry entries, optionally filtered by status", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue([{ id: "r1", status: "pending" }])
    const { result } = renderHook(() => useAdminRegistry("pending"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiGetMock).toHaveBeenCalledWith("admin/registry?status=pending")
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminRegistry(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useConfigSnapshot", () => {
  it("fetches the config snapshot", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue([{ category: "AR", key: "credit_days", value: "30" }])
    const { result } = renderHook(() => useConfigSnapshot(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiGetMock).toHaveBeenCalledWith("admin/config-snapshot")
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useConfigSnapshot(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useAdminGaps", () => {
  it("fetches gaps for the given day range", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue([])
    renderHook(() => useAdminGaps(30), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("admin/knowledge-gaps?days=30"))
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
    apiGetMock.mockImplementationOnce(() => Promise.resolve([{ id: "gap-90d" }]))

    const { result, rerender } = renderHook(({ days }: { days: number }) => useAdminGaps(days), {
      wrapper: createWrapper(),
      initialProps: { days: 7 },
    })

    rerender({ days: 90 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: "gap-90d" }])

    resolveFirst([{ id: "gap-7d-too-late" }])
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.data).toEqual([{ id: "gap-90d" }])
  })
})

describe("useAdminAuditTrail", () => {
  it("builds query params from filters", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue([])
    renderHook(() => useAdminAuditTrail({ module: "SD", request_type: "vision" }), { wrapper: createWrapper() })

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    const path = apiGetMock.mock.calls[0][0] as string
    expect(path).toContain("module=SD")
    expect(path).toContain("request_type=vision")
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminAuditTrail(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useAdminReviewQueue", () => {
  it("defaults to status=pending", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue([])
    renderHook(() => useAdminReviewQueue(), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("admin/review-queue?status=pending"))
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminReviewQueue(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe("useAdminTickets", () => {
  it("fetches tickets, optionally filtered by status", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue([])
    renderHook(() => useAdminTickets("open"), { wrapper: createWrapper() })
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("admin/tickets?status=open"))
  })

  it("surfaces a rejected request as an error state", async () => {
    apiGetMock.mockReset()
    apiGetMock.mockRejectedValue(new Error("down"))
    const { result } = renderHook(() => useAdminTickets(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
