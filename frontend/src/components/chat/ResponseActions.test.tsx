import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ResponseActions } from "./ResponseActions"

describe("ResponseActions", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("copies the message content to the clipboard and shows a confirmation", async () => {
    // userEvent.setup() installs its own clipboard mock on navigator —
    // override it afterward so this test can assert on the real call.
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })

    render(<ResponseActions messageContent="VL150 means..." onFeedback={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Copy message" }))

    expect(writeText).toHaveBeenCalledWith("VL150 means...")
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument()
  })

  it("calls onFeedback with 'positive' or 'negative' and disables both after one is given", async () => {
    const onFeedback = vi.fn()
    const user = userEvent.setup()
    render(<ResponseActions messageContent="x" onFeedback={onFeedback} />)

    await user.click(screen.getByRole("button", { name: "Helpful" }))
    expect(onFeedback).toHaveBeenCalledWith("positive")
  })

  it("marks the given feedback as pressed and disables the other option", () => {
    render(<ResponseActions messageContent="x" onFeedback={vi.fn()} feedbackGiven="positive" />)
    expect(screen.getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Not helpful — flag for review" })).toBeDisabled()
  })

  it("shows the regenerate button only when canRegenerate and onRegenerate are both provided", () => {
    const { rerender } = render(<ResponseActions messageContent="x" onFeedback={vi.fn()} canRegenerate onRegenerate={undefined} />)
    expect(screen.queryByRole("button", { name: "Try different approach" })).not.toBeInTheDocument()

    rerender(<ResponseActions messageContent="x" onFeedback={vi.fn()} canRegenerate onRegenerate={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Try different approach" })).toBeInTheDocument()
  })

  it("calls onRegenerate when clicked", async () => {
    const onRegenerate = vi.fn()
    const user = userEvent.setup()
    render(<ResponseActions messageContent="x" onFeedback={vi.fn()} canRegenerate onRegenerate={onRegenerate} />)

    await user.click(screen.getByRole("button", { name: "Try different approach" }))
    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })
})
