import type { AutoSaveStatus } from "@/hooks/useAutoSave"
import { Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react"

export function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
        <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
        Saving draft…
      </span>
    )
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-success">
        <CheckCircle className="w-2.5 h-2.5" aria-hidden="true" />
        Draft saved
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-warning">
        <AlertCircle className="w-2.5 h-2.5" aria-hidden="true" />
        Save failed — will retry
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
      <Clock className="w-2.5 h-2.5" aria-hidden="true" />
      Auto-saves every 30s
    </span>
  )
}
