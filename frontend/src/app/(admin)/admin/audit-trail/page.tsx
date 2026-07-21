"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Download, List, Table2, ClipboardList } from "lucide-react"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { AuditTimeline } from "@/components/admin/AuditTimeline"
import { DataTable, type AegisColumnDef } from "@/components/admin/DataTable"
import { EmptyState } from "@/components/admin/EmptyState"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAdminAuditTrail } from "@/hooks/queries"
import { useAdminStore } from "@/stores/adminStore"
import { formatDateLocalized, formatScore } from "@/lib/utils"
import { exportToCSV } from "@/lib/csvExport"
import type { AuditEntry } from "@/hooks/queries/adminData"
import type { ConfidenceBadge } from "@/types"

type ViewMode = "timeline" | "table"

// Real /admin/audit-trail only takes a single relative `days` window (no
// date_from/date_to) — confirmed 2026-07-22 against admin_handler.py.
const DATE_RANGES = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
]

const BADGE_OPTIONS: { label: string; value: string }[] = [
  { label: "All confidence", value: "" },
  { label: "Green", value: "green" },
  { label: "Amber", value: "amber" },
  { label: "None", value: "none" },
]

// request_type has no server-side filter param — filtered client-side on
// whichever page is currently loaded (see useAdminAuditTrail's doc comment).
const REQUEST_TYPE_OPTIONS: { label: string; value: AuditEntry["request_type"] | "" }[] = [
  { label: "All types", value: "" },
  { label: "Chat", value: "chat" },
  { label: "Upload", value: "upload" },
  { label: "Admin", value: "admin" },
]

const CONFIDENCE_VARIANT: Record<string, "success" | "warning" | "default"> = {
  green: "success",
  amber: "warning",
  none: "default",
}

const PAGE_SIZE = 50

export default function AuditTrailPage() {
  const { auditFilters, setAuditFilters } = useAdminStore()
  const [viewMode, setViewMode] = useState<ViewMode>("timeline")
  const [requestType, setRequestType] = useState<AuditEntry["request_type"] | "">("")
  const [page, setPage] = useState(1)

  const days = auditFilters.days ?? 7

  const { data, isLoading } = useAdminAuditTrail({
    days,
    confidence_badge: auditFilters.confidence_badge ?? undefined,
    page,
    page_size: PAGE_SIZE,
  })

  const total = data?.total ?? 0

  const filteredEntries = useMemo(() => {
    const entries = data?.entries ?? []
    return requestType ? entries.filter((e) => e.request_type === requestType) : entries
  }, [data, requestType])

  const columns: AegisColumnDef<AuditEntry>[] = [
    {
      id: "occurred_at",
      header: "Time",
      cell: (row) => <span className="tabular-nums text-xs">{formatDateLocalized(row.occurred_at)}</span>,
      sortable: true,
      width: "180px",
    },
    {
      id: "session_id",
      header: "Session",
      cell: (row) => (
        <Link href={`/?session=${row.session_id}`} className="font-mono text-xs text-accent hover:underline">
          {row.session_id}
        </Link>
      ),
    },
    {
      id: "request_type",
      header: "Type",
      cell: (row) => <span className="capitalize text-xs">{row.request_type}</span>,
    },
    {
      id: "confidence_badge",
      header: "Confidence",
      cell: (row) => (
        <Badge variant={CONFIDENCE_VARIANT[row.confidence_badge ?? "none"]} dot>
          {row.confidence_badge ?? "none"}
        </Badge>
      ),
    },
    {
      id: "validation_score",
      header: "Validation",
      cell: (row) => <span className="tabular-nums text-xs">{row.validation_score !== null ? formatScore(row.validation_score) : "—"}</span>,
      align: "right",
    },
    {
      id: "model_tier",
      header: "Tier",
      cell: (row) => <span className="tabular-nums text-xs">{row.model_tier ?? "—"}</span>,
      align: "center",
    },
    {
      id: "feedback_signal",
      header: "Feedback",
      cell: (row) => <span className="text-xs capitalize">{row.feedback_signal}</span>,
    },
  ]

  function handleExport() {
    exportToCSV({
      filename: "audit-trail",
      columns: [
        { header: "Time", accessor: (row: AuditEntry) => formatDateLocalized(row.occurred_at) },
        { header: "Session", accessor: (row: AuditEntry) => row.session_id },
        { header: "Type", accessor: (row: AuditEntry) => row.request_type },
        { header: "Confidence", accessor: (row: AuditEntry) => row.confidence_badge ?? "none" },
        { header: "Validation score", accessor: (row: AuditEntry) => (row.validation_score !== null ? formatScore(row.validation_score) : "") },
        { header: "Model tier", accessor: (row: AuditEntry) => row.model_tier ?? "" },
        { header: "Feedback", accessor: (row: AuditEntry) => row.feedback_signal },
      ],
      data: filteredEntries,
    })
  }

  return (
    <AdminPageWrapper width="wide">
      <AdminPageHeader
        title="Audit trail"
        description="Every AI response, logged for confidence and governance review"
        actions={
          <>
            <div className="flex items-center rounded-lg border border-border-primary overflow-hidden">
              <button
                onClick={() => setViewMode("timeline")}
                className={cnMode(viewMode === "timeline")}
                aria-pressed={viewMode === "timeline"}
              >
                <List className="w-3.5 h-3.5" aria-hidden="true" />
                Timeline
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={cnMode(viewMode === "table")}
                aria-pressed={viewMode === "table"}
              >
                <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                Table
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export CSV
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {DATE_RANGES.map((range) => (
          <Button
            key={range.days}
            variant={days === range.days ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setAuditFilters({ days: range.days })
              setPage(1)
            }}
          >
            {range.label}
          </Button>
        ))}

        <select
          value={auditFilters.confidence_badge ?? ""}
          onChange={(e) => {
            const value = e.target.value
            setAuditFilters({ confidence_badge: value === "" ? undefined : (value as ConfidenceBadge) })
            setPage(1)
          }}
          className="h-8 rounded-lg border border-border-primary bg-bg-secondary px-2.5 text-xs text-text-primary"
          aria-label="Filter by confidence badge"
        >
          {BADGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={requestType}
          onChange={(e) => setRequestType(e.target.value as AuditEntry["request_type"] | "")}
          className="h-8 rounded-lg border border-border-primary bg-bg-secondary px-2.5 text-xs text-text-primary"
          aria-label="Filter by request type"
        >
          {REQUEST_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {!isLoading && filteredEntries.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit entries found"
          description="No responses were logged for the selected time range and filters."
          variant="page"
        />
      ) : viewMode === "timeline" ? (
        <AuditTimeline entries={filteredEntries} />
      ) : (
        <DataTable
          data={filteredEntries}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          aria-label="Audit trail"
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
        />
      )}
    </AdminPageWrapper>
  )
}

function cnMode(active: boolean): string {
  return [
    "flex items-center gap-1.5 px-3 h-8 text-xs font-medium transition-colors",
    active ? "bg-bg-secondary text-text-primary" : "text-text-tertiary hover:text-text-secondary",
  ].join(" ")
}
