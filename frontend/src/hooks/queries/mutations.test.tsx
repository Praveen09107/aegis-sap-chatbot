import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import {
  useDeprecateDocument,
  useBulkDeprecateDocuments,
  useApproveRegistry,
  useRejectRegistry,
  useUpdateConfig,
  useResolveReview,
  useUpdateTicketStatus,
  useUploadDocument,
  useSubmitFeedback,
} from "./mutations"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { useAdminStore } from "@/stores/adminStore"

const {
  apiGetMock,
  apiPostMock,
  apiPutMock,
  apiPatchMock,
  apiUploadMock,
  toastMock,
  toastErrorMock,
  toastPromiseMock,
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiPutMock: vi.fn(),
  apiPatchMock: vi.fn(),
  apiUploadMock: vi.fn(),
  toastMock: {
    documentDeprecated: vi.fn(),
    registryApproved: vi.fn(),
    registryRejected: vi.fn(),
    configSaved: vi.fn(),
    configSaveFailed: vi.fn(),
    correctionSubmitted: vi.fn(),
    correctionSkipped: vi.fn(),
    ticketMoved: vi.fn(),
    networkError: vi.fn(),
    documentUploaded: vi.fn(),
    documentsFailed: vi.fn(),
    feedbackPositive: vi.fn(),
    feedbackNegative: vi.fn(),
  },
  toastErrorMock: vi.fn(),
  toastPromiseMock: vi.fn((...args: unknown[]) => args[0] as Promise<unknown>),
}))

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
    put: (...args: unknown[]) => apiPutMock(...args),
    patch: (...args: unknown[]) => apiPatchMock(...args),
    upload: (...args: unknown[]) => apiUploadMock(...args),
  },
}))

vi.mock("@/lib/toast", () => ({
  TOAST: toastMock,
  toastError: (...args: unknown[]) => toastErrorMock(...args),
  toastPromise: (...args: unknown[]) => toastPromiseMock(...args),
}))

function createWrapper() {
  return createQueryWrapper().Wrapper
}

describe("useDeprecateDocument", () => {
  it("PATCHes status=deprecated, toasts, and invalidates documents on success", async () => {
    apiPatchMock.mockReset()
    toastMock.documentDeprecated.mockClear()
    apiPatchMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeprecateDocument(), { wrapper: Wrapper })

    result.current.mutate("doc-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPatchMock).toHaveBeenCalledWith("admin/documents/doc-1", { status: "deprecated" })
    expect(toastMock.documentDeprecated).toHaveBeenCalledWith("doc-1")
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "documents", {}] })
  })

  it("toasts an error on failure", async () => {
    apiPatchMock.mockReset()
    toastErrorMock.mockClear()
    apiPatchMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useDeprecateDocument(), { wrapper: createWrapper() })

    result.current.mutate("doc-1")

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to deprecate document")
  })
})

describe("useBulkDeprecateDocuments", () => {
  it("posts the id list and invalidates documents regardless of outcome (onSettled)", async () => {
    apiPostMock.mockReset()
    apiPostMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useBulkDeprecateDocuments(), { wrapper: Wrapper })

    result.current.mutate(["d1", "d2"])

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPostMock).toHaveBeenCalledWith("admin/documents/bulk-deprecate", { document_ids: ["d1", "d2"] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "documents", {}] })
  })

  it("still invalidates documents when the request fails (onSettled runs on error too)", async () => {
    apiPostMock.mockReset()
    apiPostMock.mockRejectedValue(new Error("500"))
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useBulkDeprecateDocuments(), { wrapper: Wrapper })

    result.current.mutate(["d1"])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "documents", {}] })
  })
})

describe("useApproveRegistry / useRejectRegistry", () => {
  it("useApproveRegistry PATCHes (the real backend route, not POST), toasts, and invalidates the registry", async () => {
    apiPatchMock.mockReset()
    apiPatchMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useApproveRegistry(), { wrapper: Wrapper })

    result.current.mutate("r1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPatchMock).toHaveBeenCalledWith("admin/registry/r1/approve")
    expect(toastMock.registryApproved).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "registry", "all"] })
  })

  it("useApproveRegistry toasts an error on failure", async () => {
    apiPatchMock.mockReset()
    toastErrorMock.mockClear()
    apiPatchMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useApproveRegistry(), { wrapper: createWrapper() })

    result.current.mutate("r1")

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to approve registry entry")
  })

  it("useRejectRegistry rejects, toasts, and invalidates the registry", async () => {
    apiPostMock.mockReset()
    apiPostMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useRejectRegistry(), { wrapper: Wrapper })

    result.current.mutate("r1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPostMock).toHaveBeenCalledWith("admin/registry/r1/reject")
    expect(toastMock.registryRejected).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "registry", "all"] })
  })
})

describe("useUpdateConfig", () => {
  it("PUTs config_value (the real body key, not value), toasts with the key, and invalidates config on success", async () => {
    apiPutMock.mockReset()
    apiPutMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useUpdateConfig(), { wrapper: Wrapper })

    result.current.mutate({ category: "AR", key: "credit_days", value: "30" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPutMock).toHaveBeenCalledWith("admin/config-snapshot/AR/credit_days", { config_value: "30" })
    expect(toastMock.configSaved).toHaveBeenCalledWith("credit_days")
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "config"] })
  })

  it("toasts a save-failed message on error", async () => {
    apiPutMock.mockReset()
    toastMock.configSaveFailed.mockClear()
    apiPutMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useUpdateConfig(), { wrapper: createWrapper() })

    result.current.mutate({ category: "AR", key: "credit_days", value: "30" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toastMock.configSaveFailed).toHaveBeenCalled()
  })

  it("resolves correctly when two different rows save in the same tick — each row's own save is independent, neither is lost (race condition)", async () => {
    apiPutMock.mockReset()
    let resolveFirst!: (value: unknown) => void
    const firstCall = new Promise((resolve) => {
      resolveFirst = resolve
    })
    apiPutMock.mockImplementationOnce(() => firstCall)
    apiPutMock.mockImplementationOnce(() => Promise.resolve(undefined))

    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const rowA = renderHook(() => useUpdateConfig(), { wrapper: Wrapper })
    const rowB = renderHook(() => useUpdateConfig(), { wrapper: Wrapper })

    rowA.result.current.mutate({ category: "AR", key: "credit_days", value: "30" })
    rowB.result.current.mutate({ category: "MM", key: "reorder_point", value: "50" })

    await waitFor(() => expect(rowB.result.current.isSuccess).toBe(true))
    expect(toastMock.configSaved).toHaveBeenCalledWith("reorder_point")

    resolveFirst(undefined)
    await waitFor(() => expect(rowA.result.current.isSuccess).toBe(true))
    expect(toastMock.configSaved).toHaveBeenCalledWith("credit_days")
    expect(invalidateSpy).toHaveBeenCalledTimes(2)
  })
})

describe("useResolveReview", () => {
  it("posts admin_correct_answer, toasts, invalidates the review queue and metrics", async () => {
    apiPostMock.mockReset()
    apiPostMock.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useResolveReview(), { wrapper: Wrapper })

    result.current.mutate({ item_id: "rq1", admin_correct_answer: "The correct procedure is..." })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPostMock).toHaveBeenCalledWith("admin/review-queue/rq1/resolve", {
      admin_correct_answer: "The correct procedure is...",
    })
    expect(toastMock.correctionSubmitted).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "review", "pending"] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "metrics"] })
  })

  it("toasts an error on failure", async () => {
    apiPostMock.mockReset()
    toastErrorMock.mockClear()
    apiPostMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useResolveReview(), { wrapper: createWrapper() })

    result.current.mutate({ item_id: "rq1", admin_correct_answer: "fix" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to submit review")
  })
})

describe("useUpdateTicketStatus", () => {
  it("optimistically updates the ticket in the cached {tickets: [...]} envelope before the request resolves", async () => {
    apiPatchMock.mockReset()
    const { Wrapper, queryClient } = createQueryWrapper()
    queryClient.setQueryData(["admin", "tickets", "all"], { tickets: [{ ticket_id: "t1", status: "open" }] })

    let resolvePatch!: (value: unknown) => void
    apiPatchMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolvePatch = resolve))
    )

    const { result } = renderHook(() => useUpdateTicketStatus(), { wrapper: Wrapper })
    result.current.mutate({ ticketId: "t1", status: "in_progress" })

    await waitFor(() =>
      expect(queryClient.getQueryData(["admin", "tickets", "all"])).toEqual({
        tickets: [{ ticket_id: "t1", status: "in_progress" }],
      })
    )

    resolvePatch(undefined)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it("reverts the optimistic update and toasts a network error on failure", async () => {
    apiPatchMock.mockReset()
    toastMock.networkError.mockClear()
    const { Wrapper, queryClient } = createQueryWrapper()
    queryClient.setQueryData(["admin", "tickets", "all"], { tickets: [{ ticket_id: "t1", status: "open" }] })
    apiPatchMock.mockRejectedValue(new Error("500"))

    const { result } = renderHook(() => useUpdateTicketStatus(), { wrapper: Wrapper })
    result.current.mutate({ ticketId: "t1", status: "in_progress" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryData(["admin", "tickets", "all"])).toEqual({ tickets: [{ ticket_id: "t1", status: "open" }] })
    expect(toastMock.networkError).toHaveBeenCalled()
  })

  it("resolves correctly when two tickets move in the same tick — both optimistic updates land, and the final onSettled refetch reconciles the list regardless of resolution order (race condition)", async () => {
    apiPatchMock.mockReset()
    const { Wrapper, queryClient } = createQueryWrapper()
    queryClient.setQueryData(
      ["admin", "tickets", "all"],
      {
        tickets: [
          { ticket_id: "t1", status: "open" },
          { ticket_id: "t2", status: "open" },
        ],
      }
    )

    let resolveSecond!: (value: unknown) => void
    apiPatchMock.mockImplementationOnce(() => Promise.resolve(undefined)) // t1
    apiPatchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve))) // t2

    const hookA = renderHook(() => useUpdateTicketStatus(), { wrapper: Wrapper })
    const hookB = renderHook(() => useUpdateTicketStatus(), { wrapper: Wrapper })

    hookA.result.current.mutate({ ticketId: "t1", status: "resolved" })
    hookB.result.current.mutate({ ticketId: "t2", status: "in_progress" })

    // Both optimistic updates apply immediately, independent of network timing.
    await waitFor(() =>
      expect(queryClient.getQueryData(["admin", "tickets", "all"])).toEqual({
        tickets: [
          { ticket_id: "t1", status: "resolved" },
          { ticket_id: "t2", status: "in_progress" },
        ],
      })
    )

    resolveSecond(undefined)
    await waitFor(() => expect(hookB.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(hookA.result.current.isSuccess).toBe(true))
  })
})

describe("useUploadDocument", () => {
  beforeEach(() => {
    useAdminStore.setState({ uploadProgress: {} })
  })

  it("uploads via api.upload('document', formData, {onProgress}) and invalidates documents on success", async () => {
    apiUploadMock.mockReset()
    apiUploadMock.mockResolvedValue({ status: "complete", document_id: "d1", chunk_count: 12, message: "ok" })
    const { Wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useUploadDocument(), { wrapper: Wrapper })

    const file = new File(["x"], "guide.pdf", { type: "application/pdf" })
    result.current.mutate({ file, metadata: { module: "SD", content_type: "error_guide" } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiUploadMock).toHaveBeenCalledWith("document", expect.any(FormData), { onProgress: expect.any(Function) })
    expect(toastMock.documentUploaded).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "documents", {}] })
  })

  it("reports real upload progress into adminStore.uploadProgress, and clears it once the request settles", async () => {
    apiUploadMock.mockReset()
    let resolveUpload!: (value: unknown) => void
    const uploadPromise = new Promise((resolve) => {
      resolveUpload = resolve
    })
    apiUploadMock.mockImplementation((_kind: string, _formData: FormData, options: { onProgress: (p: number) => void }) => {
      options.onProgress(42)
      return uploadPromise
    })
    const { result } = renderHook(() => useUploadDocument(), { wrapper: createWrapper() })

    const file = new File(["x"], "guide.pdf", { type: "application/pdf" })
    const mutatePromise = result.current.mutateAsync({ file, metadata: { module: "SD", content_type: "error_guide" } })

    await waitFor(() => expect(useAdminStore.getState().uploadProgress["guide.pdf"]).toBe(42))

    resolveUpload({ status: "complete", document_id: "d1", chunk_count: 12, message: "ok" })
    await mutatePromise
    expect(useAdminStore.getState().uploadProgress["guide.pdf"]).toBeUndefined()
  })

  it("clears upload progress even when the upload fails", async () => {
    apiUploadMock.mockReset()
    toastMock.documentsFailed.mockClear()
    apiUploadMock.mockImplementation(async (_kind: string, _formData: FormData, options: { onProgress: (p: number) => void }) => {
      options.onProgress(50)
      throw new Error("413")
    })
    const { result } = renderHook(() => useUploadDocument(), { wrapper: createWrapper() })

    const file = new File(["x"], "guide.pdf")
    result.current.mutate({ file, metadata: { module: "SD", content_type: "error_guide" } })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toastMock.documentsFailed).toHaveBeenCalled()
    expect(useAdminStore.getState().uploadProgress["guide.pdf"]).toBeUndefined()
  })
})

describe("useSubmitFeedback", () => {
  it("posts positive feedback and shows the positive toast", async () => {
    apiPostMock.mockReset()
    apiPostMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useSubmitFeedback(), { wrapper: createWrapper() })

    result.current.mutate({ sessionId: "s1", turnIndex: 0, signal: "positive" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiPostMock).toHaveBeenCalledWith("feedback", { session_id: "s1", turn_index: 0, signal: "positive" })
    expect(toastMock.feedbackPositive).toHaveBeenCalled()
  })

  it("fails silently (no error toast) on a rejected request", async () => {
    apiPostMock.mockReset()
    toastErrorMock.mockClear()
    apiPostMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useSubmitFeedback(), { wrapper: createWrapper() })

    result.current.mutate({ sessionId: "s1", turnIndex: 0, signal: "negative" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
