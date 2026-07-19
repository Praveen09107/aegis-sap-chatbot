import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatusDot } from "./status-dot"

describe("StatusDot", () => {
  it("labels an online status as 'Connected'", () => {
    render(<StatusDot status="online" />)
    expect(screen.getByRole("status", { name: "Connected" })).toBeInTheDocument()
  })

  it("labels an error status as 'Error'", () => {
    render(<StatusDot status="error" />)
    expect(screen.getByRole("status", { name: "Error" })).toBeInTheDocument()
  })

  it("shows a visible text label only when showLabel is true", () => {
    const { rerender } = render(<StatusDot status="online" />)
    expect(screen.queryByText("Connected")).not.toBeInTheDocument()

    rerender(<StatusDot status="online" showLabel />)
    expect(screen.getByText("Connected")).toBeInTheDocument()
  })
})
