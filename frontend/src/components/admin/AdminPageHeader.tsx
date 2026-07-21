import { cn } from "@/lib/utils"

interface AdminPageHeaderProps {
  title: string
  description?: string
  /** Action buttons rendered on the right side */
  actions?: React.ReactNode
  /** Optional: left-side supplementary content (e.g. filter chips) */
  leftSlot?: React.ReactNode
  className?: string
}

/**
 * Reusable page header for all admin pages.
 * Renders: title (left) + optional description + actions (right).
 *
 * RULE: Every admin page must have an AdminPageHeader at the top.
 * Do not hardcode page headers in individual pages.
 *
 * @example
 * <AdminPageHeader
 *   title="Documents"
 *   description="Manage the SAP knowledge base documents"
 *   actions={
 *     <Button onClick={openUpload}>
 *       <Upload className="w-4 h-4" /> Upload document
 *     </Button>
 *   }
 * />
 */
export function AdminPageHeader({ title, description, actions, leftSlot, className }: AdminPageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      {/* Left: title + description */}
      <div className="space-y-1 min-w-0">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">{title}</h1>
        {description && <p className="text-sm text-text-secondary">{description}</p>}
        {leftSlot && <div className="mt-3">{leftSlot}</div>}
      </div>

      {/* Right: action buttons */}
      {actions && <div className="flex items-center gap-2 shrink-0 mt-0.5">{actions}</div>}
    </div>
  )
}
