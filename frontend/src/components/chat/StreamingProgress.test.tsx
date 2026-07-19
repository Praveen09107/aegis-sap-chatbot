import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { StreamingProgress } from "./StreamingProgress"

describe("StreamingProgress", () => {
  it("shows the label for each streaming stage", async () => {
    const { rerender } = render(<StreamingProgress state="thinking" />)
    expect(screen.getByText("Thinking...")).toBeInTheDocument()

    // AnimatePresence mode="wait" holds the outgoing stage's exit animation
    // before mounting the next one — wait for the transition to settle.
    rerender(<StreamingProgress state="retrieving" />)
    await vi.waitFor(() => expect(screen.getByText("Retrieving SAP documentation...")).toBeInTheDocument())

    rerender(<StreamingProgress state="generating" />)
    await vi.waitFor(() => expect(screen.getByText("Generating response...")).toBeInTheDocument())

    rerender(<StreamingProgress state="validating" />)
    await vi.waitFor(() => expect(screen.getByText("Validating answer...")).toBeInTheDocument())
  })

  it("renders nothing for idle, streaming, complete, or error states", () => {
    for (const state of ["idle", "streaming", "complete", "error"] as const) {
      const { container, unmount } = render(<StreamingProgress state={state} />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it("exposes a polite live region for screen readers", () => {
    render(<StreamingProgress state="generating" />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite")
  })
})
