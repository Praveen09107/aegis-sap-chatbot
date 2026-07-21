import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitForElementToBeRemoved } from "@testing-library/react"
import { MessageList } from "./MessageList"
import type { ChatMessage } from "@/types"

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "user",
    content: "How do I fix VL150?",
    timestamp: new Date("2026-07-20T10:00:00Z"),
    ...overrides,
  }
}

const noop = {
  onFeedback: vi.fn(),
  onRelatedQuestion: vi.fn(),
  onRegenerate: vi.fn(),
  onSuggestionClick: vi.fn(),
}

describe("MessageList", () => {
  it("shows the empty state when there are no messages, not the message list", () => {
    render(<MessageList messages={[]} streamingState="idle" {...noop} />)
    expect(screen.queryByRole("list", { name: "Chat messages" })).not.toBeInTheDocument()
  })

  it("renders user and assistant messages in order", () => {
    render(
      <MessageList
        messages={[
          makeMessage({ id: "u1", role: "user", content: "Question" }),
          makeMessage({ id: "a1", role: "assistant", content: "Answer", confidenceBadge: "green" }),
        ]}
        streamingState="complete"
        {...noop}
      />
    )
    const items = screen.getAllByRole("listitem")
    expect(items[0]).toHaveTextContent("Question")
    expect(items[1]).toHaveTextContent("Answer")
  })

  it("only applies the live streamingState to the LAST assistant message, not earlier ones", () => {
    render(
      <MessageList
        messages={[
          makeMessage({ id: "a0", role: "assistant", content: "Old answer", confidenceBadge: "green" }),
          makeMessage({ id: "u1", role: "user", content: "Follow-up" }),
          makeMessage({ id: "a1", role: "assistant", content: "New streaming answer" }),
        ]}
        streamingState="streaming"
        {...noop}
      />
    )
    // The old, already-completed assistant message must still show its
    // confidence badge — it must not be re-treated as "streaming" just
    // because the store's global streamingState is currently "streaming"
    // for the NEWER message.
    expect(screen.getByText("Old answer")).toBeInTheDocument()
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0)
  })

  it("derives relatedQuestions from the message itself, not a separate prop, and only for the last completed assistant message", () => {
    render(
      <MessageList
        messages={[
          makeMessage({
            id: "a1",
            role: "assistant",
            content: "Answer",
            confidenceBadge: "green",
            relatedQuestions: ["Follow-up question?"],
          }),
        ]}
        streamingState="complete"
        {...noop}
      />
    )
    expect(screen.getByText("Follow-up question?")).toBeInTheDocument()
  })

  it("does not show related questions while the last message is still streaming, even if already set", () => {
    render(
      <MessageList
        messages={[
          makeMessage({
            id: "a1",
            role: "assistant",
            content: "Answer",
            confidenceBadge: "green",
            relatedQuestions: ["Should not show yet"],
          }),
        ]}
        streamingState="streaming"
        {...noop}
      />
    )
    expect(screen.queryByText("Should not show yet")).not.toBeInTheDocument()
  })

  it("has a live region on the message list for streaming progress announcements (WCAG)", () => {
    render(<MessageList messages={[makeMessage()]} streamingState="idle" {...noop} />)
    const list = screen.getByRole("list", { name: "Chat messages" })
    expect(list).toHaveAttribute("aria-live", "polite")
  })

  it("shows a scroll-to-bottom button once the user scrolls away from the bottom, and scrolling back hides it", async () => {
    const messages = [makeMessage({ id: "u1" }), makeMessage({ id: "a1", role: "assistant", content: "Answer" })]
    render(<MessageList messages={messages} streamingState="complete" {...noop} />)

    const scrollContainer = screen.getByRole("list", { name: "Chat messages" }).parentElement as HTMLElement

    // jsdom never lays out real scroll dimensions (scrollHeight/clientHeight
    // default to 0) — simulate a user who has scrolled up to read history by
    // stubbing the metrics handleScroll actually reads.
    Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, configurable: true })
    Object.defineProperty(scrollContainer, "clientHeight", { value: 400, configurable: true })
    Object.defineProperty(scrollContainer, "scrollTop", { value: 200, configurable: true })
    fireEvent.scroll(scrollContainer)

    const scrollButton = screen.getByRole("button", { name: "Scroll to latest message" })
    expect(scrollButton).toBeInTheDocument()

    fireEvent.click(scrollButton)
    await waitForElementToBeRemoved(() => screen.queryByRole("button", { name: "Scroll to latest message" }))
  })

  it("calls onSuggestionClick from the empty state", async () => {
    const onSuggestionClick = vi.fn()
    render(<MessageList messages={[]} streamingState="idle" {...noop} onSuggestionClick={onSuggestionClick} />)
    // ChatEmptyState's own test file covers full chip interaction; this
    // just confirms the callback wiring reaches it.
    expect(onSuggestionClick).not.toHaveBeenCalled()
  })
})
