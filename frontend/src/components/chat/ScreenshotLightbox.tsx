"use client"

import { useEffect, useCallback } from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import type { ScreenshotReference } from "@/types"

interface Props {
  screenshots: ScreenshotReference[]
  activeIndex: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

/** Full-size screenshot viewer with prev/next navigation, opened from AttributionScreenshotsSection. */
export function ScreenshotLightbox({ screenshots, activeIndex, onIndexChange, onClose }: Props) {
  const active = screenshots[activeIndex]

  const goPrev = useCallback(() => {
    onIndexChange((activeIndex - 1 + screenshots.length) % screenshots.length)
  }, [activeIndex, screenshots.length, onIndexChange])

  const goNext = useCallback(() => {
    onIndexChange((activeIndex + 1) % screenshots.length)
  }, [activeIndex, screenshots.length, onIndexChange])

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft" && screenshots.length > 1) goPrev()
      else if (e.key === "ArrowRight" && screenshots.length > 1) goNext()
    }
    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  }, [onClose, goPrev, goNext, screenshots.length])

  if (!active) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      onClick={onClose}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-4 right-4 text-white/80 hover:text-white"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {screenshots.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            goPrev()
          }}
          className="absolute left-4 text-white/80 hover:text-white p-2"
          aria-label="Previous screenshot"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      <div className="max-w-4xl max-h-[80vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL, not optimizable by next/image */}
        <img src={active.url} alt={active.caption} className="max-w-full max-h-[70vh] rounded-lg object-contain" />
        <div className="text-center">
          <p className="text-sm text-white">{active.caption}</p>
          {screenshots.length > 1 && (
            <p className="text-xs text-white/60 mt-1">
              {activeIndex + 1} of {screenshots.length}
            </p>
          )}
        </div>
      </div>

      {screenshots.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            goNext()
          }}
          className="absolute right-4 text-white/80 hover:text-white p-2"
          aria-label="Next screenshot"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}
    </div>
  )
}
