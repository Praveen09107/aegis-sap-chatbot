import type { FeedbackSummary } from "@/types"

export function QuickEntryFeedbackBadge({ summary }: { summary: FeedbackSummary }) {
  const { positive, negative, net } = summary

  // Only show a badge if there is any feedback at all.
  if (positive === 0 && negative === 0) return null

  if (net < -1) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-danger-bg text-danger-text">
        {negative} negative (30d)
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
      {positive > 0 && `${positive}↑`}
      {negative > 0 && ` ${negative}↓`}
    </span>
  )
}
