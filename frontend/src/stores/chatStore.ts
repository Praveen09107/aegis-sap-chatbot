import { create } from "zustand"
import type { ChatMessage, StreamingState, AttributionPanel } from "@/types"

interface ChatState {
  // ── Message list ──────────────────────────────────────────
  messages: ChatMessage[]

  /** Add a complete new message (user or AI) */
  addMessage: (message: ChatMessage) => void

  /**
   * Append a streaming token to the last AI message.
   * The last message must have role='assistant'.
   * Creates the assistant message placeholder if it doesn't exist.
   */
  appendToken: (token: string) => void

  /**
   * Update the last assistant message with validation results.
   * Called when the backend sends validation_result via WebSocket.
   *
   * answerText, when provided, REPLACES the message's content — confirmed
   * against the real backend (chat_handler.py): a targeted regeneration
   * pass can produce a different final answer than whatever streamed via
   * "token" messages, since regeneration bypasses the token Pub/Sub
   * channel entirely. answer_text is the authoritative final text.
   */
  updateLastMessageValidation: (data: {
    validationScore: number
    confidenceBadge: ChatMessage["confidenceBadge"]
    attributionPanel: AttributionPanel | null
    answerText?: string
    relatedQuestions?: string[]
  }) => void

  /**
   * Mark the last assistant message as incomplete — the WebSocket dropped
   * mid-stream, before validation_result arrived. Sets streamingState to
   * 'error' so the compose bar re-activates for a retry.
   */
  markLastMessageIncomplete: () => void

  /** Clear all messages (when starting a new chat session) */
  clearMessages: () => void

  // ── Streaming state machine ──────────────────────────────
  streamingState: StreamingState
  setStreamingState: (state: StreamingState) => void

  // ── Current session ──────────────────────────────────────
  currentSessionId: string | null
  setCurrentSessionId: (id: string | null) => void

  // ── WebSocket reference ──────────────────────────────────
  /** The active WebSocket connection. Managed by useWebSocket hook in FRONTEND_12. */
  websocket: WebSocket | null
  setWebSocket: (ws: WebSocket | null) => void

  // ── Screenshot state ─────────────────────────────────────
  pendingScreenshot: File | null
  setPendingScreenshot: (file: File | null) => void

  screenshotPreviewUrl: string | null
  setScreenshotPreviewUrl: (url: string | null) => void

  /** Clear screenshot + revoke object URL to prevent memory leak */
  clearScreenshot: () => void

  // ── Compose bar ──────────────────────────────────────────
  composeValue: string
  setComposeValue: (value: string) => void

  // ── Reset ────────────────────────────────────────────────
  /** Reset entire chat state for a new session */
  resetForNewSession: () => void
}

const INITIAL_STATE = {
  messages: [] as ChatMessage[],
  streamingState: "idle" as StreamingState,
  currentSessionId: null as string | null,
  websocket: null as WebSocket | null,
  pendingScreenshot: null as File | null,
  screenshotPreviewUrl: null as string | null,
  composeValue: "",
}

export const useChatStore = create<ChatState>()((set, get) => ({
  ...INITIAL_STATE,

  // ── Message operations ──────────────────────────────────

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  appendToken: (token) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIdx = messages.length - 1
      const last = messages[lastIdx]

      if (!last || last.role !== "assistant") {
        // Create placeholder assistant message
        const placeholder: ChatMessage = {
          id: `stream-${Date.now()}`,
          role: "assistant",
          content: token,
          timestamp: new Date(),
          streamingState: "streaming",
          confidenceBadge: null,
        }
        return { messages: [...state.messages, placeholder] }
      }

      // Append token to existing assistant message
      messages[lastIdx] = {
        ...last,
        content: last.content + token,
      }
      return { messages }
    }),

  updateLastMessageValidation: ({ validationScore, confidenceBadge, attributionPanel, answerText, relatedQuestions }) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIdx = messages.length - 1
      const last = messages[lastIdx]
      if (!last || last.role !== "assistant") return state

      messages[lastIdx] = {
        ...last,
        ...(answerText ? { content: answerText } : {}),
        validationScore,
        confidenceBadge,
        attributionPanel,
        relatedQuestions,
        streamingState: "complete",
        isIncomplete: false,
      }
      return { messages }
    }),

  markLastMessageIncomplete: () =>
    set((state) => {
      const messages = [...state.messages]
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          messages[i] = { ...messages[i], isIncomplete: true }
          break
        }
      }
      return { messages, streamingState: "error" }
    }),

  clearMessages: () => set({ messages: [] }),

  // ── Streaming state ─────────────────────────────────────

  setStreamingState: (streamingState) => set({ streamingState }),

  // ── Session ─────────────────────────────────────────────

  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),

  // ── WebSocket ────────────────────────────────────────────

  setWebSocket: (websocket) => set({ websocket }),

  // ── Screenshot ──────────────────────────────────────────

  setPendingScreenshot: (pendingScreenshot) => set({ pendingScreenshot }),

  setScreenshotPreviewUrl: (screenshotPreviewUrl) => set({ screenshotPreviewUrl }),

  clearScreenshot: () => {
    const { screenshotPreviewUrl } = get()
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl)
    set({ pendingScreenshot: null, screenshotPreviewUrl: null })
  },

  // ── Compose bar ──────────────────────────────────────────

  setComposeValue: (composeValue) => set({ composeValue }),

  // ── Reset ────────────────────────────────────────────────

  resetForNewSession: () => {
    const { screenshotPreviewUrl, websocket } = get()
    // Revoke screenshot URL
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl)
    // Close WebSocket if open — a failed close() must not block the reset
    // (same reasoning as F07's stub: the socket is being discarded either way)
    try {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.close(1000, "New session")
      }
    } catch {
      // ignore — socket is being discarded regardless
    }
    set({
      ...INITIAL_STATE,
      websocket: null,
    })
  },
}))
