import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { useWebSocket, initMultiTabDetection } from "./useWebSocket"
import { useChatStore } from "@/stores/chatStore"
import { useSessionStore } from "@/stores/sessionStore"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"

// ── Mock WebSocket ──────────────────────────────────────────────
//
// jsdom provides a real WebSocket that tries to actually connect — this
// mock gives full manual control over the connection lifecycle
// (open/message/close) so each real backend message type can be simulated
// directly, matching the exact payload shapes confirmed in chat_handler.py.
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code = 1000, reason = "") {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }

  // ── Test helpers ──────────────────────────────────────────
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }

  simulateServerClose(code: number, reason = "") {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }
}

function latestSocket(): MockWebSocket {
  const ws = MockWebSocket.instances.at(-1)
  if (!ws) throw new Error("No MockWebSocket instance was created")
  return ws
}

async function renderConnectedWebSocket() {
  const { Wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useWebSocket(), { wrapper: Wrapper })

  const sendPromise = act(async () => {
    await result.current.sendMessage("How do I fix VL150?")
  })
  const ws = await waitFor(() => latestSocket())
  act(() => ws.simulateOpen())
  await sendPromise

  return { result, ws }
}

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal("WebSocket", MockWebSocket)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/ws-token") {
          return new Response(JSON.stringify({ ws_token: "test-jwt" }), { status: 200 })
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })
    )
    useChatStore.setState({
      messages: [],
      streamingState: "idle",
      currentSessionId: null,
      websocket: null,
      pendingScreenshot: null,
      screenshotPreviewUrl: null,
      composeValue: "",
    })
    useSessionStore.setState({ activeSessionId: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("sendMessage — connection and send", () => {
    it("connects with the real ?token= query param and sends the message once open", async () => {
      const { ws } = await renderConnectedWebSocket()

      expect(ws.url).toContain("?token=test-jwt")
      expect(ws.sent).toHaveLength(1)
      const sent = JSON.parse(ws.sent[0])
      expect(sent).toMatchObject({ type: "message", message: "How do I fix VL150?" })
    })

    it("adds the user's message optimistically before the connection even opens", async () => {
      const { Wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useWebSocket(), { wrapper: Wrapper })

      act(() => {
        result.current.sendMessage("VL150 question")
      })

      await waitFor(() => expect(useChatStore.getState().messages).toHaveLength(1))
      expect(useChatStore.getState().messages[0]).toMatchObject({ role: "user", content: "VL150 question" })
      expect(useChatStore.getState().streamingState).toBe("thinking")
    })

    it("reuses an already-open connection instead of reconnecting", async () => {
      const { result } = await renderConnectedWebSocket()

      await act(async () => {
        await result.current.sendMessage("second question")
      })

      expect(MockWebSocket.instances).toHaveLength(1)
    })

    it("surfaces a failed connection as an error state with a toast (error path)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ error: "no cookie" }), { status: 401 }))
      )
      const { Wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useWebSocket(), { wrapper: Wrapper })

      await act(async () => {
        await result.current.sendMessage("question")
      })

      expect(useChatStore.getState().streamingState).toBe("error")
    })
  })

  describe("real backend message handling", () => {
    it("session_ready sets both currentSessionId and the sidebar's activeSessionId", async () => {
      const { ws } = await renderConnectedWebSocket()

      act(() => ws.simulateMessage({ type: "session_ready", session_id: "sess-1" }))

      expect(useChatStore.getState().currentSessionId).toBe("sess-1")
      expect(useSessionStore.getState().activeSessionId).toBe("sess-1")
    })

    it("token messages append to the streaming assistant message and set streamingState", async () => {
      const { ws } = await renderConnectedWebSocket()

      act(() => {
        ws.simulateMessage({ type: "token", token: "VL150 " })
        ws.simulateMessage({ type: "token", token: "means..." })
      })

      const messages = useChatStore.getState().messages
      const assistant = messages.find((m) => m.role === "assistant")
      expect(assistant?.content).toBe("VL150 means...")
      expect(useChatStore.getState().streamingState).toBe("streaming")
    })

    it("stream_complete moves to the validating state", async () => {
      const { ws } = await renderConnectedWebSocket()
      act(() => ws.simulateMessage({ type: "stream_complete" }))
      expect(useChatStore.getState().streamingState).toBe("validating")
    })

    it("validation_result's answer_text REPLACES the streamed content — the confirmed real backend contract for regeneration", async () => {
      const { ws } = await renderConnectedWebSocket()

      act(() => {
        ws.simulateMessage({ type: "token", token: "draft answer that got regenerated" })
        ws.simulateMessage({
          type: "validation_result",
          answer_text: "the real, regenerated final answer",
          validation_score: 0.91,
          confidence_badge: "green",
          attribution_panel: null,
        })
      })

      const assistant = useChatStore.getState().messages.find((m) => m.role === "assistant")
      expect(assistant?.content).toBe("the real, regenerated final answer")
      expect(assistant?.confidenceBadge).toBe("green")
      expect(assistant?.validationScore).toBe(0.91)
      expect(useChatStore.getState().streamingState).toBe("complete")
    })

    it("validation_result derives fallback related questions locally when the backend doesn't send any (confirmed real gap)", async () => {
      const { ws } = await renderConnectedWebSocket()

      act(() => {
        ws.simulateMessage({ type: "token", token: "Fix VL150 by adjusting the delivery quantity." })
        ws.simulateMessage({
          type: "validation_result",
          answer_text: "Fix VL150 by adjusting the delivery quantity.",
          validation_score: 0.9,
          confidence_badge: "green",
          attribution_panel: null,
        })
      })

      const assistant = useChatStore.getState().messages.find((m) => m.role === "assistant")
      expect(assistant?.relatedQuestions?.length).toBeGreaterThan(0)
    })

    it("validation_result prefers the backend's own related_questions when present (forward compatibility)", async () => {
      const { ws } = await renderConnectedWebSocket()

      act(() => {
        ws.simulateMessage({ type: "token", token: "answer" })
        ws.simulateMessage({
          type: "validation_result",
          answer_text: "answer",
          validation_score: 0.9,
          confidence_badge: "green",
          attribution_panel: null,
          related_questions: ["Server-provided question?"],
        })
      })

      const assistant = useChatStore.getState().messages.find((m) => m.role === "assistant")
      expect(assistant?.relatedQuestions).toEqual(["Server-provided question?"])
    })

    it("does not generate fallback related questions for a non-green badge", async () => {
      const { ws } = await renderConnectedWebSocket()

      act(() => {
        ws.simulateMessage({ type: "token", token: "VL150 partial answer" })
        ws.simulateMessage({
          type: "validation_result",
          answer_text: "VL150 partial answer",
          validation_score: 0.7,
          confidence_badge: "amber",
          attribution_panel: null,
        })
      })

      const assistant = useChatStore.getState().messages.find((m) => m.role === "assistant")
      expect(assistant?.relatedQuestions).toEqual([])
    })

    it("error messages add a new assistant error bubble and set streamingState to error (real INSUFFICIENT payload shape)", async () => {
      const { ws } = await renderConnectedWebSocket()

      act(() =>
        ws.simulateMessage({
          type: "error",
          error_code: "INSUFFICIENT",
          message: "I could not find sufficient documentation... Ticket reference will appear shortly.",
          ticket_id: null,
          session_id: "sess-1",
        })
      )

      const messages = useChatStore.getState().messages
      const errorMsg = messages.find((m) => m.streamingState === "error")
      expect(errorMsg?.content).toContain("Ticket reference will appear shortly")
      expect(errorMsg?.confidenceBadge).toBe("none")
      expect(useChatStore.getState().streamingState).toBe("error")
    })

    it("vision_refined_answer starts a fresh assistant message rather than appending to the current one", async () => {
      const { ws } = await renderConnectedWebSocket()
      act(() => {
        ws.simulateMessage({ type: "token", token: "unrelated in-flight answer" })
      })

      act(() =>
        ws.simulateMessage({
          type: "vision_refined_answer",
          message: "Screenshot analysed. Error code confirmed: VL150.",
          diagnostic_summary: "VL150 on VL01N",
          has_error_code: true,
          error_code: "VL150",
          transaction_code: "VL01N",
        })
      )

      // renderConnectedWebSocket() already sent one user message, so this
      // is the 3rd message overall: user question, streaming assistant
      // placeholder from the token above, then the vision push as its own
      // NEW message rather than appending onto that placeholder.
      const messages = useChatStore.getState().messages
      expect(messages).toHaveLength(3)
      expect(messages[2].content).toBe("Screenshot analysed. Error code confirmed: VL150.")
      expect(messages[2].visionContext?.error_code).toBe("VL150")
    })

    it("pong clears the pending pong timeout (keepalive)", async () => {
      const { ws } = await renderConnectedWebSocket()
      // Simply confirming the message doesn't throw and is recognized —
      // the timeout-clearing effect is exercised end-to-end in the
      // keepalive describe block below.
      expect(() => act(() => ws.simulateMessage({ type: "pong" }))).not.toThrow()
    })

    it("retrieval_progress is handled without throwing, even though the real backend never sends it (forward compatibility only)", async () => {
      const { ws } = await renderConnectedWebSocket()
      expect(() =>
        act(() => ws.simulateMessage({ type: "retrieval_progress", stage: "retrieving" }))
      ).not.toThrow()
      expect(useChatStore.getState().streamingState).toBe("retrieving")
    })

    it.each([
      ["crag", "generating"],
      ["generating", "generating"],
      ["validating", "validating"],
    ] as const)("retrieval_progress maps stage %s to streamingState %s", async (stage, expected) => {
      const { ws } = await renderConnectedWebSocket()
      act(() => ws.simulateMessage({ type: "retrieval_progress", stage }))
      expect(useChatStore.getState().streamingState).toBe(expected)
    })

    it("ignores an unparseable message instead of crashing (error path)", async () => {
      const { ws } = await renderConnectedWebSocket()
      expect(() => act(() => ws.onmessage?.({ data: "not json" } as MessageEvent))).not.toThrow()
    })

    it("logs and ignores a message type the client doesn't recognize (forward compatibility)", async () => {
      const { ws } = await renderConnectedWebSocket()
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
      expect(() => act(() => ws.simulateMessage({ type: "some_future_message_type" }))).not.toThrow()
      expect(debugSpy).toHaveBeenCalledWith("[WS] Unhandled message type:", "some_future_message_type")
      debugSpy.mockRestore()
    })

    it("derives FI-module fallback related questions for FB/FF/F5-prefixed entities", async () => {
      const { ws } = await renderConnectedWebSocket()
      act(() => {
        ws.simulateMessage({ type: "token", token: "Check posting period in FB50." })
        ws.simulateMessage({
          type: "validation_result",
          answer_text: "Check posting period in FB50.",
          validation_score: 0.9,
          confidence_badge: "green",
          attribution_panel: null,
        })
      })
      const assistant = useChatStore.getState().messages.find((m) => m.role === "assistant")
      expect(assistant?.relatedQuestions).toEqual([
        "How do I view the posting period settings?",
        "What does an F5201 error indicate?",
      ])
    })

    it("derives MM-module fallback related questions for MB/MM/ME-prefixed entities", async () => {
      const { ws } = await renderConnectedWebSocket()
      act(() => {
        ws.simulateMessage({ type: "token", token: "Check stock via MB52." })
        ws.simulateMessage({
          type: "validation_result",
          answer_text: "Check stock via MB52.",
          validation_score: 0.9,
          confidence_badge: "green",
          attribution_panel: null,
        })
      })
      const assistant = useChatStore.getState().messages.find((m) => m.role === "assistant")
      expect(assistant?.relatedQuestions).toEqual([
        "How do I view stock with MMBE?",
        "What is unrestricted stock vs restricted stock?",
      ])
    })
  })

  describe("connection close handling", () => {
    it("a clean close (1000) does not touch streaming state or show a toast", async () => {
      const { ws } = await renderConnectedWebSocket()
      useChatStore.setState({ streamingState: "streaming" })

      act(() => ws.simulateServerClose(1000, "New session"))

      expect(useChatStore.getState().streamingState).toBe("streaming")
      expect(useChatStore.getState().websocket).toBeNull()
    })

    it("an auth-failure close (4001, the real backend's code for every auth rejection) sets an error state", async () => {
      const { ws } = await renderConnectedWebSocket()

      act(() => ws.simulateServerClose(4001, "Token has expired"))

      expect(useChatStore.getState().streamingState).toBe("error")
    })

    it("marks the last message incomplete on an unexpected close while streaming (SUPPLEMENT_05 Part 2)", async () => {
      const { ws } = await renderConnectedWebSocket()
      act(() => {
        ws.simulateMessage({ type: "token", token: "partial answer" })
      })
      expect(useChatStore.getState().streamingState).toBe("streaming")

      act(() => ws.simulateServerClose(1006, "abnormal closure"))

      const assistant = useChatStore.getState().messages.find((m) => m.role === "assistant")
      expect(assistant?.isIncomplete).toBe(true)
      expect(useChatStore.getState().streamingState).toBe("error")
    })

    it("does not mark anything incomplete for an unexpected close while idle (no active turn)", async () => {
      const { ws } = await renderConnectedWebSocket()
      useChatStore.setState({ streamingState: "complete" })

      act(() => ws.simulateServerClose(1006, "abnormal closure"))

      const assistant = useChatStore.getState().messages.find((m) => m.role === "assistant")
      expect(assistant?.isIncomplete).toBeUndefined()
    })

    it("resolves correctly when a new message arrives right as the connection drops (race condition)", async () => {
      const { result, ws } = await renderConnectedWebSocket()

      // The drop and a fresh send race each other; sendMessage must connect
      // a new socket rather than reuse the now-dead one.
      act(() => ws.simulateServerClose(1006, "dropped"))

      const sendPromise = act(async () => {
        await result.current.sendMessage("retry after drop")
      })
      const newWs = await waitFor(() => {
        expect(MockWebSocket.instances).toHaveLength(2)
        return latestSocket()
      })
      act(() => newWs.simulateOpen())
      await sendPromise

      expect(newWs.sent.length).toBeGreaterThan(0)
    })
  })

  describe("uploadScreenshot", () => {
    it("uploads the pending screenshot before sending the message over the socket", async () => {
      const uploadResponse = new Response(
        JSON.stringify({ status: "queued", session_id: "throwaway", task_id: "t1", message: "queued" }),
        { status: 200 }
      )
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url === "/api/auth/ws-token") return new Response(JSON.stringify({ ws_token: "test-jwt" }), { status: 200 })
          if (url === "/api/upload/screenshot") return uploadResponse
          throw new Error(`Unexpected fetch: ${url}`)
        })
      )
      const { Wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useWebSocket(), { wrapper: Wrapper })
      const screenshot = new File(["x"], "screenshot.png", { type: "image/png" })

      const sendPromise = act(async () => {
        await result.current.sendMessage("What does this error mean?", screenshot)
      })
      const ws = await waitFor(() => latestSocket())
      act(() => ws.simulateOpen())
      await sendPromise

      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
      expect(fetchMock.mock.calls.some(([url]) => url === "/api/upload/screenshot")).toBe(true)
      expect(ws.sent).toHaveLength(1)
    })
  })

  describe("disconnect", () => {
    it("closes an open connection cleanly (code 1000)", async () => {
      const { result, ws } = await renderConnectedWebSocket()
      act(() => result.current.disconnect())
      expect(ws.readyState).toBe(MockWebSocket.CLOSED)
    })

    it("does nothing when there is no open connection (error/edge path)", async () => {
      const { Wrapper } = createQueryWrapper()
      const { result } = renderHook(() => useWebSocket(), { wrapper: Wrapper })
      expect(() => act(() => result.current.disconnect())).not.toThrow()
    })
  })

  describe("connect — error paths", () => {
    it("rejects with a timeout error if the connection never opens", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { Wrapper } = createQueryWrapper()
        const { result } = renderHook(() => useWebSocket(), { wrapper: Wrapper })

        const sendPromise = act(async () => {
          await result.current.sendMessage("hello")
        })
        await waitFor(() => latestSocket())
        act(() => vi.advanceTimersByTime(8_000)) // connect timeout
        await sendPromise

        expect(useChatStore.getState().streamingState).toBe("error")
      } finally {
        vi.useRealTimers()
      }
    })

    it("logs but does not crash on a raw WebSocket error event", async () => {
      const { ws } = await renderConnectedWebSocket()
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      expect(() => act(() => ws.onerror?.({} as Event))).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  describe("keepalive ping/pong", () => {
    it("sends a ping on the configured interval and force-closes after a pong timeout", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { Wrapper } = createQueryWrapper()
        const { result } = renderHook(() => useWebSocket(), { wrapper: Wrapper })

        const sendPromise = act(async () => {
          await result.current.sendMessage("hello")
        })
        const ws = await waitFor(() => latestSocket())
        act(() => ws.simulateOpen())
        await sendPromise

        act(() => vi.advanceTimersByTime(30_000)) // WS_PING_INTERVAL_MS
        expect(ws.sent.some((s) => JSON.parse(s).type === "ping")).toBe(true)

        act(() => vi.advanceTimersByTime(10_000)) // WS_PONG_TIMEOUT_MS
        expect(ws.readyState).toBe(MockWebSocket.CLOSED)
      } finally {
        vi.useRealTimers()
      }
    })

    it("a real pong arriving before the timeout prevents the force-close", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { Wrapper } = createQueryWrapper()
        const { result } = renderHook(() => useWebSocket(), { wrapper: Wrapper })

        const sendPromise = act(async () => {
          await result.current.sendMessage("hello")
        })
        const ws = await waitFor(() => latestSocket())
        act(() => ws.simulateOpen())
        await sendPromise

        act(() => vi.advanceTimersByTime(30_000))
        act(() => ws.simulateMessage({ type: "pong" }))
        act(() => vi.advanceTimersByTime(10_000))

        expect(ws.readyState).not.toBe(MockWebSocket.CLOSED)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

describe("initMultiTabDetection", () => {
  const originalBroadcastChannel = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel

  afterEach(() => {
    if (originalBroadcastChannel) {
      vi.stubGlobal("BroadcastChannel", originalBroadcastChannel)
    } else {
      vi.unstubAllGlobals()
    }
  })

  it("does not throw when BroadcastChannel is unavailable (Safari <15.4 fallback)", () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    // @ts-expect-error - simulating an environment without BroadcastChannel
    delete window.BroadcastChannel
    expect(() => initMultiTabDetection(vi.fn())).not.toThrow()
  })

  it("warns the current tab when another tab announces itself active", () => {
    class MockBroadcastChannel {
      onmessage: ((event: MessageEvent) => void) | null = null
      static channels: MockBroadcastChannel[] = []
      constructor(public name: string) {
        MockBroadcastChannel.channels.push(this)
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel)
    MockBroadcastChannel.channels = []

    const setMultiTabWarning = vi.fn()
    initMultiTabDetection(setMultiTabWarning)

    const channel = MockBroadcastChannel.channels[0]
    channel.onmessage?.({ data: { type: "tab-active", tabId: "some-other-tab" } } as MessageEvent)

    expect(setMultiTabWarning).toHaveBeenCalledWith(true)
  })

  it("clears the warning once the other tab announces it's no longer active", () => {
    class MockBroadcastChannel {
      onmessage: ((event: MessageEvent) => void) | null = null
      static channels: MockBroadcastChannel[] = []
      constructor(public name: string) {
        MockBroadcastChannel.channels.push(this)
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel)
    MockBroadcastChannel.channels = []

    const setMultiTabWarning = vi.fn()
    initMultiTabDetection(setMultiTabWarning)

    const channel = MockBroadcastChannel.channels[0]
    channel.onmessage?.({ data: { type: "tab-inactive", tabId: "some-other-tab" } } as MessageEvent)

    expect(setMultiTabWarning).toHaveBeenCalledWith(false)
  })

  it("announces this tab as inactive and closes the channel on beforeunload", () => {
    const postMessageSpy = vi.fn()
    const closeSpy = vi.fn()
    class MockBroadcastChannel {
      onmessage: ((event: MessageEvent) => void) | null = null
      constructor(public name: string) {}
      postMessage = postMessageSpy
      close = closeSpy
    }
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel)

    initMultiTabDetection(vi.fn())
    postMessageSpy.mockClear() // clear the initial "tab-active" announcement

    window.dispatchEvent(new Event("beforeunload"))

    expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "tab-inactive" }))
    expect(closeSpy).toHaveBeenCalled()
  })
})
