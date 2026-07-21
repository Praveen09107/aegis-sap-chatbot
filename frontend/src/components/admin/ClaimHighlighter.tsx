"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

interface ClaimHighlighterProps {
  text: string
  /**
   * Real human_review_queue.unsupported_claims is a TEXT[] (FRONTEND_21
   * assumed a single `claim: string`) — every claim substring found in
   * `text` is highlighted, not just one.
   */
  claims: string[]
  className?: string
}

interface Range {
  start: number
  end: number
}

function findClaimRanges(text: string, claims: string[]): Range[] {
  const lowerText = text.toLowerCase()
  const ranges: Range[] = []

  for (const claim of claims) {
    if (!claim) continue
    const lowerClaim = claim.toLowerCase()
    let fromIndex = 0
    while (fromIndex <= lowerText.length) {
      const idx = lowerText.indexOf(lowerClaim, fromIndex)
      if (idx === -1) break
      ranges.push({ start: idx, end: idx + claim.length })
      fromIndex = idx + claim.length
    }
  }

  ranges.sort((a, b) => a.start - b.start)

  // Merge overlapping/adjacent ranges so overlapping claims don't produce
  // nested/duplicate <mark> segments.
  const merged: Range[] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end)
    } else {
      merged.push({ ...r })
    }
  }
  return merged
}

/**
 * Highlights one or more problematic claim substrings within a response
 * text. Used in the review queue to show which parts of the response were
 * flagged as unsupported by retrieval.
 *
 * unsupported_claims entries are substrings of answer_text. Claims that
 * aren't found (text differs slightly) are silently skipped — the rest
 * still render plain.
 */
export function ClaimHighlighter({ text, claims, className }: ClaimHighlighterProps) {
  const segments = useMemo(() => {
    const ranges = findClaimRanges(text, claims)
    if (ranges.length === 0) return [{ type: "text" as const, content: text }]

    const segs: Array<{ type: "text" | "claim"; content: string }> = []
    let cursor = 0
    for (const r of ranges) {
      if (r.start > cursor) segs.push({ type: "text", content: text.slice(cursor, r.start) })
      segs.push({ type: "claim", content: text.slice(r.start, r.end) })
      cursor = r.end
    }
    if (cursor < text.length) segs.push({ type: "text", content: text.slice(cursor) })
    return segs
  }, [text, claims])

  return (
    <p className={cn("text-sm text-text-primary leading-relaxed whitespace-pre-wrap", className)}>
      {segments.map((seg, i) =>
        seg.type === "claim" ? (
          <mark
            key={i}
            className="bg-danger-bg text-danger-text rounded px-0.5 not-italic border-b border-danger-border"
            title="Flagged as an unsupported claim"
          >
            {seg.content}
          </mark>
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </p>
  )
}
