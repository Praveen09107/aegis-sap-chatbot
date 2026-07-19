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
  validation_score?: number
  confidence_badge?: ConfidenceBadge
  attribution_panel?: AttributionPanel
  message?: string
  error_code?: string
  ticket_id?: string
  diagnostic_summary?: string
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
