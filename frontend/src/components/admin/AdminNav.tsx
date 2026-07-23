"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { logout } from "@/lib/auth"
import { useReviewQueueCount } from "@/hooks/queries"
import { orgName, ADMIN_NAV_ITEMS, LAYOUT } from "@/lib/constants"
import { LogOut } from "lucide-react"

// Pages that get a "new" badge (added beyond original spec)
const NEW_PAGES = new Set(["/admin/dashboard", "/admin/system-health", "/admin/analytics", "/admin/quick-entry"])

/**
 * Admin portal navigation sidebar.
 * Fixed width: LAYOUT.ADMIN_SIDEBAR_WIDTH (220px).
 *
 * Contains:
 * - Brand: organization logo (org-configurable via NEXT_PUBLIC_ORG_NAME) + "Admin" text
 * - Nav items list with new/badge indicators
 * - Review queue live count badge
 * - Bottom: user info + logout
 */
export function AdminNav() {
  const pathname = usePathname()
  const { data: reviewCount = 0 } = useReviewQueueCount()

  return (
    <nav
      className={cn(
        "flex flex-col h-dvh shrink-0",
        "bg-bg-primary border-r border-border-primary",
        "overflow-hidden z-sticky",
      )}
      style={{ width: LAYOUT.ADMIN_SIDEBAR_WIDTH }}
      aria-label="Admin navigation"
    >
      {/* Brand */}
      <div
        className="flex items-center gap-2.5 px-4 border-b border-border-primary shrink-0"
        style={{ height: LAYOUT.ADMIN_TOPBAR_HEIGHT }}
      >
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <Image
            src="/logo.svg"
            alt={orgName}
            width={18}
            height={18}
            className="object-contain brightness-0 invert"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = "none"
            }}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary leading-none">AEGIS</p>
          <p className="text-xs text-text-tertiary mt-0.5">Admin</p>
        </div>
      </div>

      {/* Navigation items */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/admin/dashboard"
              ? pathname === "/admin/dashboard" || pathname === "/admin"
              : pathname.startsWith(item.href)

          const isReviewQueue = item.href === "/admin/review-queue"
          const isNew = NEW_PAGES.has(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-item w-full", isActive && "active")}
              aria-current={isActive ? "page" : undefined}
              // The "new"/count badges below are plain adjacent text nodes
              // with no separating whitespace, so without an explicit
              // aria-label a screen reader would announce e.g.
              // "Dashboardnew" as one run-together word.
              aria-label={
                isReviewQueue && reviewCount > 0
                  ? `${item.label} (${reviewCount > 99 ? "99+" : reviewCount} pending)`
                  : isNew
                  ? `${item.label} (new)`
                  : undefined
              }
            >
              <span className="flex-1 text-sm">{item.label}</span>

              {/* Review queue count badge */}
              {isReviewQueue && reviewCount > 0 && (
                <Badge
                  variant="warning"
                  className="tabular-nums text-[10px] px-1.5 py-0 min-w-[18px] h-4 flex items-center justify-center"
                  aria-hidden="true"
                >
                  {reviewCount > 99 ? "99+" : reviewCount}
                </Badge>
              )}

              {/* New page badge */}
              {isNew && !isReviewQueue && (
                <span
                  className="text-[9px] font-bold text-accent bg-accent-subtle border border-border-focus/30 rounded px-1 py-0.5 uppercase tracking-wide"
                  aria-hidden="true"
                >
                  new
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Bottom: user + logout */}
      <div className="border-t border-border-primary p-3 shrink-0">
        <button
          onClick={logout}
          className={cn(
            "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg",
            "text-sm text-text-secondary",
            "hover:bg-bg-secondary hover:text-text-primary",
            "transition-colors duration-[var(--duration-normal)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
          )}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </nav>
  )
}
