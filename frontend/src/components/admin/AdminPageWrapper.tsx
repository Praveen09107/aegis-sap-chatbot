import { cn } from "@/lib/utils"

interface AdminPageWrapperProps {
  children: React.ReactNode
  /** Extra wide pages (system health grid, analytics) use 'wide' */
  width?: "default" | "wide" | "full"
  className?: string
}

/**
 * Standard content padding wrapper for all admin pages.
 * Provides consistent horizontal padding and optional max-width.
 *
 * RULE: Every admin page.tsx wraps its content in AdminPageWrapper.
 *
 * @example
 * <AdminPageWrapper>
 *   <AdminPageHeader title="Documents" />
 *   <DataTable ... />
 * </AdminPageWrapper>
 */
export function AdminPageWrapper({ children, width = "default", className }: AdminPageWrapperProps) {
  return (
    <div
      className={cn(
        "px-6 py-5",
        width === "default" && "max-w-[1200px]",
        width === "wide" && "max-w-[1400px]",
        width === "full" && "max-w-none",
        className
      )}
    >
      {children}
    </div>
  )
}
