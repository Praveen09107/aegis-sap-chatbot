"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { StatusDot } from "@/components/ui/status-dot"
import { useChatStore } from "@/stores/chatStore"
import { useAuth } from "@/hooks/useAuth"
import { orgName, LAYOUT } from "@/lib/constants"

/**
 * Employee portal top bar.
 * Fixed height (52px). Contains:
 * - Left: organization logo (org-configurable via NEXT_PUBLIC_ORG_NAME) + "AEGIS" brand name
 * - Center: WebSocket connection status
 * - Right: Dark mode toggle + user avatar
 */
export function EmployeeTopbar() {
  const { websocket } = useChatStore()
  const { role } = useAuth()

  // Derive connection status from WebSocket readyState
  const wsStatus =
    !websocket ? "offline"
    : websocket.readyState === WebSocket.OPEN ? "online"
    : websocket.readyState === WebSocket.CONNECTING ? "connecting"
    : "offline"

  return (
    <header
      className={cn(
        "flex items-center justify-between",
        "bg-bg-card border-b border-border-primary",
        "px-4 shrink-0 z-sticky",
      )}
      style={{ height: LAYOUT.EMPLOYEE_TOPBAR_HEIGHT }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0 shadow-sm">
          <Image
            src="/logo.svg"
            alt={orgName}
            width={18}
            height={18}
            className="object-contain brightness-0 invert"
            onError={(e) => {
              const t = e.target as HTMLImageElement
              t.style.display = "none"
            }}
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-text-primary tracking-tight">AEGIS</span>
          <span className="text-xs text-text-tertiary font-normal hidden lg:block">
            SAP Intelligence
          </span>
        </div>
      </div>

      {/* Connection status */}
      <StatusDot status={wsStatus} showLabel size="sm" />

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Skip to main content link (a11y) — mirrors AdminTopbar's pattern */}
        <a
          href="#employee-main-content"
          className="sr-only focus:not-sr-only focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-xs focus:bg-bg-secondary focus:text-text-primary focus:ring-2 focus:ring-border-focus"
        >
          Skip to chat
        </a>
        <ThemeToggle size="sm" />
        <UserAvatar role={role} />
      </div>
    </header>
  )
}

function UserAvatar({ role }: { role: string | null }) {
  const initials = role === "it-admin" ? "IT" : "U"

  return (
    <div
      className={cn(
        "w-7 h-7 rounded-full",
        "bg-accent-subtle border border-border-focus/30",
        "flex items-center justify-center",
        "text-xs font-semibold text-accent-text",
        "select-none",
      )}
      role="img"
      aria-label={`Logged in as ${role ?? "user"}`}
    >
      {initials}
    </div>
  )
}
