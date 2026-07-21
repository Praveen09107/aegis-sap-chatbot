import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { TOAST, toastError, toastPromise } from "@/lib/toast"
import { useAdminStore } from "@/stores/adminStore"

// ── Document mutations ────────────────────────────────────────

/**
 * Deprecate a document (sets status to 'deprecated').
 * Always wrap in ConfirmDialog before calling.
 *
 * NOTE: confirmed (2026-07-21) the real backend has no soft-deprecate
 * mechanism at all — admin_handler.py only exposes a hard
 * `DELETE /admin/documents/{document_id}`, no PATCH/PUT on this path.
 * Built here exactly as FRONTEND_18 specifies anyway (matching the F11
 * dashboard precedent: real code, honest 404 via the api client's own
 * error toast, ready to work the moment a backend session adds this route)
 * rather than silently swapping in the destructive DELETE, which is a
 * materially different, irreversible action the spec never asked for.
 *
 * @example
 * const deprecate = useDeprecateDocument()
 * <ConfirmDialog onConfirm={() => deprecate.mutateAsync(docId)} ... />
 */
export function useDeprecateDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (documentId: string) => api.patch<void>(`admin/documents/${documentId}`, { status: "deprecated" }),
    onSuccess: (_data, documentId) => {
      TOAST.documentDeprecated(documentId)
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })
    },
    onError: () => toastError("Failed to deprecate document"),
  })
}

/**
 * Bulk deprecate multiple documents.
 * NOTE: confirmed (2026-07-21) no bulk document endpoint of any kind exists
 * on the real backend — same disclosed-gap precedent as useDeprecateDocument.
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
 * Approve a registry entry (draft → approved).
 * Confirmed (2026-07-21): the real route is PATCH, not POST.
 */
export function useApproveRegistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.patch(`admin/registry/${id}/approve`),
    onSuccess: () => {
      TOAST.registryApproved()
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.registry() })
    },
    onError: () => toastError("Failed to approve registry entry"),
  })
}

/**
 * Reject a registry entry.
 * NOTE: confirmed (2026-07-21) there is no reject endpoint, and no
 * 'rejected' state anywhere in the real backend's DB schema at all (the
 * enum is 'draft' | 'approved' | 'deprecated') — this isn't a missing
 * route on an otherwise-real concept, the concept itself doesn't exist yet.
 * Built here anyway per FRONTEND_19's spec (same disclosed-gap precedent as
 * the dashboard's /admin/metrics) — real admins clicking Reject today get
 * an honest error toast from the api client's own 404 handling, not a fake
 * success.
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
 * NOTE: confirmed (2026-07-21) the real PUT body key is `config_value`, not
 * `value` — the backend reads `body["config_value"]` directly (no
 * `.get()`), so the wrong key would raise a real 500 on every save.
 * `updated_by` is derived server-side from the auth token, not the body —
 * no reason/verified_by field is needed or read.
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
      api.put<void>(`admin/config-snapshot/${category}/${key}`, { config_value: value }),
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
  admin_correct_answer: string
}

/**
 * Resolve a review queue item.
 * Called from the review split-pane with keyboard shortcuts (A=approve).
 *
 * NOTE: confirmed (2026-07-22) against the real POST
 * /admin/review-queue/{item_id}/resolve (admin_handler.py:205-218): the
 * body only accepts `admin_correct_answer` (required, non-empty — the
 * handler 400s otherwise) and always sets status='resolved' server-side.
 * There is no action/skip/reject field or write path at all — FRONTEND_21's
 * "Skip" is therefore handled entirely client-side (see review-queue's
 * page.tsx), never through this mutation.
 */
export function useResolveReview() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: ReviewResolutionPayload) =>
      api.post(`admin/review-queue/${payload.item_id}/resolve`, { admin_correct_answer: payload.admin_correct_answer }),
    onSuccess: () => {
      TOAST.correctionSubmitted()
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reviewQueue("pending") })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.metrics() })
    },
    onError: () => toastError("Failed to submit review"),
  })
}

// ── Ticket mutations ──────────────────────────────────────────

interface TicketLike {
  ticket_id: string
  status: "open" | "in_progress" | "resolved"
  [key: string]: unknown
}

/**
 * Update ticket status — used by the kanban drag-and-drop.
 * Optimistic update: kanban card moves immediately, reverts on error.
 *
 * NOTE: fixed (2026-07-22) — useAdminTickets caches the RAW
 * {tickets: [...]} envelope (TanStack Query's `select` runs at read time,
 * not on the cached data), and the real ticket key is `ticket_id`, not
 * `id`. The original version here assumed a bare array with an `id` field,
 * so `Array.isArray(old)` was always false and the optimistic update
 * silently did nothing.
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

      queryClient.setQueriesData({ queryKey: queryKeys.admin.tickets() }, (old: unknown) => {
        if (old === null || typeof old !== "object" || !Array.isArray((old as { tickets?: unknown }).tickets)) return old
        const envelope = old as { tickets: TicketLike[] }
        return { ...envelope, tickets: envelope.tickets.map((t) => (t.ticket_id === ticketId ? { ...t, status } : t)) }
      })

      return { previousTickets }
    },

    onSuccess: (_data, { status }) => {
      TOAST.ticketMoved(status)
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

interface UploadDocumentResult {
  status: "complete" | "failed"
  document_id?: string
  chunk_count?: number
  stage?: string
  message: string
}

/**
 * Upload a document for ingestion.
 * Reports real HTTP upload progress via adminStore.setUploadProgress
 * (XHR-based — see api.ts's uploadWithProgress; fetch has no upload-progress
 * API at all).
 *
 * NOTE: confirmed (2026-07-21) against the real ingestion_pipeline —
 * upload is fully synchronous: the single POST response only arrives after
 * the entire 11-stage pipeline (chunking, embedding, indexing) has already
 * run server-side and completed or failed — there is no queued
 * task_id/"processing" polling phase for documents (unlike screenshots,
 * which do queue). Once this mutation resolves, the document's final
 * status (active/failed) is already set — the "processing" phase
 * IngestionProgressRow shows is really just this request's own in-flight
 * wait after the upload's bytes have all been sent (progress reaches 100%
 * well before the response arrives), not a second, separately-polled phase.
 *
 * Also confirmed: the real handler only reads the `file` field — `module`/
 * `content_type` are parsed from the document's own content/filename
 * inside the pipeline, not from these form fields. They're still sent
 * here (matching FRONTEND_18/DocumentMetadataModal's spec'd UI exactly)
 * but the backend currently ignores them; harmless, and ready to become
 * real overrides if the pipeline is ever changed to accept them.
 *
 * Use with <UploadDropZone /> in FRONTEND_18.
 */
export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, metadata }: { file: File; metadata: { module: string; content_type: string } }) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("module", metadata.module)
      formData.append("content_type", metadata.content_type)

      const { setUploadProgress } = useAdminStore.getState()
      try {
        // api.upload's `kind` selects the route (/api/upload/<kind>), not a
        // literal path — "document" here, not "api/upload/document".
        return await api.upload<UploadDocumentResult>("document", formData, {
          onProgress: (percent) => setUploadProgress(file.name, percent),
        })
      } finally {
        useAdminStore.getState().removeUploadProgress(file.name)
      }
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
