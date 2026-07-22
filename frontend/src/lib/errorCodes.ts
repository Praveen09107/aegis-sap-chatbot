/**
 * Maps HTTP status codes and error scenarios to user-friendly messages.
 * Import from here instead of writing inline error strings.
 */

export const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: "The request could not be processed — please check your input.",
  401: "Your session has expired. Redirecting to login...",
  403: "You do not have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "A conflict occurred — this item may have been modified.",
  413: "The file is too large to upload.",
  422: "The submitted data is invalid — please review and try again.",
  429: "Too many requests — please wait a moment before trying again.",
  500: "A server error occurred. Our team has been notified.",
  502: "The service is temporarily unreachable. Retrying...",
  503: "The service is temporarily unavailable. Retrying...",
  504: "The server took too long to respond. Please try again.",
}

/**
 * Confirmed (2026-07-22) against the real close codes used by
 * chat_handler.py / authentication.py (see useWebSocket.ts's own doc
 * comment): the backend uses 4001 for every auth-failure path (not the
 * 4000/4003/4004 split this table originally assumed), and 4002 is a
 * client-side pong-timeout code, not a backend one. Kept here in full
 * anyway as the disclosed, spec'd reference — useWebSocket.ts's real
 * message construction doesn't consult this table today (it builds its own
 * messages inline), so this doesn't change current behavior; it's ready
 * reference if a future session wants to centralize those strings.
 */
export const WEBSOCKET_ERROR_MESSAGES: Record<number, string> = {
  1006: "Connection lost unexpectedly. Reconnecting...",
  4001: "Your session could not be authenticated. Please refresh the page.",
  4002: "Connection timed out. Reconnecting...",
}

export const UPLOAD_ERROR_MESSAGES = {
  TYPE_INVALID: "Only PDF files are supported.",
  SIZE_EXCEEDED: "File exceeds the 50MB size limit.",
  NETWORK: "Upload failed — check your connection and try again.",
  SERVER: "Upload failed on the server. Please try again.",
} as const

/**
 * Query-domain labels for section-level error fallbacks (e.g.
 * `<ErrorFallbackInline message={QUERY_ERROR_MESSAGES.DOCUMENTS} />`).
 * Keys match this codebase's real admin query hooks (adminData.ts,
 * adminHealth.ts, adminAnalytics.ts, adminMetrics.ts) — FRONTEND_26's own
 * list assumed a slightly different set (no GAPS/REVIEW_QUEUE/TICKETS/
 * PIPELINE_HEALTH/INFERENCE_HEALTH keys, an AUDIT_TRAIL/HEALTH naming that
 * didn't fully match the real hook set built across F11-F14).
 */
export const QUERY_ERROR_MESSAGES = {
  DOCUMENTS: "Failed to load documents",
  REGISTRY: "Failed to load registry entries",
  CONFIG: "Failed to load configuration",
  METRICS: "Failed to load metrics",
  SESSIONS: "Failed to load sessions",
  ANALYTICS: "Failed to load analytics data",
  GAPS: "Failed to load knowledge gaps",
  AUDIT_TRAIL: "Failed to load audit entries",
  REVIEW_QUEUE: "Failed to load the review queue",
  TICKETS: "Failed to load tickets",
  HEALTH: "Failed to fetch service health",
  PIPELINE_HEALTH: "Failed to fetch Quick Entry pipeline health",
  INFERENCE_HEALTH: "Failed to fetch inference orchestration health",
} as const

/**
 * Returns a user-friendly message for an HTTP status code.
 * Falls back to a generic message for unknown status codes.
 */
export function getHttpErrorMessage(status: number): string {
  return HTTP_ERROR_MESSAGES[status] ?? (status >= 500 ? "A server error occurred. Please try again." : "An unexpected error occurred.")
}
