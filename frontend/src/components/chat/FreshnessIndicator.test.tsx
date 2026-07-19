import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { FreshnessIndicator } from "./FreshnessIndicator"

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

describe("FreshnessIndicator", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("labels a recently verified document as Fresh", () => {
    render(<FreshnessIndicator verifiedDate={daysAgo(5)} />)
    expect(screen.getByText(/Fresh — 5 days old/)).toBeInTheDocument()
  })

  it("labels a document past the warn threshold (35 days) as Aging", () => {
    render(<FreshnessIndicator verifiedDate={daysAgo(40)} />)
    expect(screen.getByText(/Aging — 40 days old/)).toBeInTheDocument()
  })

  it("labels a document past the critical threshold (70 days) as Stale", () => {
    render(<FreshnessIndicator verifiedDate={daysAgo(80)} />)
    expect(screen.getByText(/Stale — 80 days old/)).toBeInTheDocument()
  })
})
