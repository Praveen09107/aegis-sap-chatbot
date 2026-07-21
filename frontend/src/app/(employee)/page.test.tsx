import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import ChatPage from "./page"
import { useChatStore } from "@/stores/chatStore"
import { useSessionStore } from "@/stores/sessionStore"

const replaceMock = vi.fn()
const searchParamsMock = { get: vi.fn(() => null as string | null) }
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock,
  useRouter: () => ({ replace: replaceMock }),
}))

const useSessionMock = vi.fn<(id: string | null) => { data: unknown; isError: boolean }>(
  () => ({ data: undefined, isError: false })
)
vi.mock("@/hooks/queries", () => ({
  useSession: (id: string | null) => useSessionMock(id),
}))

vi.mock("@/hooks/useChatKeyboardShortcuts", () => ({
  useChatKeyboardShortcuts: vi.fn(),
}))

vi.mock("@/components/chat/ChatInterface", () => ({
  ChatInterface: () => <div data-testid="chat-interface" />,
}))

describe("ChatPage", () => {
  beforeEach(() => {
    replaceMock.mockClear()
    searchParamsMock.get.mockReturnValue(null)
    useSessionMock.mockReset()
    useSessionMock.mockReturnValue({ data: undefined, isError: false })
    useChatStore.setState({
      messages: [],
      currentSessionId: null,
    })
    useSessionStore.setState({ activeSessionId: null })
  })

  it("renders the chat interface", () => {
    render(<ChatPage />)
    expect(screen.getByTestId("chat-interface")).toBeInTheDocument()
  })

  it("does not attempt to load a session when there is no ?session= param", () => {
    render(<ChatPage />)
    expect(useSessionMock).toHaveBeenCalledWith(null)
  })

  describe("loading a historical session (?session=<id>)", () => {
    const historicalSession = {
      session: { id: "sess-1", topic_summary: "VL150 troubleshooting" },
      messages: [
        { id: "m1", role: "user" as const, content: "How do I fix VL150?", timestamp: "2026-07-19T10:00:00Z" },
        {
          id: "m2",
          role: "assistant" as const,
          content: "Adjust the delivery quantity.",
          timestamp: "2026-07-19T10:00:05Z",
          confidence_badge: "green",
          validation_score: 0.91,
          attribution_doc_id: "DOC-1",
        },
      ],
    }

    it("loads messages into chatStore and sets the active session", async () => {
      searchParamsMock.get.mockReturnValue("sess-1")
      useSessionMock.mockReturnValue({ data: historicalSession, isError: false })

      render(<ChatPage />)

      await waitFor(() => expect(useChatStore.getState().messages).toHaveLength(2))
      expect(useChatStore.getState().currentSessionId).toBe("sess-1")
      expect(useSessionStore.getState().activeSessionId).toBe("sess-1")
      expect(useChatStore.getState().messages[1]).toMatchObject({
        content: "Adjust the delivery quantity.",
        confidenceBadge: "green",
        validationScore: 0.91,
      })
      expect(useChatStore.getState().messages[1].attributionPanel?.primary_document_id).toBe("DOC-1")
    })

    it("reconstructs a null attributionPanel when the message has no attribution_doc_id", async () => {
      searchParamsMock.get.mockReturnValue("sess-1")
      useSessionMock.mockReturnValue({
        data: {
          session: { id: "sess-1" },
          messages: [{ id: "m1", role: "user" as const, content: "hi", timestamp: "2026-07-19T10:00:00Z" }],
        },
        isError: false,
      })

      render(<ChatPage />)

      await waitFor(() => expect(useChatStore.getState().messages).toHaveLength(1))
      expect(useChatStore.getState().messages[0].attributionPanel).toBeNull()
    })

    it("clears the invalid session param and toasts an error when the session fails to load (error path)", async () => {
      searchParamsMock.get.mockReturnValue("does-not-exist")
      useSessionMock.mockReturnValue({ data: undefined, isError: true })

      render(<ChatPage />)

      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"))
    })
  })

  it("clears messages when there is no session param and no active WS-driven session", () => {
    useChatStore.setState({ messages: [{ id: "m1", role: "user", content: "stale", timestamp: new Date() }] })
    render(<ChatPage />)
    expect(useChatStore.getState().messages).toEqual([])
  })

  it("does not clear messages when a session is already active (e.g. mid-conversation, WS-driven session_ready already landed)", () => {
    useChatStore.setState({
      messages: [{ id: "m1", role: "user", content: "in progress", timestamp: new Date() }],
      currentSessionId: "sess-live",
    })
    render(<ChatPage />)
    expect(useChatStore.getState().messages).toHaveLength(1)
  })
})
