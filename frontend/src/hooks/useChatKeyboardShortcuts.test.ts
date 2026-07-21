import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useChatKeyboardShortcuts } from "./useChatKeyboardShortcuts"
import { useChatStore } from "@/stores/chatStore"
import { useSessionStore } from "@/stores/sessionStore"

const replaceMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

const disconnectMock = vi.fn()
vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({ disconnect: disconnectMock }),
}))

const exportSessionAsPDFMock = vi.fn()
vi.mock("@/lib/sessionExport", () => ({
  exportSessionAsPDF: (...args: unknown[]) => exportSessionAsPDFMock(...args),
}))

function dispatchKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }))
}

describe("useChatKeyboardShortcuts", () => {
  beforeEach(() => {
    replaceMock.mockClear()
    disconnectMock.mockClear()
    exportSessionAsPDFMock.mockClear()
    useChatStore.setState({
      messages: [],
      currentSessionId: null,
      streamingState: "idle",
      websocket: null,
      pendingScreenshot: null,
      screenshotPreviewUrl: null,
      composeValue: "",
    })
    useSessionStore.setState({ activeSessionId: null, sessions: [] })
  })

  describe("⌘N — new chat session", () => {
    it("disconnects, resets chat state, clears the active session, and navigates to /", () => {
      useChatStore.setState({
        messages: [{ id: "m1", role: "user", content: "old", timestamp: new Date() }],
        currentSessionId: "sess-1",
      })
      useSessionStore.setState({ activeSessionId: "sess-1" })
      renderHook(() => useChatKeyboardShortcuts())

      dispatchKey("n", { metaKey: true })

      expect(disconnectMock).toHaveBeenCalledTimes(1)
      expect(useChatStore.getState().messages).toEqual([])
      expect(useChatStore.getState().currentSessionId).toBeNull()
      expect(useSessionStore.getState().activeSessionId).toBeNull()
      expect(replaceMock).toHaveBeenCalledWith("/")
    })

    it("fires even while focus is inside the compose textarea (ignoreInInput: false)", () => {
      renderHook(() => useChatKeyboardShortcuts())
      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)
      textarea.focus()

      dispatchKey("n", { metaKey: true })

      expect(disconnectMock).toHaveBeenCalledTimes(1)
      document.body.removeChild(textarea)
    })
  })

  describe("⌘F — focus session search", () => {
    it("focuses and selects the sidebar's search input", () => {
      renderHook(() => useChatKeyboardShortcuts())

      const aside = document.createElement("aside")
      aside.setAttribute("aria-label", "Session history")
      const input = document.createElement("input")
      input.type = "search"
      aside.appendChild(input)
      document.body.appendChild(aside)

      const focusSpy = vi.spyOn(input, "focus")
      const selectSpy = vi.spyOn(input, "select")

      dispatchKey("f", { metaKey: true })

      expect(focusSpy).toHaveBeenCalled()
      expect(selectSpy).toHaveBeenCalled()
      document.body.removeChild(aside)
    })

    it("does not throw when the sidebar search input isn't in the DOM (error/edge path)", () => {
      renderHook(() => useChatKeyboardShortcuts())
      expect(() => dispatchKey("f", { metaKey: true })).not.toThrow()
    })
  })

  describe("⌘Shift+E — export session PDF", () => {
    it("exports the current session using its topic_summary", async () => {
      useChatStore.setState({
        currentSessionId: "sess-1",
        messages: [{ id: "m1", role: "user", content: "hi", timestamp: new Date() }],
      })
      useSessionStore.setState({
        sessions: [{ id: "sess-1", topic_summary: "VL150 troubleshooting" } as never],
      })
      renderHook(() => useChatKeyboardShortcuts())

      dispatchKey("e", { metaKey: true, shiftKey: true })
      await Promise.resolve()

      expect(exportSessionAsPDFMock).toHaveBeenCalledWith(
        useChatStore.getState().messages,
        "VL150 troubleshooting"
      )
    })

    it("does nothing when there is no active session or no messages (guard, not a crash)", async () => {
      useChatStore.setState({ currentSessionId: null, messages: [] })
      renderHook(() => useChatKeyboardShortcuts())

      dispatchKey("e", { metaKey: true, shiftKey: true })
      await Promise.resolve()

      expect(exportSessionAsPDFMock).not.toHaveBeenCalled()
    })

    it("falls back to a generic topic when the session isn't found in sessionStore (error/edge path)", async () => {
      useChatStore.setState({
        currentSessionId: "unknown-session",
        messages: [{ id: "m1", role: "user", content: "hi", timestamp: new Date() }],
      })
      useSessionStore.setState({ sessions: [] })
      renderHook(() => useChatKeyboardShortcuts())

      dispatchKey("e", { metaKey: true, shiftKey: true })
      await Promise.resolve()

      expect(exportSessionAsPDFMock).toHaveBeenCalledWith(useChatStore.getState().messages, "AEGIS Session")
    })

    it("does not throw when the export itself fails (error path)", async () => {
      exportSessionAsPDFMock.mockRejectedValueOnce(new Error("PDF generation failed"))
      useChatStore.setState({
        currentSessionId: "sess-1",
        messages: [{ id: "m1", role: "user", content: "hi", timestamp: new Date() }],
      })
      renderHook(() => useChatKeyboardShortcuts())

      expect(() => dispatchKey("e", { metaKey: true, shiftKey: true })).not.toThrow()
      await Promise.resolve()
      await Promise.resolve()
    })
  })
})
