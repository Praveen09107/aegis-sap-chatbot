import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { LoadingScreen } from "./LoadingScreen"

describe("LoadingScreen", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders with the org's logo alt text, never a hardcoded company name", () => {
    render(<LoadingScreen />)
    expect(screen.queryByText(/Sona Comstar/i)).not.toBeInTheDocument()
    // orgName falls back to "Your Company" outside a real deployment env.
    expect(screen.getByAltText("Your Company")).toBeInTheDocument()
  })

  it("shows the given label", () => {
    render(<LoadingScreen label="Checking session..." />)
    expect(screen.getByRole("status", { name: "Checking session..." })).toBeInTheDocument()
  })

  it("stays visible until minDurationMs elapses, then unmounts", () => {
    vi.useFakeTimers()
    const { container } = render(<LoadingScreen minDurationMs={400} />)
    expect(screen.getByRole("status")).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(399))
    expect(screen.getByRole("status")).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(container).toBeEmptyDOMElement()
  })
})
