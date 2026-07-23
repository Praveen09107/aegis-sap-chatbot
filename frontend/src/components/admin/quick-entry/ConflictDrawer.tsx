import { X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { QuickEntryFull } from "@/types"

interface Props {
  serverEntry: QuickEntryFull
  onAcceptServer: () => void
  onKeepLocal: () => void
  onClose: () => void
}

export function ConflictDrawer({ serverEntry, onAcceptServer, onKeepLocal, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="w-[480px] h-full bg-bg-secondary border-l border-border-primary shadow-xl flex flex-col pointer-events-auto">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-warning-border bg-warning-bg">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-text-primary">Editing conflict</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              Another admin saved changes to this entry while you were editing. Current server version is {serverEntry.version}. Choose how to proceed:
            </p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="p-4 rounded-lg border border-border-primary bg-bg-card">
            <p className="text-sm font-medium text-text-primary mb-1">Use the server version</p>
            <p className="text-xs text-text-tertiary mb-3">Discard your changes and load the version saved by the other admin. Your edits will be lost.</p>
            <Button variant="outline" size="sm" onClick={onAcceptServer}>
              Load server version (v{serverEntry.version})
            </Button>
          </div>

          <div className="p-4 rounded-lg border border-border-primary bg-bg-card">
            <p className="text-sm font-medium text-text-primary mb-1">Keep my changes</p>
            <p className="text-xs text-text-tertiary mb-3">
              Submit your version anyway. Your changes will overwrite the other admin&apos;s edits. The overwritten version is still in version history.
            </p>
            <Button variant="default" size="sm" onClick={onKeepLocal}>
              Submit my version
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
