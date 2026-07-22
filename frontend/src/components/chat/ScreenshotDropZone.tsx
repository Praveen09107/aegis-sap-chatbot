"use client"

import { useState, useCallback } from "react"
import { ImageIcon } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/constants"
import { toastError } from "@/lib/toast"
import { FADE_IN } from "@/lib/animations"

interface ScreenshotDropZoneProps {
  onFileAccepted: (file: File) => void
  children: React.ReactNode
  className?: string
}

/**
 * Full-area drag-and-drop zone for SAP screenshots. Wraps the entire chat
 * area — when a PNG/JPG is dragged over, shows a full overlay with a drop
 * prompt.
 *
 * Validates: file type (image/*), file size (max 10MB). On acceptance:
 * calls onFileAccepted, parent shows ScreenshotThumbnail.
 *
 * @example
 * <ScreenshotDropZone onFileAccepted={(file) => chatStore.setPendingScreenshot(file)}>
 *   <MessageList />
 *   <ComposeBar />
 * </ScreenshotDropZone>
 */
export function ScreenshotDropZone({ onFileAccepted, children, className }: ScreenshotDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  // Counter (not read directly, only via functional updates) to handle
  // child-element dragenter/dragleave pairs firing as the cursor crosses
  // nested elements within the drop zone.
  const [, setDragCounter] = useState(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragCounter((c) => c + 1)
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragCounter((c) => {
      const next = c - 1
      if (next === 0) setIsDragging(false)
      return next
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      setDragCounter(0)

      const file = e.dataTransfer.files[0]
      if (!file) return

      validateAndAccept(file, onFileAccepted)
    },
    [onFileAccepted]
  )

  return (
    <div className={cn("relative", className)} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {children}

      {/* Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            variants={FADE_IN}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "absolute inset-0 z-overlay",
              "flex flex-col items-center justify-center gap-3",
              "bg-accent-subtle/90 border-2 border-dashed border-accent",
              "rounded-xl",
              "pointer-events-none"
            )}
            aria-hidden="true"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-accent-text">Drop SAP screenshot here</p>
              <p className="text-sm text-text-secondary mt-1">PNG, JPG — max 10MB</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function validateAndAccept(file: File, onAccept: (file: File) => void) {
  if (!file.type.startsWith("image/")) {
    toastError("Invalid file type", "Please drop an image file (PNG, JPG)")
    return
  }
  if (file.size > LIMITS.MAX_SCREENSHOT_BYTES) {
    toastError("File too large", "Screenshot must be under 10MB")
    return
  }
  onAccept(file)
}
