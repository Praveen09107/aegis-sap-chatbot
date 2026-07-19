import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "./button"

describe("Button", () => {
  it("renders the default variant with AEGIS's accent color, not shadcn's stock primary", () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole("button", { name: "Save" })
    expect(button.className).toContain("bg-accent")
    expect(button.className).not.toContain("bg-primary")
  })

  it("renders the destructive variant with a solid danger background", () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-danger")
  })

  it("fires onClick when enabled", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Click me</Button>)
    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("disables the button and shows a spinner while loading", () => {
    render(<Button loading>Save</Button>)
    const button = screen.getByRole("button")
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("asChild renders a single element without double-wrapping (Radix Slot compatibility)", () => {
    render(
      <Button asChild>
        <a href="/admin">Go to admin</a>
      </Button>
    )
    const link = screen.getByRole("link", { name: "Go to admin" })
    expect(link.tagName).toBe("A")
    expect(link.className).toContain("bg-accent")
  })
})
