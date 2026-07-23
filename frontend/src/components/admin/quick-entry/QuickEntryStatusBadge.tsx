import { cn } from "@/lib/utils"
import type { QuickEntryStatus } from "@/types"

interface Props {
  status: QuickEntryStatus
  size?: "sm" | "xs"
}

const STATUS_CONFIG: Record<QuickEntryStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "text-text-tertiary bg-bg-tertiary" },
  processing: { label: "Processing…", className: "text-accent bg-accent-subtle animate-pulse" },
  active: { label: "Active", className: "text-success-text bg-success-bg" },
  archived: { label: "Archived", className: "text-text-tertiary bg-bg-tertiary line-through" },
  low_quality: { label: "Low quality", className: "text-danger-text bg-danger-bg" },
  failed: { label: "Failed", className: "text-danger-text bg-danger-bg font-medium" },
  partial_index: { label: "Partial index", className: "text-warning-text bg-warning-bg" },
  review_required: { label: "Review required", className: "text-warning-text bg-warning-bg font-medium" },
}

export function QuickEntryStatusBadge({ status, size = "xs" }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded whitespace-nowrap shrink-0",
        size === "xs" ? "text-[10px]" : "text-xs",
        config.className
      )}
    >
      {config.label}
    </span>
  )
}
