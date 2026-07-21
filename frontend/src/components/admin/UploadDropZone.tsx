"use client"

import { useState, useCallback, useRef } from "react"
import { Upload, FileText } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Button } from "@/components/ui/button"
import { cn, formatFileSize } from "@/lib/utils"
import { LIMITS } from "@/lib/constants"
import { toastError } from "@/lib/toast"

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
export function UploadDropZone({ onFileReady, uploading = false, className }: UploadDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  // Plain ref, not state — nothing ever reads this count directly (only
  // isDragging drives rendering); it's pure bookkeeping to handle
  // dragenter/dragleave firing repeatedly for child elements, so a ref
  // avoids a wholly unnecessary extra re-render per drag event.
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function validateFile(file: File): string | null {
    if (file.type !== "application/pdf") {
      return "Only PDF files are supported"
    }
    if (file.size > LIMITS.MAX_DOCUMENT_BYTES) {
      return `File too large — maximum size is ${formatFileSize(LIMITS.MAX_DOCUMENT_BYTES)}`
    }
    return null
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current += 1
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      dragCounterRef.current = 0
      const file = e.dataTransfer.files[0]
      if (!file) return
      const error = validateFile(file)
      if (error) {
        toastError(error)
        return
      }
      onFileReady(file)
    },
    [onFileReady]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const error = validateFile(file)
      if (error) {
        toastError(error)
        e.target.value = ""
        return
      }
      onFileReady(file)
      e.target.value = ""
    },
    [onFileReady]
  )

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 border-dashed",
        "transition-all duration-[var(--duration-slow)]",
        "flex flex-col items-center justify-center gap-3",
        "py-10 px-6 text-center",
        uploading
          ? "border-border-primary bg-bg-secondary opacity-60 pointer-events-none"
          : isDragging
            ? "border-accent bg-accent-subtle"
            : "border-border-secondary bg-bg-secondary hover:border-border-strong hover:bg-bg-tertiary",
        className
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
      <AnimatePresence mode="wait">
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
              <Upload className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-accent">Drop to upload</p>
          </motion.div>
        ) : (
          <motion.div key="default-icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-bg-tertiary border border-border-primary flex items-center justify-center">
              <FileText className="w-6 h-6 text-text-tertiary" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">Drag and drop a document here</p>
              <p className="text-xs text-text-tertiary">PDF only · max {formatFileSize(LIMITS.MAX_DOCUMENT_BYTES)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              Browse files
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
