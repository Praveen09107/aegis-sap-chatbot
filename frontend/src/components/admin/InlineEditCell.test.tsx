import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { InlineEditCell } from "./InlineEditCell"

describe("InlineEditCell", () => {
  it("renders the static value with an edit affordance", () => {
    render(<InlineEditCell value="30" onSave={vi.fn()} />)
    expect(screen.getByText("30")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit value: 30" })).toBeInTheDocument()
  })

  it("shows the placeholder when value is empty", () => {
    render(<InlineEditCell value="" onSave={vi.fn()} placeholder="No value set" />)
    expect(screen.getByText("No value set")).toBeInTheDocument()
  })

  it("transforms into an input on click, focused and selected", async () => {
    const user = userEvent.setup()
    render(<InlineEditCell value="30" onSave={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Edit value: 30" }))

    const input = screen.getByDisplayValue("30")
    expect(input).toHaveFocus()
  })

  it("saves the new value on Enter", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<InlineEditCell value="30" onSave={onSave} />)

    await user.click(screen.getByRole("button", { name: "Edit value: 30" }))
    const input = screen.getByDisplayValue("30")
    await user.clear(input)
    await user.type(input, "45{Enter}")

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("45"))
    await waitFor(() => expect(screen.queryByDisplayValue("45")).not.toBeInTheDocument())
  })

  it("cancels and restores the original value on Escape, without calling onSave", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<InlineEditCell value="30" onSave={onSave} />)

    await user.click(screen.getByRole("button", { name: "Edit value: 30" }))
    const input = screen.getByDisplayValue("30")
    await user.clear(input)
    await user.type(input, "999{Escape}")

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText("30")).toBeInTheDocument()
  })

  it("does not call onSave when the value is unchanged (just trimmed) — closes immediately", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<InlineEditCell value="30" onSave={onSave} />)

    await user.click(screen.getByRole("button", { name: "Edit value: 30" }))
    await user.keyboard("{Enter}")

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText("30")).toBeInTheDocument()
  })

  it("restores the original value and stops editing when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("network error"))
    const user = userEvent.setup()
    render(<InlineEditCell value="30" onSave={onSave} />)

    await user.click(screen.getByRole("button", { name: "Edit value: 30" }))
    const input = screen.getByDisplayValue("30")
    await user.clear(input)
    await user.type(input, "45{Enter}")

    await waitFor(() => expect(screen.getByText("30")).toBeInTheDocument())
  })

  it("saves via the explicit Save button", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<InlineEditCell value="30" onSave={onSave} />)

    await user.click(screen.getByRole("button", { name: "Edit value: 30" }))
    const input = screen.getByDisplayValue("30")
    await user.clear(input)
    await user.type(input, "45")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("45"))
  })

  it("cancels via the explicit Cancel button", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<InlineEditCell value="30" onSave={onSave} />)

    await user.click(screen.getByRole("button", { name: "Edit value: 30" }))
    const input = screen.getByDisplayValue("30")
    await user.clear(input)
    await user.type(input, "999")
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText("30")).toBeInTheDocument()
  })

  it("does not enter edit mode when disabled", async () => {
    const user = userEvent.setup()
    render(<InlineEditCell value="30" onSave={vi.fn()} disabled />)

    const button = screen.getByRole("button", { name: "Edit value: 30" })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(screen.queryByDisplayValue("30")).not.toBeInTheDocument()
  })

  it("syncs the displayed value when the external value prop changes while not editing", () => {
    const { rerender } = render(<InlineEditCell value="30" onSave={vi.fn()} />)
    expect(screen.getByText("30")).toBeInTheDocument()

    rerender(<InlineEditCell value="99" onSave={vi.fn()} />)
    expect(screen.getByText("99")).toBeInTheDocument()
  })
})
