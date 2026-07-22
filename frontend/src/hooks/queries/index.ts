/**
 * TanStack Query hooks — complete implementation.
 * Replaces the stub created in FRONTEND_09 (Session F07 Step 0).
 * All export names match the stub exactly.
 */

// Session hooks
export { useSessions, useSession, useDeleteSession, useRenameSession, usePinSession } from "./sessions"

// Admin live data (polling)
export { useAdminMetrics, useSystemHealth, useReviewQueueCount } from "./adminMetrics"

// Admin content data
export {
  useAdminDocuments,
  useAdminRegistry,
  useConfigSnapshot,
  useAdminGaps,
  useAdminAuditTrail,
  useAdminReviewQueue,
  useAdminTickets,
} from "./adminData"
export type { RegistryEntry, ConfigEntry, GapEntry, AuditEntry, ReviewItem, TicketEntry } from "./adminData"

// Analytics
export { useAdminAnalytics } from "./adminAnalytics"

// Health (system health grid's useSystemHealth/useAdminMetrics stay disclosed-gap
// placeholders above; these three are the real, confirmed endpoints — see
// adminHealth.ts's own doc comments for each)
export { usePipelineHealth, useInferenceHealth, useAttentionEntries } from "./adminHealth"
export type { PipelineHealthData, InferenceHealthData, InferenceChainTier, KnowledgeEntrySummary } from "./adminHealth"

// Mutations
export {
  useDeprecateDocument,
  useBulkDeprecateDocuments,
  useApproveRegistry,
  useRejectRegistry,
  useUpdateConfig,
  useResolveReview,
  useUpdateTicketStatus,
  useUploadDocument,
  useSubmitFeedback,
} from "./mutations"

// Preferences
export { usePreferences, useUpdatePreferences } from "./preferences"
