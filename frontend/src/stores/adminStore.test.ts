import { describe, it, expect, beforeEach } from "vitest"
import { useAdminStore } from "./adminStore"

describe("adminStore", () => {
  beforeEach(() => {
    useAdminStore.setState({
      selectedDocumentIds: new Set(),
      selectedRegistryIds: new Set(),
      selectedAuditIds: new Set(),
      selectedTicketIds: new Set(),
      activeDocumentId: null,
      activeTicketId: null,
      activeAuditId: null,
      reviewQueueIndex: 0,
      uploadProgress: {},
      documentFilters: {},
      auditFilters: {},
      analyticsRange: "30d",
      gapsRangeDays: 30,
      documentSearch: "",
      registrySearch: "",
      gapsSearch: "",
    })
  })

  describe("table selection", () => {
    it("setSelectedDocumentIds() / clearDocumentSelection()", () => {
      useAdminStore.getState().setSelectedDocumentIds(new Set(["d1", "d2"]))
      expect(useAdminStore.getState().selectedDocumentIds.size).toBe(2)

      useAdminStore.getState().clearDocumentSelection()
      expect(useAdminStore.getState().selectedDocumentIds.size).toBe(0)
    })

    it("registry, audit, and ticket selections are independent of each other", () => {
      useAdminStore.getState().setSelectedRegistryIds(new Set(["r1"]))
      useAdminStore.getState().setSelectedAuditIds(new Set(["a1"]))
      useAdminStore.getState().setSelectedTicketIds(new Set(["t1"]))

      const state = useAdminStore.getState()
      expect(state.selectedRegistryIds).toEqual(new Set(["r1"]))
      expect(state.selectedAuditIds).toEqual(new Set(["a1"]))
      expect(state.selectedTicketIds).toEqual(new Set(["t1"]))

      useAdminStore.getState().clearRegistrySelection()
      expect(useAdminStore.getState().selectedRegistryIds.size).toBe(0)
      expect(useAdminStore.getState().selectedAuditIds.size).toBe(1)
    })
  })

  describe("active detail drawer", () => {
    it("setActiveDocumentId/TicketId/AuditId() set and clear independently", () => {
      useAdminStore.getState().setActiveDocumentId("d1")
      useAdminStore.getState().setActiveTicketId("t1")
      useAdminStore.getState().setActiveAuditId("a1")

      const state = useAdminStore.getState()
      expect(state.activeDocumentId).toBe("d1")
      expect(state.activeTicketId).toBe("t1")
      expect(state.activeAuditId).toBe("a1")

      useAdminStore.getState().setActiveDocumentId(null)
      expect(useAdminStore.getState().activeDocumentId).toBeNull()
      expect(useAdminStore.getState().activeTicketId).toBe("t1")
    })
  })

  describe("review queue", () => {
    it("setReviewQueueIndex() sets an explicit index", () => {
      useAdminStore.getState().setReviewQueueIndex(3)
      expect(useAdminStore.getState().reviewQueueIndex).toBe(3)
    })

    it("advanceReviewQueue() increments from the current index", () => {
      useAdminStore.getState().setReviewQueueIndex(2)
      useAdminStore.getState().advanceReviewQueue()
      expect(useAdminStore.getState().reviewQueueIndex).toBe(3)
    })

    it("resolves correctly when two advanceReviewQueue() calls fire in the same tick (no lost update)", () => {
      const { advanceReviewQueue } = useAdminStore.getState()
      advanceReviewQueue()
      advanceReviewQueue()
      expect(useAdminStore.getState().reviewQueueIndex).toBe(2)
    })
  })

  describe("upload progress", () => {
    it("setUploadProgress() tracks per-filename progress without clobbering other files", () => {
      useAdminStore.getState().setUploadProgress("a.pdf", 40)
      useAdminStore.getState().setUploadProgress("b.pdf", 70)

      expect(useAdminStore.getState().uploadProgress).toEqual({ "a.pdf": 40, "b.pdf": 70 })
    })

    it("removeUploadProgress() removes only the given filename", () => {
      useAdminStore.getState().setUploadProgress("a.pdf", 100)
      useAdminStore.getState().setUploadProgress("b.pdf", 50)

      useAdminStore.getState().removeUploadProgress("a.pdf")

      expect(useAdminStore.getState().uploadProgress).toEqual({ "b.pdf": 50 })
    })

    it("removeUploadProgress() for a filename that was never tracked is a no-op error case, not a crash", () => {
      expect(() => useAdminStore.getState().removeUploadProgress("never-uploaded.pdf")).not.toThrow()
      expect(useAdminStore.getState().uploadProgress).toEqual({})
    })
  })

  describe("filters", () => {
    it("setDocumentFilters() merges into existing filters rather than replacing them", () => {
      useAdminStore.getState().setDocumentFilters({ module: "SD" })
      useAdminStore.getState().setDocumentFilters({ status: "active" })

      expect(useAdminStore.getState().documentFilters).toEqual({ module: "SD", status: "active" })
    })

    it("resetDocumentFilters() clears back to empty", () => {
      useAdminStore.getState().setDocumentFilters({ module: "SD" })
      useAdminStore.getState().resetDocumentFilters()
      expect(useAdminStore.getState().documentFilters).toEqual({})
    })

    it("setAuditFilters() merges, resetAuditFilters() clears", () => {
      useAdminStore.getState().setAuditFilters({ module: "MM" })
      useAdminStore.getState().setAuditFilters({ request_type: "vision" })
      expect(useAdminStore.getState().auditFilters).toEqual({ module: "MM", request_type: "vision" })

      useAdminStore.getState().resetAuditFilters()
      expect(useAdminStore.getState().auditFilters).toEqual({})
    })
  })

  describe("date ranges and search", () => {
    it("setAnalyticsRange() and setGapsRangeDays() set explicit values", () => {
      useAdminStore.getState().setAnalyticsRange("90d")
      useAdminStore.getState().setGapsRangeDays(7)

      expect(useAdminStore.getState().analyticsRange).toBe("90d")
      expect(useAdminStore.getState().gapsRangeDays).toBe(7)
    })

    it("setDocumentSearch/setRegistrySearch/setGapsSearch() are independent", () => {
      useAdminStore.getState().setDocumentSearch("VL150")
      useAdminStore.getState().setRegistrySearch("MM02")
      useAdminStore.getState().setGapsSearch("unknown module")

      const state = useAdminStore.getState()
      expect(state.documentSearch).toBe("VL150")
      expect(state.registrySearch).toBe("MM02")
      expect(state.gapsSearch).toBe("unknown module")
    })
  })

  it("resolves correctly when selection and clear fire in the same tick for different tables (no cross-table interference)", () => {
    // Race-style check: bulk-selecting documents while clearing an unrelated
    // registry selection must not affect each other — each is stored under
    // its own key, but this is worth pinning explicitly since a shared
    // "selectedIds" implementation would have been an easy, wrong shortcut.
    useAdminStore.getState().setSelectedDocumentIds(new Set(["d1", "d2"]))
    useAdminStore.getState().clearRegistrySelection()

    expect(useAdminStore.getState().selectedDocumentIds).toEqual(new Set(["d1", "d2"]))
    expect(useAdminStore.getState().selectedRegistryIds.size).toBe(0)
  })
})
