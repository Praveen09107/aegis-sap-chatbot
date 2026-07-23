import { AlertTriangle, ExternalLink, X } from "lucide-react"
import type { DuplicateMatch } from "@/types"
import { QuickEntrySourceBadge } from "./QuickEntrySourceBadge"
import { Button } from "@/components/ui/button"

interface Props {
  matches: DuplicateMatch[]
  onSubmitAnyway: () => void
  onUpdateExisting: (match: DuplicateMatch) => void
  onCancel: () => void
}

export function DuplicateCheckModal({ matches, onSubmitAnyway, onUpdateExisting, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Similar existing knowledge found">
      <div className="w-full max-w-lg bg-bg-secondary rounded-xl shadow-2xl border border-border-primary overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border-primary">
          <AlertTriangle className="w-4.5 h-4.5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-text-primary">Similar existing knowledge found</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              {matches.length} existing {matches.length === 1 ? "entry" : "entries"} may cover this topic. Review below before creating a duplicate.
            </p>
          </div>
          <button onClick={onCancel} className="text-text-tertiary hover:text-text-primary" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto divide-y divide-border-primary">
          {matches.map((match) => (
            <div key={match.document_id} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-text-primary truncate">{match.title}</span>
                    <span className="text-[10px] font-mono text-text-tertiary shrink-0">{match.document_id}</span>
                    <QuickEntrySourceBadge sourceType={match.source_type} />
                  </div>
                  <p className="text-[11px] text-text-tertiary line-clamp-2 mb-1">{match.preview}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-warning">{Math.round(match.similarity_score * 100)}% similar</span>
                    <span className="text-[10px] text-text-tertiary">
                      {match.module} · Verified {match.last_verified}
                    </span>
                  </div>
                </div>

                {match.source_type === "form_entry" && (
                  <button onClick={() => onUpdateExisting(match)} className="text-[11px] text-accent hover:underline whitespace-nowrap shrink-0 flex items-center gap-1">
                    Update existing
                    <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border-primary bg-bg-card">
          <button onClick={onCancel} className="text-xs text-text-tertiary hover:text-text-primary">
            Go back and review my entry
          </button>
          <Button variant="default" size="sm" onClick={onSubmitAnyway}>
            My topic is different — submit anyway
          </Button>
        </div>
      </div>
    </div>
  )
}
