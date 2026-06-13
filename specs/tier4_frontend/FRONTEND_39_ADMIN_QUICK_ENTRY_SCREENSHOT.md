# FRONTEND_39 — ADMIN QUICK ENTRY: SCREENSHOTS AND MODALS
## AEGIS SAP Helpdesk AI — Screenshot Upload Component and All Overlays
## Depends on: IMPL_25, IMPL_28, FRONTEND_37, FRONTEND_38

---

## 1. OVERVIEW

This document specifies:
- `ScreenshotUploadZone` component (upload, SAP classification, preview, confirm)
- Per-screenshot thumbnail display and retry UI
- All modal and drawer overlays for the Quick Entry form:
  - `DuplicateCheckModal` — pre-submission similarity warning
  - `ArchiveConfirmModal` — archive with document ID confirmation
  - `VersionHistoryDrawer` — all version snapshots with restore
  - `ConflictDrawer` — 409 optimistic locking conflict resolution
  - `OnboardingModal` — first-time use guidance with example entries

---

## 2. SCREENSHOT UPLOAD ZONE

**File:** `src/components/quick-entry/ScreenshotUploadZone.tsx`

Used inside each cause block (Error Guide), each step batch section (Procedure),
and in the Config overview section. The `associatedSection` prop determines
which chunk the screenshot enriches.
  
import { useState, useRef, useCallback } from 'react'
import { Camera, X, CheckCircle, AlertCircle, Loader2, RotateCcw, Upload } from 'lucide-react'
import type { QuickEntryScreenshot } from '@/types'
import { SCREENSHOT_MAX_SIZE_BYTES, SCREENSHOT_ACCEPTED_MIME_TYPES } from '@/lib/constants'

interface Props {
  entryId: string | null            // null if draft not yet saved
  associatedSection: string         // chunk_type this screenshot enriches
  screenshots: QuickEntryScreenshot[]
  onUploaded: (screenshot: QuickEntryScreenshot) => void
  onDeleted: (screenshotId: string) => void
  onRetry: (screenshotId: string) => void
  isReadOnly?: boolean
  maxScreenshots?: number           // default: 3 for cause sections, 2 for step sections
}

export function ScreenshotUploadZone({
  entryId, associatedSection, screenshots,
  onUploaded, onDeleted, onRetry,
  isReadOnly = false,
  maxScreenshots = 3
}: Props) {

  const [isDragging, setIsDragging]       = useState(false)
  const [isUploading, setIsUploading]     = useState(false)
  const [uploadError, setUploadError]     = useState<string | null>(null)
  const [captionInput, setCaptionInput]   = useState('')
  const [pendingFile, setPendingFile]     = useState<File | null>(null)
  const [extractionPreview, setExtractionPreview] = useState<{
    screenshotId: string;
    previewText: string;
    confidence: number
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canUpload = screenshots.length < maxScreenshots && !isReadOnly && Boolean(entryId)

  // ── File handling ──────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    setUploadError(null)

    // Client-side validation
    if (!SCREENSHOT_ACCEPTED_MIME_TYPES.includes(file.type as any)) {
      setUploadError('Only PNG, JPEG, and WebP images are accepted.')
      return
    }
    if (file.size > SCREENSHOT_MAX_SIZE_BYTES) {
      setUploadError(`Screenshot must be smaller than 10 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`)
      return
    }
    if (!entryId) {
      setUploadError('Please save the entry as a draft first before adding screenshots.')
      return
    }

    setPendingFile(file)
    setCaptionInput('')
    // Don't upload yet — wait for caption
  }, [entryId])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleUpload = useCallback(async () => {
    if (!pendingFile || !entryId) return
    if (captionInput.trim().length < 10) {
      setUploadError('Please write a description of at least 10 characters before uploading.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', pendingFile)
    formData.append('entry_id', entryId)
    formData.append('associated_section', associatedSection)
    formData.append('admin_caption', captionInput.trim())

    try {
      const response = await fetch('/api/admin/knowledge-screenshots/upload', {
        method: 'POST',
        body: formData,
        // No Content-Type header — browser sets multipart/form-data with boundary
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail ?? 'Upload failed')
      }

      const data = await response.json()

      // Show extraction preview
      setExtractionPreview({
        screenshotId: data.screenshot_id,
        previewText: data.extraction_preview,
        confidence: data.vision_confidence
      })

      // Call parent with the new screenshot
      onUploaded({
        id: data.screenshot_id,
        entry_id: entryId,
        version: 1,
        associated_section: associatedSection,
        minio_object_key: data.minio_object_key,
        admin_caption: captionInput.trim(),
        extracted_text: data.extraction_preview,
        vision_status: 'complete',
        vision_error: null,
        vision_confidence: data.vision_confidence,
        sap_confirmed: false,
        file_size_bytes: pendingFile.size,
        mime_type: pendingFile.type,
        eligible_for_cleanup: false,
        created_at: new Date().toISOString(),
        proxy_url: `/api/screenshots/${data.minio_object_key}`
      })

      setPendingFile(null)
      setCaptionInput('')

    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }, [pendingFile, entryId, captionInput, associatedSection, onUploaded])

  const handleCancelPending = useCallback(() => {
    setPendingFile(null)
    setCaptionInput('')
    setUploadError(null)
    setExtractionPreview(null)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Existing screenshots */}
      {screenshots.map(screenshot => (
        <ScreenshotThumbnailAdmin
          key={screenshot.id}
          screenshot={screenshot}
          onDelete={() => onDeleted(screenshot.id)}
          onRetry={() => onRetry(screenshot.id)}
          isReadOnly={isReadOnly}
        />
      ))}

      {/* Extraction preview (shown after upload) */}
      {extractionPreview && (
        <ExtractionPreviewCard
          preview={extractionPreview}
          onDismiss={() => setExtractionPreview(null)}
        />
      )}

      {/* Pending file — caption entry */}
      {pendingFile && !isUploading && !extractionPreview && (
        <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] space-y-2">
          <div className="flex items-center gap-2">
            <Camera size={14} className="text-[var(--color-text-muted)]" />
            <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
              {pendingFile.name}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
              {(pendingFile.size / 1024).toFixed(0)} KB
            </span>
          </div>

          <div>
            <label className="text-[10px] text-[var(--color-text-muted)] block mb-1">
              Describe what this screenshot shows (min 10 characters)
            </label>
            <textarea
              value={captionInput}
              onChange={e => setCaptionInput(e.target.value)}
              placeholder="e.g. BP transaction — Billing tab showing Tax Classification field"
              className="w-full text-xs resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] px-2 py-1.5 focus:outline-none focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-muted)]"
              rows={2}
            />
          </div>

          {uploadError && (
            <p className="text-[10px] text-[var(--color-danger)]">{uploadError}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleUpload}
              disabled={captionInput.trim().length < 10}
              className="text-xs px-3 py-1.5 rounded bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Upload size={12} />
              Upload screenshot
            </button>
            <button
              onClick={handleCancelPending}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upload in progress */}
      {isUploading && (
        <div className="flex items-center gap-2 py-2 px-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
          <Loader2 size={12} className="animate-spin text-[var(--color-accent)]" />
          <span className="text-xs text-[var(--color-text-muted)]">
            Uploading and analysing screenshot…
          </span>
        </div>
      )}

      {/* Drop zone (shown when can upload and no pending file) */}
      {canUpload && !pendingFile && !isUploading && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center gap-1 py-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
            isDragging
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
              : 'border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elevated)]'
          ].join(' ')}
        >
          <Camera size={16} className="text-[var(--color-text-muted)]" />
          <p className="text-xs text-[var(--color-text-muted)]">
            Drop SAP screenshot or <span className="text-[var(--color-accent)]">click to browse</span>
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)]">
            PNG, JPEG, WebP · max 10 MB · {maxScreenshots - screenshots.length} remaining
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
        </div>
      )}

      {/* Max reached */}
      {!canUpload && !isReadOnly && entryId && (
        <p className="text-[10px] text-[var(--color-text-muted)]">
          Maximum {maxScreenshots} screenshot{maxScreenshots > 1 ? 's' : ''} for this section
        </p>
      )}

      {/* Draft not saved warning */}
      {!entryId && !isReadOnly && (
        <p className="text-[10px] text-[var(--color-text-muted)] italic">
          Save as draft first to add screenshots
        </p>
      )}

      {uploadError && !pendingFile && (
        <p className="text-[10px] text-[var(--color-danger)]">{uploadError}</p>
      )}
    </div>
  )
}
```

### 2.1 Screenshot thumbnail (admin form view)

```typescript
function ScreenshotThumbnailAdmin({
  screenshot, onDelete, onRetry, isReadOnly
}: {
  screenshot: QuickEntryScreenshot
  onDelete: () => void
  onRetry: () => void
  isReadOnly: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const visionStatusConfig = {
    pending:    { icon: Loader2, color: 'text-[var(--color-text-muted)]', spin: true },
    processing: { icon: Loader2, color: 'text-[var(--color-accent)]', spin: true },
    complete:   { icon: CheckCircle, color: 'text-[var(--color-success)]', spin: false },
    failed:     { icon: AlertCircle, color: 'text-[var(--color-danger)]', spin: false },
    not_sap:    { icon: AlertCircle, color: 'text-[var(--color-danger)]', spin: false },
  }[screenshot.vision_status]

  const StatusIcon = visionStatusConfig.icon

  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
      {/* Thumbnail header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)]">
        {/* Tiny image preview */}
        <img
          src={screenshot.proxy_url}
          alt={screenshot.admin_caption}
          className="w-10 h-7 object-cover rounded border border-[var(--color-border)] flex-shrink-0"
          loading="lazy"
        />

        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-[var(--color-text-primary)] truncate">
            {screenshot.admin_caption}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <StatusIcon
              size={10}
              className={[visionStatusConfig.color, visionStatusConfig.spin ? 'animate-spin' : ''].join(' ')}
            />
            <span className="text-[9px] text-[var(--color-text-muted)]">
              {VISION_STATUS_LABELS[screenshot.vision_status]}
            </span>
            {screenshot.vision_confidence && (
              <span className="text-[9px] text-[var(--color-text-muted)]">
                {Math.round(screenshot.vision_confidence)}% confidence
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Expand to see extraction */}
          {screenshot.extracted_text && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-[var(--color-accent)] hover:underline"
            >
              {expanded ? 'Hide' : 'Show'} extraction
            </button>
          )}

          {/* Retry if failed */}
          {screenshot.vision_status === 'failed' && !isReadOnly && (
            <button
              onClick={onRetry}
              className="text-[10px] text-[var(--color-warning)] hover:underline flex items-center gap-0.5"
            >
              <RotateCcw size={9} />
              Retry
            </button>
          )}

          {/* Delete (draft only) */}
          {!isReadOnly && (
            <button
              onClick={onDelete}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] p-0.5"
              title="Remove screenshot"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Extraction preview (expandable) */}
      {expanded && screenshot.extracted_text && (
        <div className="px-3 py-2 bg-[var(--color-surface-elevated)] border-t border-[var(--color-border)]">
          <p className="text-[9px] font-medium text-[var(--color-text-muted)] mb-1">
            Extracted content (will be appended to chunk):
          </p>
          <pre className="text-[9px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
            {screenshot.extracted_text}
          </pre>
        </div>
      )}

      {/* Error display */}
      {screenshot.vision_status === 'failed' && screenshot.vision_error && !expanded && (
        <div className="px-3 py-1.5 bg-[var(--color-danger-subtle)] border-t border-[var(--color-danger-border)]">
          <p className="text-[9px] text-[var(--color-danger)]">{screenshot.vision_error}</p>
        </div>
      )}
    </div>
  )
}
```

### 2.2 Extraction preview card (shown after upload)

```typescript
function ExtractionPreviewCard({ preview, onDismiss }: {
  preview: { screenshotId: string; previewText: string; confidence: number }
  onDismiss: () => void
}) {
  return (
    <div className="rounded-lg border border-[var(--color-success-border)] bg-[var(--color-success-subtle)] p-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs font-medium text-[var(--color-success)]">
            ✓ Screenshot processed — content extracted
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)]">
            {Math.round(preview.confidence)}% confidence this is a SAP screenshot
          </p>
        </div>
        <button onClick={onDismiss} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          <X size={14} />
        </button>
      </div>
      <div className="bg-[var(--color-surface)] rounded border border-[var(--color-border)] p-2 max-h-32 overflow-y-auto">
        <pre className="text-[9px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">
          {preview.previewText}
        </pre>
      </div>
      <p className="text-[9px] text-[var(--color-text-muted)] mt-1.5">
        This text will be appended to the corresponding knowledge chunk in the vector store.
      </p>
    </div>
  )
}
```

---

## 3. DUPLICATE CHECK MODAL

**File:** `src/components/quick-entry/DuplicateCheckModal.tsx`

```typescript
import { AlertTriangle, ExternalLink, X } from 'lucide-react'
import type { DuplicateMatch } from '@/types'
import { QuickEntrySourceBadge } from './QuickEntrySourceBadge'
import { Button } from '@/components/ui/Button'

interface Props {
  matches: DuplicateMatch[]
  onSubmitAnyway: () => void
  onUpdateExisting: (match: DuplicateMatch) => void
  onCancel: () => void
}

export function DuplicateCheckModal({ matches, onSubmitAnyway, onUpdateExisting, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[var(--color-surface-elevated)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <AlertTriangle size={18} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              Similar existing knowledge found
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {matches.length} existing {matches.length === 1 ? 'entry' : 'entries'} may cover this topic.
              Review below before creating a duplicate.
            </p>
          </div>
          <button onClick={onCancel} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={16} />
          </button>
        </div>

        {/* Match list */}
        <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]">
          {matches.map(match => (
            <div key={match.document_id} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {match.title}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)] flex-shrink-0">
                      {match.document_id}
                    </span>
                    <QuickEntrySourceBadge sourceType={match.source_type} />
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 mb-1">
                    {match.preview}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-[var(--color-warning)]">
                      {Math.round(match.similarity_score * 100)}% similar
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {match.module} · Verified {match.last_verified}
                    </span>
                  </div>
                </div>

                {/* Update existing button */}
                {match.source_type === 'form_entry' && (
                  <button
                    onClick={() => onUpdateExisting(match)}
                    className="text-[11px] text-[var(--color-accent)] hover:underline whitespace-nowrap flex-shrink-0 flex items-center gap-1"
                  >
                    Update existing
                    <ExternalLink size={10} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <button
            onClick={onCancel}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Go back and review my entry
          </button>
          <Button variant="primary" size="sm" onClick={onSubmitAnyway}>
            My topic is different — submit anyway
          </Button>
        </div>
      </div>
    </div>
  )
}
```

**Behaviour rules:**
- "Update existing" only shown for `source_type === 'form_entry'` matches
  (document-based entries cannot be edited via Quick Entry form)
- When admin clicks "Update existing":
  1. Show inline confirmation: "Your current form data will be discarded. Continue?"
  2. If confirmed: navigate to the existing entry, current draft deleted
  3. If cancelled: return to modal
- "Submit anyway" immediately proceeds to submission (no second confirmation)
- "Go back" closes modal, returns to form in draft_editing state

---

## 4. ARCHIVE CONFIRM MODAL

**File:** `src/components/quick-entry/ArchiveConfirmModal.tsx`

The admin must type the document ID exactly to confirm archival.
This prevents accidental archival of production knowledge entries.

```typescript
import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useArchiveQuickEntry } from '@/hooks/useQuickEntry'

interface Props {
  entryId: string
  documentId: string
  onSuccess: () => void
  onCancel: () => void
}

export function ArchiveConfirmModal({ entryId, documentId, onSuccess, onCancel }: Props) {
  const [typedId, setTypedId] = useState('')
  const archiveMutation = useArchiveQuickEntry()
  const isMatch = typedId === documentId

  const handleArchive = async () => {
    if (!isMatch) return
    await archiveMutation.mutateAsync({ id: entryId, confirmedDocumentId: documentId })
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[var(--color-surface-elevated)] rounded-xl shadow-2xl border border-[var(--color-danger-border)] overflow-hidden">

        <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <Trash2 size={18} className="text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              Archive this entry?
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Archiving removes this entry from the active knowledge base.
              Existing employees will no longer receive answers from it.
              Version history is preserved.
            </p>
          </div>
          <button onClick={onCancel} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1.5">
              Type <span className="font-mono font-medium text-[var(--color-text-primary)]">{documentId}</span> to confirm:
            </label>
            <input
              type="text"
              value={typedId}
              onChange={e => setTypedId(e.target.value)}
              placeholder={documentId}
              className={[
                'w-full px-3 py-2 text-sm rounded-md border font-mono focus:outline-none',
                'bg-[var(--color-surface)] text-[var(--color-text-primary)]',
                isMatch && typedId
                  ? 'border-[var(--color-success)] focus:border-[var(--color-success)]'
                  : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
              ].join(' ')}
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between">
            <button onClick={onCancel} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              Cancel
            </button>
            <Button
              variant="danger"
              size="sm"
              disabled={!isMatch || archiveMutation.isPending}
              onClick={handleArchive}
            >
              {archiveMutation.isPending ? 'Archiving…' : 'Archive entry'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## 5. VERSION HISTORY DRAWER

**File:** `src/components/quick-entry/VersionHistoryDrawer.tsx`

```typescript
import { useState } from 'react'
import { X, RotateCcw, Clock } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatRelativeDate } from '@/lib/utils'
import type { QuickEntryVersion } from '@/types'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/Button'

interface Props {
  entryId: string
  currentVersion: number
  onClose: () => void
  onRestored: () => void
}

export function VersionHistoryDrawer({ entryId, currentVersion, onClose, onRestored }: Props) {
  const [restoring, setRestoring] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['quick-entry', 'versions', entryId],
    queryFn: () => apiClient.get<{ versions: QuickEntryVersion[] }>(
      `/api/admin/knowledge-entries/${entryId}/versions`
    )
  })

  const restoreMutation = useMutation({
    mutationFn: (version: number) =>
      apiClient.post(`/api/admin/knowledge-entries/${entryId}/restore/${version}`),
    onSuccess: () => {
      setRestoring(null)
      onRestored()
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="w-96 h-full bg-[var(--color-surface-elevated)] border-l border-[var(--color-border)] shadow-xl flex flex-col pointer-events-auto">

        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">Version History</span>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading && (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-16 rounded bg-[var(--color-skeleton)] animate-pulse" />
              ))}
            </div>
          )}

          {data?.versions.map(version => {
            const isCurrent = version.version === currentVersion
            return (
              <div
                key={version.version}
                className={[
                  'mb-3 p-3 rounded-lg border',
                  isCurrent
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                ].join(' ')}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                        Version {version.version}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-accent)] text-white">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      By {version.changed_by_name} · {formatRelativeDate(version.changed_at)}
                    </p>
                    {version.change_summary && (
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 italic">
                        "{version.change_summary}"
                      </p>
                    )}
                  </div>

                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={restoring !== null}
                      onClick={() => {
                        setRestoring(version.version)
                        restoreMutation.mutate(version.version)
                      }}
                    >
                      {restoring === version.version ? (
                        'Restoring…'
                      ) : (
                        <>
                          <RotateCcw size={10} className="mr-1" />
                          Restore
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

---

## 6. CONFLICT DRAWER

**File:** `src/components/quick-entry/ConflictDrawer.tsx`

Shown on 409 response from PUT endpoint. Lets admin choose between their
local changes and the server's current state.

```typescript
import { X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  localFormData: object
  serverEntry: any
  onAcceptServer: () => void
  onKeepLocal: () => void
  onClose: () => void
}

export function ConflictDrawer({ localFormData, serverEntry, onAcceptServer, onKeepLocal, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="w-[480px] h-full bg-[var(--color-surface-elevated)] border-l border-[var(--color-border)] shadow-xl flex flex-col pointer-events-auto">

        <div className="flex items-start gap-3 px-4 py-3 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-subtle)]">
          <AlertTriangle size={16} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              Editing conflict
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Another admin saved changes to this entry while you were editing.
              Current server version is {serverEntry.version}.
              Choose how to proceed:
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Option A: Accept server version */}
          <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
              Use the server version
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Discard your changes and load the version saved by the other admin.
              Your edits will be lost.
            </p>
            <Button variant="outline" size="sm" onClick={onAcceptServer}>
              Load server version (v{serverEntry.version})
            </Button>
          </div>

          {/* Option B: Override with local */}
          <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
              Keep my changes
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Submit your version anyway. Your changes will overwrite the other admin's edits.
              The overwritten version is still in version history.
            </p>
            <Button variant="primary" size="sm" onClick={onKeepLocal}>
              Submit my version
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## 7. ONBOARDING MODAL

**File:** `src/components/quick-entry/OnboardingModal.tsx`

Shown on first visit to Quick Entry. Contains example entries as placeholders.
When IT team provides real examples, the placeholder content is replaced
in the component and the DB seed data.

```typescript
import { useState } from 'react'
import { X, FileText, List, Settings, ChevronRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const STEPS = [
  {
    title: 'What is Quick Entry?',
    content: (
      <div className="space-y-3 text-sm text-[var(--color-text-muted)]">
        <p>
          Quick Entry lets you add SAP knowledge directly through a structured form —
          no Word document or PDF required.
        </p>
        <p>
          The system automatically structures your input into optimised knowledge chunks
          that AEGIS searches when employees ask questions.
        </p>
        <p className="text-xs font-medium text-[var(--color-text-primary)]">
          Three entry types are available:
        </p>
        <ul className="space-y-1.5">
          {[
            { icon: FileText, label: 'Error Guide', desc: 'For SAP errors with causes and resolution steps' },
            { icon: List,     label: 'Procedure',   desc: 'Step-by-step instructions for SAP tasks' },
            { icon: Settings, label: 'Config Reference', desc: 'Current configuration values at Sona Comstar' },
          ].map(({ icon: Icon, label, desc }) => (
            <li key={label} className="flex items-start gap-2">
              <Icon size={14} className="text-[var(--color-accent)] flex-shrink-0 mt-0.5" />
              <span><span className="font-medium text-[var(--color-text-primary)]">{label}</span> — {desc}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  },
  {
    title: 'Example: Error Guide',
    content: (
      <div className="space-y-2 text-xs">
        <p className="text-[var(--color-text-muted)] mb-2">
          A well-written Error Guide example from Sona Comstar's SAP environment:
        </p>
        <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <span className="text-[10px] font-mono text-[var(--color-accent)]">EXAMPLE-SD-ERR-001</span>
            <span className="ml-2 text-[10px] text-[var(--color-warning)] italic">
              [REPLACE BEFORE DEPLOYMENT — real example coming from IT team]
            </span>
          </div>
          <div className="px-3 py-2 space-y-1 text-[var(--color-text-muted)]">
            <p><span className="font-medium text-[var(--color-text-primary)]">Issue:</span> [Real SD error title]</p>
            <p><span className="font-medium text-[var(--color-text-primary)]">Error code:</span> [Actual code]</p>
            <p><span className="font-medium text-[var(--color-text-primary)]">Causes:</span> [1-3 real causes with resolution steps]</p>
            <p><span className="font-medium text-[var(--color-text-primary)]">Success indicator:</span> [Exact SAP success message]</p>
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] italic mt-1">
          Complete example entries will be provided by the Sona Comstar IT team before deployment.
        </p>
      </div>
    )
  },
  {
    title: 'Tips for the best results',
    content: (
      <div className="space-y-2.5 text-sm text-[var(--color-text-muted)]">
        {[
          'Always name the exact T-code and field in resolution steps',
          'Use "NONE" checkboxes only when genuinely not applicable — do not leave required fields blank',
          'Screenshots attached to a cause block are returned to employees alongside the answer',
          'Check the chunk preview before submitting to see exactly what AEGIS will index',
          'Config entries have review dates — confirm values are current when notified',
        ].map((tip, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent)] text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span>{tip}</span>
          </div>
        ))}
      </div>
    )
  }
]

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[var(--color-surface-elevated)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            {STEPS[step].title}
          </p>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 min-h-[200px]">
          {STEPS[step].content}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={[
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  i === step
                    ? 'bg-[var(--color-accent)]'
                    : 'bg-[var(--color-border)] hover:bg-[var(--color-text-muted)]'
                ].join(' ')}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center gap-1"
              >
                <ChevronLeft size={12} />
                Back
              </button>
            )}
            {isLast ? (
              <Button variant="primary" size="sm" onClick={onClose}>
                Get started
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s + 1)}>
                Next
                <ChevronRight size={12} className="ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

*FRONTEND_39 — Admin Quick Entry Screenshots and Modals | AEGIS v1.0 | Sona Comstar*
