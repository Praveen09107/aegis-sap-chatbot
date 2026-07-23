"use client"

import { useState } from "react"
import type { ScreenshotReference } from "@/types"
import { AttributionScreenshotThumbnail } from "./AttributionScreenshotThumbnail"
import { ScreenshotLightbox } from "./ScreenshotLightbox"

interface Props {
  screenshots: ScreenshotReference[]
}

/** Renders the Quick Entry screenshots attached to this answer's source, if any (FRONTEND_40). */
export function AttributionScreenshotsSection({ screenshots }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (screenshots.length === 0) return null

  return (
    <div>
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide">
        Screenshot{screenshots.length > 1 ? "s" : ""}
      </span>
      <div className="flex gap-2 mt-1.5 flex-wrap">
        {screenshots.map((screenshot, i) => (
          <AttributionScreenshotThumbnail key={screenshot.url} screenshot={screenshot} onClick={() => setActiveIndex(i)} />
        ))}
      </div>

      {activeIndex !== null && (
        <ScreenshotLightbox screenshots={screenshots} activeIndex={activeIndex} onIndexChange={setActiveIndex} onClose={() => setActiveIndex(null)} />
      )}
    </div>
  )
}
