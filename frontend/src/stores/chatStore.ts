import { create } from "zustand"
import type { ChatMessage } from "@/types"

/**
 * chatStore — STUB version (FRONTEND_09_LAYOUT_COMPONENTS.md's
 * EmployeeTopbar/SessionSidebar/AttributionPanelShell need websocket,
 * messages, streamingState, and resetForNewSession at minimum). Full
 * implementation (send/receive/streaming reducers): FRONTEND_10_ZUSTAND_STORES.md
 * (session F08). Do NOT rename these exports.
 */
export type StreamingState = "idle" | "streaming" | "error"

interface ChatState {
  websocket: WebSocket | null
  messages: ChatMessage[]
  streamingState: StreamingState
  setWebsocket: (ws: WebSocket | null) => void
  resetForNewSession: () => void
}

export const useChatStore = create<ChatState>()((set) => ({
  websocket: null,
  messages: [],
  streamingState: "idle",

  setWebsocket: (ws) => set({ websocket: ws }),

  resetForNewSession: () =>
    set((s) => {
      // A failed close() must not block resetting local state — the socket
      // is being discarded either way, and a stuck stale reference here
      // would leave the UI pointed at a dead connection.
      try {
        s.websocket?.close()
      } catch {
        // ignore — socket is being discarded regardless
      }
      return { websocket: null, messages: [], streamingState: "idle" }
    }),
}))
