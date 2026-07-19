import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { MetricCard, MetricCardGrid } from "./MetricCard"

vi.mock("@/hooks/useMediaQuery", () => ({
  usePrefersReducedMotion: () => false,
}))

describe("MetricCard", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders a string value directly with no animation", () => {
    render(<MetricCard label="Status" value="Healthy" />)
    expect(screen.getByText("Healthy")).toBeInTheDocument()
  })

  it("shows a loading skeleton when isLoading", () => {
    const { container } = render(<MetricCard label="Queries" value={100} isLoading />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("renders the final value immediately when animateCount is false", () => {
    render(<MetricCard label="Open tickets" value={42} animateCount={false} format="integer" />)
    expect(screen.getByText("42")).toBeInTheDocument()
  })

  it("formats percentage and score values correctly", () => {
    const { rerender } = render(<MetricCard label="Green rate" value={0.71} format="percentage" animateCount={false} />)
    expect(screen.getByText("71%")).toBeInTheDocument()

    rerender(<MetricCard label="Avg score" value={0.847} format="score" animateCount={false} />)
    expect(screen.getByText("0.85")).toBeInTheDocument()
  })

  it("animates from 0 up to the target value via requestAnimationFrame", () => {
    let rafCallback: FrameRequestCallback = () => {}
    let time = 0
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb
      return 1
    })
    vi.spyOn(window, "performance", "get").mockReturnValue({ now: () => time } as Performance)

    render(<MetricCard label="Queries today" value={100} format="integer" animateCount />)

    // Immediately after mount, the animated value starts at (or very near) 0.
    expect(screen.getByText("0")).toBeInTheDocument()

    time = 600 // full duration elapsed
    act(() => rafCallback(600))

    expect(screen.getByText("100")).toBeInTheDocument()
  })

  it("aria-label always announces the final target value, not a mid-animation number", () => {
    let rafCallback: FrameRequestCallback = () => {}
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb
      return 1
    })
    vi.spyOn(window, "performance", "get").mockReturnValue({ now: () => 0 } as Performance)

    render(<MetricCard label="Queries today" value={247} format="integer" animateCount />)
    act(() => rafCallback(100)) // partway through the animation

    expect(screen.getByLabelText("Queries today: 247")).toBeInTheDocument()
  })

  it("colors the trend green for an 'up' direction when upIsPositive (default)", () => {
    render(<MetricCard label="Score" value={5} animateCount={false} trend={{ value: "up 3", direction: "up" }} />)
    expect(screen.getByText("up 3").parentElement?.className).toContain("text-success")
  })

  it("colors the trend red for an 'up' direction when upIsPositive is false (e.g. ticket count)", () => {
    render(
      <MetricCard label="Open tickets" value={5} animateCount={false} trend={{ value: "3 new", direction: "up", upIsPositive: false }} />
    )
    expect(screen.getByText("3 new").parentElement?.className).toContain("text-danger")
  })
})

describe("MetricCardGrid", () => {
  it("renders children inside a labeled region", () => {
    render(
      <MetricCardGrid>
        <div>card 1</div>
      </MetricCardGrid>
    )
    expect(screen.getByRole("region", { name: "Key metrics" })).toBeInTheDocument()
  })
})
