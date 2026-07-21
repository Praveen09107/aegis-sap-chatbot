"use client"

import { useState } from "react"
import { Download, Archive } from "lucide-react"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { AdminStatRow } from "@/components/admin/AdminStatRow"
import { UploadDropZone } from "@/components/admin/UploadDropZone"
import { DocumentMetadataModal } from "@/components/admin/DocumentMetadataModal"
import { IngestionProgressRow } from "@/components/admin/IngestionProgressRow"
import { DataTable, type AegisColumnDef, type SortState } from "@/components/admin/DataTable"
import { BulkActionBar } from "@/components/admin/BulkActionBar"
import { FilterChips, type FilterChip } from "@/components/admin/FilterChips"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { useAdminDocuments, useDeprecateDocument, useBulkDeprecateDocuments, useUploadDocument } from "@/hooks/queries"
import { useAdminStore } from "@/stores/adminStore"
import { exportToCSV } from "@/lib/csvExport"
import type { DocumentRecord } from "@/types"

// ── Status badge mapping ──────────────────────────────────────

const STATUS_VARIANT: Record<DocumentRecord["status"], "active" | "processing" | "failed" | "deprecated"> = {
  active: "active",
  processing: "processing",
  failed: "failed",
  deprecated: "deprecated",
}

// ── Column definitions ────────────────────────────────────────

const columns: AegisColumnDef<DocumentRecord>[] = [
  {
    id: "document_id",
    header: "Document ID",
    cell: (row) => <span className="font-mono text-xs text-text-primary">{row.document_id}</span>,
    sortable: true,
    width: "130px",
  },
  {
    id: "module",
    header: "Module",
    cell: (row) => (
      <span className="text-xs font-semibold text-text-secondary bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5">{row.module}</span>
    ),
    width: "80px",
  },
  {
    id: "content_type",
    header: "Type",
    cell: (row) => <span className="text-xs text-text-tertiary capitalize">{row.content_type.replace("_", " ")}</span>,
    width: "100px",
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <Badge variant={STATUS_VARIANT[row.status]} dot>
        {row.status}
      </Badge>
    ),
    sortable: true,
    width: "110px",
  },
  {
    id: "chunk_count",
    header: "Chunks",
    cell: (row) => <span className="text-xs tabular-nums text-text-secondary">{row.chunk_count}</span>,
    sortable: true,
    width: "70px",
    align: "right",
  },
  {
    id: "last_verified_date",
    header: "Last verified",
    cell: (row) => (
      <div className="space-y-0.5">
        <p className="text-xs text-text-secondary">{row.last_verified_date}</p>
        {/* verified_by is confirmed absent from the real GET /admin/documents
            response (types/index.ts's own doc comment) — fall back rather
            than rendering the literal word "undefined". */}
        <p className="text-xs text-text-tertiary">{row.verified_by ?? "—"}</p>
      </div>
    ),
    sortable: true,
    width: "140px",
  },
  {
    id: "actions",
    header: "",
    cell: (row) =>
      row.status !== "deprecated" ? (
        <DeprecateAction documentId={row.document_id} />
      ) : null,
    width: "50px",
    align: "right",
  },
]

// ── Single-row deprecate action (isolated so its own mutation/hook use
// doesn't force every row to re-render on every other row's mutation state) ──

function DeprecateAction({ documentId }: { documentId: string }) {
  const deprecate = useDeprecateDocument()
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Deprecate ${documentId}`}>
          <Archive className="w-3.5 h-3.5 text-text-tertiary" />
        </Button>
      }
      title={`Deprecate ${documentId}?`}
      description="This document will be removed from AI responses. This cannot be undone. You can upload an updated version separately."
      confirmLabel="Deprecate"
      variant="destructive"
      onConfirm={() => deprecate.mutateAsync(documentId)}
    />
  )
}

// ── Page component ────────────────────────────────────────────

export default function AdminDocumentsPage() {
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [metaModalOpen, setMetaModalOpen] = useState(false)
  const [sortState, setSortState] = useState<SortState | null>(null)

  const documentFilters = useAdminStore((s) => s.documentFilters)
  const setDocumentFilters = useAdminStore((s) => s.setDocumentFilters)
  const resetDocumentFilters = useAdminStore((s) => s.resetDocumentFilters)
  const selectedDocumentIds = useAdminStore((s) => s.selectedDocumentIds)
  const setSelectedDocumentIds = useAdminStore((s) => s.setSelectedDocumentIds)
  const clearDocumentSelection = useAdminStore((s) => s.clearDocumentSelection)
  const uploadProgress = useAdminStore((s) => s.uploadProgress)

  const { data: documents = [], isLoading } = useAdminDocuments(documentFilters)
  const bulkDeprecate = useBulkDeprecateDocuments()
  const uploadDocument = useUploadDocument()

  // ── Computed stats ────────────────────────────────────────

  const stats = {
    active: documents.filter((d) => d.status === "active").length,
    processing: documents.filter((d) => d.status === "processing").length,
    deprecated: documents.filter((d) => d.status === "deprecated").length,
    failed: documents.filter((d) => d.status === "failed").length,
  }

  // ── Handlers ──────────────────────────────────────────────

  function handleFileReady(file: File) {
    setPendingFile(file)
    setMetaModalOpen(true)
  }

  async function handleUpload(file: File, moduleValue: string, contentType: string) {
    await uploadDocument.mutateAsync({ file, metadata: { module: moduleValue, content_type: contentType } })
    setPendingFile(null)
  }

  // ── Active filter chips ───────────────────────────────────

  const activeChips: FilterChip[] = [
    ...(documentFilters.module ? [{ id: "module", label: "Module", value: documentFilters.module }] : []),
    ...(documentFilters.status ? [{ id: "status", label: "Status", value: documentFilters.status }] : []),
    ...(documentFilters.content_type ? [{ id: "content_type", label: "Type", value: documentFilters.content_type }] : []),
  ]

  function removeFilter(id: string) {
    setDocumentFilters({ [id]: undefined })
  }

  // ── CSV export ────────────────────────────────────────────

  const selectedRows = documents.filter((d) => selectedDocumentIds.has(d.document_id))

  function handleExport() {
    exportToCSV({
      filename: "aegis-documents",
      columns: [
        { header: "Document ID", accessor: (d: DocumentRecord) => d.document_id },
        { header: "Module", accessor: (d: DocumentRecord) => d.module },
        { header: "Content type", accessor: (d: DocumentRecord) => d.content_type },
        { header: "Status", accessor: (d: DocumentRecord) => d.status },
        { header: "Chunks", accessor: (d: DocumentRecord) => d.chunk_count },
        { header: "Last verified", accessor: (d: DocumentRecord) => d.last_verified_date },
        { header: "Verified by", accessor: (d: DocumentRecord) => d.verified_by ?? "" },
      ],
      data: selectedRows.length > 0 ? selectedRows : documents,
    })
  }

  return (
    <AdminPageWrapper>
      <AdminPageHeader
        title="Documents"
        description="SAP knowledge base documents"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export CSV
          </Button>
        }
        leftSlot={
          <AdminStatRow
            stats={[
              { label: "Active", value: stats.active, color: "green" },
              { label: "Processing", value: stats.processing, color: "info" },
              { label: "Deprecated", value: stats.deprecated },
              ...(stats.failed > 0 ? [{ label: "Failed", value: stats.failed, color: "red" as const }] : []),
            ]}
            isLoading={isLoading}
          />
        }
      />

      {/* Upload zone */}
      <UploadDropZone onFileReady={handleFileReady} uploading={uploadDocument.isPending} className="mb-4" />

      {/* Active ingestion rows */}
      {Object.entries(uploadProgress).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(uploadProgress).map(([filename, progress]) => (
            <IngestionProgressRow key={filename} filename={filename} fileSize={pendingFile?.size ?? 0} progress={progress} />
          ))}
        </div>
      )}

      {/* Filter chips */}
      {activeChips.length > 0 && <FilterChips chips={activeChips} onRemove={removeFilter} onClearAll={resetDocumentFilters} className="mb-3" />}

      {/* Documents table */}
      <ErrorBoundary section="documents table">
        <DataTable
          data={documents}
          columns={columns}
          keyField="document_id"
          isLoading={isLoading}
          emptyTitle="No documents uploaded yet"
          emptyDescription="Upload SAP documentation to start training the knowledge base. Accepted: PDF, max 50MB."
          selectable
          selectedKeys={selectedDocumentIds}
          onSelectionChange={setSelectedDocumentIds}
          sortState={sortState}
          onSortChange={setSortState}
          aria-label="Documents management table"
        />
      </ErrorBoundary>

      {/* Bulk actions */}
      <BulkActionBar
        selectedCount={selectedDocumentIds.size}
        onClearSelection={clearDocumentSelection}
        actions={[
          {
            label: "Deprecate selected",
            icon: <Archive className="w-3.5 h-3.5" />,
            variant: "destructive",
            loading: bulkDeprecate.isPending,
            onClick: () => {
              const activeIds = Array.from(selectedDocumentIds).filter((id) => documents.find((d) => d.document_id === id)?.status === "active")
              if (activeIds.length === 0) return
              bulkDeprecate.mutate(activeIds)
              clearDocumentSelection()
            },
          },
          {
            label: "Export CSV",
            icon: <Download className="w-3.5 h-3.5" />,
            onClick: handleExport,
          },
        ]}
      />

      {/* Metadata modal */}
      <DocumentMetadataModal file={pendingFile} open={metaModalOpen} onOpenChange={setMetaModalOpen} onUpload={handleUpload} uploading={uploadDocument.isPending} />
    </AdminPageWrapper>
  )
}
