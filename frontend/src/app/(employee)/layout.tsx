"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { LoadingScreen } from "@/components/shared/LoadingScreen"
import { OfflineBanner } from "@/components/shared/OfflineBanner"
import { MultiTabWarningBanner } from "@/components/shared/MultiTabWarningBanner"
import { EmployeeTopbar } from "@/components/shared/EmployeeTopbar"
import { SessionSidebar } from "@/components/sessions/SessionSidebar"
import { AttributionPanelShell } from "@/components/chat/AttributionPanelShell"
import { CommandPalette } from "@/components/shared/CommandPalette"
import { KeyboardShortcutsOverlay } from "@/components/shared/KeyboardShortcutsOverlay"
import { useAuth } from "@/hooks/useAuth"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useUIStore } from "@/stores/uiStore"
import { usePanelStore } from "@/stores/panelStore"
import { useSessions } from "@/hooks/queries"
import { initMultiTabDetection } from "@/hooks/useWebSocket"
import { LAYOUT } from "@/lib/constants"

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isAdmin, initializing } = useAuth()
  const { commandPaletteOpen, toggleCommandPalette, closeCommandPalette } = useUIStore()
  const { collapsed } = usePanelStore()

  const { data: sessions = [] } = useSessions()

  // Redirect non-employees (IT admins go to admin portal)
  useEffect(() => {
    if (!initializing && isAuthenticated && isAdmin) {
      router.replace("/admin/dashboard")
    }
  }, [isAuthenticated, isAdmin, initializing, router])

  // Multi-tab coordination (SUPPLEMENT_05 Part 1) — each tab gets its own
  // independent WebSocket session; this only powers the informational banner.
  useEffect(() => {
    const { setMultiTabWarning } = useUIStore.getState()
    initMultiTabDetection(setMultiTabWarning)
  }, [])

  useKeyboardShortcuts([
    {
      key: "k",
      meta: true,
      handler: toggleCommandPalette,
      preventDefault: true,
    },
  ])

  if (initializing) return <LoadingScreen />

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg-secondary">
      <OfflineBanner />
      <MultiTabWarningBanner />

      <EmployeeTopbar />

      <div
        className="flex-1 overflow-hidden grid"
        style={{
          gridTemplateColumns: collapsed
            ? `${LAYOUT.EMPLOYEE_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EMPLOYEE_SOURCE_PANEL_ICON_WIDTH}px`
            : `${LAYOUT.EMPLOYEE_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EMPLOYEE_SOURCE_PANEL_WIDTH}px`,
          transition: `grid-template-columns ${LAYOUT.EMPLOYEE_SOURCE_PANEL_WIDTH * 0.5}ms cubic-bezier(0.16,1,0.3,1)`,
        }}
      >
        <SessionSidebar sessions={sessions} />

        <main className="min-w-0 flex flex-col overflow-hidden bg-bg-card">
          {children}
        </main>

        <AttributionPanelShell />
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={closeCommandPalette}
        sessions={sessions}
        isAdmin={false}
      />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
