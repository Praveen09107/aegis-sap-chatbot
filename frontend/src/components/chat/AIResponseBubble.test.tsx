import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AIResponseBubble } from "./AIResponseBubble"
import type { ChatMessage } from "@/types"

const baseMessage: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "VL150 means the delivery quantity exceeds the sales order quantity.",
  timestamp: new Date("2026-07-19T10:00:00Z"),
}

describe("AIResponseBubble — streaming states", () => {
  it("shows the streaming progress label and no confidence badge while streaming", () => {
    render(<AIResponseBubble message={{ ...baseMessage, content: "" }} streamingState="thinking" onFeedback={vi.fn()} />)
    expect(screen.getByText("Thinking...")).toBeInTheDocument()
    expect(screen.queryByRole("status", { name: /confidence/i })).not.toBeInTheDocument()
  })

  it("shows a blinking cursor only in the 'streaming' sub-state, not 'thinking'/'retrieving'", () => {
    const { container, rerender } = render(
      <AIResponseBubble message={{ ...baseMessage, content: "Partial answer" }} streamingState="retrieving" onFeedback={vi.fn()} />
    )
    expect(container.querySelector('[role="presentation"]')).not.toBeInTheDocument()

    rerender(<AIResponseBubble message={{ ...baseMessage, content: "Partial answer" }} streamingState="streaming" onFeedback={vi.fn()} />)
    expect(container.querySelector('[role="presentation"]')).toBeInTheDocument()
  })

  it("does not show the metadata row (badge/actions) while streaming", () => {
    render(<AIResponseBubble message={{ ...baseMessage, confidenceBadge: "green" }} streamingState="streaming" onFeedback={vi.fn()} />)
    expect(screen.queryByRole("toolbar", { name: "Message actions" })).not.toBeInTheDocument()
  })
})

describe("AIResponseBubble — completed states", () => {
  it("shows the confidence badge and attribution reference once complete", () => {
    render(
      <AIResponseBubble
        message={{
          ...baseMessage,
          confidenceBadge: "green",
          validationScore: 0.91,
          attributionPanel: {
            primary_document_id: "SD-ERR-001",
            primary_document_name: "Delivery error guide",
            verified_by: "admin",
            verified_date: "2026-06-01",
            secondary_sources: [],
            confidence_badge: "green",
            form_entry_id: null,
            screenshots: [],
          },
        }}
        streamingState="complete"
        onFeedback={vi.fn()}
      />
    )
    expect(screen.getByText("High confidence")).toBeInTheDocument()
    expect(screen.getByText(/SD-ERR-001/)).toBeInTheDocument()
    expect(screen.getByRole("toolbar", { name: "Message actions" })).toBeInTheDocument()
  })

  it("renders message content through MarkdownMessage with entity highlighting", () => {
    render(<AIResponseBubble message={{ ...baseMessage, confidenceBadge: "green" }} streamingState="complete" onFeedback={vi.fn()} />)
    expect(screen.getByText("VL150")).toHaveAttribute("role", "mark")
  })

  it("shows the regenerate action only for amber/none badges, not green", async () => {
    const onRegenerate = vi.fn()
    const { rerender } = render(
      <AIResponseBubble message={{ ...baseMessage, confidenceBadge: "green" }} streamingState="complete" onFeedback={vi.fn()} onRegenerate={onRegenerate} />
    )
    expect(screen.queryByRole("button", { name: "Try different approach" })).not.toBeInTheDocument()

    rerender(
      <AIResponseBubble message={{ ...baseMessage, confidenceBadge: "amber" }} streamingState="complete" onFeedback={vi.fn()} onRegenerate={onRegenerate} />
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Try different approach" }))
    expect(onRegenerate).toHaveBeenCalledWith("m1")
  })

  it("shows related questions only for a green badge, and calls onRelatedQuestion", async () => {
    const onRelatedQuestion = vi.fn()
    const user = userEvent.setup()
    render(
      <AIResponseBubble
        message={{ ...baseMessage, confidenceBadge: "green" }}
        streamingState="complete"
        onFeedback={vi.fn()}
        onRelatedQuestion={onRelatedQuestion}
        relatedQuestions={["What is safety stock?"]}
      />
    )
    await user.click(screen.getByText("What is safety stock?"))
    expect(onRelatedQuestion).toHaveBeenCalledWith("What is safety stock?")
  })

  it("does not show related questions for amber/none badges even if provided", () => {
    render(
      <AIResponseBubble
        message={{ ...baseMessage, confidenceBadge: "amber" }}
        streamingState="complete"
        onFeedback={vi.fn()}
        onRelatedQuestion={vi.fn()}
        relatedQuestions={["Should not show"]}
      />
    )
    expect(screen.queryByText("Should not show")).not.toBeInTheDocument()
  })

  it("forwards feedback signals with the message id", async () => {
    const onFeedback = vi.fn()
    const user = userEvent.setup()
    render(<AIResponseBubble message={{ ...baseMessage, confidenceBadge: "green" }} streamingState="complete" onFeedback={onFeedback} />)

    await user.click(screen.getByRole("button", { name: "Helpful" }))
    expect(onFeedback).toHaveBeenCalledWith("m1", "positive")
  })
})

describe("AIResponseBubble — incomplete stream (SUPPLEMENT_05 Part 2)", () => {
  it("shows no incomplete indicator for a normally-completed message", () => {
    render(<AIResponseBubble message={{ ...baseMessage, confidenceBadge: "green" }} streamingState="complete" onFeedback={vi.fn()} />)
    expect(screen.queryByText(/Response interrupted/)).not.toBeInTheDocument()
  })

  it("shows the interrupted notice and a Retry action when the message is marked incomplete", async () => {
    const onRegenerate = vi.fn()
    const user = userEvent.setup()
    render(
      <AIResponseBubble
        message={{ ...baseMessage, isIncomplete: true }}
        streamingState="error"
        onFeedback={vi.fn()}
        onRegenerate={onRegenerate}
      />
    )

    expect(screen.getByText(/Response interrupted/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(onRegenerate).toHaveBeenCalledWith("m1")
  })

  it("shows the interrupted notice without a Retry button when onRegenerate isn't provided (error/edge path)", () => {
    render(<AIResponseBubble message={{ ...baseMessage, isIncomplete: true }} streamingState="error" onFeedback={vi.fn()} />)
    expect(screen.getByText(/Response interrupted/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument()
  })
})
