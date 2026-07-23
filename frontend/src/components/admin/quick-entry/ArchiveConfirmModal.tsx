"use client"

import { useState } from "react"
import { Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useArchiveQuickEntry } from "@/hooks/queries"

interface Props {
  entryId: string
  documentId: string
  onSuccess: () => void
  onCancel: () => void
}

export function ArchiveConfirmModal({ entryId, documentId, onSuccess, onCancel }: Props) {
  const [typedId, setTypedId] = useState("")
  const archiveMutation = useArchiveQuickEntry()
  const isMatch = typedId === documentId

  const handleArchive = async () => {
    if (!isMatch) return
    await archiveMutation.mutateAsync({ id: entryId, confirmedDocumentId: documentId })
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Archive this entry">
      <div className="w-full max-w-sm bg-bg-secondary rounded-xl shadow-2xl border border-danger-border overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border-primary">
          <Trash2 className="w-4.5 h-4.5 text-danger shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-text-primary">Archive this entry?</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              Archiving removes this entry from the active knowledge base. Existing employees will no longer receive answers from it. Version history is preserved.
            </p>
          </div>
          <button onClick={onCancel} className="text-text-tertiary hover:text-text-primary" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-text-tertiary block mb-1.5" htmlFor="archive-confirm-id">
              Type <span className="font-mono font-medium text-text-primary">{documentId}</span> to confirm:
            </label>
            <input
              id="archive-confirm-id"
              type="text"
              value={typedId}
              onChange={(e) => setTypedId(e.target.value)}
              placeholder={documentId}
              className={
                "w-full px-3 py-2 text-sm rounded-md border font-mono focus:outline-none bg-bg-card text-text-primary " +
                (isMatch && typedId ? "border-success focus:border-success" : "border-border-primary focus:border-border-focus")
              }
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between">
            <button onClick={onCancel} className="text-xs text-text-tertiary hover:text-text-primary">
              Cancel
            </button>
            <Button variant="destructive" size="sm" disabled={!isMatch || archiveMutation.isPending} onClick={handleArchive}>
              {archiveMutation.isPending ? "Archiving…" : "Archive entry"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
