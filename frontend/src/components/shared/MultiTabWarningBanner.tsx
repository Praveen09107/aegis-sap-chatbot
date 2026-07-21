"use client"

import { useUIStore } from "@/stores/uiStore"
import { cn } from "@/lib/utils"
import { AlertTriangle } from "lucide-react"

/**
 * Shown when the user has the AEGIS chat open in multiple tabs.
 * Informational only — both tabs function independently, each with its
 * own WebSocket session; nothing is actually synced between them.
 */
export function MultiTabWarningBanner() {
  const multiTabWarning = useUIStore((s) => s.multiTabWarning)

  if (!multiTabWarning) return null

  return (
    <div
      className={cn(
        "bg-warning-bg border-b border-warning-border",
        "flex items-center justify-center gap-2 px-4 py-1.5"
      )}
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium text-warning-text">
        AEGIS is open in another tab — each tab has its own independent session
      </span>
    </div>
  )
}
