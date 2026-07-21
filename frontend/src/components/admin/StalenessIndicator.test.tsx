import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StalenessIndicator } from "./StalenessIndicator"

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

describe("StalenessIndicator", () => {
  it("shows Fresh (green) for a recently verified date", () => {
    render(<StalenessIndicator verifiedDate={daysAgo(5)} />)
    expect(screen.getByText("5d")).toBeInTheDocument()
  })

  it("shows Aging (amber) between the warn and critical thresholds", async () => {
    const user = userEvent.setup()
    render(<StalenessIndicator verifiedDate={daysAgo(40)} />)
    expect(screen.getByText("40d")).toBeInTheDocument()
    await user.hover(screen.getByText("40d"))
    expect((await screen.findAllByText("Aging")).length).toBeGreaterThan(0)
  })

  it("shows Stale (red) beyond the critical threshold", async () => {
    const user = userEvent.setup()
    render(<StalenessIndicator verifiedDate={daysAgo(80)} />)
    expect(screen.getByText("80d")).toBeInTheDocument()
    await user.hover(screen.getByText("80d"))
    expect((await screen.findAllByText("Stale")).length).toBeGreaterThan(0)
  })

  it("uses daysSince directly when provided, instead of computing from verifiedDate", () => {
    render(<StalenessIndicator verifiedDate={daysAgo(1)} daysSince={99} />)
    expect(screen.getByText("99d")).toBeInTheDocument()
  })

  it("prefers a server-computed staleness level over threshold recomputation", async () => {
    const user = userEvent.setup()
    // daysSince alone (10 days) would compute as "Fresh", but a real
    // backend staleness of "critical" must win — avoids drift between the
    // server's own thresholds and CONFIDENCE.FRESHNESS_*_DAYS.
    render(<StalenessIndicator verifiedDate={daysAgo(10)} daysSince={10} staleness="critical" />)
    await user.hover(screen.getByText("10d"))
    expect((await screen.findAllByText("Stale")).length).toBeGreaterThan(0)
  })

  it("staleness='warning' overrides a days-based Fresh result", async () => {
    const user = userEvent.setup()
    render(<StalenessIndicator verifiedDate={daysAgo(2)} daysSince={2} staleness="warning" />)
    await user.hover(screen.getByText("2d"))
    expect((await screen.findAllByText("Aging")).length).toBeGreaterThan(0)
  })
})
