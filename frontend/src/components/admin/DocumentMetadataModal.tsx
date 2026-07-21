"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { FileText } from "lucide-react"
import { cn, formatFileSize } from "@/lib/utils"
import { SAP_MODULES } from "@/lib/constants"

interface DocumentMetadataModalProps {
  file: File | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (file: File, module: string, contentType: string) => Promise<void>
  uploading?: boolean
}

const CONTENT_TYPES = [
  { value: "error_guide", label: "Error guide", description: "Resolution steps for SAP error codes" },
  { value: "procedure", label: "Procedure", description: "Step-by-step workflow instructions" },
  { value: "config", label: "Configuration", description: "SAP system configuration documentation" },
] as const

/**
 * Modal shown after file selection. Collects module and content type before
 * upload begins.
 *
 * NOTE: confirmed (2026-07-21) the real ingestion pipeline derives module
 * and content type from the document's own content/filename, not from
 * these form fields — the backend currently ignores whatever this modal
 * sends. Kept here exactly as FRONTEND_18 specifies (same disclosed-gap
 * precedent used elsewhere this session) since these fields are ready to
 * become real overrides if the pipeline is ever changed to accept them, and
 * dropping the step now would be a bigger, unasked-for scope cut.
 */
export function DocumentMetadataModal({ file, open, onOpenChange, onUpload, uploading = false }: DocumentMetadataModalProps) {
  const [module, setModule] = useState("")
  const [contentType, setContentType] = useState<string>("")

  const canUpload = !!module && !!contentType && !uploading

  async function handleUpload() {
    if (!file || !canUpload) return
    await onUpload(file, module, contentType)
    onOpenChange(false)
    setModule("")
    setContentType("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-card border-border-primary max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Document details</DialogTitle>
          <DialogDescription className="text-text-secondary">Provide metadata before uploading this document.</DialogDescription>
        </DialogHeader>

        {/* File summary */}
        {file && (
          <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border-primary">
            <FileText className="w-5 h-5 text-text-secondary shrink-0" aria-hidden="true" />
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
                aria-pressed={module === mod}
                className={cn(
                  "h-8 rounded-lg text-xs font-semibold transition-all",
                  "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                  module === mod
                    ? "bg-accent-subtle border-border-focus text-accent-text"
                    : "bg-bg-secondary border-border-primary text-text-secondary hover:border-border-secondary hover:text-text-primary"
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
                aria-pressed={contentType === type.value}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-lg border text-left",
                  "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                  contentType === type.value ? "bg-accent-subtle border-border-focus" : "bg-bg-secondary border-border-primary hover:border-border-secondary"
                )}
              >
                <div
                  className={cn(
                    "w-3.5 h-3.5 rounded-full border-2 mt-0.5 shrink-0 transition-colors",
                    contentType === type.value ? "border-accent bg-accent" : "border-border-secondary"
                  )}
                  aria-hidden="true"
                />
                <div>
                  <p className={cn("text-sm font-medium", contentType === type.value ? "text-accent-text" : "text-text-primary")}>{type.label}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleUpload} disabled={!canUpload} loading={uploading}>
            Upload document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
