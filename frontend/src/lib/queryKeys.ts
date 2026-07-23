/**
 * TanStack Query key factory for AEGIS.
 *
 * Consistent cache keys prevent stale data and enable precise invalidation.
 * Usage: queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })
 */

import type { SessionFilters, DocFilters, AuditFilters } from "@/types"

interface QuickEntryListParams {
  search?: string
  module?: string
  content_type?: string
  status?: string
  include_archived?: boolean
  page?: number
  page_size?: number
}

export const queryKeys = {
  // ── Session history (employee) ──
  sessions: {
    all: () => ["sessions"] as const,
    list: (filters?: SessionFilters) => ["sessions", "list", filters ?? {}] as const,
    detail: (id: string) => ["sessions", "detail", id] as const,
    search: (query: string) => ["sessions", "search", query] as const,
  },

  // ── Admin ──
  admin: {
    metrics: () => ["admin", "metrics"] as const,
    documents: (filters?: DocFilters) => ["admin", "documents", filters ?? {}] as const,
    registry: (status?: string) => ["admin", "registry", status ?? "all"] as const,
    config: () => ["admin", "config"] as const,
    gaps: (days: number) => ["admin", "gaps", days] as const,
    auditTrail: (filters?: AuditFilters) => ["admin", "audit", filters ?? {}] as const,
    reviewQueue: (status: string) => ["admin", "review", status] as const,
    tickets: (status?: string) => ["admin", "tickets", status ?? "all"] as const,
    systemHealth: () => ["admin", "health"] as const,
    analytics: (range: string) => ["admin", "analytics", range] as const,
    pipelineHealth: () => ["quick-entry", "health"] as const,
    inferenceHealth: () => ["admin", "inference-health"] as const,
    attentionEntries: () => ["admin", "knowledge-entries", "attention"] as const,
  },

  // ── User preferences ──
  preferences: {
    all: () => ["preferences"] as const,
  },

  // ── Quick Entry (admin) ──
  quickEntry: {
    all: () => ["quick-entry"] as const,
    lists: () => ["quick-entry", "list"] as const,
    list: (params: QuickEntryListParams) => ["quick-entry", "list", params] as const,
    detail: (id: string) => ["quick-entry", "detail", id] as const,
    versions: (id: string) => ["quick-entry", "versions", id] as const,
    feedback: (id: string) => ["quick-entry", "feedback", id] as const,
    coverage: (query: string, module: string) => ["quick-entry", "coverage", query, module] as const,
  },
} as const
