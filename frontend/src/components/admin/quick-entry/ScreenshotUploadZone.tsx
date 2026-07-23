"use client"

import { useState, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Camera, X, CheckCircle, AlertCircle, Loader2, RotateCcw, Upload } from "lucide-react"
import type { QuickEntryScreenshot } from "@/types"
import { SCREENSHOT_ACCEPTED_MIME_TYPES, LIMITS } from "@/lib/constants"
import { queryKeys } from "@/lib/queryKeys"
import { useDeleteScreenshot, useRetryScreenshotVision } from "@/hooks/queries"

interface Props {
  entryId: string | null
  associatedSection: string
  screenshots: QuickEntryScreenshot[]
  isReadOnly?: boolean
  maxScreenshots?: number
}

const VISION_STATUS_LABELS: Record<QuickEntryScreenshot["vision_status"], string> = {
  pending: "Pending",
  processing: "Analyzing…",
  complete: "Analyzed",
  failed: "Analysis failed",
  not_sap: "Not a SAP screenshot",
}

/**
 * Screenshots aren't tracked as local state here — they live inside the
 * parent Quick Entry's own GET response (there's no separate screenshots
 * query). Upload/delete/retry all invalidate that entry's detail query
 * afterward so the next render's `screenshots` prop (passed down from
 * QuickEntryForm's own useQuickEntry() call) picks up the change.
 */
export function ScreenshotUploadZone({ entryId, associatedSection, screenshots, isReadOnly = false, maxScreenshots = 3 }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [captionInput, setCaptionInput] = useState("")
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [extractionPreview, setExtractionPreview] = useState<{ previewText: string } | null>(null)

  const queryClient = useQueryClient()
  const deleteMutation = useDeleteScreenshot(entryId ?? "")
  const retryMutation = useRetryScreenshotVision(entryId ?? "")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canUpload = screenshots.length < maxScreenshots && !isReadOnly && Boolean(entryId)

  const handleFileSelect = useCallback(
    (file: File) => {
      setUploadError(null)

      if (!SCREENSHOT_ACCEPTED_MIME_TYPES.includes(file.type as (typeof SCREENSHOT_ACCEPTED_MIME_TYPES)[number])) {
        setUploadError("Only PNG, JPEG, and WebP images are accepted.")
        return
      }
      if (file.size > LIMITS.MAX_SCREENSHOT_BYTES) {
        setUploadError(`Screenshot must be smaller than 10 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`)
        return
      }
      if (!entryId) {
        setUploadError("Please save the entry as a draft first before adding screenshots.")
        return
      }

      setPendingFile(file)
      setCaptionInput("")
    },
    [entryId]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect]
  )

  const handleUpload = useCallback(async () => {
    if (!pendingFile || !entryId) return
    if (captionInput.trim().length < 10) {
      setUploadError("Please write a description of at least 10 characters before uploading.")
      return
    }

    setIsUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append("file", pendingFile)
    formData.append("entry_id", entryId)
    formData.append("associated_section", associatedSection)
    formData.append("admin_caption", captionInput.trim())

    try {
      // Dedicated streaming upload route (matches the existing
      // /api/upload/document and /api/upload/screenshot routes' own
      // pattern) — not the catch-all /api/proxy/* route, which this
      // codebase reserves for JSON bodies.
      const response = await fetch("/api/upload/knowledge-screenshot", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Upload failed" }))
        const detail = Array.isArray(error.detail) ? error.detail.map((d: { message: string }) => d.message).join(" ") : error.detail
        throw new Error(detail ?? "Upload failed")
      }

      const data = await response.json()

      setExtractionPreview({ previewText: data.extraction_preview })
      await queryClient.invalidateQueries({ queryKey: queryKeys.quickEntry.detail(entryId) })

      setPendingFile(null)
      setCaptionInput("")
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }, [pendingFile, entryId, captionInput, associatedSection, queryClient])

  const handleCancelPending = useCallback(() => {
    setPendingFile(null)
    setCaptionInput("")
    setUploadError(null)
    setExtractionPreview(null)
  }, [])

  return (
    <div className="space-y-3">
      {screenshots.map((screenshot) => (
        <ScreenshotThumbnailAdmin
          key={screenshot.id}
          screenshot={screenshot}
          onDelete={() => deleteMutation.mutate(screenshot.id)}
          onRetry={() => retryMutation.mutate(screenshot.id)}
          isReadOnly={isReadOnly}
        />
      ))}

      {extractionPreview && <ExtractionPreviewCard previewText={extractionPreview.previewText} onDismiss={() => setExtractionPreview(null)} />}

      {pendingFile && !isUploading && !extractionPreview && (
        <div className="p-3 rounded-lg border border-border-primary bg-bg-secondary space-y-2">
          <div className="flex items-center gap-2">
            <Camera className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />
            <span className="text-xs font-medium text-text-primary truncate">{pendingFile.name}</span>
            <span className="text-[10px] text-text-tertiary ml-auto">{(pendingFile.size / 1024).toFixed(0)} KB</span>
          </div>

          <div>
            <label className="text-[10px] text-text-tertiary block mb-1">Describe what this screenshot shows (min 10 characters)</label>
            <textarea
              value={captionInput}
              onChange={(e) => setCaptionInput(e.target.value)}
              placeholder="e.g. BP transaction — Billing tab showing Tax Classification field"
              className="w-full text-xs resize-none rounded border border-border-primary bg-bg-card text-text-primary px-2 py-1.5 focus:outline-none focus:border-border-focus placeholder:text-text-tertiary"
              rows={2}
            />
          </div>

          {uploadError && <p className="text-[10px] text-danger">{uploadError}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleUpload}
              disabled={captionInput.trim().length < 10}
              className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Upload className="w-3 h-3" aria-hidden="true" />
              Upload screenshot
            </button>
            <button onClick={handleCancelPending} className="text-xs text-text-tertiary hover:text-text-primary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="flex items-center gap-2 py-2 px-3 rounded border border-border-primary bg-bg-secondary">
          <Loader2 className="w-3 h-3 animate-spin text-accent" aria-hidden="true" />
          <span className="text-xs text-text-tertiary">Uploading and analysing screenshot…</span>
        </div>
      )}

      {canUpload && !pendingFile && !isUploading && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={
            "flex flex-col items-center justify-center gap-1 py-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors " +
            (isDragging ? "border-border-focus bg-accent-subtle" : "border-border-primary hover:border-border-focus hover:bg-bg-secondary")
          }
        >
          <Camera className="w-4 h-4 text-text-tertiary" aria-hidden="true" />
          <p className="text-xs text-text-tertiary">
            Drop SAP screenshot or <span className="text-accent">click to browse</span>
          </p>
          <p className="text-[10px] text-text-tertiary">
            PNG, JPEG, WebP · max 10 MB · {maxScreenshots - screenshots.length} remaining
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
        </div>
      )}

      {!canUpload && !isReadOnly && entryId && (
        <p className="text-[10px] text-text-tertiary">
          Maximum {maxScreenshots} screenshot{maxScreenshots > 1 ? "s" : ""} for this section
        </p>
      )}

      {!entryId && !isReadOnly && <p className="text-[10px] text-text-tertiary italic">Save as draft first to add screenshots</p>}

      {uploadError && !pendingFile && <p className="text-[10px] text-danger">{uploadError}</p>}
    </div>
  )
}

function ScreenshotThumbnailAdmin({
  screenshot,
  onDelete,
  onRetry,
  isReadOnly,
}: {
  screenshot: QuickEntryScreenshot
  onDelete: () => void
  onRetry: () => void
  isReadOnly: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const visionStatusConfig = {
    pending: { Icon: Loader2, className: "text-text-tertiary", spin: true },
    processing: { Icon: Loader2, className: "text-accent", spin: true },
    complete: { Icon: CheckCircle, className: "text-success", spin: false },
    failed: { Icon: AlertCircle, className: "text-danger", spin: false },
    not_sap: { Icon: AlertCircle, className: "text-danger", spin: false },
  }[screenshot.vision_status]

  const StatusIcon = visionStatusConfig.Icon

  return (
    <div className="rounded-lg border border-border-primary overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL, not optimizable by next/image */}
        <img src={screenshot.proxy_url} alt={screenshot.admin_caption} className="w-10 h-7 object-cover rounded border border-border-primary shrink-0" loading="lazy" />

        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-text-primary truncate">{screenshot.admin_caption}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <StatusIcon className={`w-2.5 h-2.5 ${visionStatusConfig.className} ${visionStatusConfig.spin ? "animate-spin" : ""}`} aria-hidden="true" />
            <span className="text-[9px] text-text-tertiary">{VISION_STATUS_LABELS[screenshot.vision_status]}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {screenshot.extracted_text && (
            <button onClick={() => setExpanded((v) => !v)} className="text-[10px] text-accent hover:underline">
              {expanded ? "Hide" : "Show"} extraction
            </button>
          )}

          {screenshot.vision_status === "failed" && !isReadOnly && (
            <button onClick={onRetry} className="text-[10px] text-warning hover:underline flex items-center gap-0.5">
              <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
              Retry
            </button>
          )}

          {!isReadOnly && (
            <button onClick={onDelete} className="text-text-tertiary hover:text-danger p-0.5" title="Remove screenshot">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {expanded && screenshot.extracted_text && (
        <div className="px-3 py-2 bg-bg-secondary border-t border-border-primary">
          <p className="text-[9px] font-medium text-text-tertiary mb-1">Extracted content (will be appended to chunk):</p>
          <pre className="text-[9px] text-text-primary font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{screenshot.extracted_text}</pre>
        </div>
      )}

      {screenshot.vision_status === "failed" && screenshot.vision_error && !expanded && (
        <div className="px-3 py-1.5 bg-danger-bg border-t border-danger-border">
          <p className="text-[9px] text-danger-text">{screenshot.vision_error}</p>
        </div>
      )}
    </div>
  )
}

function ExtractionPreviewCard({ previewText, onDismiss }: { previewText: string; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-success-border bg-success-bg p-3">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-success-text">✓ Screenshot processed — content extracted</p>
        <button onClick={onDismiss} className="text-text-tertiary hover:text-text-primary">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="bg-bg-card rounded border border-border-primary p-2 max-h-32 overflow-y-auto">
        <pre className="text-[9px] font-mono text-text-primary whitespace-pre-wrap leading-relaxed">{previewText}</pre>
      </div>
      <p className="text-[9px] text-text-tertiary mt-1.5">This text will be appended to the corresponding knowledge chunk in the vector store.</p>
    </div>
  )
}
