import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import {
  useQuickEntryList,
  useCoverageSearch,
  useCreateQuickEntry,
  useUpdateQuickEntry,
  useArchiveQuickEntry,
  checkDuplicate,
} from "./quickEntry"

const apiGetMock = vi.fn()
const apiPostMock = vi.fn()
const apiPutMock = vi.fn()
const apiDeleteMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
    put: (...args: unknown[]) => apiPutMock(...args),
    delete: (...args: unknown[]) => apiDeleteMock(...args),
  },
}))

describe("useQuickEntryList", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
    apiGetMock.mockResolvedValue({ entries: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
  })

  it("builds the query string with only the provided filters, defaulting page/page_size", async () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useQuickEntryList({ module: "SD" }), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url] = apiGetMock.mock.calls[0]
    expect(url).toBe("api/admin/knowledge-entries?module=SD&page=1&page_size=20")
  })

  it("includes search/content_type/status/include_archived when provided", async () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(
      () =>
        useQuickEntryList({
          search: "VL150",
          content_type: "error_guide",
          status: "active",
          include_archived: true,
          page: 2,
          page_size: 50,
        }),
      { wrapper: Wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url] = apiGetMock.mock.calls[0]
    expect(url).toContain("search=VL150")
    expect(url).toContain("content_type=error_guide")
    expect(url).toContain("status=active")
    expect(url).toContain("include_archived=true")
    expect(url).toContain("page=2")
    expect(url).toContain("page_size=50")
  })
})

describe("useCoverageSearch — fans out across all 3 content types and merges", () => {
  beforeEach(() => {
    apiPostMock.mockReset()
  })

  it("calls check-duplicate once per content type and merges + sorts by similarity_score desc", async () => {
    apiPostMock.mockImplementation((_url: string, body: { content_type: string }) => {
      if (body.content_type === "error_guide") {
        return Promise.resolve({ has_similar: true, matches: [{ document_id: "EG-1", similarity_score: 0.7 }] })
      }
      if (body.content_type === "procedure") {
        return Promise.resolve({ has_similar: true, matches: [{ document_id: "PR-1", similarity_score: 0.95 }] })
      }
      return Promise.resolve({ has_similar: false, matches: [] })
    })

    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCoverageSearch({ query: "delivery error" }), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPostMock).toHaveBeenCalledTimes(3)
    const calledContentTypes = apiPostMock.mock.calls.map(([, body]) => body.content_type).sort()
    expect(calledContentTypes).toEqual(["config", "error_guide", "procedure"])

    // Merged and sorted by similarity_score descending — PR-1 (0.95) before EG-1 (0.7).
    expect(result.current.data?.results.map((r) => r.document_id)).toEqual(["PR-1", "EG-1"])
  })

  it("does not fire until the query is at least 3 characters", () => {
    const { Wrapper } = createQueryWrapper()
    renderHook(() => useCoverageSearch({ query: "ab" }), { wrapper: Wrapper })
    expect(apiPostMock).not.toHaveBeenCalled()
  })
})

describe("checkDuplicate — single content-type call used inside the form's own submit flow", () => {
  it("posts module, content_type, and summary_text as given, without fan-out", async () => {
    apiPostMock.mockResolvedValue({ has_similar: false, matches: [] })
    await checkDuplicate("SD", "error_guide", "delivery error")

    expect(apiPostMock).toHaveBeenCalledTimes(1)
    expect(apiPostMock).toHaveBeenCalledWith("api/admin/knowledge-entries/check-duplicate", {
      module: "SD",
      content_type: "error_guide",
      summary_text: "delivery error",
    })
  })
})

describe("useCreateQuickEntry / useUpdateQuickEntry — real payload shape", () => {
  beforeEach(() => {
    apiPostMock.mockReset()
    apiPutMock.mockReset()
  })

  it("create does not require expected_updated_at", async () => {
    apiPostMock.mockResolvedValue({ id: "e1", document_id: "SD-1", status: "draft", version: 1, message: "ok" })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCreateQuickEntry(), { wrapper: Wrapper })

    result.current.mutate({
      document_id: "SD-1",
      content_type: "error_guide",
      module: "SD",
      transactions: ["VL01N"],
      verified_by_name: "Admin",
      verified_date: "2026-01-01",
      review_frequency: null,
      form_data: {},
      gap_id: null,
      publish: false,
      current_version: 1,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPostMock).toHaveBeenCalledWith("api/admin/knowledge-entries", expect.not.objectContaining({ expected_updated_at: expect.anything() }))
  })

  it("a draft update includes expected_updated_at for the backend's optimistic-lock check", async () => {
    apiPutMock.mockResolvedValue({ id: "e1", document_id: "SD-1", version: 1, status: "draft", message: "ok" })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUpdateQuickEntry("e1"), { wrapper: Wrapper })

    result.current.mutate({
      document_id: "SD-1",
      content_type: "error_guide",
      module: "SD",
      transactions: ["VL01N"],
      verified_by_name: "Admin",
      verified_date: "2026-01-01",
      review_frequency: null,
      form_data: {},
      gap_id: null,
      publish: false,
      current_version: 1,
      expected_updated_at: "2026-01-01T00:00:00Z",
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPutMock).toHaveBeenCalledWith(
      "api/admin/knowledge-entries/e1",
      expect.objectContaining({ expected_updated_at: "2026-01-01T00:00:00Z" })
    )
  })
})

describe("useArchiveQuickEntry — sends confirmed_document_id as a DELETE body", () => {
  it("calls api.delete with a body option carrying confirmed_document_id", async () => {
    apiDeleteMock.mockReset()
    apiDeleteMock.mockResolvedValue(undefined)
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useArchiveQuickEntry(), { wrapper: Wrapper })

    result.current.mutate({ id: "e1", confirmedDocumentId: "SD-1" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiDeleteMock).toHaveBeenCalledWith("api/admin/knowledge-entries/e1", { body: { confirmed_document_id: "SD-1" } })
  })
})
