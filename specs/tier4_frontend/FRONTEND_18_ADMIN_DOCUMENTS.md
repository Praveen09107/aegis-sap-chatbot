# FRONTEND_18: ADMIN DOCUMENTS
## Document Management — Upload, Ingestion Tracking, Table with Bulk Actions
## Session F11 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F11: Admin documents management page.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Sessions F01–F10 complete.

**What this session creates:**
```
src/app/(admin)/admin/documents/
├── page.tsx                      ← Documents management page
└── loading.tsx                   ← Skeleton loading state

src/components/admin/
├── UploadDropZone.tsx            ← Drag-drop or click-to-upload zone
├── IngestionProgressRow.tsx      ← Active upload/processing card
└── DocumentMetadataModal.tsx     ← Module + content type selection before upload
```

---

## PAGE LAYOUT

```
┌─────────────────────────────────────────────────────────────────┐
│  Documents   Manage the SAP knowledge base documents            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📄  Drag and drop a PDF here                            │  │
│  │      or  [Browse files]                                  │  │
│  │      PDF only · max 50MB                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Active ingestions:                                             │
│  [▓▓▓▓▓▓░░  68%]  SD-Error-Guide-v2.pdf   Embedding...        │
│                                                                 │
│  ┌── Module [All ▾]  Status [All ▾]  Type [All ▾]  🔍 ─────┐  │
│  │  SD-ERR-001  VL150 Error Guide  SD  active  47 chunks    │  │
│  │  FI-ERR-001  F5201 Billing Err  FI  active  38 chunks    │  │
│  │  MM-PROC-01  MB1A Procedure     MM  deprecated           │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ← Page 1/4 →                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## UPLOAD FLOW — COMPLETE SPECIFICATION

```
User interaction → Component response → State change → API call

1. File drop / browse selection
   → Validate type (PDF only) + size (≤ 50MB)
   → If invalid: toastError, clear
   → If valid: open DocumentMetadataModal

2. User fills metadata (module + content_type) and clicks "Upload"
   → DocumentMetadataModal closes
   → adminStore.setUploadProgress(filename, 0)
   → api.upload() called with XHR progress tracking
   → adminStore.setUploadProgress(filename, percent) on progress event

3. Upload completes
   → adminStore.removeUploadProgress(filename)
   → queryClient.invalidateQueries(documents)
   → Document appears in table with status: "processing"

4. Backend ingestion runs asynchronously
   → Table polls via useAdminDocuments() (staleTime: 30s)
   → Document row status changes: processing → active (or failed)

The upload progress bar (0–100%) only covers the HTTP upload.
The ingestion phase is tracked by polling the document status in the table.
Processing rows show a pulsing indicator, not a progress bar.
```

---

## FILE 1: src/components/admin/UploadDropZone.tsx (COMPLETE)

```typescript
'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'
import { LIMITS } from '@/lib/constants'
import { toastError } from '@/lib/toast'

interface UploadDropZoneProps {
  /** Called with the validated file when ready to proceed to metadata modal */
  onFileReady: (file: File) => void
  /** Whether an upload is currently in progress (disables the zone) */
  uploading?: boolean
  className?: string
}

/**
 * Document upload drop zone.
 * Accepts drag-and-drop OR file browser.
 * Validates: PDF only, max 50MB.
 * On valid file: calls onFileReady(file) — parent shows metadata modal.
 */
export function UploadDropZone({
  onFileReady,
  uploading = false,
  className,
}: UploadDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragCounter, setDragCounter] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function validateFile(file: File): string | null {
    if (file.type !== 'application/pdf') {
      return 'Only PDF files are supported'
    }
    if (file.size > LIMITS.MAX_DOCUMENT_BYTES) {
      return `File too large — maximum size is ${formatFileSize(LIMITS.MAX_DOCUMENT_BYTES)}`
    }
    return null
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragCounter((c) => c + 1)
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragCounter((c) => {
      if (c - 1 === 0) setIsDragging(false)
      return c - 1
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      setDragCounter(0)
      const file = e.dataTransfer.files[0]
      if (!file) return
      const error = validateFile(file)
      if (error) { toastError(error); return }
      onFileReady(file)
    },
    [onFileReady]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const error = validateFile(file)
      if (error) { toastError(error); return }
      onFileReady(file)
      e.target.value = ''
    },
    [onFileReady]
  )

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 border-dashed',
        'transition-all duration-[var(--duration-slow)]',
        'flex flex-col items-center justify-center gap-3',
        'py-10 px-6 text-center',
        uploading
          ? 'border-border-primary bg-bg-secondary opacity-60 pointer-events-none'
          : isDragging
          ? 'border-accent bg-accent-subtle'
          : 'border-border-secondary bg-bg-secondary hover:border-border-strong hover:bg-bg-tertiary',
        className,
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-label="Document upload zone — drag and drop or click Browse files"
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileInput}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Drag state overlay icon */}
      <AnimatePresence>
        {isDragging ? (
          <motion.div
            key="drag-icon"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-accent">Drop to upload</p>
          </motion.div>
        ) : (
          <motion.div
            key="default-icon"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="w-12 h-12 rounded-xl bg-bg-tertiary border border-border-primary flex items-center justify-center">
              <FileText className="w-6 h-6 text-text-tertiary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">
                Drag and drop a document here
              </p>
              <p className="text-xs text-text-tertiary">
                PDF only · max {formatFileSize(LIMITS.MAX_DOCUMENT_BYTES)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Browse files
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## FILE 2: src/components/admin/DocumentMetadataModal.tsx (COMPLETE)

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'
import { SAP_MODULES } from '@/lib/constants'

interface DocumentMetadataModalProps {
  file: File | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (file: File, module: string, contentType: string) => Promise<void>
  uploading?: boolean
}

const CONTENT_TYPES = [
  { value: 'error_guide', label: 'Error guide', description: 'Resolution steps for SAP error codes' },
  { value: 'procedure',   label: 'Procedure',   description: 'Step-by-step workflow instructions' },
  { value: 'config',      label: 'Configuration', description: 'SAP system configuration documentation' },
] as const

/**
 * Modal shown after file selection.
 * Collects module and content type before upload begins.
 */
export function DocumentMetadataModal({
  file,
  open,
  onOpenChange,
  onUpload,
  uploading = false,
}: DocumentMetadataModalProps) {
  const [module, setModule] = useState('')
  const [contentType, setContentType] = useState<string>('')

  const canUpload = !!module && !!contentType && !uploading

  async function handleUpload() {
    if (!file || !canUpload) return
    await onUpload(file, module, contentType)
    onOpenChange(false)
    setModule('')
    setContentType('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-card border-border-primary max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Document details</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Provide metadata before uploading this document.
          </DialogDescription>
        </DialogHeader>

        {/* File summary */}
        {file && (
          <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border-primary">
            <FileText className="w-5 h-5 text-text-secondary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
              <p className="text-xs text-text-tertiary">{formatFileSize(file.size)}</p>
            </div>
          </div>
        )}

        {/* Module selection */}
        <div className="space-y-2">
          <Label className="text-text-secondary">SAP module</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.keys(SAP_MODULES).map((mod) => (
              <button
                key={mod}
                type="button"
                onClick={() => setModule(mod)}
                className={cn(
                  'h-8 rounded-lg text-xs font-semibold transition-all',
                  'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                  module === mod
                    ? 'bg-accent-subtle border-border-focus text-accent-text'
                    : 'bg-bg-secondary border-border-primary text-text-secondary hover:border-border-secondary hover:text-text-primary',
                )}
              >
                {mod}
              </button>
            ))}
          </div>
        </div>

        {/* Content type selection */}
        <div className="space-y-2">
          <Label className="text-text-secondary">Content type</Label>
          <div className="space-y-1.5">
            {CONTENT_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setContentType(type.value)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-lg border text-left',
                  'transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                  contentType === type.value
                    ? 'bg-accent-subtle border-border-focus'
                    : 'bg-bg-secondary border-border-primary hover:border-border-secondary',
                )}
              >
                <div
                  className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 mt-0.5 shrink-0 transition-colors',
                    contentType === type.value
                      ? 'border-accent bg-accent'
                      : 'border-border-secondary',
                  )}
                />
                <div>
                  <p className={cn(
                    'text-sm font-medium',
                    contentType === type.value ? 'text-accent-text' : 'text-text-primary',
                  )}>
                    {type.label}
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!canUpload}
            loading={uploading}
          >
            Upload document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

## FILE 3: src/components/admin/IngestionProgressRow.tsx (COMPLETE)

```typescript
'use client'

import { FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'

interface IngestionProgressRowProps {
  filename: string
  fileSize: number
  progress: number     // 0–100 (upload progress)
  className?: string
}

/**
 * Shows upload/ingestion progress for a document being processed.
 * Appears above the documents table while upload + ingestion is in progress.
 * Disappears when the document appears in the table with "active" or "failed" status.
 *
 * Progress phases:
 * 0–99: "Uploading..."  (HTTP upload to server)
 * 100:  "Processing..."  (server ingestion: chunking, embedding, indexing)
 */
export function IngestionProgressRow({
  filename,
  fileSize,
  progress,
  className,
}: IngestionProgressRowProps) {
  const isUploading = progress < 100
  const label = isUploading ? `Uploading... ${progress}%` : 'Processing — embedding chunks...'

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3',
        'bg-info-bg border border-info-border rounded-lg',
        className,
      )}
      role="status"
      aria-label={`${filename}: ${label}`}
    >
      {/* File icon */}
      <div className="w-8 h-8 rounded-lg bg-info/20 border border-info-border flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-info-text" aria-hidden="true" />
      </div>

      {/* Progress info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-info-text truncate">{filename}</p>
          <span className="text-xs text-info-text/70 tabular-nums ml-2 shrink-0">
            {formatFileSize(fileSize)}
          </span>
        </div>

        {/* Progress bar */}
        {isUploading ? (
          <div className="space-y-1">
            <div
              className="w-full h-1.5 bg-info/20 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-info rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-info-text/70">{label}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* Pulsing dot for processing state */}
            <span className="w-2 h-2 rounded-full bg-info animate-pulse-subtle" aria-hidden="true" />
            <p className="text-xs text-info-text/70">{label}</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## FILE 4: src/app/(admin)/admin/documents/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function DocumentsLoading() {
  return (
    <div className="px-6 py-5 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
      {/* Upload zone skeleton */}
      <Skeleton className="h-36 w-full rounded-xl" />
      {/* Filters */}
      <div className="flex gap-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-lg" />
        ))}
        <Skeleton className="h-8 flex-1 max-w-xs rounded-lg ml-auto" />
      </div>
      {/* Table */}
      <div className="rounded-xl border border-border-primary overflow-hidden">
        <div className="bg-bg-secondary px-4 py-3 flex gap-8">
          {['Document ID','Name','Module','Status','Chunks','Verified'].map((h) => (
            <Skeleton key={h} className="h-2.5 w-16" />
          ))}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-t border-border-primary flex gap-8 items-center">
            <Skeleton className="h-2.5 w-20 font-mono" />
            <Skeleton className="h-2.5 w-44" />
            <Skeleton className="h-5 w-8 rounded" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 5: src/app/(admin)/admin/documents/page.tsx (COMPLETE)

```typescript
'use client'

import { useState, useCallback } from 'react'
import { Download, Archive } from 'lucide-react'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminStatRow } from '@/components/admin/AdminStatRow'
import { UploadDropZone } from '@/components/admin/UploadDropZone'
import { DocumentMetadataModal } from '@/components/admin/DocumentMetadataModal'
import { IngestionProgressRow } from '@/components/admin/IngestionProgressRow'
import { DataTable, type ColumnDef } from '@/components/admin/DataTable'
import { BulkActionBar } from '@/components/admin/BulkActionBar'
import { FilterChips, type FilterChip } from '@/components/admin/FilterChips'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAdminDocuments, useDeprecateDocument, useBulkDeprecateDocuments, useUploadDocument } from '@/hooks/queries'
import { useAdminStore } from '@/stores/adminStore'
import { exportToCSV } from '@/lib/csvExport'
import { formatFileSize } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { DocumentRecord } from '@/types'

// ── Status badge mapping ──────────────────────────────────────

const STATUS_VARIANT: Record<DocumentRecord['status'], 'active' | 'processing' | 'failed' | 'deprecated'> = {
  active:      'active',
  processing:  'processing',
  failed:      'failed',
  deprecated:  'deprecated',
}

// ── Column definitions ────────────────────────────────────────

const columns: ColumnDef<DocumentRecord>[] = [
  {
    id: 'document_id',
    header: 'Document ID',
    cell: (row) => (
      <span className="font-mono text-xs text-text-primary">{row.document_id}</span>
    ),
    sortable: true,
    width: '130px',
  },
  {
    id: 'module',
    header: 'Module',
    cell: (row) => (
      <span className="text-xs font-semibold text-text-secondary bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5">
        {row.module}
      </span>
    ),
    width: '80px',
  },
  {
    id: 'content_type',
    header: 'Type',
    cell: (row) => (
      <span className="text-xs text-text-tertiary capitalize">
        {row.content_type.replace('_', ' ')}
      </span>
    ),
    width: '100px',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <Badge variant={STATUS_VARIANT[row.status]} dot>
        {row.status}
      </Badge>
    ),
    sortable: true,
    width: '110px',
  },
  {
    id: 'chunk_count',
    header: 'Chunks',
    cell: (row) => (
      <span className="text-xs tabular-nums text-text-secondary">{row.chunk_count}</span>
    ),
    sortable: true,
    width: '70px',
    align: 'right',
  },
  {
    id: 'last_verified_date',
    header: 'Last verified',
    cell: (row) => (
      <div className="space-y-0.5">
        <p className="text-xs text-text-secondary">{row.last_verified_date}</p>
        <p className="text-xs text-text-tertiary">{row.verified_by}</p>
      </div>
    ),
    sortable: true,
    width: '140px',
  },
  {
    id: 'actions',
    header: '',
    cell: (row) => row.status !== 'deprecated' ? (
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Deprecate ${row.document_id}`}>
            <Archive className="w-3.5 h-3.5 text-text-tertiary" />
          </Button>
        }
        title={`Deprecate ${row.document_id}?`}
        description="This document will be removed from AI responses. This cannot be undone. You can upload an updated version separately."
        confirmLabel="Deprecate"
        variant="destructive"
        onConfirm={() => deprecate.mutateAsync(row.document_id)}
      />
    ) : null,
    width: '50px',
    align: 'right',
  },
]

// ── Page component ────────────────────────────────────────────

export default function AdminDocumentsPage() {
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [metaModalOpen, setMetaModalOpen] = useState(false)
  const [sortState, setSortState] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null)

  const {
    documentFilters,
    setDocumentFilters,
    resetDocumentFilters,
    selectedDocumentIds,
    setSelectedDocumentIds,
    clearDocumentSelection,
    uploadProgress,
  } = useAdminStore()

  const { data: documents = [], isLoading } = useAdminDocuments(documentFilters)
  const deprecate = useDeprecateDocument()
  const bulkDeprecate = useBulkDeprecateDocuments()
  const uploadDocument = useUploadDocument()

  // ── Computed stats ────────────────────────────────────────

  const stats = {
    active:      documents.filter((d) => d.status === 'active').length,
    processing:  documents.filter((d) => d.status === 'processing').length,
    deprecated:  documents.filter((d) => d.status === 'deprecated').length,
    failed:      documents.filter((d) => d.status === 'failed').length,
  }

  // ── Handlers ──────────────────────────────────────────────

  function handleFileReady(file: File) {
    setPendingFile(file)
    setMetaModalOpen(true)
  }

  async function handleUpload(file: File, module: string, contentType: string) {
    await uploadDocument.mutateAsync({ file, metadata: { module, content_type: contentType } })
    setPendingFile(null)
  }

  // ── Active filter chips ───────────────────────────────────

  const activeChips: FilterChip[] = [
    ...(documentFilters.module ? [{ id: 'module', label: 'Module', value: documentFilters.module }] : []),
    ...(documentFilters.status ? [{ id: 'status', label: 'Status', value: documentFilters.status }] : []),
    ...(documentFilters.content_type ? [{ id: 'content_type', label: 'Type', value: documentFilters.content_type }] : []),
  ]

  function removeFilter(id: string) {
    setDocumentFilters({ [id]: undefined })
  }

  // ── CSV export ────────────────────────────────────────────

  const selectedRows = documents.filter((d) => selectedDocumentIds.has(d.document_id))

  function handleExport() {
    exportToCSV({
      filename: 'aegis-documents',
      columns: [
        { header: 'Document ID', accessor: (d: DocumentRecord) => d.document_id },
        { header: 'Module', accessor: (d) => d.module },
        { header: 'Content type', accessor: (d) => d.content_type },
        { header: 'Status', accessor: (d) => d.status },
        { header: 'Chunks', accessor: (d) => d.chunk_count },
        { header: 'Last verified', accessor: (d) => d.last_verified_date },
        { header: 'Verified by', accessor: (d) => d.verified_by },
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
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        }
        leftSlot={
          <AdminStatRow
            stats={[
              { label: 'Active', value: stats.active, color: 'green' },
              { label: 'Processing', value: stats.processing, color: 'info' },
              { label: 'Deprecated', value: stats.deprecated },
              ...(stats.failed > 0
                ? [{ label: 'Failed', value: stats.failed, color: 'red' as const }]
                : []),
            ]}
            isLoading={isLoading}
          />
        }
      />

      {/* Upload zone */}
      <UploadDropZone
        onFileReady={handleFileReady}
        uploading={uploadDocument.isPending}
        className="mb-4"
      />

      {/* Active ingestion rows */}
      {Object.entries(uploadProgress).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(uploadProgress).map(([filename, progress]) => (
            <IngestionProgressRow
              key={filename}
              filename={filename}
              fileSize={pendingFile?.size ?? 0}
              progress={progress}
            />
          ))}
        </div>
      )}

      {/* Filter chips */}
      {activeChips.length > 0 && (
        <FilterChips
          chips={activeChips}
          onRemove={removeFilter}
          onClearAll={resetDocumentFilters}
          className="mb-3"
        />
      )}

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
            label: 'Deprecate selected',
            icon: <Archive className="w-3.5 h-3.5" />,
            variant: 'destructive',
            loading: bulkDeprecate.isPending,
            onClick: () => {
              const activeIds = Array.from(selectedDocumentIds).filter(
                (id) => documents.find((d) => d.document_id === id)?.status === 'active'
              )
              if (activeIds.length === 0) return
              bulkDeprecate.mutate(activeIds)
              clearDocumentSelection()
            },
          },
          {
            label: 'Export CSV',
            icon: <Download className="w-3.5 h-3.5" />,
            onClick: handleExport,
          },
        ]}
      />

      {/* Metadata modal */}
      <DocumentMetadataModal
        file={pendingFile}
        open={metaModalOpen}
        onOpenChange={setMetaModalOpen}
        onUpload={handleUpload}
        uploading={uploadDocument.isPending}
      />
    </AdminPageWrapper>
  )
}
```

---

## VERIFICATION STEPS

```bash
# Step 1: Drop zone accepts PDF
# → Drag a PDF onto the drop zone → blue overlay → drop → metadata modal opens
# → Drag a PNG → toastError "Only PDF files are supported"
# → Drag a 60MB PDF → toastError "File too large"

# Step 2: Metadata modal
# → Select module (SD) + content type (Error guide) → Upload button enables
# → Click Upload → modal closes, ingestion progress row appears

# Step 3: Upload progress
# → adminStore.uploadProgress should update with filename → percent
# → Progress bar fills 0→100%
# → When upload completes → row shows pulsing "Processing..." state
# → Document appears in table with "processing" badge

# Step 4: Bulk deprecate
# → Select 3 active documents
# → BulkActionBar slides up with count "3 items selected"
# → Click "Deprecate selected" → ConfirmDialog not needed (bulk action already confirmed by selection)
# → All 3 change to "deprecated" badge

# Step 5: Single row deprecate
# → Hover a row → Archive icon appears
# → Click Archive → ConfirmDialog appears with document ID
# → Confirm → document changes to deprecated

# Step 6: CSV export
# → With rows selected: exports only selected rows
# → Without selection: exports all visible documents

npx tsc --noEmit  # Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F11: Admin documents — UploadDropZone, DocumentMetadataModal, IngestionProgressRow, documents page"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F11*
