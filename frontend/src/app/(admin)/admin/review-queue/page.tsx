"use client"

import { useCallback, useState } from "react"
import { CheckCircle } from "lucide-react"
import { ReviewItemList } from "@/components/admin/ReviewItemList"
import { ReviewItemDetail } from "@/components/admin/ReviewItemDetail"
import { EmptyState } from "@/components/admin/EmptyState"
import { useAdminReviewQueue, useResolveReview } from "@/hooks/queries"
import { useAdminStore } from "@/stores/adminStore"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { TOAST } from "@/lib/toast"
import { SHORTCUTS } from "@/lib/constants"

/**
 * Review queue page — full viewport split-pane layout.
 * Does NOT use AdminPageWrapper (takes full height).
 * Keyboard shortcuts: J=next, K=prev, A=approve, X=skip.
 *
 * Skip is client-side only (2026-07-22): the real
 * POST /admin/review-queue/{id}/resolve always sets status='resolved' and
 * requires a non-empty admin_correct_answer — there's no skip/reject write
 * path. Skip just advances the local queue position without persisting
 * anything; the item reappears on the next 30s poll.
 */
export default function AdminReviewQueuePage() {
  const { data: items = [], isLoading } = useAdminReviewQueue("pending")
  const resolve = useResolveReview()
  const { reviewQueueIndex, setReviewQueueIndex, advanceReviewQueue } = useAdminStore()
  const [correctionText, setCorrectionText] = useState("")

  const currentItem = items[reviewQueueIndex] ?? null

  // Reset the correction draft whenever the active item changes — there's
  // no suggested_correction to prefill from (see ReviewItemDetail). Adjusts
  // state during render (React's documented pattern for state derived from
  // props) rather than in an effect, which would cause an extra cascading
  // render (react-hooks/set-state-in-effect) — same pattern already used by
  // InlineEditCell.tsx.
  const [prevItemId, setPrevItemId] = useState<string | undefined>(undefined)
  if (currentItem?.id !== prevItemId) {
    setPrevItemId(currentItem?.id)
    setCorrectionText("")
  }

  const goNext = useCallback(() => {
    setReviewQueueIndex(Math.min(reviewQueueIndex + 1, Math.max(items.length - 1, 0)))
  }, [reviewQueueIndex, items.length, setReviewQueueIndex])

  const goPrev = useCallback(() => {
    setReviewQueueIndex(Math.max(reviewQueueIndex - 1, 0))
  }, [reviewQueueIndex, setReviewQueueIndex])

  const handleApprove = useCallback(async () => {
    if (!currentItem || !correctionText.trim()) return
    await resolve.mutateAsync({ item_id: currentItem.id, admin_correct_answer: correctionText.trim() })
    advanceReviewQueue()
  }, [currentItem, correctionText, resolve, advanceReviewQueue])

  const handleSkip = useCallback(() => {
    TOAST.correctionSkipped()
    advanceReviewQueue()
  }, [advanceReviewQueue])

  // Deliberately NOT ignoreInInput: false, despite FRONTEND_21's literal
  // instruction ("these shortcuts work even when focused inside the
  // correction textarea"). Confirmed live (2026-07-22): with that flag set,
  // typing a real correction containing the letters j/k/a/x — e.g. "batch"
  // — fires Approve/navigate mid-keystroke on every occurrence, submitting
  // whatever's been typed so far. Free text will always contain some of
  // these letters, so the literal spec behavior is unsafe here. Shortcuts
  // fire everywhere else on the page (the item list, or nothing focused) —
  // just not while the cursor is actually in the textarea.
  useKeyboardShortcuts([
    { key: SHORTCUTS.REVIEW_NEXT, handler: goNext },
    { key: SHORTCUTS.REVIEW_PREV, handler: goPrev },
    {
      key: SHORTCUTS.REVIEW_APPROVE,
      handler: () => {
        if (currentItem && correctionText.trim()) void handleApprove()
      },
    },
    { key: SHORTCUTS.REVIEW_SKIP, handler: handleSkip },
  ])

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          icon={CheckCircle}
          title="Review queue is empty"
          description="All items have been reviewed. New items will appear here when employees submit feedback on AI responses."
          variant="page"
        />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden" role="main" aria-label="Review queue">
      {/* Left: item list — fixed 288px */}
      <div className="w-72 border-r border-border-primary flex-shrink-0 overflow-hidden bg-bg-primary">
        <ReviewItemList items={items} currentIndex={reviewQueueIndex} onSelect={setReviewQueueIndex} totalPending={items.length} />
      </div>

      {/* Right: item detail — flex */}
      <div className="flex-1 overflow-hidden bg-bg-card">
        <ReviewItemDetail
          item={currentItem}
          currentIndex={reviewQueueIndex}
          totalItems={items.length}
          correctionText={correctionText}
          onCorrectionTextChange={setCorrectionText}
          onApprove={handleApprove}
          onSkip={handleSkip}
          isSubmitting={resolve.isPending}
        />
      </div>
    </div>
  )
}
