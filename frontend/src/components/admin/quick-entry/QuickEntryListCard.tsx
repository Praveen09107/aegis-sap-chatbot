"use client"

import { FileText, Settings, List, Calendar, Camera, AlertTriangle, ChevronRight, Clock } from "lucide-react"
import type { QuickEntryListItem, QuickEntryContentType } from "@/types"
import { QuickEntryStatusBadge } from "./QuickEntryStatusBadge"
import { QuickEntryFeedbackBadge } from "./QuickEntryFeedbackBadge"
import { formatRelativeDate, cn } from "@/lib/utils"
import { CONTENT_TYPE_LABELS, SAP_MODULES } from "@/lib/constants"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  entry: QuickEntryListItem
  onEdit: () => void
}

const CONTENT_TYPE_ICONS: Record<QuickEntryContentType, typeof FileText> = {
  error_guide: FileText,
  procedure: List,
  config: Settings,
}

export function QuickEntryListCard({ entry, onEdit }: Props) {
  const Icon = CONTENT_TYPE_ICONS[entry.content_type] ?? FileText

  const isAttentionNeeded =
    entry.status === "review_required" ||
    entry.status === "partial_index" ||
    entry.has_failed_screenshots ||
    entry.feedback_summary.net < -2

  const isActionRequired = entry.status === "failed" || entry.status === "low_quality"

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 px-4 py-3 rounded-lg border",
        "bg-bg-card hover:bg-bg-secondary",
        "transition-colors duration-150 cursor-pointer",
        isActionRequired ? "border-danger-border" : isAttentionNeeded ? "border-warning-border" : "border-border-primary"
      )}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onEdit()}
      aria-label={`Edit Quick Entry: ${entry.issue_title}`}
    >
      {/* Content type icon */}
      <div className="shrink-0 w-8 h-8 rounded-md bg-bg-tertiary flex items-center justify-center mt-0.5">
        <Icon className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Title and status badge */}
        <div className="flex items-start gap-2 mb-1">
          <span className="text-sm font-medium text-text-primary truncate flex-1">{entry.issue_title || entry.document_id}</span>
          <QuickEntryStatusBadge status={entry.status} />
        </div>

        {/* Row 2: Meta info */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-text-tertiary">
          <span className="font-mono text-[10px] bg-bg-tertiary px-1.5 py-0.5 rounded">{entry.document_id}</span>
          <span>{SAP_MODULES[entry.module as keyof typeof SAP_MODULES] ?? entry.module}</span>
          <span>{CONTENT_TYPE_LABELS[entry.content_type]}</span>
          <span>v{entry.version}</span>
          <span>
            Verified: {entry.verified_by_name} · {entry.verified_date}
          </span>
        </div>

        {/* Row 3: Badges row */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] text-text-tertiary">{entry.chunk_count} chunks</span>

          {entry.screenshot_count > 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
                entry.has_failed_screenshots ? "bg-danger-bg text-danger-text" : "bg-bg-tertiary text-text-tertiary"
              )}
            >
              <Camera className="w-2.5 h-2.5" aria-hidden="true" />
              {entry.screenshot_count}
              {entry.has_failed_screenshots && " — vision failed"}
            </span>
          )}

          {entry.next_review_date && <ReviewDateBadge nextReviewDate={entry.next_review_date} status={entry.status} />}

          {entry.gap_id && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-subtle text-accent">
              From gap
            </span>
          )}

          <QuickEntryFeedbackBadge summary={entry.feedback_summary} />

          {entry.status === "partial_index" && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warning-bg text-warning-text">
              <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
              Partial index
            </span>
          )}
        </div>
      </div>

      {/* Right: Updated time + chevron */}
      <div className="shrink-0 flex flex-col items-end gap-2 pl-2">
        <span className="text-[10px] text-text-tertiary">{formatRelativeDate(entry.updated_at)}</span>
        <ChevronRight className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary transition-colors" aria-hidden="true" />
      </div>
    </div>
  )
}

function ReviewDateBadge({ nextReviewDate, status }: { nextReviewDate: string; status: string }) {
  const reviewDate = new Date(nextReviewDate)
  const today = new Date()
  const daysUntilReview = Math.ceil((reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (status === "review_required") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warning-bg text-warning-text font-medium">
        <Clock className="w-2.5 h-2.5" aria-hidden="true" />
        Review overdue
      </span>
    )
  }

  if (daysUntilReview <= 14) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warning-bg text-warning-text">
        <Calendar className="w-2.5 h-2.5" aria-hidden="true" />
        Review in {daysUntilReview}d
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
      <Calendar className="w-2.5 h-2.5" aria-hidden="true" />
      Review {nextReviewDate}
    </span>
  )
}

export function QuickEntryListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border-primary bg-bg-card">
          <Skeleton className="w-8 h-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}
