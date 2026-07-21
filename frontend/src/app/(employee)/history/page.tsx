"use client"

import { useState, useMemo, useCallback } from "react"
import { Download, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SessionSearch } from "@/components/sessions/SessionSearch"
import { HistoryFilters, DEFAULT_FILTERS, type HistoryFilterState } from "@/components/sessions/HistoryFilters"
import { HistorySessionCard } from "@/components/sessions/HistorySessionCard"
import { EmptyState } from "@/components/admin/EmptyState"
import { Spinner } from "@/components/ui/spinner"
import { useSessions } from "@/hooks/queries"
import { useDebounce } from "@/hooks/useDebounce"
import { useSessionStore } from "@/stores/sessionStore"
import { exportToCSV } from "@/lib/csvExport"
import { toLocalizedDateString, startOfTodayLocalized, formatDateLocalized } from "@/lib/utils"
import type { Session, SessionFilters } from "@/types"

const PAGE_SIZE = 50

/**
 * Session history page — /history
 *
 * Shows all historical sessions for the current user with:
 * - Full-text search (via the shared SessionSearch component / sessionStore.searchQuery)
 * - Filter by module, badge, date range, unresolved status
 * - Sort by date, confidence, or turn count
 * - Pagination (50 per page)
 * - CSV export of the current filtered set
 *
 * Data comes from useSessions() with filters passed to the API. Client-side
 * sorting and pagination applied after fetch.
 *
 * Search is deliberately NOT part of HistoryFilterState — SessionSearch (F09)
 * reads/writes sessionStore.searchQuery directly rather than taking a
 * value/onChange prop pair, so this page reads that same store field instead
 * of threading a parallel, never-populated `search` filter field.
 */
export default function HistoryPage() {
  const [localFilters, setLocalFilters] = useState<HistoryFilterState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)

  const searchQuery = useSessionStore((s) => s.searchQuery)
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Build API filter params
  const apiFilters: SessionFilters = useMemo(() => {
    const filters: SessionFilters = {}
    if (debouncedSearch) filters.search = debouncedSearch
    if (localFilters.module) filters.module = localFilters.module
    if (localFilters.badge) filters.confidence_badge = localFilters.badge
    if (localFilters.unresolvedOnly) filters.is_unresolved = true

    // Date range → date_from, in the deployment's configured timezone
    if (localFilters.dateRange !== "all") {
      if (localFilters.dateRange === "today") {
        filters.date_from = toLocalizedDateString(startOfTodayLocalized())
      } else {
        const days: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 }
        const d = new Date()
        d.setDate(d.getDate() - (days[localFilters.dateRange] ?? 0))
        filters.date_from = toLocalizedDateString(d)
      }
    }

    return filters
  }, [debouncedSearch, localFilters])

  const { data: allSessions = [], isLoading, isFetching } = useSessions(apiFilters)

  // Client-side sort
  const sorted = useMemo(() => {
    const copy = [...allSessions]
    switch (localFilters.sortBy) {
      case "confidence":
        return copy.sort((a, b) => (b.avg_confidence_score ?? 0) - (a.avg_confidence_score ?? 0))
      case "turns":
        return copy.sort((a, b) => b.turn_count - a.turn_count)
      case "date":
      default:
        return copy.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    }
  }, [allSessions, localFilters.sortBy])

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFilterChange = useCallback((changes: Partial<HistoryFilterState>) => {
    setLocalFilters((prev) => ({ ...prev, ...changes }))
    setPage(1) // Reset to page 1 on filter change
  }, [])

  const handleClearAll = useCallback(() => {
    setLocalFilters(DEFAULT_FILTERS)
    setPage(1)
    useSessionStore.getState().setSearchQuery("")
  }, [])

  // CSV export
  function handleExport() {
    exportToCSV({
      filename: "aegis-session-history",
      columns: [
        { header: "Topic", accessor: (s: Session) => s.topic_summary },
        { header: "Date", accessor: (s: Session) => formatDateLocalized(s.updated_at) },
        { header: "Turns", accessor: (s: Session) => s.turn_count },
        { header: "Avg confidence", accessor: (s: Session) => s.avg_confidence_score?.toFixed(2) ?? "" },
        { header: "Badge", accessor: (s: Session) => s.confidence_badge ?? "none" },
        { header: "Modules", accessor: (s: Session) => s.module_tags.join(", ") },
        { header: "Unresolved", accessor: (s: Session) => (s.is_unresolved ? "Yes" : "No") },
      ],
      data: sorted,
    })
  }

  const hasSearchOrModuleFilter = Boolean(debouncedSearch || localFilters.module)

  return (
    <div className="max-w-3xl mx-auto px-5 py-6 space-y-5 overflow-y-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <History className="w-5 h-5 text-text-secondary" aria-hidden="true" />
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Session history</h1>
          {isFetching && !isLoading && <Spinner size="xs" className="ml-2" label="Refreshing..." />}
        </div>

        <Button variant="outline" size="sm" onClick={handleExport} disabled={sorted.length === 0}>
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      {/* Search */}
      <SessionSearch placeholder="Search by topic, error code, or SAP module..." autoFocus={false} />

      {/* Filters */}
      <HistoryFilters
        filters={localFilters}
        onChange={handleFilterChange}
        onClearAll={handleClearAll}
        totalResults={sorted.length}
        isLoading={isLoading}
      />

      {/* Session list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="surface-card p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-bg-tertiary rounded w-3/4" />
              <div className="h-3 bg-bg-tertiary rounded w-full" />
              <div className="flex gap-4">
                <div className="h-3 bg-bg-tertiary rounded w-16" />
                <div className="h-3 bg-bg-tertiary rounded w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <EmptyState
          icon={History}
          title="No sessions found"
          description={
            hasSearchOrModuleFilter
              ? "Try adjusting your search or filters."
              : "You haven't started any sessions yet. Go to the chat to begin."
          }
          action={
            hasSearchOrModuleFilter ? (
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Clear filters
              </Button>
            ) : undefined
          }
          variant="page"
        />
      ) : (
        <div className="space-y-3" role="list" aria-label="Session history">
          {paginated.map((session, i) => (
            <HistorySessionCard key={session.id} session={session} index={i} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-text-tertiary tabular-nums">
            Showing{" "}
            <span className="font-medium text-text-secondary">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)}
            </span>{" "}
            of <span className="font-medium text-text-secondary">{sorted.length}</span>
          </p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              ← Previous
            </Button>
            <span className="text-xs text-text-secondary tabular-nums px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
