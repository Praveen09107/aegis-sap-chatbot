"use client"

import { FileText } from "lucide-react"
import { cn, formatFileSize } from "@/lib/utils"

interface IngestionProgressRowProps {
  filename: string
  fileSize: number
  progress: number // 0–100 (upload progress)
  className?: string
}

/**
 * Shows upload/ingestion progress for a document being processed.
 * Appears above the documents table while upload + ingestion is in progress.
 * Disappears when the document appears in the table with "active" or "failed" status.
 *
 * Progress phases:
 * 0–99:  "Uploading..."   (HTTP request body still being sent)
 * 100:   "Processing..."  (bytes fully sent — server now runs the real,
 *        synchronous ingestion pipeline before the response returns; see
 *        useUploadDocument's own doc comment — confirmed 2026-07-21 there
 *        is no separate queued/polled phase for documents, this IS the
 *        server doing real work before responding, not a placeholder wait)
 */
export function IngestionProgressRow({ filename, fileSize, progress, className }: IngestionProgressRowProps) {
  const isUploading = progress < 100
  const label = isUploading ? `Uploading... ${progress}%` : "Processing — embedding chunks..."

  return (
    <div className={cn("flex items-center gap-3 p-3", "bg-info-bg border border-info-border rounded-lg", className)} role="status" aria-label={`${filename}: ${label}`}>
      {/* File icon */}
      <div className="w-8 h-8 rounded-lg bg-info/20 border border-info-border flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-info-text" aria-hidden="true" />
      </div>

      {/* Progress info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-info-text truncate">{filename}</p>
          <span className="text-xs text-info-text/70 tabular-nums ml-2 shrink-0">{formatFileSize(fileSize)}</span>
        </div>

        {/* Progress bar */}
        {isUploading ? (
          <div className="space-y-1">
            <div className="w-full h-1.5 bg-info/20 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-info rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
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
