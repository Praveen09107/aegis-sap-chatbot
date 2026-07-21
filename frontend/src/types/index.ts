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
}

// ── WebSocket message types ──
export type WSMessageType =
  | "session_ready"
  | "token"
  | "stream_complete"
  | "validation_result"
  | "vision_refined_answer"
  | "error"
  | "correction"
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
  verified_by: string
  ingested_at: string
}

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

export interface AuditFilters {
  date_from?: string
  date_to?: string
  confidence_badge?: ConfidenceBadge
  module?: string
  request_type?: string
}
