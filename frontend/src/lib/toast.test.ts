import { describe, it, expect, vi, afterEach } from "vitest"
import { toast } from "sonner"
import { toastSuccess, toastError, toastWarning, toastInfo, toastLoading, toastPromise, TOAST } from "./toast"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    promise: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

describe("toast helpers", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("toastSuccess passes a 4s duration", () => {
    toastSuccess("Saved", "All good")
    expect(toast.success).toHaveBeenCalledWith("Saved", { description: "All good", duration: 4000 })
  })

  it("toastError uses a longer 6s duration than success", () => {
    toastError("Failed")
    expect(toast.error).toHaveBeenCalledWith("Failed", { description: undefined, duration: 6000 })
  })

  it("toastWarning uses a 5s duration", () => {
    toastWarning("Careful")
    expect(toast.warning).toHaveBeenCalledWith("Careful", { description: undefined, duration: 5000 })
  })

  it("toastInfo uses a 4s duration", () => {
    toastInfo("FYI")
    expect(toast.info).toHaveBeenCalledWith("FYI", { description: undefined, duration: 4000 })
  })

  it("toastLoading never auto-dismisses (duration: Infinity) and returns the toast id", () => {
    const id = toastLoading("Uploading...")
    expect(toast.loading).toHaveBeenCalledWith("Uploading...", { duration: Infinity })
    expect(id).toBe("toast-id")
  })

  it("toastPromise resolves to the ORIGINAL promise's value — not sonner's non-Promise return", async () => {
    const promise = Promise.resolve("real result")
    const result = await toastPromise(promise, { loading: "...", success: "Done", error: "Failed" })
    expect(result).toBe("real result")
    expect(toast.promise).toHaveBeenCalledWith(promise, { loading: "...", success: "Done", error: "Failed" })
  })

  it("toastPromise still rejects correctly when the wrapped promise rejects", async () => {
    const promise = Promise.reject(new Error("boom"))
    await expect(toastPromise(promise, { loading: "...", success: "Done", error: "Failed" })).rejects.toThrow("boom")
  })

  it("TOAST.documentUploaded fires the expected success message", () => {
    TOAST.documentUploaded()
    expect(toast.success).toHaveBeenCalledWith("Document uploaded", {
      description: "Ingestion started in background",
      duration: 4000,
    })
  })

  it("TOAST.sessionExpired fires an error toast", () => {
    TOAST.sessionExpired()
    expect(toast.error).toHaveBeenCalledWith("Session expired", { description: "Redirecting to login...", duration: 6000 })
  })

  it("every remaining TOAST helper calls the correct underlying sonner function", () => {
    TOAST.documentDeprecated("SD-ERR-001")
    expect(toast.success).toHaveBeenCalledWith("SD-ERR-001 deprecated", { description: undefined, duration: 4000 })

    TOAST.documentsFailed()
    expect(toast.error).toHaveBeenCalledWith("Upload failed", { description: "Check file size (max 50MB) and format", duration: 6000 })

    TOAST.registryApproved()
    expect(toast.success).toHaveBeenCalledWith("Registry entry approved", { description: undefined, duration: 4000 })

    TOAST.registryRejected()
    expect(toast.success).toHaveBeenCalledWith("Registry entry rejected", { description: undefined, duration: 4000 })

    TOAST.configSaved("KEYCLOAK_CLIENT_ID")
    expect(toast.success).toHaveBeenCalledWith("KEYCLOAK_CLIENT_ID saved", { description: undefined, duration: 4000 })

    TOAST.configSaveFailed()
    expect(toast.error).toHaveBeenCalledWith("Save failed", { description: "Check your connection and retry", duration: 6000 })

    TOAST.correctionSubmitted()
    expect(toast.success).toHaveBeenCalledWith("Correction submitted to knowledge base", { description: undefined, duration: 4000 })

    TOAST.correctionSkipped()
    expect(toast.info).toHaveBeenCalledWith("Item skipped — moved to end of queue", { description: undefined, duration: 4000 })

    TOAST.ticketUpdated()
    expect(toast.success).toHaveBeenCalledWith("Ticket updated", { description: undefined, duration: 4000 })

    TOAST.ticketMoved("Resolved")
    expect(toast.success).toHaveBeenCalledWith("Ticket moved to Resolved", { description: undefined, duration: 4000 })

    TOAST.sessionPinned()
    expect(toast.success).toHaveBeenCalledWith("Session pinned", { description: undefined, duration: 4000 })

    TOAST.sessionUnpinned()
    expect(toast.info).toHaveBeenCalledWith("Session unpinned", { description: undefined, duration: 4000 })

    TOAST.sessionRenamed()
    expect(toast.success).toHaveBeenCalledWith("Session renamed", { description: undefined, duration: 4000 })

    TOAST.sessionDeleted()
    expect(toast.success).toHaveBeenCalledWith("Session deleted", { description: undefined, duration: 4000 })

    TOAST.sessionExported()
    expect(toast.success).toHaveBeenCalledWith("PDF downloaded", { description: undefined, duration: 4000 })

    TOAST.networkError()
    expect(toast.error).toHaveBeenCalledWith("Network error", { description: "Check your connection and try again", duration: 6000 })

    TOAST.feedbackPositive()
    expect(toast.success).toHaveBeenCalledWith("Thanks! Positive feedback recorded", { description: undefined, duration: 4000 })

    TOAST.feedbackNegative()
    expect(toast.info).toHaveBeenCalledWith("Feedback recorded — question flagged for review", { description: undefined, duration: 4000 })
  })
})
