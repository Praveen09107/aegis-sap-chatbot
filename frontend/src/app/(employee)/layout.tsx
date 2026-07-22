"use client"

import { useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
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
import { LAYOUT, STORAGE_KEYS, FEATURES } from "@/lib/constants"

// Onboarding is a one-time, first-run flow most sessions never mount — code
// split it out of the employee portal's initial bundle rather than paying
// for it on every load (FRONTEND_28_PERFORMANCE.md). No loading fallback:
// it's only rendered once onboardingVisible flips true, ~800ms after the
// page is already interactive, so a skeleton would be visible for a
// fraction of a second for no benefit.
const OnboardingModal = dynamic(() => import("@/components/onboarding/OnboardingModal").then((m) => m.OnboardingModal), { ssr: false })

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isAdmin, initializing } = useAuth()
  const { commandPaletteOpen, toggleCommandPalette, closeCommandPalette } = useUIStore()
  const { collapsed } = usePanelStore()
  const onboardingVisible = useUIStore((s) => s.onboardingVisible)
  const setOnboardingVisible = useUIStore((s) => s.setOnboardingVisible)

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

  // First-time onboarding (FRONTEND_15) — shown once per browser/device,
  // gated by both the feature flag and a localStorage completion flag.
  // Lives at the layout level (not the chat page) so the same
  // uiStore.onboardingVisible flag CommandPalette's "Restart walkthrough"
  // action toggles is the single source of truth in both places.
  useEffect(() => {
    if (!FEATURES.ONBOARDING || initializing || !isAuthenticated || isAdmin) return
    const completed = localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
    if (completed) return
    const timer = setTimeout(() => setOnboardingVisible(true), 800)
    return () => clearTimeout(timer)
  }, [initializing, isAuthenticated, isAdmin, setOnboardingVisible])

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, "true")
    setOnboardingVisible(false)
  }, [setOnboardingVisible])

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

        <main id="employee-main-content" className="min-w-0 flex flex-col overflow-hidden bg-bg-card">
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
      {onboardingVisible && <OnboardingModal open={onboardingVisible} onComplete={handleOnboardingComplete} />}
    </div>
  )
}
