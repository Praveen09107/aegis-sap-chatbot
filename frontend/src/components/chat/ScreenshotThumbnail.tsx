"use client"

import Image from "next/image"
import { X } from "lucide-react"
import { cn, formatFileSize } from "@/lib/utils"

interface ScreenshotThumbnailProps {
  file: File
  previewUrl: string
  onRemove: () => void
  className?: string
}

export function ScreenshotThumbnail({ file, previewUrl, onRemove, className }: ScreenshotThumbnailProps) {
  return (
    <div className={cn("inline-flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-lg p-2", className)}>
      <div className="relative w-10 h-10 rounded overflow-hidden shrink-0">
        <Image src={previewUrl} alt="Screenshot preview" fill className="object-cover" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-primary truncate max-w-[140px]">{file.name}</p>
        <p className="text-xs text-text-tertiary">{formatFileSize(file.size)}</p>
      </div>
      <button
        onClick={onRemove}
        className="w-5 h-5 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        aria-label="Remove screenshot"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
