import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Input } from "./input"

describe("Input", () => {
  it("renders a bare input with no error", () => {
    render(<Input placeholder="Username" />)
    const input = screen.getByPlaceholderText("Username")
    expect(input.tagName).toBe("INPUT")
    expect(input.className).toContain("border-border-primary")
    expect(input).toHaveAttribute("aria-invalid", "false")
  })

  it("does not wrap in a container when there is no error — required for InputGroupInput's flex composition", () => {
    const { container } = render(<Input placeholder="Username" />)
    expect(container.firstChild).toBe(screen.getByPlaceholderText("Username"))
  })

  it("shows the danger border and inline message when error + errorMessage are set", () => {
    render(<Input placeholder="Email" error errorMessage="Invalid email address" />)
    const input = screen.getByPlaceholderText("Email")
    expect(input.className).toContain("border-danger-border")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email address")
  })

  it("marks aria-invalid without rendering a message when errorMessage is omitted", () => {
    render(<Input placeholder="Email" error />)
    expect(screen.getByPlaceholderText("Email")).toHaveAttribute("aria-invalid", "true")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
