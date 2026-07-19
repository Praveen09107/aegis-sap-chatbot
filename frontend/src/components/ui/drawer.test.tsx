import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Drawer } from "./drawer"

describe("Drawer", () => {
  it("renders nothing when closed", () => {
    render(
      <Drawer open={false} onOpenChange={vi.fn()} title="Ticket #TKT-0042">
        <p>Content</p>
      </Drawer>
    )
    expect(screen.queryByText("Ticket #TKT-0042")).not.toBeInTheDocument()
  })

  it("renders the title, description, and children when open", () => {
    render(
      <Drawer open onOpenChange={vi.fn()} title="Ticket #TKT-0042" description="VL150 delivery error">
        <p>Ticket detail content</p>
      </Drawer>
    )
    expect(screen.getByText("Ticket #TKT-0042")).toBeInTheDocument()
    expect(screen.getByText("VL150 delivery error")).toBeInTheDocument()
    expect(screen.getByText("Ticket detail content")).toBeInTheDocument()
  })

  it("renders an optional footer", () => {
    render(
      <Drawer open onOpenChange={vi.fn()} title="Test" footer={<button>Save</button>}>
        <p>Content</p>
      </Drawer>
    )
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  it("calls onOpenChange(false) when the close button is clicked", async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Drawer open onOpenChange={onOpenChange} title="Test">
        <p>Content</p>
      </Drawer>
    )

    await user.click(screen.getByRole("button", { name: "Close drawer" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
