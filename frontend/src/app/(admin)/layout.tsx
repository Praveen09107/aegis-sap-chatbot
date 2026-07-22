"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { AdminNav } from "@/components/admin/AdminNav"
import { AdminTopbar } from "@/components/admin/AdminTopbar"
import { CommandPalette } from "@/components/shared/CommandPalette"
import { KeyboardShortcutsOverlay } from "@/components/shared/KeyboardShortcutsOverlay"
import { OfflineBanner } from "@/components/shared/OfflineBanner"
import { LoadingScreen } from "@/components/shared/LoadingScreen"
import { useUIStore } from "@/stores/uiStore"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useAuth } from "@/hooks/useAuth"
import { STORAGE_KEYS } from "@/lib/constants"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()
  const router = useRouter()
  const { isAuthenticated, isAdmin, initializing } = useAuth()
  const { commandPaletteOpen, toggleCommandPalette, closeCommandPalette } = useUIStore()

  // Soft-force dark mode for admin portal — the monitoring console
  // aesthetic — but only when the user hasn't explicitly chosen light via
  // ThemeToggle (FRONTEND_25). Fixed (2026-07-22): this previously called
  // setTheme("dark") unconditionally on every mount, silently overriding an
  // admin's explicit light-mode choice the moment they navigated away and
  // back to any admin page.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEYS.DARK_MODE) : null
    if (stored !== "light") {
      setTheme("dark")
    }
  }, [setTheme])

  // Redirect non-admin users
  useEffect(() => {
    if (!initializing && isAuthenticated && !isAdmin) {
      router.replace("/")
    }
  }, [isAuthenticated, isAdmin, initializing, router])

  // ⌘K
  useKeyboardShortcuts([
    { key: "k", meta: true, handler: toggleCommandPalette, preventDefault: true },
  ])

  if (initializing) return <LoadingScreen />

  return (
    <div className="flex h-dvh overflow-hidden bg-bg-primary">
      <OfflineBanner />

      {/* Fixed-width sidebar */}
      <AdminNav />

      {/* Scrollable main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto" id="admin-main-content">
          {children}
        </main>
      </div>

      {/* Global overlays */}
      <CommandPalette open={commandPaletteOpen} onOpenChange={closeCommandPalette} isAdmin />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
