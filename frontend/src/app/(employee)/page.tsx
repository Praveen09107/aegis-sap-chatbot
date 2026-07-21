"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ChatInterface } from "@/components/chat/ChatInterface"
import { useChatStore } from "@/stores/chatStore"
import { useSessionStore } from "@/stores/sessionStore"
import { useSession } from "@/hooks/queries"
import { useChatKeyboardShortcuts } from "@/hooks/useChatKeyboardShortcuts"
import { toastError } from "@/lib/toast"
import type { ChatMessage } from "@/types"

/**
 * Employee chat page — the root route of the employee portal.
 *
 * Responsibilities:
 * 1. Read ?session=<id> URL param — load historical session if present
 * 2. Register chat keyboard shortcuts (⌘N, ⌘F, ⌘Shift+E)
 * 3. Render ChatInterface
 *
 * Note: The three-panel layout shell (topbar, sidebar, right panel) is
 * provided by (employee)/layout.tsx — this page only renders the center
 * panel.
 *
 * Onboarding is not wired in here — OnboardingModal doesn't exist yet
 * (FRONTEND_15_EMPLOYEE_ONBOARDING is F10's scope, per
 * FRONTEND_MASTER_REFERENCE's session table). Wiring a first-time-user
 * check to a component that doesn't exist would either be a build error or
 * a fake stub pretending to work — F10 adds both the modal and this page's
 * check together, as one real feature.
 */
export default function ChatPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionIdParam = searchParams.get("session")

  const { setCurrentSessionId, clearMessages, addMessage, currentSessionId } = useChatStore()
  const { setActiveSessionId } = useSessionStore()

  useChatKeyboardShortcuts()

  // ── Historical session loading ─────────────────────────────

  const { data: historicalSession, isError } = useSession(sessionIdParam)

  useEffect(() => {
    if (!sessionIdParam || !historicalSession) return

    clearMessages()
    setCurrentSessionId(historicalSession.session.id)
    setActiveSessionId(historicalSession.session.id)

    const loadedMessages: ChatMessage[] = historicalSession.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
      streamingState: "complete",
      confidenceBadge: (m.confidence_badge as ChatMessage["confidenceBadge"]) ?? null,
      validationScore: m.validation_score ?? undefined,
      attributionPanel: m.attribution_doc_id
        ? {
            primary_document_id: m.attribution_doc_id,
            primary_document_name: m.attribution_doc_id,
            verified_by: "",
            verified_date: "",
            secondary_sources: [],
            confidence_badge: (m.confidence_badge as ChatMessage["confidenceBadge"]) ?? null,
          }
        : null,
    }))

    loadedMessages.forEach((msg) => addMessage(msg))
  }, [sessionIdParam, historicalSession, clearMessages, setCurrentSessionId, setActiveSessionId, addMessage])

  // Invalid or inaccessible session param — clear it and fall back to an empty chat.
  useEffect(() => {
    if (isError && sessionIdParam) {
      toastError("Session not found", "The requested session could not be loaded.")
      router.replace("/")
    }
  }, [isError, sessionIdParam, router])

  // No session param → ensure clean state (unless a WS-driven session is already active).
  useEffect(() => {
    if (!sessionIdParam && !currentSessionId) {
      clearMessages()
    }
    // currentSessionId intentionally excluded — this effect only decides
    // whether to clear on a URL change, not on every store-driven session
    // id update (e.g. session_ready arriving mid-chat).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdParam, clearMessages])

  return <ChatInterface className="h-full" />
}
