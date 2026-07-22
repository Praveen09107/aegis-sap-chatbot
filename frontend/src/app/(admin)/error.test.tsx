import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminErrorPage from "./error"

describe("AdminErrorPage", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

  beforeEach(() => {
    consoleError.mockClear()
  })

  it("logs the error and renders the fallback UI", () => {
    const error = new Error("boom")
    render(<AdminErrorPage error={error} reset={vi.fn()} />)

    expect(screen.getByText("Admin portal error")).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith("[Admin portal error]", error)
  })

  it("calls reset when 'Try again' is clicked", async () => {
    const reset = vi.fn()
    const user = userEvent.setup()
    render(<AdminErrorPage error={new Error("boom")} reset={reset} />)

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalled()
  })

  it("links 'Dashboard' to /admin/dashboard", () => {
    render(<AdminErrorPage error={new Error("boom")} reset={vi.fn()} />)
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/admin/dashboard")
  })
})
