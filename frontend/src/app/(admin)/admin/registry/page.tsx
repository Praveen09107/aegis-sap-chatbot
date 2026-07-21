"use client"

import { useState, useMemo } from "react"
import { CheckCircle, XCircle } from "lucide-react"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { AdminStatRow } from "@/components/admin/AdminStatRow"
import { DataTable, type AegisColumnDef } from "@/components/admin/DataTable"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { useAdminRegistry, useApproveRegistry, useRejectRegistry, type RegistryEntry } from "@/hooks/queries"
import { useAdminStore } from "@/stores/adminStore"
import { cn, formatDateLocalized } from "@/lib/utils"

// ── Badge variant mapping ─────────────────────────────────────
//
// Real status enum (confirmed 2026-07-21): 'draft' | 'approved' |
// 'deprecated'. 'rejected' is the disclosed, not-yet-real target value for
// the Reject action (see useRejectRegistry's own doc comment) — it will
// never actually appear in real data today, but the type/badge/filter
// mapping stays ready for when a backend session adds it.
type NonPendingStatus = Exclude<RegistryEntry["status"], "draft">

const STATUS_VARIANT: Record<NonPendingStatus, "active" | "deprecated" | "failed"> = {
  approved: "active",
  deprecated: "deprecated",
  rejected: "failed",
}

const STATUS_FILTERS: { label: string; value: NonPendingStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Approved", value: "approved" },
  { label: "Deprecated", value: "deprecated" },
  { label: "Rejected", value: "rejected" },
]

// ── Columns for the non-pending entries table ─────────────────

const nonPendingColumns: AegisColumnDef<RegistryEntry>[] = [
  {
    id: "pattern_string",
    header: "Pattern",
    cell: (row) => <p className="text-sm text-text-primary line-clamp-2 leading-snug max-w-lg">{row.pattern_string}</p>,
    sortable: false,
  },
  {
    id: "linked_document_id",
    header: "Document",
    cell: (row) => <span className="font-mono text-xs text-text-secondary">{row.linked_document_id}</span>,
    width: "120px",
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => <Badge variant={STATUS_VARIANT[row.status as NonPendingStatus]}>{row.status}</Badge>,
    width: "90px",
  },
  {
    id: "approved_by",
    header: "Approved by",
    cell: (row) => <span className="text-xs text-text-tertiary">{row.approved_by ?? "—"}</span>,
    width: "120px",
  },
]

export default function AdminRegistryPage() {
  const [statusFilter, setStatusFilter] = useState<NonPendingStatus | "">("")
  const search = useAdminStore((s) => s.registrySearch)
  const setRegistrySearch = useAdminStore((s) => s.setRegistrySearch)

  const { data: allEntries = [], isLoading } = useAdminRegistry()
  const approve = useApproveRegistry()
  const reject = useRejectRegistry()

  const pending = useMemo(() => allEntries.filter((e) => e.status === "draft"), [allEntries])

  const nonPending = useMemo(() => {
    let entries = allEntries.filter((e) => e.status !== "draft")
    if (statusFilter) entries = entries.filter((e) => e.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      entries = entries.filter((e) => e.pattern_string.toLowerCase().includes(q) || e.linked_document_id.toLowerCase().includes(q))
    }
    return entries
  }, [allEntries, statusFilter, search])

  const stats = {
    pending: pending.length,
    approved: allEntries.filter((e) => e.status === "approved").length,
    deprecated: allEntries.filter((e) => e.status === "deprecated").length,
    rejected: allEntries.filter((e) => e.status === "rejected").length,
  }

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Registry"
        description="Known error pattern entries"
        leftSlot={
          <AdminStatRow
            stats={[
              { label: "Pending review", value: stats.pending, color: stats.pending > 0 ? "amber" : "green" },
              { label: "Approved", value: stats.approved, color: "green" },
              { label: "Deprecated", value: stats.deprecated },
              { label: "Rejected", value: stats.rejected },
            ]}
            isLoading={isLoading}
          />
        }
      />

      {/* ── Pending entries ── */}
      {pending.length > 0 && (
        <ErrorBoundary section="pending entries">
          <div className="mb-6">
            <p className="section-label mb-3 flex items-center gap-2">
              Pending review
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-warning-bg border border-warning-border text-warning-text text-[10px] font-bold">
                {pending.length}
              </span>
            </p>

            <div className="space-y-2">
              {pending.map((entry) => (
                <PendingEntryCard
                  key={entry.id}
                  entry={entry}
                  onApprove={() => approve.mutate(entry.id)}
                  onReject={() => reject.mutate(entry.id)}
                  approving={approve.isPending}
                  rejecting={reject.isPending}
                />
              ))}
            </div>
          </div>
        </ErrorBoundary>
      )}

      {/* ── Filter + search ── */}
      <div className="flex items-center gap-3 mb-3">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value || "all"}
            onClick={() => setStatusFilter(value)}
            className={cn(
              "text-xs font-medium px-3 h-8 rounded-lg border transition-colors",
              statusFilter === value
                ? "bg-accent-subtle border-border-focus text-accent-text"
                : "bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary"
            )}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setRegistrySearch(e.target.value)}
          placeholder="Search patterns..."
          aria-label="Search registry patterns"
          className="ml-auto h-8 px-3 rounded-lg bg-bg-secondary border border-border-primary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus w-64"
        />
      </div>

      {/* ── Non-pending table ── */}
      <ErrorBoundary section="registry table">
        <DataTable
          data={nonPending}
          columns={nonPendingColumns}
          keyField="id"
          isLoading={isLoading}
          emptyTitle="No registry entries"
          emptyDescription="Registry entries are generated automatically when documents are ingested."
          aria-label="Registry entries table"
        />
      </ErrorBoundary>
    </AdminPageWrapper>
  )
}

// ── PendingEntryCard ──────────────────────────────────────────

interface PendingEntryCardProps {
  entry: RegistryEntry
  onApprove: () => void
  onReject: () => void
  approving: boolean
  rejecting: boolean
}

function PendingEntryCard({ entry, onApprove, onReject, approving, rejecting }: PendingEntryCardProps) {
  return (
    <div className="surface-card p-4 flex items-start gap-4">
      {/* Pattern text */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm text-text-primary leading-snug line-clamp-3">{entry.pattern_string}</p>
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span className="font-mono">{entry.linked_document_id}</span>
          <span>·</span>
          <span>{formatDateLocalized(entry.created_at)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="success" onClick={onApprove} loading={approving} className="gap-1.5">
          <CheckCircle className="w-3.5 h-3.5" />
          Approve
        </Button>

        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5 border-danger-border/50 text-danger-text hover:bg-danger-bg" disabled={rejecting}>
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </Button>
          }
          title="Reject this pattern?"
          description="This pattern will be rejected and not used in AI responses. You can review it again later."
          confirmLabel="Reject"
          variant="destructive"
          onConfirm={onReject}
        />
      </div>
    </div>
  )
}
