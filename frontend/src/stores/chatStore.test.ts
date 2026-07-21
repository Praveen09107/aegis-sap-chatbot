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
    useChatStore.setState({
      messages: [],
      streamingState: "idle",
      currentSessionId: null,
      websocket: null,
      pendingScreenshot: null,
      screenshotPreviewUrl: null,
      composeValue: "",
    })
  })

  it("starts with the documented initial state", () => {
    const state = useChatStore.getState()
    expect(state.messages).toEqual([])
    expect(state.streamingState).toBe("idle")
    expect(state.currentSessionId).toBeNull()
    expect(state.websocket).toBeNull()
    expect(state.pendingScreenshot).toBeNull()
    expect(state.screenshotPreviewUrl).toBeNull()
    expect(state.composeValue).toBe("")
  })

  describe("addMessage / clearMessages", () => {
    it("appends a complete message", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "m1" }))
      useChatStore.getState().addMessage(makeMessage({ id: "m2", role: "assistant" }))
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["m1", "m2"])
    })

    it("clearMessages() empties the list", () => {
      useChatStore.getState().addMessage(makeMessage())
      useChatStore.getState().clearMessages()
      expect(useChatStore.getState().messages).toEqual([])
    })
  })

  describe("appendToken", () => {
    it("creates a streaming assistant placeholder when the last message isn't one", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "user-1", role: "user" }))
      useChatStore.getState().appendToken("Hello")

      const messages = useChatStore.getState().messages
      expect(messages).toHaveLength(2)
      expect(messages[1]).toMatchObject({ role: "assistant", content: "Hello", streamingState: "streaming" })
    })

    it("appends subsequent tokens to the existing assistant message", () => {
      useChatStore.getState().appendToken("Hello")
      useChatStore.getState().appendToken(" world")

      const messages = useChatStore.getState().messages
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe("Hello world")
    })

    it("resolves correctly when two tokens arrive in the same tick (no lost update)", () => {
      // appendToken derives from the previous messages array via set(state
      // => ...), not a captured outer variable, so two rapid token events
      // (as streaming naturally delivers) must both land, in order.
      const { appendToken } = useChatStore.getState()
      appendToken("a")
      appendToken("b")
      appendToken("c")
      expect(useChatStore.getState().messages[0].content).toBe("abc")
    })
  })

  describe("updateLastMessageValidation", () => {
    it("attaches validation results to the last assistant message", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "m1", role: "assistant", content: "answer" }))
      useChatStore.getState().updateLastMessageValidation({
        validationScore: 0.91,
        confidenceBadge: "green",
        attributionPanel: null,
      })

      const last = useChatStore.getState().messages[0]
      expect(last.validationScore).toBe(0.91)
      expect(last.confidenceBadge).toBe("green")
      expect(last.streamingState).toBe("complete")
    })

    it("is a no-op (error path) when there is no assistant message to update", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "m1", role: "user" }))
      const before = useChatStore.getState().messages

      useChatStore.getState().updateLastMessageValidation({
        validationScore: 0.5,
        confidenceBadge: "amber",
        attributionPanel: null,
      })

      expect(useChatStore.getState().messages).toBe(before)
    })

    it("answerText, when provided, replaces the streamed content — the authoritative final text after regeneration", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "m1", role: "assistant", content: "streamed draft" }))
      useChatStore.getState().updateLastMessageValidation({
        validationScore: 0.91,
        confidenceBadge: "green",
        attributionPanel: null,
        answerText: "regenerated final answer",
      })

      expect(useChatStore.getState().messages[0].content).toBe("regenerated final answer")
    })

    it("leaves the streamed content untouched when answerText is omitted", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "m1", role: "assistant", content: "streamed content" }))
      useChatStore.getState().updateLastMessageValidation({
        validationScore: 0.91,
        confidenceBadge: "green",
        attributionPanel: null,
      })

      expect(useChatStore.getState().messages[0].content).toBe("streamed content")
    })

    it("stores relatedQuestions on the message and clears any prior isIncomplete flag", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "m1", role: "assistant", isIncomplete: true }))
      useChatStore.getState().updateLastMessageValidation({
        validationScore: 0.91,
        confidenceBadge: "green",
        attributionPanel: null,
        relatedQuestions: ["How do I check delivery status?"],
      })

      const last = useChatStore.getState().messages[0]
      expect(last.relatedQuestions).toEqual(["How do I check delivery status?"])
      expect(last.isIncomplete).toBe(false)
    })
  })

  describe("markLastMessageIncomplete", () => {
    it("marks the last assistant message incomplete and sets streamingState to error", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "u1", role: "user" }))
      useChatStore.getState().addMessage(makeMessage({ id: "m1", role: "assistant", content: "partial" }))
      useChatStore.setState({ streamingState: "streaming" })

      useChatStore.getState().markLastMessageIncomplete()

      const messages = useChatStore.getState().messages
      expect(messages.find((m) => m.id === "m1")?.isIncomplete).toBe(true)
      expect(messages.find((m) => m.id === "u1")?.isIncomplete).toBeUndefined()
      expect(useChatStore.getState().streamingState).toBe("error")
    })

    it("is a no-op on messages (error/edge path) when there is no assistant message yet, but still sets streamingState", () => {
      useChatStore.getState().addMessage(makeMessage({ id: "u1", role: "user" }))

      expect(() => useChatStore.getState().markLastMessageIncomplete()).not.toThrow()
      expect(useChatStore.getState().streamingState).toBe("error")
    })
  })

  describe("streaming state / session id / websocket / compose value", () => {
    it("setStreamingState() updates the state machine", () => {
      useChatStore.getState().setStreamingState("retrieving")
      expect(useChatStore.getState().streamingState).toBe("retrieving")
    })

    it("setCurrentSessionId() sets and clears", () => {
      useChatStore.getState().setCurrentSessionId("s1")
      expect(useChatStore.getState().currentSessionId).toBe("s1")
      useChatStore.getState().setCurrentSessionId(null)
      expect(useChatStore.getState().currentSessionId).toBeNull()
    })

    it("setWebSocket() stores the socket reference", () => {
      const ws = {} as WebSocket
      useChatStore.getState().setWebSocket(ws)
      expect(useChatStore.getState().websocket).toBe(ws)
    })

    it("setComposeValue() updates the compose bar text", () => {
      useChatStore.getState().setComposeValue("how do I fix VL150?")
      expect(useChatStore.getState().composeValue).toBe("how do I fix VL150?")
    })
  })

  describe("screenshot handling", () => {
    it("setPendingScreenshot()/setScreenshotPreviewUrl() store the file and preview URL", () => {
      const file = new File(["x"], "screenshot.png", { type: "image/png" })
      useChatStore.getState().setPendingScreenshot(file)
      useChatStore.getState().setScreenshotPreviewUrl("blob:preview")

      expect(useChatStore.getState().pendingScreenshot).toBe(file)
      expect(useChatStore.getState().screenshotPreviewUrl).toBe("blob:preview")
    })

    it("clearScreenshot() revokes the object URL and clears both fields", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
      useChatStore.setState({
        pendingScreenshot: new File(["x"], "s.png"),
        screenshotPreviewUrl: "blob:preview",
      })

      useChatStore.getState().clearScreenshot()

      expect(revokeSpy).toHaveBeenCalledWith("blob:preview")
      expect(useChatStore.getState().pendingScreenshot).toBeNull()
      expect(useChatStore.getState().screenshotPreviewUrl).toBeNull()
      revokeSpy.mockRestore()
    })

    it("clearScreenshot() does not attempt to revoke when there was no preview URL (error/edge path)", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
      useChatStore.getState().clearScreenshot()
      expect(revokeSpy).not.toHaveBeenCalled()
      revokeSpy.mockRestore()
    })
  })

  describe("resetForNewSession", () => {
    it("closes an OPEN socket, revokes the screenshot URL, and resets to initial state", () => {
      const close = vi.fn()
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
      useChatStore.setState({
        websocket: { close, readyState: WebSocket.OPEN } as unknown as WebSocket,
        messages: [makeMessage()],
        streamingState: "streaming",
        currentSessionId: "s1",
        screenshotPreviewUrl: "blob:preview",
        composeValue: "draft",
      })

      useChatStore.getState().resetForNewSession()

      expect(close).toHaveBeenCalledWith(1000, "New session")
      expect(revokeSpy).toHaveBeenCalledWith("blob:preview")
      const state = useChatStore.getState()
      expect(state.websocket).toBeNull()
      expect(state.messages).toEqual([])
      expect(state.streamingState).toBe("idle")
      expect(state.currentSessionId).toBeNull()
      expect(state.composeValue).toBe("")
      revokeSpy.mockRestore()
    })

    it("does not call close() on a socket that isn't OPEN (e.g. already CLOSED)", () => {
      const close = vi.fn()
      useChatStore.setState({ websocket: { close, readyState: WebSocket.CLOSED } as unknown as WebSocket })

      useChatStore.getState().resetForNewSession()

      expect(close).not.toHaveBeenCalled()
      expect(useChatStore.getState().websocket).toBeNull()
    })

    it("still clears state when the socket's close() throws (error path)", () => {
      const close = vi.fn(() => {
        throw new Error("already closed")
      })
      useChatStore.setState({
        websocket: { close, readyState: WebSocket.OPEN } as unknown as WebSocket,
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
})
