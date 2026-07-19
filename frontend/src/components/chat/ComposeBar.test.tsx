import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ComposeBar } from "./ComposeBar"

function renderBar(overrides: Partial<React.ComponentProps<typeof ComposeBar>> = {}) {
  const props: React.ComponentProps<typeof ComposeBar> = {
    value: "",
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAttachClick: vi.fn(),
    onRemoveScreenshot: vi.fn(),
    streamingState: "idle",
    pendingScreenshot: null,
    screenshotPreviewUrl: null,
    ...overrides,
  }
  return { ...render(<ComposeBar {...props} />), props }
}

describe("ComposeBar", () => {
  it("disables send when the input is empty", () => {
    renderBar({ value: "" })
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
  })

  it("enables send once there is non-whitespace text", () => {
    renderBar({ value: "How do I fix VL150?" })
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled()
  })

  it("disables send while a response is streaming", () => {
    renderBar({ value: "text", streamingState: "generating" })
    expect(screen.getByRole("button", { name: "Waiting for response..." })).toBeDisabled()
  })

  it("calls onSend on Enter but not on Shift+Enter", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    renderBar({ value: "text", onSend })

    const textarea = screen.getByLabelText("Message input")
    textarea.focus()
    await user.keyboard("{Shift>}{Enter}{/Shift}")
    expect(onSend).not.toHaveBeenCalled()

    await user.keyboard("{Enter}")
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("calls onChange as the user types", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderBar({ value: "", onChange })

    await user.type(screen.getByLabelText("Message input"), "a")
    expect(onChange).toHaveBeenCalledWith("a")
  })

  it("calls onAttachClick when the attachment button is clicked", async () => {
    const onAttachClick = vi.fn()
    const user = userEvent.setup()
    renderBar({ onAttachClick })

    await user.click(screen.getByRole("button", { name: "Attach SAP screenshot" }))
    expect(onAttachClick).toHaveBeenCalledTimes(1)
  })

  it("shows the screenshot preview and wires up removal", async () => {
    const onRemoveScreenshot = vi.fn()
    const user = userEvent.setup()
    const file = new File(["x"], "shot.png", { type: "image/png" })
    renderBar({ pendingScreenshot: file, screenshotPreviewUrl: "blob:mock", onRemoveScreenshot })

    expect(screen.getByText("shot.png")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Remove screenshot" }))
    expect(onRemoveScreenshot).toHaveBeenCalledTimes(1)
  })

  it("disables the attachment button and textarea when disabled", () => {
    renderBar({ disabled: true })
    expect(screen.getByRole("button", { name: "Attach SAP screenshot" })).toBeDisabled()
    expect(screen.getByLabelText("Message input")).toBeDisabled()
  })
})
