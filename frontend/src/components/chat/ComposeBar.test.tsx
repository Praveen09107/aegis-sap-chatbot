import { describe, it, expect, vi } from "vitest"
import { useState } from "react"
import { render, screen, waitFor } from "@testing-library/react"
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

// ComposeBar's value is a controlled prop — the entity preview is derived
// from it, so exercising "type and see the preview appear" needs a real
// stateful onChange, not the static vi.fn() renderBar's other tests use.
function StatefulComposeBar(overrides: Partial<React.ComponentProps<typeof ComposeBar>> = {}) {
  const [value, setValue] = useState(overrides.value ?? "")
  return (
    <ComposeBar
      value={value}
      onChange={setValue}
      onSend={vi.fn()}
      onAttachClick={vi.fn()}
      onRemoveScreenshot={vi.fn()}
      streamingState="idle"
      pendingScreenshot={null}
      screenshotPreviewUrl={null}
      {...overrides}
    />
  )
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

  describe("SAP entity preview", () => {
    it("shows no preview for short or entity-free text", () => {
      renderBar({ value: "hi" })
      expect(screen.queryByLabelText("Detected SAP entities")).not.toBeInTheDocument()
    })

    it("shows detected entity chips after the debounce settles", async () => {
      const user = userEvent.setup()
      render(<StatefulComposeBar />)

      await user.type(screen.getByLabelText("Message input"), "How do I fix VL150 in VL01N?")

      await waitFor(
        () => {
          expect(screen.getByLabelText("Detected SAP entities")).toBeInTheDocument()
        },
        { timeout: 2000 }
      )
      expect(screen.getByText("VL150")).toBeInTheDocument()
      expect(screen.getByText("VL01N")).toBeInTheDocument()
    })

    it("caps the preview at 4 chips", async () => {
      const user = userEvent.setup()
      render(<StatefulComposeBar />)

      await user.type(
        screen.getByLabelText("Message input"),
        "VL150 F5201 MMBE VA01N 4500012345 more text"
      )

      await waitFor(
        () => {
          expect(screen.getByLabelText("Detected SAP entities")).toBeInTheDocument()
        },
        { timeout: 2000 }
      )
      const chipContainer = screen.getByLabelText("Detected SAP entities")
      // "Detected:" label + up to 4 chips — never more than that, regardless
      // of how many entities the message actually contains.
      expect(chipContainer.children.length).toBeLessThanOrEqual(5)
    })
  })
})
