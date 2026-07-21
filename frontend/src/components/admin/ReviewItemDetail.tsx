"use client"

import { CheckCircle2, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ClaimHighlighter } from "./ClaimHighlighter"
import { cn, formatDateLocalized } from "@/lib/utils"
import type { ReviewItem } from "@/hooks/queries/adminData"

interface ReviewItemDetailProps {
  item: ReviewItem | null
  currentIndex: number
  totalItems: number
  correctionText: string
  onCorrectionTextChange: (text: string) => void
  onApprove: () => void
  onSkip: () => void
  isSubmitting?: boolean
}

/**
 * Right panel of the review queue split-pane.
 * Shows the full query, original AI response with unsupported claims
 * highlighted, and an editable correction textarea.
 *
 * Adapted (2026-07-22) from FRONTEND_21's spec: the real
 * POST /admin/review-queue/{id}/resolve requires a non-empty
 * admin_correct_answer (400s otherwise) and has no suggested_correction or
 * document_reference data to draw from — the textarea is never pre-filled,
 * "Approve correction" stays disabled until text is entered, and the
 * "Source document" section is dropped entirely. correctionText is
 * controlled by the parent page (not local state) so the J/K/A/X keyboard
 * shortcuts registered there can read/submit whatever's currently typed.
 */
export function ReviewItemDetail({
  item,
  currentIndex,
  totalItems,
  correctionText,
  onCorrectionTextChange,
  onApprove,
  onSkip,
  isSubmitting = false,
}: ReviewItemDetailProps) {
  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-tertiary">Select an item from the queue</div>
    )
  }

  const canApprove = correctionText.trim().length > 0 && !isSubmitting

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: progress indicator */}
      <div className="px-6 py-3 border-b border-border-primary shrink-0 flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">
          Item {currentIndex + 1} of {totalItems} pending
        </p>
        <p className="text-xs text-text-tertiary">{formatDateLocalized(item.created_at)}</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Employee's question */}
        <section>
          <p className="section-label mb-2">Employee&apos;s question</p>
          <div className="surface-sunken rounded-xl p-3">
            <p className="text-sm text-text-primary leading-relaxed">{item.query_text}</p>
          </div>
        </section>

        {/* Original AI response with highlighted claims */}
        <section>
          <p className="section-label mb-2">Original AI response</p>
          <div className="surface-sunken rounded-xl p-3">
            <ClaimHighlighter text={item.answer_text} claims={item.unsupported_claims} />
          </div>
          {item.unsupported_claims.length > 0 && (
            <p className="text-xs text-danger-text mt-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-danger-bg border border-danger-border inline-block" aria-hidden="true" />
              {item.unsupported_claims.length} unsupported claim{item.unsupported_claims.length !== 1 ? "s" : ""} flagged
            </p>
          )}
        </section>

        {/* Correction input */}
        <section>
          <p className="section-label mb-2">Your correction</p>
          <p className="text-xs text-text-tertiary mb-2 leading-relaxed">
            Provide the correct information. This will be added to the knowledge base and used in future responses.
          </p>
          <textarea
            value={correctionText}
            onChange={(e) => onCorrectionTextChange(e.target.value)}
            placeholder="Enter the correct answer or procedure..."
            rows={5}
            disabled={isSubmitting}
            className={cn(
              "w-full rounded-xl border border-border-primary bg-bg-secondary",
              "text-sm text-text-primary placeholder:text-text-tertiary",
              "px-4 py-3 resize-none",
              "focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus",
              "disabled:opacity-50"
            )}
            aria-label="Correction text"
          />
          <p className="text-xs text-text-tertiary mt-1">A correction is required to approve — the backend has no partial/skip state.</p>
        </section>
      </div>

      {/* Footer: action buttons */}
      <div className="px-6 py-4 border-t border-border-primary shrink-0 flex items-center gap-3">
        <Button size="default" onClick={onApprove} loading={isSubmitting} disabled={!canApprove} className="gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Approve correction
          <kbd className="text-[10px] bg-white/20 rounded px-1 py-0.5">A</kbd>
        </Button>

        <Button variant="outline" size="default" onClick={onSkip} disabled={isSubmitting} className="gap-2">
          <SkipForward className="w-4 h-4" />
          Skip
          <kbd className="text-[10px] bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-text-tertiary">X</kbd>
        </Button>
      </div>
    </div>
  )
}
