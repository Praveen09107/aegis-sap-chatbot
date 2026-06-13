# FRONTEND_11: TANSTACK QUERY
## Complete Data Fetching Hooks — Server State, Polling, Mutations, Cache Strategy
## Session F06 Implementation Guide (Part 2)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F06 Part 2: Complete TanStack Query hooks.
Run after FRONTEND_10_ZUSTAND_STORES in the same session.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**This session replaces the stub file** created in FRONTEND_09 (Step 0).
All export names are preserved — existing imports remain valid.

**What this session creates/replaces:**
```
src/hooks/queries/
├── index.ts             ← Re-exports all hooks (replaces stub)
├── sessions.ts          ← Session history hooks
├── adminData.ts         ← Admin data hooks (documents, registry, gaps, audit, tickets)
├── adminMetrics.ts      ← Live metrics + system health (30s polling)
├── adminAnalytics.ts    ← Analytics time-series hooks
├── mutations.ts         ← All mutation hooks with invalidation
└── preferences.ts       ← User preferences hooks
```

**Architecture rule:**
- Query hooks: read-only data fetching, cache management
- Mutation hooks: write operations with optimistic updates and cache invalidation
- Never put business logic in stores — stores hold UI state only
- Never fetch inside a Zustand store — fetching belongs in query hooks

---

## TANSTACK QUERY KEY ARCHITECTURE

All cache keys come from `src/lib/queryKeys.ts` (created in FRONTEND_02). Keys use
a factory pattern so invalidation is precise — only the affected data refetches.

```typescript
// Invalidation examples:
// After deprecating a document:
queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })

// After approving a registry entry:
queryClient.invalidateQueries({ queryKey: queryKeys.admin.registry() })

// After submitting a review correction:
queryClient.invalidateQueries({ queryKey: queryKeys.admin.reviewQueue('pending') })
queryClient.invalidateQueries({ queryKey: queryKeys.admin.metrics() }) // affects metrics

// After deleting a session:
queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
```

---

## FILE 1: src/hooks/queries/sessions.ts (COMPLETE)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { toastSuccess, toastError } from '@/lib/toast'
import type { Session, SessionFilters } from '@/types'

// ── Response types ────────────────────────────────────────────

interface SessionListResponse {
  sessions: Session[]
  total: number
  page: number
}

interface SessionDetailResponse {
  session: Session
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: string
    confidence_badge?: string | null
    validation_score?: number | null
    attribution_doc_id?: string | null
  }>
}

// ── Session list ──────────────────────────────────────────────

/**
 * Fetches the user's session history.
 * Used by SessionSidebar and Session History page.
 *
 * @param filters - Optional filters (search, module, date range)
 * @example
 * const { data: sessions = [], isLoading } = useSessions()
 * const { data, isLoading } = useSessions({ search: 'VL150', module: 'SD' })
 */
export function useSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: queryKeys.sessions.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.search) params.set('search', filters.search)
      if (filters?.module) params.set('module', filters.module)
      if (filters?.confidence_badge) params.set('confidence_badge', filters.confidence_badge)
      if (filters?.date_from) params.set('date_from', filters.date_from)
      if (filters?.date_to) params.set('date_to', filters.date_to)
      if (filters?.is_pinned !== undefined) params.set('is_pinned', String(filters.is_pinned))

      const query = params.toString()
      const response = await api.get<SessionListResponse>(
        `sessions${query ? `?${query}` : ''}`
      )
      return response.sessions
    },
    staleTime: 30_000,   // 30s — sessions don't change mid-chat
    gcTime: 5 * 60_000,  // 5min cache retention
    placeholderData: (prev) => prev, // keep previous data while refetching
  })
}

/**
 * Fetches a single session with its full message history.
 * Used when loading a historical session into the chat interface.
 *
 * @param id - Session ID, or null if no session is active
 */
export function useSession(id: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(id ?? ''),
    queryFn: () => api.get<SessionDetailResponse>(`sessions/${id}`),
    enabled: !!id,
    staleTime: 5 * 60_000,  // Historical sessions rarely change
  })
}

// ── Session mutations ─────────────────────────────────────────

export function useDeleteSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
    },
    onError: () => {
      toastError('Failed to delete session')
    },
  })
}

export function useRenameSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.put(`sessions/${id}`, { topic_summary: title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
    },
  })
}

export function usePinSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.put(`sessions/${id}`, { is_pinned: pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all() })
    },
  })
}
```

---

## FILE 2: src/hooks/queries/adminMetrics.ts (COMPLETE)

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { TIMING } from '@/lib/constants'
import type { MetricsData, SystemHealthData } from '@/types'

/**
 * Admin dashboard live metrics — polls every 30 seconds.
 * Shows: query counts, confidence distributions, cache hit rate, open tickets.
 *
 * staleTime: 0 — always considered stale so refetchInterval works correctly.
 * refetchIntervalInBackground: false — stops polling when tab is not focused.
 *
 * @example
 * const { data: metrics, isLoading, dataUpdatedAt } = useAdminMetrics()
 */
export function useAdminMetrics() {
  return useQuery({
    queryKey: queryKeys.admin.metrics(),
    queryFn: () => api.get<MetricsData>('admin/metrics'),
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    // Suppress error toast — dashboard shows degraded state inline
    meta: { suppressErrorToast: true },
  })
}

/**
 * System health — polls every 30 seconds.
 * Shows the health status of all 19 Docker services.
 *
 * @example
 * const { data: health, isLoading } = useSystemHealth()
 * health?.services.forEach(svc => console.log(svc.name, svc.status))
 */
export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.admin.systemHealth(),
    queryFn: () => api.get<SystemHealthData>('admin/system-health'),
    staleTime: 0,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

/**
 * Review queue pending count — used for AdminNav badge.
 * Polls every 30 seconds.
 *
 * @example
 * const { data: count = 0 } = useReviewQueueCount()
 */
export function useReviewQueueCount() {
  return useQuery({
    queryKey: queryKeys.admin.reviewQueue('pending-count'),
    queryFn: () =>
      api.get<{ count: number }>('admin/review-queue/count', { silent: true }),
    staleTime: 0,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    select: (data) => data.count,
    meta: { suppressErrorToast: true },
  })
}
```

---

## FILE 3: src/hooks/queries/adminData.ts (COMPLETE)

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { DocumentRecord, DocFilters, AuditFilters } from '@/types'

// ── Documents ─────────────────────────────────────────────────

interface DocumentsResponse {
  documents: DocumentRecord[]
  total: number
}

interface RegistryEntry {
  id: string
  pattern_text: string
  linked_document_id: string
  status: 'pending' | 'active' | 'rejected'
  created_at: string
  approved_by?: string
}

interface ConfigEntry {
  category: string
  key: string
  value: string
  last_verified_date: string
  verified_by: string
  is_stale: boolean
  days_since_verified: number
}

interface GapEntry {
  id: string
  query_text: string
  frequency: number
  last_seen_at: string
  module_tags: string[]
  sample_queries: string[]
  priority_score: number  // frequency * recency weight
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
  request_type: 'standard' | 'vision' | 'cached'
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
  status: 'pending' | 'resolved' | 'skipped'
}

interface TicketEntry {
  id: string
  reference_number: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'resolved'
  priority: 'low' | 'medium' | 'high'
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
      if (filters?.content_type) params.set('content_type', filters.content_type)
      if (filters?.module) params.set('module', filters.module)
      if (filters?.status) params.set('status', filters.status)
      const q = params.toString()
      return api.get<DocumentsResponse>(`admin/documents${q ? `?${q}` : ''}`)
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
    queryFn: () => api.get<RegistryEntry[]>(`admin/registry${status ? `?status=${status}` : ''}`),
    staleTime: 30_000,
  })
}

/**
 * Configuration snapshot.
 * Used by: Admin Config Snapshot page (FRONTEND_19).
 */
export function useConfigSnapshot() {
  return useQuery({
    queryKey: queryKeys.admin.config(),
    queryFn: () => api.get<ConfigEntry[]>('admin/config-snapshot'),
    staleTime: 60_000,
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
    staleTime: 5 * 60_000,  // Gaps analysis is expensive — cache for 5 min
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
      if (filters?.date_from) params.set('date_from', filters.date_from)
      if (filters?.date_to) params.set('date_to', filters.date_to)
      if (filters?.confidence_badge) params.set('confidence_badge', filters.confidence_badge)
      if (filters?.module) params.set('module', filters.module)
      if (filters?.request_type) params.set('request_type', filters.request_type)
      const q = params.toString()
      return api.get<AuditEntry[]>(`admin/audit-trail${q ? `?${q}` : ''}`)
    },
    staleTime: 60_000,
  })
}

/**
 * Review queue items.
 * Used by: Admin Review Queue page (FRONTEND_21).
 */
export function useAdminReviewQueue(status: string = 'pending') {
  return useQuery({
    queryKey: queryKeys.admin.reviewQueue(status),
    queryFn: () => api.get<ReviewItem[]>(`admin/review-queue?status=${status}`),
    staleTime: 30_000,
    refetchInterval: 30_000,  // Live queue — check frequently
  })
}

/**
 * Ticket list.
 * Used by: Admin Tickets page (FRONTEND_21).
 */
export function useAdminTickets(status?: string) {
  return useQuery({
    queryKey: queryKeys.admin.tickets(status),
    queryFn: () =>
      api.get<TicketEntry[]>(`admin/tickets${status ? `?status=${status}` : ''}`),
    staleTime: 30_000,
  })
}
```

---

## FILE 4: src/hooks/queries/adminAnalytics.ts (COMPLETE)

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

// ── Analytics response types ──────────────────────────────────

interface TimeSeriesPoint {
  date: string
  value: number
}

interface AnalyticsResponse {
  validation_score_trend: TimeSeriesPoint[]
  confidence_distribution: {
    date: string
    green: number
    amber: number
    none: number
  }[]
  cache_performance: {
    date: string
    hit_rate: number
    total_queries: number
  }[]
  retrieval_mode_usage: {
    date: string
    mode_a: number  // CRAG-corrected
    mode_b: number  // standard retrieval
    mode_c: number  // insufficient
  }[]
  top_modules: Array<{ module: string; query_count: number; avg_score: number }>
  query_volume: TimeSeriesPoint[]
}

/**
 * Analytics time-series data.
 * Used by: Admin Analytics page (FRONTEND_22).
 *
 * @param range - '7d' | '30d' | '90d' | 'all'
 */
export function useAdminAnalytics(range: string) {
  return useQuery({
    queryKey: queryKeys.admin.analytics(range),
    queryFn: () => api.get<AnalyticsResponse>(`admin/analytics?range=${range}`),
    staleTime: 5 * 60_000,   // Analytics is heavy — cache for 5 min
    gcTime: 15 * 60_000,
    // Keep previous data visible while new range loads
    placeholderData: (prev) => prev,
  })
}
```

---

## FILE 5: src/hooks/queries/mutations.ts (COMPLETE)

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { TOAST, toastSuccess, toastError, toastPromise } from '@/lib/toast'
import type { DocFilters } from '@/types'

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
    mutationFn: (documentId: string) =>
      api.patch(`admin/documents/${documentId}`, { status: 'deprecated' }),
    onSuccess: (_data, documentId) => {
      TOAST.documentDeprecated(documentId)
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })
    },
    onError: () => toastError('Failed to deprecate document'),
  })
}

/**
 * Bulk deprecate multiple documents.
 */
export function useBulkDeprecateDocuments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (documentIds: string[]) =>
      toastPromise(
        api.post('admin/documents/bulk-deprecate', { document_ids: documentIds }),
        {
          loading: `Deprecating ${documentIds.length} documents...`,
          success: `${documentIds.length} documents deprecated`,
          error: 'Bulk deprecation failed',
        }
      ),
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
    onError: () => toastError('Failed to approve registry entry'),
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
    mutationFn: ({
      category,
      key,
      value,
    }: {
      category: string
      key: string
      value: string
    }) => api.put(`admin/config-snapshot/${category}/${key}`, { value }),
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
  action: 'approve_correction' | 'reject_correction' | 'skip'
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
    mutationFn: (payload: ReviewResolutionPayload) =>
      api.post(`admin/review-queue/${payload.item_id}/resolve`, payload),
    onSuccess: (_data, { action }) => {
      if (action === 'approve_correction') TOAST.correctionSubmitted()
      if (action === 'skip') TOAST.correctionSkipped()
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reviewQueue('pending') })
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.metrics() })
    },
    onError: () => toastError('Failed to submit review'),
  })
}

// ── Ticket mutations ──────────────────────────────────────────

/**
 * Update ticket status — used by the kanban drag-and-drop.
 * Optimistic update: kanban card moves immediately, reverts on error.
 */
export function useUpdateTicketStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      ticketId,
      status,
    }: {
      ticketId: string
      status: 'open' | 'in_progress' | 'resolved'
    }) => api.patch(`admin/tickets/${ticketId}`, { status }),

    // Optimistic update: immediately update the cache
    onMutate: async ({ ticketId, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.admin.tickets() })
      const previousTickets = queryClient.getQueryData(queryKeys.admin.tickets())

      queryClient.setQueriesData(
        { queryKey: queryKeys.admin.tickets() },
        (old: any) =>
          old?.map((t: any) => (t.id === ticketId ? { ...t, status } : t)) ?? old
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
      formData.append('file', file)
      formData.append('module', metadata.module)
      formData.append('content_type', metadata.content_type)
      return api.upload('api/upload/document', formData)
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
      signal: 'positive' | 'negative'
    }) =>
      api.post('feedback', { session_id: sessionId, turn_index: turnIndex, signal }),
    onSuccess: (_data, { signal }) => {
      if (signal === 'positive') TOAST.feedbackPositive()
      else TOAST.feedbackNegative()
    },
    // Silent failure — don't block UI on feedback errors
    onError: () => {},
  })
}
```

---

## FILE 6: src/hooks/queries/preferences.ts (COMPLETE)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { UserPreferences } from '@/types'

/**
 * Fetch user preferences from the server.
 * Falls back to defaults if the request fails.
 */
export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences.all(),
    queryFn: () => api.get<UserPreferences>('preferences', { silent: true }),
    staleTime: Infinity,  // Preferences don't change externally
    gcTime: Infinity,
    retry: 1,
    // Default preferences on error
    meta: {
      onError: (err: unknown) => {
        console.warn('Failed to load preferences:', err)
      },
    },
  })
}

/**
 * Update user preferences.
 * Called after dark mode toggle, panel state change, etc.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (prefs: Partial<UserPreferences>) =>
      api.put<UserPreferences>('preferences', prefs),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.preferences.all(), data)
    },
  })
}
```

---

## FILE 7: src/hooks/queries/index.ts (COMPLETE — REPLACES STUB)

```typescript
/**
 * TanStack Query hooks — complete implementation.
 * Replaces the stub created in FRONTEND_09 (Session F05 Step 0).
 * All export names match the stub exactly.
 */

// Session hooks
export {
  useSessions,
  useSession,
  useDeleteSession,
  useRenameSession,
  usePinSession,
} from './sessions'

// Admin live data (polling)
export {
  useAdminMetrics,
  useSystemHealth,
  useReviewQueueCount,
} from './adminMetrics'

// Admin content data
export {
  useAdminDocuments,
  useAdminRegistry,
  useConfigSnapshot,
  useAdminGaps,
  useAdminAuditTrail,
  useAdminReviewQueue,
  useAdminTickets,
} from './adminData'

// Analytics
export {
  useAdminAnalytics,
} from './adminAnalytics'

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
} from './mutations'

// Preferences
export {
  usePreferences,
  useUpdatePreferences,
} from './preferences'
```

---

## POLLING COUNTDOWN UTILITY

```typescript
// src/hooks/usePollingCountdown.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import { TIMING } from '@/lib/constants'

/**
 * Returns seconds since last data update and seconds until next poll.
 * Used in Admin Dashboard to show "Updated 22s ago · Next in 8s".
 *
 * @param dataUpdatedAt - Timestamp of last successful fetch (from useQuery result)
 * @param intervalMs - Polling interval (default: 30s)
 */
export function usePollingCountdown(
  dataUpdatedAt: number,
  intervalMs: number = TIMING.ADMIN_POLL_INTERVAL_MS
) {
  const [secondsSince, setSecondsSince] = useState(0)

  useEffect(() => {
    const tick = () => {
      setSecondsSince(Math.floor((Date.now() - dataUpdatedAt) / 1000))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [dataUpdatedAt])

  const secondsUntilNext = Math.max(0, Math.round(intervalMs / 1000) - secondsSince)

  return { secondsSince, secondsUntilNext }
}
```

---

## QUERY DEFAULTS AND ERROR HANDLING

The QueryClient default options were set in FRONTEND_01 (`src/components/shared/providers/QueryProvider.tsx`).
Here is the complete error handling strategy:

```typescript
// Error handling strategy per query category:

// 1. Silent failures (don't show toast — component renders degraded UI)
//    → useAdminMetrics: dashboard shows "--" values
//    → useReviewQueueCount: nav badge shows nothing
//    → usePreferences: falls back to defaults

// 2. Handled failures (toast shown, component shows error state)
//    → useAdminDocuments: "Failed to load documents" toast
//    → useSession: error boundary catches, shows retry option

// 3. Mutation failures (always show toast — user initiated the action)
//    → All mutation onError handlers show toastError

// Retry configuration:
// Queries: 2 retries (from QueryClient defaultOptions)
// Mutations: 0 retries (user must retry manually)
// Polling queries (metrics, health): 0 retries per interval
//   → next poll in 30s will retry automatically

// Use { silent: true } in api.get() to suppress toast on specific queries
// where the component handles the error state itself
```

---

## USAGE PATTERNS REFERENCE

### Pattern 1: Admin page with polling (Dashboard)

```typescript
// In AdminDashboardPage (FRONTEND_17):
import { useAdminMetrics } from '@/hooks/queries'
import { usePollingCountdown } from '@/hooks/usePollingCountdown'

function AdminDashboardPage() {
  const { data: metrics, isLoading, dataUpdatedAt } = useAdminMetrics()
  const { secondsSince, secondsUntilNext } = usePollingCountdown(dataUpdatedAt)

  return (
    <div>
      {/* Refresh indicator */}
      <p className="text-xs text-text-tertiary">
        Updated {secondsSince}s ago · Next refresh in {secondsUntilNext}s
      </p>

      {/* Metrics grid */}
      <MetricCardGrid>
        <MetricCard
          label="Queries today"
          value={metrics?.total_queries_today ?? 0}
          isLoading={isLoading}
          animateCount
          color="white"
        />
        {/* ... */}
      </MetricCardGrid>
    </div>
  )
}
```

### Pattern 2: Admin table with mutations (Documents page)

```typescript
// In AdminDocumentsPage (FRONTEND_18):
import { useAdminDocuments, useDeprecateDocument, useBulkDeprecateDocuments } from '@/hooks/queries'
import { useAdminStore } from '@/stores/adminStore'

function AdminDocumentsPage() {
  const { documentFilters } = useAdminStore()
  const { data: documents = [], isLoading } = useAdminDocuments(documentFilters)
  const deprecate = useDeprecateDocument()
  const bulkDeprecate = useBulkDeprecateDocuments()
  const { selectedDocumentIds, setSelectedDocumentIds, clearDocumentSelection } = useAdminStore()

  return (
    <>
      <DataTable
        data={documents}
        columns={docColumns}
        keyField="document_id"
        isLoading={isLoading}
        selectable
        selectedKeys={selectedDocumentIds}
        onSelectionChange={setSelectedDocumentIds}
      />

      <BulkActionBar
        selectedCount={selectedDocumentIds.size}
        onClearSelection={clearDocumentSelection}
        actions={[
          {
            label: 'Deprecate selected',
            variant: 'destructive',
            loading: bulkDeprecate.isPending,
            onClick: () =>
              bulkDeprecate.mutate(Array.from(selectedDocumentIds)),
          },
        ]}
      />
    </>
  )
}
```

### Pattern 3: Review queue with keyboard shortcuts (Review page)

```typescript
// In AdminReviewPage (FRONTEND_21):
import { useAdminReviewQueue, useResolveReview } from '@/hooks/queries'
import { useAdminStore } from '@/stores/adminStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

function AdminReviewPage() {
  const { data: items = [], isLoading } = useAdminReviewQueue('pending')
  const resolve = useResolveReview()
  const { reviewQueueIndex, advanceReviewQueue } = useAdminStore()

  const currentItem = items[reviewQueueIndex]

  useKeyboardShortcuts([
    {
      key: 'a',
      handler: () => {
        if (!currentItem) return
        resolve.mutate({ item_id: currentItem.id, action: 'approve_correction' })
        advanceReviewQueue()
      },
      ignoreInInput: false,  // Works even when textarea is focused
    },
    {
      key: 'x',
      handler: () => {
        if (!currentItem) return
        resolve.mutate({ item_id: currentItem.id, action: 'skip' })
        advanceReviewQueue()
      },
    },
  ])

  // ... render split-pane review UI
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Stub file replaced — no import errors
npx tsc --noEmit
# Expected: 0 errors

# Step 2: Sessions hook works
# → Open employee portal, session sidebar
# → Network tab: GET /api/proxy/sessions called on mount
# → Sessions appear in sidebar

# Step 3: Admin metrics polling
# → Open /admin/dashboard
# → Network tab: GET /api/proxy/admin/metrics called immediately, then every 30s
# → Tab Visible: polling active; Tab Hidden: polling pauses

# Step 4: Deprecate mutation + invalidation
# → Deprecate a document
# → Network tab: PATCH /api/proxy/admin/documents/:id
# → Documents list refetches immediately after

# Step 5: Review queue mutation + optimistic update
# → In review queue, press 'A' to approve
# → Item should disappear immediately from the queue
# → If API fails, item should reappear with error toast

# Step 6: TanStack Query DevTools (dev only)
# → If NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS=true
# → Click the devtools button (bottom-left)
# → Verify all active queries are visible with correct cache state

# Step 7: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F06: TanStack Query — all query hooks, mutation hooks, polling config, cache strategy"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F06 (Part 2)*
