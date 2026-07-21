import { create } from "zustand"
import type { DocFilters, AuditFilters } from "@/types"

interface AdminState {
  // ── Table row selection (per-page) ────────────────────────
  selectedDocumentIds: Set<string>
  setSelectedDocumentIds: (ids: Set<string>) => void
  clearDocumentSelection: () => void

  selectedRegistryIds: Set<string>
  setSelectedRegistryIds: (ids: Set<string>) => void
  clearRegistrySelection: () => void

  selectedAuditIds: Set<string>
  setSelectedAuditIds: (ids: Set<string>) => void
  clearAuditSelection: () => void

  selectedTicketIds: Set<string>
  setSelectedTicketIds: (ids: Set<string>) => void
  clearTicketSelection: () => void

  // ── Active detail drawer ──────────────────────────────────
  activeDocumentId: string | null
  setActiveDocumentId: (id: string | null) => void

  activeTicketId: string | null
  setActiveTicketId: (id: string | null) => void

  activeAuditId: string | null
  setActiveAuditId: (id: string | null) => void

  // ── Review queue ─────────────────────────────────────────
  reviewQueueIndex: number
  setReviewQueueIndex: (index: number) => void
  advanceReviewQueue: () => void

  // ── File upload progress ─────────────────────────────────
  /** Map of filename → upload progress percentage (0–100) */
  uploadProgress: Record<string, number>
  setUploadProgress: (filename: string, progress: number) => void
  removeUploadProgress: (filename: string) => void

  // ── Page-level filters ────────────────────────────────────
  documentFilters: DocFilters
  setDocumentFilters: (filters: Partial<DocFilters>) => void
  resetDocumentFilters: () => void

  auditFilters: AuditFilters
  setAuditFilters: (filters: Partial<AuditFilters>) => void
  resetAuditFilters: () => void

  // ── Analytics date range ─────────────────────────────────
  analyticsRange: string
  setAnalyticsRange: (range: string) => void

  // ── Knowledge gaps date range ─────────────────────────────
  gapsRangeDays: number
  setGapsRangeDays: (days: number) => void

  // ── Admin page search queries ─────────────────────────────
  documentSearch: string
  setDocumentSearch: (q: string) => void

  registrySearch: string
  setRegistrySearch: (q: string) => void

  gapsSearch: string
  setGapsSearch: (q: string) => void
}

const INITIAL_DOCUMENT_FILTERS: DocFilters = {}
const INITIAL_AUDIT_FILTERS: AuditFilters = {}

export const useAdminStore = create<AdminState>()((set) => ({
  // ── Table selection ──────────────────────────────────────

  selectedDocumentIds: new Set(),
  setSelectedDocumentIds: (selectedDocumentIds) => set({ selectedDocumentIds }),
  clearDocumentSelection: () => set({ selectedDocumentIds: new Set() }),

  selectedRegistryIds: new Set(),
  setSelectedRegistryIds: (selectedRegistryIds) => set({ selectedRegistryIds }),
  clearRegistrySelection: () => set({ selectedRegistryIds: new Set() }),

  selectedAuditIds: new Set(),
  setSelectedAuditIds: (selectedAuditIds) => set({ selectedAuditIds }),
  clearAuditSelection: () => set({ selectedAuditIds: new Set() }),

  selectedTicketIds: new Set(),
  setSelectedTicketIds: (selectedTicketIds) => set({ selectedTicketIds }),
  clearTicketSelection: () => set({ selectedTicketIds: new Set() }),

  // ── Active detail ─────────────────────────────────────────

  activeDocumentId: null,
  setActiveDocumentId: (activeDocumentId) => set({ activeDocumentId }),

  activeTicketId: null,
  setActiveTicketId: (activeTicketId) => set({ activeTicketId }),

  activeAuditId: null,
  setActiveAuditId: (activeAuditId) => set({ activeAuditId }),

  // ── Review queue ──────────────────────────────────────────

  reviewQueueIndex: 0,
  setReviewQueueIndex: (reviewQueueIndex) => set({ reviewQueueIndex }),
  advanceReviewQueue: () => set((state) => ({ reviewQueueIndex: state.reviewQueueIndex + 1 })),

  // ── Upload progress ───────────────────────────────────────

  uploadProgress: {},
  setUploadProgress: (filename, progress) =>
    set((state) => ({
      uploadProgress: { ...state.uploadProgress, [filename]: progress },
    })),
  removeUploadProgress: (filename) =>
    set((state) => {
      const next = { ...state.uploadProgress }
      delete next[filename]
      return { uploadProgress: next }
    }),

  // ── Filters ───────────────────────────────────────────────

  documentFilters: INITIAL_DOCUMENT_FILTERS,
  setDocumentFilters: (filters) => set((state) => ({ documentFilters: { ...state.documentFilters, ...filters } })),
  resetDocumentFilters: () => set({ documentFilters: INITIAL_DOCUMENT_FILTERS }),

  auditFilters: INITIAL_AUDIT_FILTERS,
  setAuditFilters: (filters) => set((state) => ({ auditFilters: { ...state.auditFilters, ...filters } })),
  resetAuditFilters: () => set({ auditFilters: INITIAL_AUDIT_FILTERS }),

  // ── Date ranges ───────────────────────────────────────────

  analyticsRange: "30d",
  setAnalyticsRange: (analyticsRange) => set({ analyticsRange }),

  gapsRangeDays: 30,
  setGapsRangeDays: (gapsRangeDays) => set({ gapsRangeDays }),

  // ── Search ────────────────────────────────────────────────

  documentSearch: "",
  setDocumentSearch: (documentSearch) => set({ documentSearch }),

  registrySearch: "",
  setRegistrySearch: (registrySearch) => set({ registrySearch }),

  gapsSearch: "",
  setGapsSearch: (gapsSearch) => set({ gapsSearch }),
}))
