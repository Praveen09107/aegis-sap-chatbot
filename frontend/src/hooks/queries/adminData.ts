import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import type { DocumentRecord, DocFilters, AuditFilters } from "@/types"

// ── Documents ─────────────────────────────────────────────────

interface DocumentsResponse {
  documents: DocumentRecord[]
  total: number
}

/**
 * Confirmed (2026-07-21) against the real GET /admin/registry response:
 * - Wrapped in {entries: [...]}, not a bare array (fixed in useAdminRegistry
 *   below via `select`).
 * - Real field is `pattern_string`, not `pattern_text`.
 * - Real status enum is 'draft' | 'approved' | 'deprecated' (the DB's own
 *   CHECK constraint on known_patterns_registry.status) — 'pending'/'active'
 *   were this type's original, incorrect guesses for 'draft'/'approved'.
 *   'rejected' is NOT a real value today (no reject endpoint or DB state
 *   exists at all) — kept here as the disclosed, spec'd target value for
 *   the Reject action built ahead of real backend support (see
 *   useRejectRegistry in mutations.ts).
 */
export interface RegistryEntry {
  id: string
  pattern_string: string
  linked_document_id: string
  status: "draft" | "approved" | "deprecated" | "rejected"
  created_at: string
  approved_by?: string
}

/**
 * Confirmed (2026-07-21) against the real GET /admin/config-snapshot
 * response: wrapped in {entries: [...]}, not a bare array (fixed in
 * useConfigSnapshot below via `select`), and every field renamed to match
 * the real backend names — this type originally guessed a shape that
 * shared no field names with the live endpoint at all.
 */
export interface ConfigEntry {
  config_category: string
  config_key: string
  config_value: string
  last_updated_at: string
  updated_by: string
  /** Server-computed staleness level — authoritative; prefer this over
   * client-side threshold recomputation to avoid drift from CONFIDENCE's
   * own FRESHNESS_*_DAYS thresholds (see StalenessIndicator's `staleness` prop). */
  staleness: "fresh" | "warning" | "critical"
  age_days: number
}

/**
 * Confirmed (2026-07-22) against the real GET /admin/knowledge-gaps
 * response (admin_handler.py:116-171): wrapped in {clusters: [...]}, and
 * clustered by `gap_description` (potentially many individual gap_events
 * per row) rather than one row per event. FRONTEND_20's spec assumed a
 * flat per-event shape (id, query_text, frequency, last_seen_at,
 * module_tags, sample_queries, priority_score) — none of those fields
 * exist. The real query only produces count_7d/count_30d as frequency
 * signals; there is no last-seen timestamp, no module tag, and no computed
 * priority/severity score anywhere — GapCard derives severity from
 * count_7d directly instead. addressed_by_entry_id/addressed_at/
 * addressed_entry_title are real (IMPL_29's IT-admin Quick Entry join) and
 * drive the "Create Quick Entry" / "Addressed by" UI in GapCard.tsx.
 */
export interface GapEntry {
  gap_id: string
  gap_description: string
  count_7d: number
  count_30d: number
  example_queries: string[]
  addressed_by_entry_id: string | null
  addressed_at: string | null
  addressed_entry_title: string | null
}

/**
 * Confirmed (2026-07-22) against the real GET /admin/audit-trail response
 * (admin_handler.py:174-190) and the audit_log table
 * (database/migrations/001_operational_schema.sql:89-103). FRONTEND_20's
 * spec assumed query_text/response_summary/primary_document_id/sap_module
 * fields — audit_log has no query/response text or document/module columns
 * at all (that data lives on a separate feedback_events table this
 * endpoint never joins). Real, exhaustive field list is exactly the 8
 * below (plus `total` in the list envelope).
 */
export interface AuditEntry {
  id: string
  occurred_at: string
  user_id_hash: string
  session_id: string
  request_type: "chat" | "upload" | "admin"
  confidence_badge: "green" | "amber" | "none" | null
  validation_score: number | null
  model_tier: 1 | 2 | 3 | null
  feedback_signal: "positive" | "negative" | "none"
}

/**
 * Confirmed (2026-07-22) against the real GET /admin/review-queue (returns
 * {items: [...]}) and POST /admin/review-queue/{id}/resolve
 * (admin_handler.py:193-218) against the human_review_queue table
 * (database/migrations/001_operational_schema.sql:156-168). FRONTEND_21
 * assumed suggested_correction/document_reference fields and an
 * action-based resolve body (approve_correction/skip + correction_text) —
 * neither exists. The table has no suggested-correction or
 * document-reference columns, and resolve always sets status='resolved',
 * requiring a non-empty admin_correct_answer — there is no skip/reject
 * write path at all (real status enum: pending/in_review/resolved, no
 * 'skipped' value). `unsupported_claims` is a real TEXT[] column (possibly
 * multiple flagged claims, not one) — ClaimHighlighter highlights all of
 * them, not just a single substring.
 */
export interface ReviewItem {
  id: string
  query_text: string
  answer_text: string
  unsupported_claims: string[]
  status: "pending" | "in_review" | "resolved"
  created_at: string
}

/**
 * Confirmed (2026-07-22) against the real GET /admin/tickets (returns
 * {tickets: [...]}) and PATCH /admin/tickets/{id} (admin_handler.py:221-247)
 * against the mock_tickets table
 * (database/migrations/001_operational_schema.sql:114-125). FRONTEND_21
 * assumed reference_number/title/description/priority fields — none of
 * those exist on mock_tickets at all, not even as unused-but-real columns.
 * The status enum (open/in_progress/resolved) matches the spec exactly, so
 * the kanban drag-and-drop works unmodified; there is no priority to badge
 * or filter by. `session_id` exists on the table but the current handler's
 * SELECT doesn't return it, so it's omitted here too.
 */
export interface TicketEntry {
  ticket_id: string
  created_at: string
  user_id_hash: string
  query_text: string
  reason: string
  status: "open" | "in_progress" | "resolved"
  resolution_notes: string | null
}

/**
 * Documents management list.
 * Used by: Admin Documents page (FRONTEND_18).
 */
export function useAdminDocuments(filters?: DocFilters) {
  return useQuery({
    queryKey: queryKeys.admin.documents(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.content_type) params.set("content_type", filters.content_type)
      if (filters?.module) params.set("module", filters.module)
      if (filters?.status) params.set("status", filters.status)
      const q = params.toString()
      return api.get<DocumentsResponse>(`admin/documents${q ? `?${q}` : ""}`)
    },
    staleTime: 30_000,
    select: (data) => data.documents,
  })
}

/**
 * Registry entries list.
 * Used by: Admin Registry page (FRONTEND_19).
 */
export function useAdminRegistry(status?: string) {
  return useQuery({
    queryKey: queryKeys.admin.registry(status),
    queryFn: () => api.get<{ entries: RegistryEntry[] }>(`admin/registry${status ? `?status=${status}` : ""}`),
    staleTime: 30_000,
    // Real response is {entries: [...]}, not a bare array — confirmed 2026-07-21.
    select: (data) => data.entries,
  })
}

/**
 * Configuration snapshot.
 * Used by: Admin Config Snapshot page (FRONTEND_19).
 */
export function useConfigSnapshot() {
  return useQuery({
    queryKey: queryKeys.admin.config(),
    queryFn: () => api.get<{ entries: ConfigEntry[] }>("admin/config-snapshot"),
    staleTime: 60_000,
    // Real response is {entries: [...]}, not a bare array — confirmed 2026-07-21.
    select: (data) => data.entries,
  })
}

/**
 * Knowledge gap analysis.
 * Used by: Admin Knowledge Gaps page (FRONTEND_20).
 *
 * @param days - Time range in days (7, 30, or 90)
 */
export function useAdminGaps(days: number) {
  return useQuery({
    queryKey: queryKeys.admin.gaps(days),
    // `days` is accepted by the real endpoint's signature but not actually
    // used in its SQL today (cutoffs are hardcoded to 7/30) — sent anyway,
    // harmless, and ready to filter for real if that's ever wired up.
    queryFn: () => api.get<{ clusters: GapEntry[] }>(`admin/knowledge-gaps?days=${days}`),
    staleTime: 5 * 60_000, // Gaps analysis is expensive — cache for 5 min
    select: (data) => data.clusters,
  })
}

/**
 * Audit trail log.
 * Used by: Admin Audit Trail page (FRONTEND_20).
 * Real response is {entries: [...], total: <count>} — total is needed for
 * real pagination, so this hook does NOT unwrap to a bare array like the
 * other admin list hooks; callers destructure both fields.
 */
export function useAdminAuditTrail(filters?: AuditFilters) {
  return useQuery({
    queryKey: queryKeys.admin.auditTrail(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.days) params.set("days", String(filters.days))
      if (filters?.confidence_badge) params.set("confidence_badge", filters.confidence_badge)
      if (filters?.page) params.set("page", String(filters.page))
      if (filters?.page_size) params.set("page_size", String(filters.page_size))
      const q = params.toString()
      return api.get<{ entries: AuditEntry[]; total: number }>(`admin/audit-trail${q ? `?${q}` : ""}`)
    },
    staleTime: 60_000,
  })
}

/**
 * Review queue items.
 * Used by: Admin Review Queue page (FRONTEND_21).
 */
export function useAdminReviewQueue(status: string = "pending") {
  return useQuery({
    queryKey: queryKeys.admin.reviewQueue(status),
    queryFn: () => api.get<{ items: ReviewItem[] }>(`admin/review-queue?status=${status}`),
    staleTime: 30_000,
    refetchInterval: 30_000, // Live queue — check frequently
    select: (data) => data.items,
  })
}

/**
 * Ticket list.
 * Used by: Admin Tickets page (FRONTEND_21).
 */
export function useAdminTickets(status?: string) {
  return useQuery({
    queryKey: queryKeys.admin.tickets(status),
    queryFn: () => api.get<{ tickets: TicketEntry[] }>(`admin/tickets${status ? `?status=${status}` : ""}`),
    staleTime: 30_000,
    select: (data) => data.tickets,
  })
}
