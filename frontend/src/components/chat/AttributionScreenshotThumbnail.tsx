"use client"

import { ImageIcon } from "lucide-react"
import type { ScreenshotReference } from "@/types"

interface Props {
  screenshot: ScreenshotReference
  onClick: () => void
}

/**
 * Small clickable thumbnail in the attribution panel's screenshots row —
 * opens ScreenshotLightbox on click. Named distinctly from the existing
 * chat/ScreenshotThumbnail.tsx (an unrelated component: the compose bar's
 * own outgoing-screenshot-attachment preview), which this is not related to.
 */
export function AttributionScreenshotThumbnail({ screenshot, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title={screenshot.caption}
      className="relative w-14 h-14 rounded-md border border-border-primary overflow-hidden shrink-0 hover:border-border-focus transition-colors group"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL, not optimizable by next/image */}
      <img src={screenshot.url} alt={screenshot.caption} className="w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <ImageIcon className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
      </div>
    </button>
  )
}
