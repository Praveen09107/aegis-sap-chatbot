import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ChartTooltip } from "./ChartTooltip"

describe("ChartTooltip", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(<ChartTooltip active={false} payload={[{ name: "score", value: 0.9 }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing when there is no payload", () => {
    const { container } = render(<ChartTooltip active payload={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the label and each payload entry's name/value", () => {
    render(
      <ChartTooltip
        active
        label="Mon"
        payload={[
          { name: "green", value: 0.847, color: "#10B981" },
          { name: "amber", value: 12 },
        ]}
      />
    )
    expect(screen.getByText("Mon")).toBeInTheDocument()
    expect(screen.getByText("green")).toBeInTheDocument()
    // Raw numeric values with no custom formatter are always shown to 3
    // decimals — this is deliberate (score precision), not a rounding bug.
    expect(screen.getByText("0.847")).toBeInTheDocument()
    expect(screen.getByText("12.000")).toBeInTheDocument()
  })

  it("applies a custom formatter and labelFormatter when given", () => {
    render(
      <ChartTooltip
        active
        label="3"
        payload={[{ name: "score", value: 0.9123 }]}
        formatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
        labelFormatter={(l) => `Day ${l}`}
      />
    )
    expect(screen.getByText("Day 3")).toBeInTheDocument()
    expect(screen.getByText("91%")).toBeInTheDocument()
  })
})
