import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { DashboardRefreshIndicator } from "./DashboardRefreshIndicator"

describe("DashboardRefreshIndicator", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows 'Updated 0s ago' immediately after mount", () => {
    render(<DashboardRefreshIndicator dataUpdatedAt={Date.now()} />)
    expect(screen.getByText(/Updated 0s ago/)).toBeInTheDocument()
    expect(screen.getByText(/Next in 30s/)).toBeInTheDocument()
  })

  it("counts up seconds-since and down seconds-until-next every second", () => {
    vi.useFakeTimers()
    const now = Date.now()
    render(<DashboardRefreshIndicator dataUpdatedAt={now} />)

    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText(/Updated 5s ago/)).toBeInTheDocument()
    expect(screen.getByText(/Next in 25s/)).toBeInTheDocument()
  })

  it("resets the countdown when dataUpdatedAt changes (a fresh poll landed)", () => {
    vi.useFakeTimers()
    const start = Date.now()
    const { rerender } = render(<DashboardRefreshIndicator dataUpdatedAt={start} />)

    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByText(/Updated 20s ago/)).toBeInTheDocument()

    rerender(<DashboardRefreshIndicator dataUpdatedAt={Date.now()} />)
    expect(screen.getByText(/Updated 0s ago/)).toBeInTheDocument()
  })

  it("spins the refresh icon once the countdown reaches 0 (poll is imminent)", () => {
    vi.useFakeTimers()
    const start = Date.now()
    render(<DashboardRefreshIndicator dataUpdatedAt={start} />)

    const icon = document.querySelector("svg")
    expect(icon).not.toHaveClass("animate-spin")

    act(() => vi.advanceTimersByTime(30_000))
    expect(screen.getByText(/Next in 0s/)).toBeInTheDocument()
    expect(document.querySelector("svg")).toHaveClass("animate-spin", "text-accent")
  })

  it("respects a custom intervalMs", () => {
    render(<DashboardRefreshIndicator dataUpdatedAt={Date.now()} intervalMs={60_000} />)
    expect(screen.getByText(/Next in 60s/)).toBeInTheDocument()
  })

  it("has an accessible live region announcing the update time", () => {
    render(<DashboardRefreshIndicator dataUpdatedAt={Date.now()} />)
    const status = screen.getByRole("status")
    expect(status).toHaveAttribute("aria-live", "polite")
  })
})
