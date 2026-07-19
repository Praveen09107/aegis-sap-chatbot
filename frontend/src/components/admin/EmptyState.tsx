import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** 'page' renders larger centered state; 'inline' renders compact version */
  variant?: "page" | "inline"
}

/**
 * Consistent empty state for all admin lists, tables, and sections.
 *
 * @example
 * // Full page empty state
 * <EmptyState
 *   icon={FileText}
 *   title="No documents uploaded yet"
 *   description="Upload SAP documentation to start training the knowledge base."
 *   action={<Button onClick={openUpload}>Upload document</Button>}
 * />
 *
 * // Inline empty state (inside a card)
 * <EmptyState variant="inline" title="No items match your filters" />
 */
export function EmptyState({ icon: Icon, title, description, action, className, variant = "inline" }: EmptyStateProps) {
  const isPage = variant === "page"

  return (
    <div
      className={cn("flex flex-col items-center justify-center text-center", isPage ? "gap-4 py-20 px-8" : "gap-3 py-12 px-6", className)}
    >
      {Icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl",
            "bg-bg-secondary border border-border-primary",
            isPage ? "w-16 h-16" : "w-12 h-12"
          )}
        >
          <Icon className={cn("text-text-tertiary", isPage ? "w-8 h-8" : "w-6 h-6")} aria-hidden="true" />
        </div>
      )}

      <div className="space-y-1.5">
        <p className={cn("font-semibold text-text-primary", isPage ? "text-lg" : "text-sm")}>{title}</p>
        {description && (
          <p className={cn("text-text-secondary leading-relaxed max-w-sm mx-auto", isPage ? "text-sm" : "text-xs")}>
            {description}
          </p>
        )}
      </div>

      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
