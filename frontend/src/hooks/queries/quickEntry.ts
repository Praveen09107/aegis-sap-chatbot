import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import type {
  QuickEntryListResponse,
  QuickEntryFull,
  QuickEntryVersion,
  DuplicateMatch,
} from "@/types"

// Confirmed directly (2026-07-23, F19) against the real backend
// (knowledge_entries_handler.py) — endpoint paths, response shapes, and the
// expected_updated_at requirement below all match the live implementation,
// not FRONTEND_36/37's assumed contract.

// ── List ──

export interface QuickEntryListParams {
  search?: string
  module?: string
  content_type?: string
  status?: string
  include_archived?: boolean
  page?: number
  page_size?: number
}

export function useQuickEntryList(params: QuickEntryListParams) {
  return useQuery({
    queryKey: queryKeys.quickEntry.list(params),
    queryFn: () => {
      const q = new URLSearchParams()
      if (params.search) q.set("search", params.search)
      if (params.module) q.set("module", params.module)
      if (params.content_type) q.set("content_type", params.content_type)
      if (params.status) q.set("status", params.status)
      if (params.include_archived) q.set("include_archived", String(params.include_archived))
      q.set("page", String(params.page ?? 1))
      q.set("page_size", String(params.page_size ?? 20))
      return api.get<QuickEntryListResponse>(`api/admin/knowledge-entries?${q.toString()}`)
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

// ── Single entry ──

/**
 * Fetches a single entry. `enabled` intentionally does NOT gate on a
 * create-vs-edit "mode" the way FRONTEND_37's own pseudocode did — a
 * brand-new entry (created via the "new" page) only gets an id after its
 * first auto-save, and this query must start fetching from that moment
 * onward regardless of which page mounted the form, since its `updated_at`
 * is required for every later draft save's optimistic-lock check (see
 * useUpdateQuickEntry below).
 */
export function useQuickEntry(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.quickEntry.detail(id),
    queryFn: () => api.get<QuickEntryFull>(`api/admin/knowledge-entries/${id}`),
    enabled: (options?.enabled ?? true) && Boolean(id),
    staleTime: 10_000,
  })
}

/** Polls a processing entry until it reaches a terminal status. */
export function useQuickEntryPoll(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.quickEntry.detail(id),
    queryFn: () => api.get<QuickEntryFull>(`api/admin/knowledge-entries/${id}`),
    enabled: enabled && Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      const terminal = ["active", "archived", "low_quality", "failed", "partial_index", "review_required"]
      if (!status || terminal.includes(status)) return false
      return 3_000
    },
    refetchIntervalInBackground: true,
  })
}

// ── Coverage search (pre-creation duplicate check) ──

const ALL_CONTENT_TYPES = ["error_guide", "procedure", "config"] as const

/**
 * The real /check-duplicate endpoint requires content_type (422s without
 * one — it searches exactly one Qdrant collection per call) but the
 * top-level "Check coverage first" search bar runs BEFORE an admin has
 * chosen an entry type at all. Fans out one call per content type in
 * parallel and merges the results, so this one search bar still covers
 * "all Quick Entries and documents" as intended, without a content-type
 * filter the spec's own UI never shows at this stage.
 */
export function useCoverageSearch(params: { query: string; module?: string }, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.quickEntry.coverage(params.query, params.module ?? ""),
    queryFn: async () => {
      const responses = await Promise.all(
        ALL_CONTENT_TYPES.map((content_type) =>
          api.post<{ has_similar: boolean; matches: DuplicateMatch[] }>("api/admin/knowledge-entries/check-duplicate", {
            module: params.module || undefined,
            content_type,
            summary_text: params.query,
          })
        )
      )
      // The real endpoint has no "total searched" figure to report (its
      // response is just {has_similar, matches}) — not fabricating one.
      const results = responses.flatMap((r) => r.matches).sort((a, b) => b.similarity_score - a.similarity_score)
      return { results }
    },
    enabled: (options?.enabled ?? true) && params.query.length >= 3,
    staleTime: 60_000,
  })
}

/**
 * Single-content-type duplicate check, used inside the form's own submit
 * flow (FRONTEND_37) — unlike the coverage search bar above, by this point
 * the admin has already chosen a content_type, so a single real call
 * suffices (no fan-out needed).
 */
export async function checkDuplicate(
  module: string,
  contentType: string,
  summaryText: string
): Promise<{ has_similar: boolean; matches: DuplicateMatch[] }> {
  return api.post("api/admin/knowledge-entries/check-duplicate", {
    module,
    content_type: contentType,
    summary_text: summaryText,
  })
}

// ── Version history ──

export function useQuickEntryVersions(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.quickEntry.versions(id),
    queryFn: () => api.get<{ entry_id: string; versions: QuickEntryVersion[]; current_version: number }>(`api/admin/knowledge-entries/${id}/versions`),
    enabled: enabled && Boolean(id),
  })
}

export function useRestoreQuickEntryVersion(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (version: number) =>
      api.post<{ entry_id: string; restored_from_version: number; new_version: number; status: string; message: string }>(
        `api/admin/knowledge-entries/${id}/restore/${version}`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.versions(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.lists() })
    },
  })
}

// ── Feedback summary ──

export function useQuickEntryFeedback(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.quickEntry.feedback(id),
    queryFn: () =>
      api.get<{ positive: number; negative: number; net: number; period_days: number; last_negative_at: string | null }>(
        `api/admin/knowledge-entries/${id}/feedback-summary`
      ),
    enabled: enabled && Boolean(id),
  })
}

// ── Mutations ──

export interface QuickEntrySubmitPayload {
  document_id: string
  content_type: string
  module: string
  transactions: string[]
  verified_by_name: string
  verified_date: string
  review_frequency: string | null
  form_data: object
  gap_id: string | null
  publish: boolean
  change_summary?: string | null
  current_version: number
  /**
   * Required by the real backend for every non-publish (draft) save —
   * drafts never increment `version`, so the version check alone can't
   * detect a concurrent draft edit; the backend uses this timestamp as an
   * atomic compare-and-swap instead. Not required (and not read) when
   * publish is true.
   */
  expected_updated_at?: string
}

export function useCreateQuickEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: QuickEntrySubmitPayload) =>
      api.post<{ id: string; document_id: string; status: string; version: number; message: string }>(
        "api/admin/knowledge-entries",
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.lists() })
    },
  })
}

export function useUpdateQuickEntry(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: QuickEntrySubmitPayload) =>
      api.put<{ id: string; document_id: string; version: number; status: string; message: string }>(
        `api/admin/knowledge-entries/${id}`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.lists() })
    },
  })
}

export function useArchiveQuickEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, confirmedDocumentId }: { id: string; confirmedDocumentId: string }) =>
      api.delete(`api/admin/knowledge-entries/${id}`, { body: { confirmed_document_id: confirmedDocumentId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.lists() })
    },
  })
}

// ── Screenshot mutations (ScreenshotUploadZone) ──
// Screenshots live inside the parent entry's own GET response (there's no
// separate screenshots query) — both mutations invalidate that entry's
// detail query so the next render picks up the change, rather than trying
// to hand-maintain a duplicate local screenshots array.

export function useDeleteScreenshot(entryId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (screenshotId: string) => api.delete(`api/admin/knowledge-screenshots/${screenshotId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.detail(entryId) })
    },
  })
}

export function useRetryScreenshotVision(entryId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (screenshotId: string) =>
      api.post<{ screenshot_id: string; vision_status: string; message: string }>(`api/admin/knowledge-screenshots/${screenshotId}/retry-vision`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.detail(entryId) })
    },
  })
}

export function useConfirmCurrent(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ verified_date: string; next_review_date: string | null; status: string; message: string }>(
        `api/admin/knowledge-entries/${id}/confirm-current`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.lists() })
    },
  })
}

// ── Suggest document ID ──

export async function suggestDocumentId(module: string, contentType: string): Promise<string> {
  const q = new URLSearchParams({ module, content_type: contentType })
  const result = await api.get<{ suggested_id: string }>(`api/admin/knowledge-entries/suggest-doc-id?${q.toString()}`)
  return result.suggested_id
}

// ── Cross-reference validation ──

export async function validateReference(docId: string): Promise<{ exists: boolean; title: string | null; source_type: "form_entry" | "document" | null }> {
  const q = new URLSearchParams({ doc_id: docId })
  return api.get(`api/admin/knowledge-entries/validate-reference?${q.toString()}`)
}
