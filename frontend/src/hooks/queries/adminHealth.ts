import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { TIMING } from "@/lib/constants"

// ── Quick Entry pipeline health ────────────────────────────────
//
// Confirmed (2026-07-22) against the real GET
// /api/admin/knowledge-entries/pipeline-health (knowledge_entries_handler.py,
// built in DEC-058/059). FRONTEND_22's own IMPL_29 addendum assumed a
// Quick-Entry-vs-Document quality COMPARISON and storage in MB — neither
// exists: there is no document-side score anywhere in this endpoint to
// compare against (only `quick_entry_avg_score`), and storage is raw bytes
// (`screenshot_storage_bytes`), converted to MB client-side for display.
// ARQ queue depths are themselves disclosed by the backend as a DB-derived
// proxy, not real Redis queue introspection (ARQ shares one Redis queue
// with no per-function depth) — surfaced via this same field names anyway.

export interface PipelineHealthData {
  badge: "red" | "amber" | "green"
  arq_queues: {
    form_entry_queue_pending: number
    screenshot_queue_pending: number
    avg_processing_seconds: number | null
  }
  entry_status: {
    active: number
    draft: number
    processing: number
    failed: number
    partial_index: number
    review_required: number
  }
  screenshot_status: {
    complete: number
    processing: number
    pending: number
    failed: number
    not_sap: number
  }
  knowledge_quality: {
    quick_entry_avg_score: number | null
  }
  feedback: {
    entries_with_net_negative_feedback_30d: number
  }
  storage: {
    screenshot_storage_bytes: number
    eligible_for_cleanup: number
  }
}

/**
 * Quick Entry ingestion pipeline health — polls every 30 seconds, same
 * cadence as the (disclosed-gap) Docker service health grid.
 */
export function usePipelineHealth() {
  return useQuery({
    queryKey: queryKeys.admin.pipelineHealth(),
    queryFn: () => api.get<PipelineHealthData>("api/admin/knowledge-entries/pipeline-health"),
    staleTime: 0,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

// ── Inference orchestration health ─────────────────────────────
//
// Confirmed (2026-07-22) directly against the real GET
// /api/admin/inference-health (backend/app/handlers/inference_health_handler.py,
// new in DEC-058 — did not exist when FRONTEND_22 was originally written, so
// there was no spec'd shape to conform to; this type is built from the real
// handler code, not assumed). `chains` groups tiers by role (main/judge/
// vision); `quota_remaining` is only ever populated for header_groq/
// header_cerebras quota kinds (SambaNova's sliding_window and Cloudflare's
// neuron_pool report null here). Circuit state is per-process/in-memory
// only (2 uvicorn workers) — a real, disclosed limitation, not a bug: two
// requests in a row can legitimately show different circuit state if they
// land on different workers.
export interface InferenceChainTier {
  tier_position: number
  provider: string
  model: string
  circuit_state: string | null
  circuit_total_calls: number
  circuit_total_failures: number
  quota_remaining: number | string | null
  last_known_in_catalog: boolean | null
  last_known_live_call_ok: boolean | null
  last_checked_at: string | null
}

export interface InferenceHealthData {
  badge: "red" | "amber" | "green"
  chains: Record<string, InferenceChainTier[]>
  last_health_check: {
    run_id: string | null
    checked_at: string | null
    drift_found: number | null
  } | null
}

/** Inference gateway (N-tier model orchestration) health — polls every 30 seconds. */
export function useInferenceHealth() {
  return useQuery({
    queryKey: queryKeys.admin.inferenceHealth(),
    queryFn: () => api.get<InferenceHealthData>("api/admin/inference-health"),
    staleTime: 0,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

// ── Knowledge entries needing attention ────────────────────────
//
// Confirmed (2026-07-22) against the real GET /api/admin/knowledge-entries
// list endpoint — response is {entries: [...], total, page, page_size,
// total_pages}. Each entry embeds a real `feedback_summary` (identical
// shape to the standalone per-entry GET /{id}/feedback-summary). There is
// no aggregate feedback-summary endpoint — this hook fetches the list (one
// page, most-recent-first per the backend's own default ordering) and
// filters client-side for entries with negative feedback, since the
// backend has no server-side "net negative" filter param.
export interface KnowledgeEntrySummary {
  id: string
  document_id: string
  content_type: "error_guide" | "procedure" | "config"
  module: string
  status: string
  version: number
  verified_by_name: string
  verified_date: string | null
  submitted_by_name: string
  chunk_count: number
  screenshot_count: number
  has_failed_screenshots: boolean
  next_review_date: string | null
  gap_id: string | null
  feedback_summary: {
    positive: number
    negative: number
    net: number
    period_days: number
    last_negative_at: string | null
  }
  issue_title: string
  created_at: string
  updated_at: string
}

interface KnowledgeEntriesListResponse {
  entries: KnowledgeEntrySummary[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/**
 * Entries with negative feedback in the last 30 days — feeds the "needing
 * attention" list in the Quick Entry Pipeline health section. Not live-
 * polled like the health endpoints above (this is a browse-and-triage list,
 * not a health signal); a 60s staleTime keeps it reasonably fresh without
 * refetching on every render.
 */
export function useAttentionEntries() {
  return useQuery({
    queryKey: queryKeys.admin.attentionEntries(),
    queryFn: () => api.get<KnowledgeEntriesListResponse>("api/admin/knowledge-entries?page_size=100"),
    staleTime: 60_000,
    select: (data) =>
      data.entries
        .filter((e) => e.feedback_summary.negative > 0)
        .sort((a, b) => a.feedback_summary.net - b.feedback_summary.net)
        .slice(0, 5),
  })
}
