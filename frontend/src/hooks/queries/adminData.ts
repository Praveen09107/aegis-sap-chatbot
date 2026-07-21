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

interface GapEntry {
  id: string
  query_text: string
  frequency: number
  last_seen_at: string
  module_tags: string[]
  sample_queries: string[]
  priority_score: number // frequency * recency weight
}

interface AuditEntry {
  id: string
  session_id: string
  query_text: string
  response_summary: string
  confidence_badge: string | null
  validation_score: number | null
  primary_document_id: string | null
  sap_module: string | null
  request_type: "standard" | "vision" | "cached"
  created_at: string
}

interface ReviewItem {
  id: string
  session_id: string
  query_text: string
  original_answer: string
  problematic_claim: string
  suggested_correction: string | null
  document_reference: string | null
  created_at: string
  status: "pending" | "resolved" | "skipped"
}

interface TicketEntry {
  id: string
  reference_number: string
  title: string
  description: string
  status: "open" | "in_progress" | "resolved"
  priority: "low" | "medium" | "high"
  session_id: string | null
  created_at: string
  updated_at: string
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
    queryFn: () => api.get<GapEntry[]>(`admin/knowledge-gaps?days=${days}`),
    staleTime: 5 * 60_000, // Gaps analysis is expensive — cache for 5 min
  })
}

/**
 * Audit trail log.
 * Used by: Admin Audit Trail page (FRONTEND_20).
 */
export function useAdminAuditTrail(filters?: AuditFilters) {
  return useQuery({
    queryKey: queryKeys.admin.auditTrail(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.date_from) params.set("date_from", filters.date_from)
      if (filters?.date_to) params.set("date_to", filters.date_to)
      if (filters?.confidence_badge) params.set("confidence_badge", filters.confidence_badge)
      if (filters?.module) params.set("module", filters.module)
      if (filters?.request_type) params.set("request_type", filters.request_type)
      const q = params.toString()
      return api.get<AuditEntry[]>(`admin/audit-trail${q ? `?${q}` : ""}`)
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
    queryFn: () => api.get<ReviewItem[]>(`admin/review-queue?status=${status}`),
    staleTime: 30_000,
    refetchInterval: 30_000, // Live queue — check frequently
  })
}

/**
 * Ticket list.
 * Used by: Admin Tickets page (FRONTEND_21).
 */
export function useAdminTickets(status?: string) {
  return useQuery({
    queryKey: queryKeys.admin.tickets(status),
    queryFn: () => api.get<TicketEntry[]>(`admin/tickets${status ? `?status=${status}` : ""}`),
    staleTime: 30_000,
  })
}
