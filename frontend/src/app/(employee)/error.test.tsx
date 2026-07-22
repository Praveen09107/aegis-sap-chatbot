import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import EmployeeErrorPage from "./error"

describe("EmployeeErrorPage", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

  beforeEach(() => {
    consoleError.mockClear()
  })

  it("logs the error and renders the fallback UI", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" })
    render(<EmployeeErrorPage error={error} reset={vi.fn()} />)

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith("[Employee portal error]", error)
  })

  it("calls reset when 'Try again' is clicked", async () => {
    const reset = vi.fn()
    const user = userEvent.setup()
    render(<EmployeeErrorPage error={new Error("boom")} reset={reset} />)

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalled()
  })

  it("links 'Go to chat' to /", () => {
    render(<EmployeeErrorPage error={new Error("boom")} reset={vi.fn()} />)
    expect(screen.getByRole("link", { name: /Go to chat/ })).toHaveAttribute("href", "/")
  })
})
