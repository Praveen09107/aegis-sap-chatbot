"use client"

import { useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PenLine, Plus, Search, X } from "lucide-react"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { EmptyState } from "@/components/admin/EmptyState"
import { Button } from "@/components/ui/button"
import { QuickEntryListCard, QuickEntryListSkeleton } from "@/components/admin/quick-entry/QuickEntryListCard"
import { QuickEntryFilters } from "@/components/admin/quick-entry/QuickEntryFilters"
import { CoverageSearchBar } from "@/components/admin/quick-entry/CoverageSearchBar"
import { useQuickEntryList } from "@/hooks/queries"
import { useDebounce } from "@/hooks/useDebounce"
import { useURLStateSync } from "@/hooks/useURLStateSync"

const PAGE_SIZE = 20

export default function QuickEntryListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [moduleFilter, setModuleFilter] = useState(searchParams.get("module") ?? "")
  const [typeFilter, setTypeFilter] = useState(searchParams.get("content_type") ?? "")
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "")
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [showCoverageSearch, setShowCoverageSearch] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  // Filters survive a page refresh via the URL (FRONTEND_SUPPLEMENT_02 Part 4).
  useURLStateSync({ search, module: moduleFilter, content_type: typeFilter, status: statusFilter }, (fromUrl) => {
    if (fromUrl.search !== undefined) setSearch(fromUrl.search)
    if (fromUrl.module !== undefined) setModuleFilter(fromUrl.module)
    if (fromUrl.content_type !== undefined) setTypeFilter(fromUrl.content_type)
    if (fromUrl.status !== undefined) setStatusFilter(fromUrl.status)
  })

  const { data, isLoading, isError, isFetching } = useQuickEntryList({
    search: debouncedSearch || undefined,
    module: moduleFilter || undefined,
    content_type: typeFilter || undefined,
    status: statusFilter || undefined,
    include_archived: includeArchived,
    page,
    page_size: PAGE_SIZE,
  })

  // Resets to page 1 whenever the filters actually change — a guarded
  // render-time adjustment (React's own documented pattern for "resetting
  // state when a dependency changes") rather than an effect, since there's
  // no external system involved in this reset.
  const filtersKey = `${debouncedSearch}|${moduleFilter}|${typeFilter}|${statusFilter}`
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey)
    setPage(1)
  }

  const handleNewEntry = useCallback(() => {
    if (showCoverageSearch) {
      document.getElementById("coverage-search")?.scrollIntoView({ behavior: "smooth" })
    } else {
      router.push("/admin/quick-entry/new")
    }
  }, [showCoverageSearch, router])

  const hasActiveFilters = Boolean(debouncedSearch || moduleFilter || typeFilter || statusFilter || includeArchived)

  function clearFilters() {
    setSearch("")
    setModuleFilter("")
    setTypeFilter("")
    setStatusFilter("")
    setIncludeArchived(false)
  }

  return (
    <AdminPageWrapper width="wide">
      <AdminPageHeader
        title="Quick Entry"
        description="Structured knowledge entries — no document required"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowCoverageSearch((v) => !v)} aria-expanded={showCoverageSearch}>
              <Search className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Check coverage first
            </Button>
            <Button variant="default" size="sm" onClick={handleNewEntry}>
              <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              New Entry
            </Button>
          </>
        }
      />

      {showCoverageSearch && (
        <div id="coverage-search" className="px-4 py-4 mb-4 rounded-xl bg-bg-secondary border border-border-primary">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-text-primary">Check existing knowledge before creating</p>
              <p className="text-xs text-text-tertiary">Searches all Quick Entries and uploaded documents</p>
            </div>
            <button onClick={() => setShowCoverageSearch(false)} className="text-text-tertiary hover:text-text-primary" aria-label="Close coverage search">
              <X className="w-4 h-4" />
            </button>
          </div>
          <CoverageSearchBar onNavigateToNew={() => router.push("/admin/quick-entry/new")} />
        </div>
      )}

      <div className="mb-4">
        <QuickEntryFilters
          search={search}
          onSearchChange={setSearch}
          moduleFilter={moduleFilter}
          onModuleChange={setModuleFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          includeArchived={includeArchived}
          onIncludeArchivedChange={setIncludeArchived}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          resultCount={data?.total ?? null}
          isFetching={isFetching}
        />
      </div>

      {isLoading && <QuickEntryListSkeleton count={6} />}

      {isError && (
        <EmptyState icon={PenLine} title="Failed to load Quick Entry list" description="Please refresh the page." variant="page" />
      )}

      {!isLoading && !isError && data?.entries.length === 0 && (
        <EmptyState
          icon={hasActiveFilters ? Search : PenLine}
          title={hasActiveFilters ? "No entries match your filters" : "No Quick Entries yet"}
          description={
            hasActiveFilters
              ? undefined
              : "Quick Entry lets you add knowledge directly through a form — no document required."
          }
          variant="page"
          action={
            hasActiveFilters ? (
              <button onClick={clearFilters} className="text-xs text-accent hover:underline">
                Clear all filters
              </button>
            ) : (
              <Button variant="default" size="sm" onClick={() => router.push("/admin/quick-entry/new")}>
                <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Create your first Quick Entry
              </Button>
            )
          }
        />
      )}

      {!isLoading && !isError && data && data.entries.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.entries.map((entry) => (
            <QuickEntryListCard key={entry.id} entry={entry} onEdit={() => router.push(`/admin/quick-entry/${entry.id}`)} />
          ))}
        </div>
      )}

      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-border-primary">
          <p className="text-xs text-text-tertiary">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-text-tertiary">
              {page} / {data.total_pages}
            </span>
            <Button variant="outline" size="xs" disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </AdminPageWrapper>
  )
}
