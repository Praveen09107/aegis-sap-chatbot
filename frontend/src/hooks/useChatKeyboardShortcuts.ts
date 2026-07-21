"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useChatStore } from "@/stores/chatStore"
import { useSessionStore } from "@/stores/sessionStore"
import { useWebSocket } from "@/hooks/useWebSocket"
import { exportSessionAsPDF } from "@/lib/sessionExport"
import { FEATURES } from "@/lib/constants"
import { TOAST } from "@/lib/toast"

/**
 * Registers all keyboard shortcuts for the employee chat interface.
 * Mount this hook once at the chat page level.
 *
 * Shortcuts registered:
 * ⌘N       → New chat session
 * ⌘F       → Focus session search
 * ⌘Shift+E → Export current session as PDF
 *
 * Note: ⌘K (command palette) is registered in the employee layout.
 * Note: ⌘/ (shortcuts overlay) is registered in KeyboardShortcutsOverlay.
 * Note: Enter/Shift+Enter are handled by ComposeBar's own onKeyDown.
 */
export function useChatKeyboardShortcuts() {
  const router = useRouter()
  const resetForNewSession = useChatStore((s) => s.resetForNewSession)
  const messages = useChatStore((s) => s.messages)
  const currentSessionId = useChatStore((s) => s.currentSessionId)
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId)
  const { disconnect } = useWebSocket()

  // ── ⌘N: New chat session ──────────────────────────────────

  const handleNewSession = useCallback(() => {
    disconnect()
    resetForNewSession()
    setActiveSessionId(null)
    router.replace("/")
    TOAST.sessionUnpinned() // Subtle confirmation: not intrusive
  }, [disconnect, resetForNewSession, setActiveSessionId, router])

  // ── ⌘F: Focus session search ──────────────────────────────

  const handleFocusSearch = useCallback(() => {
    const searchInput = document.querySelector<HTMLInputElement>(
      'aside[aria-label="Session history"] input[type="search"]'
    )
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
  }, [])

  // ── ⌘Shift+E: Export current session ─────────────────────

  const handleExport = useCallback(async () => {
    if (!FEATURES.PDF_EXPORT || !currentSessionId || messages.length === 0) return

    try {
      const { sessions } = useSessionStore.getState()
      const session = sessions.find((s) => s.id === currentSessionId)
      const topic = session?.topic_summary ?? "AEGIS Session"

      await exportSessionAsPDF(messages, topic)
      TOAST.sessionExported()
    } catch (err) {
      console.error("Export failed:", err)
    }
  }, [currentSessionId, messages])

  // ── Register shortcuts ────────────────────────────────────

  useKeyboardShortcuts([
    {
      key: "n",
      meta: true,
      handler: handleNewSession,
      preventDefault: true,
      ignoreInInput: false,
    },
    {
      key: "f",
      meta: true,
      handler: handleFocusSearch,
      preventDefault: true,
    },
    {
      key: "e",
      meta: true,
      shift: true,
      handler: handleExport,
      preventDefault: true,
    },
  ])
}
