import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { TOAST, toastError, toastPromise } from "@/lib/toast"

// ── Document mutations ────────────────────────────────────────

/**
 * Deprecate a document (sets status to 'deprecated').
 * Always wrap in ConfirmDialog before calling.
 *
 * @example
 * const deprecate = useDeprecateDocument()
 * <ConfirmDialog onConfirm={() => deprecate.mutateAsync(docId)} ... />
 */
export function useDeprecateDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (documentId: string) => api.patch(`admin/documents/${documentId}`, { status: "deprecated" }),
    onSuccess: (_data, documentId) => {
      TOAST.documentDeprecated(documentId)
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })
    },
    onError: () => toastError("Failed to deprecate document"),
  })
}

/**
 * Bulk deprecate multiple documents.
 */
export function useBulkDeprecateDocuments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (documentIds: string[]) =>
      toastPromise(api.post("admin/documents/bulk-deprecate", { document_ids: documentIds }), {
        loading: `Deprecating ${documentIds.length} documents...`,
        success: `${documentIds.length} documents deprecated`,
        error: "Bulk deprecation failed",
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })
    },
  })
}

// ── Registry mutations ────────────────────────────────────────

/**
 * Approve a registry entry (pending → active).
 */
export function useApproveRegistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.post(`admin/registry/${id}/approve`),
    onSuccess: () => {
      TOAST.registryApproved()
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.registry() })
    },
    onError: () => toastError("Failed to approve registry entry"),
  })
}

/**
 * Reject a registry entry (pending → rejected).
 */
export function useRejectRegistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.post(`admin/registry/${id}/reject`),
    onSuccess: () => {
      TOAST.registryRejected()
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.registry() })
    },
  })
}

// ── Config mutations ──────────────────────────────────────────

/**
 * Update a single config snapshot value.
 * Per-row save pattern — each row has its own save button.
 *
 * @example
 * const update = useUpdateConfig()
 * <Button onClick={() => update.mutate({ category: 'AR', key: 'credit_days', value: '30' })}>
 *   Save
 * </Button>
 */
export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ category, key, value }: { category: string; key: string; value: string }) =>
      api.put(`admin/config-snapshot/${category}/${key}`, { value }),
    onSuccess: (_data, { key }) => {
      TOAST.configSaved(key)
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.config() })
    },
    onError: () => TOAST.configSaveFailed(),
  })
}

// ── Review queue mutations ────────────────────────────────────

interface ReviewResolutionPayload {
  item_id: string
  action: "approve_correction" | "reject_correction" | "skip"
  correction_text?: string
  reviewer_note?: string
}

/**
 * Resolve a review queue item.
 * Called from the review split-pane with keyboard shortcuts (A=approve, X=skip).
 */
export function useResolveReview() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: ReviewResolutionPayload) => api.post(`admin/review-queue/${payload.item_id}/resolve`, payload),
    onSuccess: (_data, { action }) => {
      if (action === "approve_correction") TOAST.correctionSubmitted()
      if (action === "skip") TOAST.correctionSkipped()
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reviewQueue("pending") })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.metrics() })
    },
    onError: () => toastError("Failed to submit review"),
  })
}

// ── Ticket mutations ──────────────────────────────────────────

interface TicketLike {
  id: string
  status: "open" | "in_progress" | "resolved"
  [key: string]: unknown
}

/**
 * Update ticket status — used by the kanban drag-and-drop.
 * Optimistic update: kanban card moves immediately, reverts on error.
 */
export function useUpdateTicketStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: "open" | "in_progress" | "resolved" }) =>
      api.patch(`admin/tickets/${ticketId}`, { status }),

    // Optimistic update: immediately update the cache
    onMutate: async ({ ticketId, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.admin.tickets() })
      const previousTickets = queryClient.getQueryData(queryKeys.admin.tickets())

      queryClient.setQueriesData({ queryKey: queryKeys.admin.tickets() }, (old: unknown) =>
        Array.isArray(old)
          ? (old as TicketLike[]).map((t) => (t.id === ticketId ? { ...t, status } : t))
          : old
      )

      return { previousTickets }
    },

    onError: (_err, _vars, context) => {
      // Revert optimistic update on error
      if (context?.previousTickets) {
        queryClient.setQueryData(queryKeys.admin.tickets(), context.previousTickets)
      }
      TOAST.networkError()
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tickets() })
    },
  })
}

// ── Document upload ───────────────────────────────────────────

/**
 * Upload a document for ingestion.
 * Reports progress via adminStore.setUploadProgress.
 * Use with <UploadDropZone /> in FRONTEND_18.
 */
export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      metadata,
    }: {
      file: File
      metadata: { module: string; content_type: string }
    }) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("module", metadata.module)
      formData.append("content_type", metadata.content_type)
      // api.upload's `kind` selects the route (/api/upload/<kind>), not a
      // literal path — "document" here, not "api/upload/document".
      return api.upload("document", formData)
    },
    onSuccess: () => {
      TOAST.documentUploaded()
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })
    },
    onError: () => TOAST.documentsFailed(),
  })
}

// ── Feedback mutation (employee chat) ─────────────────────────

/**
 * Submit thumbs feedback for an AI response.
 * Called from ResponseActions in the chat interface.
 */
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: ({
      sessionId,
      turnIndex,
      signal,
    }: {
      sessionId: string
      turnIndex: number
      signal: "positive" | "negative"
    }) => api.post("feedback", { session_id: sessionId, turn_index: turnIndex, signal }),
    onSuccess: (_data, { signal }) => {
      if (signal === "positive") TOAST.feedbackPositive()
      else TOAST.feedbackNegative()
    },
    // Silent failure — don't block UI on feedback errors
    onError: () => {},
  })
}
