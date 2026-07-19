"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { ADMIN_NAV_ITEMS, LAYOUT } from "@/lib/constants"

/**
 * Admin portal page-level header.
 * Fixed height (52px). Content:
 * - Left: current page title + short description
 * - Right: skip-to-content link (a11y) + theme toggle
 *
 * Page titles and descriptions are derived from the current pathname
 * matched against ADMIN_NAV_ITEMS.
 */
export function AdminTopbar() {
  const pathname = usePathname()

  // Match current pathname to nav item for page title
  const currentNav = ADMIN_NAV_ITEMS.find((item) =>
    item.href === "/admin/dashboard"
      ? pathname === "/admin/dashboard" || pathname === "/admin"
      : pathname.startsWith(item.href)
  )

  const pageTitle = currentNav?.label ?? "Admin"

  // Short descriptions per admin page
  const PAGE_DESCRIPTIONS: Record<string, string> = {
    "/admin/dashboard": "Live quality overview",
    "/admin/documents": "Manage knowledge documents",
    "/admin/registry": "Known error patterns",
    "/admin/config-snapshot": "SAP configuration values",
    "/admin/knowledge-gaps": "Unanswered query analysis",
    "/admin/audit-trail": "Employee interaction history",
    "/admin/review-queue": "Human review workflow",
    "/admin/tickets": "Escalated support tickets",
    "/admin/system-health": "19 Docker service statuses",
    "/admin/analytics": "Quality trend reporting",
  }

  const pageDesc = PAGE_DESCRIPTIONS[currentNav?.href ?? ""] ?? ""

  return (
    <header
      className={cn(
        "flex items-center justify-between",
        "border-b border-border-primary bg-bg-primary",
        "px-6 shrink-0",
      )}
      style={{ height: LAYOUT.ADMIN_TOPBAR_HEIGHT }}
    >
      {/* Page identity */}
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold text-text-primary">{pageTitle}</h1>
        {pageDesc && (
          <span className="text-xs text-text-tertiary hidden lg:block">{pageDesc}</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Skip to main content link (a11y) */}
        <a
          href="#admin-main-content"
          className="sr-only focus:not-sr-only focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-xs focus:bg-bg-secondary focus:text-text-primary focus:ring-2 focus:ring-border-focus"
        >
          Skip to content
        </a>
        <ThemeToggle size="sm" />
      </div>
    </header>
  )
}
