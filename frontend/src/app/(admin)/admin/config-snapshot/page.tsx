"use client"

import { useState, useMemo } from "react"
import { RefreshCw } from "lucide-react"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { InlineEditCell } from "@/components/admin/InlineEditCell"
import { StalenessIndicator } from "@/components/admin/StalenessIndicator"
import { DataTable, type AegisColumnDef } from "@/components/admin/DataTable"
import { FilterChips, type FilterChip } from "@/components/admin/FilterChips"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { Badge } from "@/components/ui/badge"
import { useConfigSnapshot, useUpdateConfig, type ConfigEntry } from "@/hooks/queries"
import { cn } from "@/lib/utils"

// Composite row key — confirmed (2026-07-21) the real update route addresses
// rows by the (category, key) pair (PUT /admin/config-snapshot/{category}/{key}),
// so config_key alone isn't guaranteed unique across categories.
interface ConfigRow extends ConfigEntry {
  _rowKey: string
}

export default function AdminConfigSnapshotPage() {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [showStaleOnly, setShowStaleOnly] = useState(false)

  const { data: allConfig = [], isLoading } = useConfigSnapshot()
  const updateConfig = useUpdateConfig()

  const rows: ConfigRow[] = useMemo(
    () => allConfig.map((c) => ({ ...c, _rowKey: `${c.config_category}:${c.config_key}` })),
    [allConfig]
  )

  // ── Derived: unique categories ─────────────────────────────

  const categories = useMemo(() => Array.from(new Set(rows.map((c) => c.config_category))).sort(), [rows])

  // ── Filtered entries ──────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...rows]
    if (categoryFilter) result = result.filter((c) => c.config_category === categoryFilter)
    if (showStaleOnly) result = result.filter((c) => c.staleness !== "fresh")
    return result
  }, [rows, categoryFilter, showStaleOnly])

  // ── Stats ─────────────────────────────────────────────────

  const staleCount = rows.filter((c) => c.staleness !== "fresh").length

  // ── Column definitions ────────────────────────────────────

  const columns: AegisColumnDef<ConfigRow>[] = [
    {
      id: "config_category",
      header: "Category",
      cell: (row) => (
        <span className="text-xs font-semibold text-text-secondary bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5">
          {row.config_category}
        </span>
      ),
      width: "100px",
      sortable: true,
    },
    {
      id: "config_key",
      header: "Key",
      cell: (row) => <span className="text-sm font-mono text-text-primary">{row.config_key}</span>,
      width: "180px",
      sortable: true,
    },
    {
      id: "config_value",
      header: "Current value",
      cell: (row) => (
        <InlineEditCell
          value={row.config_value}
          onSave={(newValue) => updateConfig.mutateAsync({ category: row.config_category, key: row.config_key, value: newValue })}
        />
      ),
    },
    {
      id: "staleness",
      header: "Freshness",
      cell: (row) => <StalenessIndicator verifiedDate={row.last_updated_at} daysSince={row.age_days} staleness={row.staleness} />,
      width: "80px",
    },
    {
      id: "last_updated_at",
      header: "Last verified",
      cell: (row) => (
        <div className="space-y-0.5">
          <p className="text-xs text-text-secondary">{row.last_updated_at}</p>
          <p className="text-xs text-text-tertiary">{row.updated_by}</p>
        </div>
      ),
      width: "140px",
      sortable: true,
    },
  ]

  // ── Filter chips ─────────────────────────────────────────

  const chips: FilterChip[] = [
    ...(categoryFilter ? [{ id: "category", label: "Category", value: categoryFilter }] : []),
    ...(showStaleOnly ? [{ id: "stale", label: "Filter", value: "Stale only" }] : []),
  ]

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Config snapshot"
        description="SAP configuration values — click any value to edit"
        actions={
          staleCount > 0 ? (
            <Badge variant="warning" dot>
              {staleCount} stale value{staleCount > 1 ? "s" : ""}
            </Badge>
          ) : (
            <Badge variant="success" dot>
              All values fresh
            </Badge>
          )
        }
      />

      {/* Category filter row */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button
          onClick={() => {
            setCategoryFilter(null)
            setShowStaleOnly(false)
          }}
          className={cn(
            "text-xs font-medium px-3 h-8 rounded-lg border transition-colors",
            !categoryFilter && !showStaleOnly
              ? "bg-accent-subtle border-border-focus text-accent-text"
              : "bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary"
          )}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              "text-xs font-medium px-3 h-8 rounded-lg border transition-colors",
              categoryFilter === cat
                ? "bg-accent-subtle border-border-focus text-accent-text"
                : "bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary"
            )}
          >
            {cat}
          </button>
        ))}
        {staleCount > 0 && (
          <button
            onClick={() => setShowStaleOnly((v) => !v)}
            className={cn(
              "text-xs font-medium px-3 h-8 rounded-lg border transition-colors ml-1",
              showStaleOnly ? "bg-warning-bg border-warning-border text-warning-text" : "bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary"
            )}
          >
            Stale only ({staleCount})
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <FilterChips
          chips={chips}
          onRemove={(id) => {
            if (id === "category") setCategoryFilter(null)
            if (id === "stale") setShowStaleOnly(false)
          }}
          className="mb-3"
        />
      )}

      {/* Config table */}
      <ErrorBoundary section="config snapshot table">
        <DataTable
          data={filtered}
          columns={columns}
          keyField="_rowKey"
          isLoading={isLoading}
          emptyTitle="No configuration entries"
          emptyDescription="Config entries are populated when SAP documentation is ingested."
          aria-label="Configuration snapshot table"
        />
      </ErrorBoundary>

      {/* Usage tip */}
      <p className="text-xs text-text-tertiary mt-4 flex items-center gap-1.5">
        <RefreshCw className="w-3 h-3 shrink-0" aria-hidden="true" />
        Click any value in the Current value column to edit it inline. Changes are saved immediately per row.
      </p>
    </AdminPageWrapper>
  )
}
