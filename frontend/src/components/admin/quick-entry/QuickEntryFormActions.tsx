import { Loader2, Send, Save, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { QuickEntryContentType } from "@/types"

interface Props {
  formState: string
  status?: string
  contentType: QuickEntryContentType | null
  savedEntryId: string | null
  onSaveDraft: () => void
  onSubmit: () => void
  onViewProcessing: () => void
}

export function QuickEntryFormActions({ formState, status, contentType, savedEntryId, onSaveDraft, onSubmit, onViewProcessing }: Props) {
  const isSubmitting = formState === "submitting" || formState === "duplicate_checking"
  const isProcessing = formState === "processing"
  const isArchived = formState === "archived"

  if (isArchived) {
    return (
      <div className="px-6 py-3 border-t border-border-primary flex items-center justify-between shrink-0">
        <p className="text-xs text-text-tertiary">Archived entries cannot be edited. Create a new version to restore.</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-3 border-t border-border-primary flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        {savedEntryId && status === "draft" && (
          <button
            onClick={onSaveDraft}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary disabled:opacity-40"
          >
            <Save className="w-3 h-3" aria-hidden="true" />
            Save draft
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isProcessing && (
          <button onClick={onViewProcessing} className="flex items-center gap-1.5 text-xs text-accent hover:underline">
            <Eye className="w-3 h-3" aria-hidden="true" />
            View processing status
          </button>
        )}

        <Button variant="default" size="sm" disabled={!contentType || isSubmitting || isProcessing} onClick={onSubmit}>
          {(isSubmitting || isProcessing) && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Submitting…" : isProcessing ? "Processing…" : "Submit to Knowledge Base"}
          {!isSubmitting && !isProcessing && <Send className="w-3 h-3 ml-1.5" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  )
}
