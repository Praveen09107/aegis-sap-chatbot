import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { UserBubble } from "./UserBubble"
import type { ChatMessage } from "@/types"

const message: ChatMessage = {
  id: "1",
  role: "user",
  content: "How do I fix VL150?",
  timestamp: new Date("2026-07-19T10:30:00Z"),
}

describe("UserBubble", () => {
  it("renders the message content exactly as typed, with no entity chips or markdown", () => {
    render(<UserBubble message={{ ...message, content: "**VL150** should not be bold or chipped" }} />)
    expect(screen.getByText("**VL150** should not be bold or chipped")).toBeInTheDocument()
    expect(screen.queryByRole("mark")).not.toBeInTheDocument()
  })

  it("preserves whitespace and line breaks", () => {
    const { container } = render(<UserBubble message={{ ...message, content: "line one\nline two" }} />)
    expect(container.querySelector(".whitespace-pre-wrap")).toBeInTheDocument()
  })

  it("shows a formatted timestamp", () => {
    render(<UserBubble message={message} />)
    expect(screen.getByLabelText(/Sent at/)).toBeInTheDocument()
  })
})
