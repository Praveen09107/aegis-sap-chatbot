import { describe, it, expect, beforeEach, vi } from "vitest"
import { useChatStore } from "./chatStore"
import type { ChatMessage } from "@/types"

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "user",
    content: "hello",
    timestamp: new Date(),
    ...overrides,
  }
}

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.setState({ websocket: null, messages: [], streamingState: "idle" })
  })

  it("starts with no socket, no messages, idle streaming state", () => {
    const state = useChatStore.getState()
    expect(state.websocket).toBeNull()
    expect(state.messages).toEqual([])
    expect(state.streamingState).toBe("idle")
  })

  it("setWebsocket() stores the socket reference", () => {
    const ws = {} as WebSocket
    useChatStore.getState().setWebsocket(ws)
    expect(useChatStore.getState().websocket).toBe(ws)
  })

  it("resetForNewSession() closes the existing socket and clears state", () => {
    const close = vi.fn()
    useChatStore.setState({
      websocket: { close } as unknown as WebSocket,
      messages: [makeMessage()],
      streamingState: "streaming",
    })

    useChatStore.getState().resetForNewSession()

    expect(close).toHaveBeenCalledTimes(1)
    const state = useChatStore.getState()
    expect(state.websocket).toBeNull()
    expect(state.messages).toEqual([])
    expect(state.streamingState).toBe("idle")
  })

  it("resetForNewSession() still clears state when the socket's close() throws", () => {
    // Error path: a dying socket that throws on close() must not prevent
    // local state from resetting — the socket is being discarded regardless.
    const close = vi.fn(() => {
      throw new Error("already closed")
    })
    useChatStore.setState({
      websocket: { close } as unknown as WebSocket,
      messages: [makeMessage()],
      streamingState: "error",
    })

    expect(() => useChatStore.getState().resetForNewSession()).not.toThrow()

    const state = useChatStore.getState()
    expect(state.websocket).toBeNull()
    expect(state.messages).toEqual([])
    expect(state.streamingState).toBe("idle")
  })

  it("resolves correctly when a new message arrives while resetForNewSession fires in the same tick (no lost update)", () => {
    // Simulates a race: a streamed message callback firing at the same
    // moment the user starts a new session. The reset must win since it
    // fires second — no stale message should survive into the new session.
    useChatStore.setState({ messages: [makeMessage({ id: "old" })] })

    useChatStore.setState((s) => ({ messages: [...s.messages, makeMessage({ id: "incoming" })] }))
    useChatStore.getState().resetForNewSession()

    expect(useChatStore.getState().messages).toEqual([])
  })
})
