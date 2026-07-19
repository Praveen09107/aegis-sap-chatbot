"use client"

import { useMemo } from "react"
import { detectSAPEntities, splitTextByEntities } from "@/lib/sapEntityDetector"
import { EntityChip } from "./EntityChip"

interface SAPEntityHighlighterProps {
  text: string
  showTooltips?: boolean
}

/**
 * Automatically detects and highlights SAP entities in text. Returns a mix
 * of plain text spans and EntityChip components.
 *
 * Use inside AIResponseBubble for answer content. Do NOT use on user
 * messages (they're displayed as-is for trust reasons).
 *
 * @example
 * <SAPEntityHighlighter text="Fix the VL150 error by opening MM02 and checking MRP 2 tab." />
 * // Renders: "Fix the " [VL150 chip] " error by opening " [MM02 chip] " and checking MRP 2 tab."
 */
export function SAPEntityHighlighter({ text, showTooltips = true }: SAPEntityHighlighterProps) {
  const segments = useMemo(() => {
    const entities = detectSAPEntities(text)
    return splitTextByEntities(text, entities)
  }, [text])

  return (
    <>
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.content}</span>
        ) : (
          <EntityChip key={i} type={segment.entity!.type} value={segment.content} showTooltip={showTooltips} />
        )
      )}
    </>
  )
}
