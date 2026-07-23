// ── Confidence system ──
export type ConfidenceBadge = "green" | "amber" | "none" | null

// ── Streaming state machine ──
export type StreamingState =
  | "idle"
  | "thinking"
  | "retrieving"
  | "generating"
  | "streaming"
  | "validating"
  | "complete"
  | "error"

// ── SAP entity types ──
export type SAPEntityType = "error_code" | "tcode" | "doc_number"

export interface SAPEntity {
  type: SAPEntityType
  value: string
  start: number
  end: number
}

// ── Attribution panel ──
export interface AttributionPanel {
  primary_document_id: string
  primary_document_name: string
  verified_by: string
  verified_date: string
  secondary_sources: Array<{
    document_id: string
    chunk_type: string
    verified_date: string
  }>
  confidence_badge: ConfidenceBadge
  /**
   * Confirmed (2026-07-23, F19) against the real backend
   * (validation_engine.py's build_attribution_panel): already live, not
   * aspirational — null when the answer's primary source is a document
   * chunk rather than a Quick Entry chunk.
   */
  form_entry_id: string | null
  /** Screenshots attached to any retrieved chunk (not just the primary source), deduped, max 5. */
  screenshots: ScreenshotReference[]
}

/** A Quick Entry screenshot as surfaced to the employee via the attribution panel. */
export interface ScreenshotReference {
  /** Proxy URL — /api/screenshots/{path} — never a direct MinIO URL. */
  url: string
  /** Admin-written description of the screenshot content. */
  caption: string
  /** The chunk_type this screenshot is associated with, e.g. "cause_1". */
  section: string
}

// ── WebSocket message types ──
export type WSMessageType =
  | "session_ready"
  | "token"
  | "stream_complete"
  | "validation_result"
  | "vision_refined_answer"
  | "error"
  | "pong"
  | "retrieval_progress"

export interface WSMessage {
  type: WSMessageType
  session_id?: string
  token?: string
  /**
   * The authoritative final answer text, sent with validation_result.
   * Confirmed via the real backend (chat_handler.py): a targeted
   * regeneration pass can produce a DIFFERENT final answer than whatever
   * was streamed via "token" messages moments earlier (regeneration calls
   * the model directly and never publishes to the token Pub/Sub channel).
   * A client must prefer this over its own accumulated streamed content.
   */
  answer_text?: string
  validation_score?: number
  confidence_badge?: ConfidenceBadge
  attribution_panel?: AttributionPanel
  /** 2-3 follow-up question suggestions, sent with validation_result on green-badge answers. */
  related_questions?: string[]
  message?: string
  error_code?: string
  ticket_id?: string
  diagnostic_summary?: string
  /** vision_refined_answer only — whether the analyzed screenshot showed a recognizable SAP error code. */
  has_error_code?: boolean
  /** vision_refined_answer only — the SAP transaction code detected in the screenshot, if any. */
  transaction_code?: string
  /**
   * retrieval_progress — declared per FRONTEND_MASTER_REFERENCE's protocol
   * documentation, but confirmed (by reading the real backend) never
   * actually sent by any current code path — kept for forward
   * compatibility with the documented-but-unshipped backend addition, not
   * something the current UI can rely on firing.
   */
  stage?: "retrieving" | "crag" | "generating" | "validating"
}

// ── Chat message ──
export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  streamingState?: StreamingState
  validationScore?: number
  confidenceBadge?: ConfidenceBadge
  attributionPanel?: AttributionPanel | null
  visionContext?: {
    message: string
    diagnostic_summary: string
    error_code?: string
  } | null
  entities?: SAPEntity[]
  /** True if the WebSocket dropped mid-stream, before validation_result arrived. */
  isIncomplete?: boolean
  /** 2-3 follow-up question suggestions for this specific response, tied to the message so a later turn can't go stale. */
  relatedQuestions?: string[]
}

// ── Session ──
export interface Session {
  id: string
  user_id_hash: string
  topic_summary: string
  created_at: string
  updated_at: string
  turn_count: number
  avg_confidence_score: number | null
  confidence_badge: ConfidenceBadge
  module_tags: string[]
  is_pinned: boolean
  is_unresolved: boolean
}

// ── Admin types ──
export interface DocumentRecord {
  document_id: string
  content_type: "error_guide" | "procedure" | "config"
  module: string
  status: "active" | "processing" | "failed" | "deprecated"
  chunk_count: number
  last_verified_date: string
  /**
   * Confirmed (2026-07-21): GET /admin/documents's real SELECT does not
   * include this column, even though it's a real NOT NULL column on
   * documents_registry — optional here so the type doesn't claim a
   * guarantee the live endpoint doesn't honor. UI must handle it being
   * absent (e.g. a "—" fallback), not assume it's always present.
   */
  verified_by?: string
  ingested_at: string
}

/**
 * Knowledge gap event summary, as shown on the admin dashboard.
 * NOTE: this is the shape FRONTEND_17_ADMIN_DASHBOARD.md specifies for
 * GET /admin/metrics's gap_events field — confirmed (2026-07-21) that no
 * such field exists on the real backend under this or any other name.
 * The real, live /admin/knowledge-gaps endpoint returns a differently
 * shaped {clusters: [...]} payload (entity_combination, gap_description,
 * count_7d/count_30d, example_queries, gap_id, addressed_by_entry_id) —
 * built for a future Knowledge Gaps admin page (not this session's scope).
 * Kept here as the spec'd contract so the dashboard ships complete and
 * lights up the moment a backend session adds a matching /admin/metrics
 * endpoint; until then, useAdminMetrics() 404s and the dashboard shows its
 * own loading/degraded state, never fake data.
 */
export interface GapEvent {
  query_pattern: string
  module: string
  doc_category: string
  count_this_week: number
  severity: "high" | "medium" | "low"
}

/**
 * Admin dashboard live metrics, from GET /admin/metrics.
 * NOTE: confirmed (2026-07-21) this endpoint does not exist on the real
 * backend yet — no route, no Pydantic model, nothing under any name. Same
 * is true of GET /admin/system-health and GET /admin/review-queue/count
 * (both already called by hooks in src/hooks/queries/adminMetrics.ts,
 * built in F08 ahead of the backend). This type is the spec'd contract
 * from FRONTEND_17_ADMIN_DASHBOARD.md, kept in full so the frontend is
 * complete and production-grade the moment a backend session builds the
 * matching endpoint — not an invented workaround, just built ahead of it,
 * the same precedent already established for the screenshot-upload
 * session-correlation gap disclosed in F09's useWebSocket.ts.
 */
export interface MetricsData {
  total_queries_today: number
  avg_validation_score: number
  green_badge_rate: number
  amber_badge_rate: number
  none_badge_rate: number
  open_tickets: number
  cache_hit_rate: number
  crag_insufficient_rate: number
  mode_a_rate: number
  mode_b_rate: number
  mode_c_rate: number
  last_updated_at: string
  /** 7-day ValidationScore trend, most recent last. */
  validation_score_7d: Array<{ date: string; score: number }>
  /** 7-day confidence badge distribution, values are percentages (0-100) per day. */
  confidence_dist_7d: Array<{ date: string; green: number; amber: number; none: number }>
  gap_events: GapEvent[]
}

export interface ServiceHealth {
  name: string
  container_name: string
  status: "healthy" | "unhealthy" | "degraded" | "unknown"
  response_time_ms: number | null
  last_checked_at: string
  error_message?: string | null
}

export interface SystemHealthData {
  services: ServiceHealth[]
  total_healthy: number
  total_unhealthy: number
  overall_status: "healthy" | "degraded" | "critical"
  checked_at: string
}

// ── User preferences ──
export interface UserPreferences {
  dark_mode: boolean | null // null = use system
  panel_collapsed: boolean
  pinned_session_ids: string[]
  onboarding_complete: boolean
  onboarding_step: number
}

// ── Filter types ──
export interface SessionFilters {
  search?: string
  module?: string
  confidence_badge?: ConfidenceBadge
  date_from?: string
  date_to?: string
  is_pinned?: boolean
  is_unresolved?: boolean
}

export interface DocFilters {
  content_type?: string
  module?: string
  status?: string
}

/**
 * Confirmed (2026-07-22) against the real GET /admin/audit-trail (F13): the
 * only accepted query params are `days` (a single relative window) and
 * `confidence_badge` — no date_from/date_to/module/request_type params
 * exist server-side. `page`/`page_size` drive the real endpoint's own
 * pagination envelope ({entries, total}).
 */
export interface AuditFilters {
  days?: number
  confidence_badge?: ConfidenceBadge
  page?: number
  page_size?: number
}

// ── Quick Entry ──
// Field names and shapes confirmed directly (2026-07-23, F19) against the
// real backend: backend/app/models/quick_entry.py (row + form_data
// dataclasses), backend/app/handlers/knowledge_entries_handler.py (endpoint
// response shapes), backend/app/services/form_validator.py (validation
// rules). Where FRONTEND_36-38's own pseudocode assumed a shape that
// doesn't match the real backend, the real backend wins.

export type QuickEntryContentType = "error_guide" | "procedure" | "config"

export type QuickEntryStatus =
  | "draft"
  | "processing"
  | "active"
  | "archived"
  | "low_quality"
  | "failed"
  | "partial_index"
  | "review_required"

export interface FeedbackSummary {
  positive: number
  negative: number
  net: number
  period_days: number
  last_negative_at: string | null
}

export interface QuickEntryListItem {
  id: string
  document_id: string
  content_type: QuickEntryContentType
  module: string
  status: QuickEntryStatus
  version: number
  verified_by_name: string
  verified_date: string
  /** Raw Keycloak sub claim — no users table exists to resolve a display name. */
  submitted_by_name: string
  chunk_count: number
  screenshot_count: number
  has_failed_screenshots: boolean
  next_review_date: string | null
  gap_id: string | null
  feedback_summary: FeedbackSummary
  issue_title: string
  created_at: string
  updated_at: string
}

export interface QuickEntryListResponse {
  entries: QuickEntryListItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ── form_data payloads — exact match to backend/app/models/quick_entry.py ──

export type CausePriority = "check_first" | "common" | "less_common" | "rare"

export interface CauseBlock {
  /** 1-based, always recomputed from array position — never trusted from input. */
  cause_number: number
  priority: CausePriority
  cause_description: string
  how_to_identify: string
  resolution_steps: string
  resolution_requires_admin: boolean
  cause_obsolete: boolean
  /** Required (min 10 chars) if cause_obsolete is true. */
  obsolete_reason: string
  screenshot_ids: string[]
  /** Suppresses the resolution_steps specificity warning once dismissed. */
  specificity_acknowledged: boolean
}

export interface ErrorGuideFormData {
  issue_description: string
  /** Exact code, or the literal string "NONE" — never shown to the employee. */
  error_code: string
  error_message: string
  description: string
  when_this_occurs: string
  causes: CauseBlock[]
  success_indicator: string
  escalation_criteria: string
  admin_steps: string
  notes: string
}

export type ProcedureStepType =
  | "normal"
  | "branch_start"
  | "branch_option_a"
  | "branch_option_b"
  | "branch_end"
  | "admin_required"

export interface ProcedureStep {
  action: string
  step_type: ProcedureStepType
  specificity_acknowledged: boolean
  screenshot_ids: string[]
  /** Computed by the backend at read time (array index + 1) — never sent by the client. */
  step_number?: number
}

export interface CommonError {
  error_code: string
  cause_summary: string
  see_document_id: string
  reference_validated: boolean
}

export interface ProcedureFormData {
  procedure_name: string
  purpose: string
  when_to_use: string
  data_required: string
  system_conditions: string
  access_required: string
  steps: ProcedureStep[]
  verification: string
  common_errors: CommonError[]
  plant_notes: string
  notes: string
}

export interface CurrentValueParameter {
  name: string
  value: string
}

export interface CurrentValuesGroup {
  group_name: string
  parameters: CurrentValueParameter[]
}

export interface RelatedError {
  error_code: string
  misconfiguration_cause: string
  see_document_id: string
  reference_validated: boolean
}

export type CurrentValuesMode = "structured" | "free_text"

export interface ConfigFormData {
  configuration_name: string
  what_this_controls: string
  access_view: string
  access_change: string
  change_frequency: string
  table_name: string
  current_values_mode: CurrentValuesMode
  current_values_structured: CurrentValuesGroup[]
  current_values_free_text: string
  how_to_navigate: string
  related_errors: RelatedError[]
  notes: string
}

export type QuickEntryFormData = Partial<ErrorGuideFormData> | Partial<ProcedureFormData> | Partial<ConfigFormData>

// ── processing_log — exact match to IMPL_24 Section 4 ──

export interface ProcessingStageBase {
  status: string
  duration_ms: number
}
export interface ValidationStage extends ProcessingStageBase {
  errors: string[]
}
export interface ChunkAssemblyStage extends ProcessingStageBase {
  chunks_assembled: number
  chunk_types: string[]
}
export interface EntityExtractionStage extends ProcessingStageBase {
  t_codes_found: string[]
  error_codes_found: string[]
}
export interface EmbeddingStage extends ProcessingStageBase {
  chunks_embedded: number
  model_used: string
}
export interface QualityScoringStage extends ProcessingStageBase {
  avg_score: number | null
  threshold_used: number
  per_chunk_scores: Record<string, number>
}
export interface SimilarEntrySummary {
  document_id: string
  similarity_score: number
}
export interface DeduplicationStage extends ProcessingStageBase {
  similar_entries: SimilarEntrySummary[]
}
export interface QdrantInsertionStage extends ProcessingStageBase {
  chunks_attempted: number
  chunks_succeeded: number
  chunks_failed: number
  point_ids: Record<string, string>
  failed_chunk_types: string[]
}
export interface OpenSearchIndexingStage extends ProcessingStageBase {
  docs_attempted: number
  docs_succeeded: number
  docs_failed: number
  failed_chunk_types: string[]
}
export interface ScreenshotEnrichmentStage {
  queued: boolean
  screenshot_count: number
  task_id: string | null
}

export interface ProcessingLogStages {
  validation?: ValidationStage
  chunk_assembly?: ChunkAssemblyStage
  entity_extraction?: EntityExtractionStage
  embedding?: EmbeddingStage
  quality_scoring?: QualityScoringStage
  deduplication?: DeduplicationStage
  qdrant_insertion?: QdrantInsertionStage
  opensearch_indexing?: OpenSearchIndexingStage
  screenshot_enrichment?: ScreenshotEnrichmentStage
}

export interface ProcessingLog {
  run_id: string
  started_at: string
  entry_id: string
  entry_version: number
  stages: ProcessingLogStages
  overall_status: string
  retry_count: number
  completed_at: string | null
  total_duration_ms: number | null
  failure_stage: string | null
  failure_reason: string | null
  previous_run_ids: string[]
}

export interface QuickEntryScreenshot {
  id: string
  entry_id: string
  version: number
  associated_section: string
  minio_object_key: string
  admin_caption: string
  file_size_bytes: number
  mime_type: string
  created_at: string
  extracted_text: string | null
  vision_status: "pending" | "processing" | "complete" | "failed" | "not_sap"
  vision_error: string | null
  /**
   * Confirmed (knowledge_screenshots_handler.py): always null in practice —
   * classify_sap() returns a screen-type enum, not a confidence number, and
   * the real upload endpoint never populates this field with a real value.
   */
  vision_confidence: number | null
  sap_confirmed: boolean
  eligible_for_cleanup: boolean
  proxy_url: string
}

export interface QuickEntryChunkSummary {
  id: string
  version: number
  chunk_type: string
  qdrant_status: "pending" | "success" | "failed"
  opensearch_status: "pending" | "success" | "failed"
  is_current: boolean
  created_at: string
}

export interface QuickEntryFull {
  id: string
  document_id: string
  content_type: QuickEntryContentType
  module: string
  transactions: string[]
  status: QuickEntryStatus
  version: number
  form_data: QuickEntryFormData
  verified_by_name: string
  verified_date: string
  review_frequency: string | null
  next_review_date: string | null
  gap_id: string | null
  processing_log: ProcessingLog | null
  submitted_by: string
  created_at: string
  updated_at: string
  screenshots: QuickEntryScreenshot[]
  chunks: QuickEntryChunkSummary[]
}

export interface QuickEntryVersion {
  id: string
  version: number
  changed_by_name: string
  changed_at: string
  change_summary: string | null
  verified_by_name: string
  verified_date: string
  form_data: QuickEntryFormData
}

export interface DuplicateMatch {
  document_id: string
  title: string
  source_type: "form_entry" | "document"
  content_type: string
  module: string
  similarity_score: number
  preview: string
  last_verified: string
  status: string
}

/** A single assembled knowledge chunk, client-side preview (mirrors form_chunker.py's real output shape). */
export interface AssembledChunk {
  chunk_type: string
  text: string
  associated_section: string
}
