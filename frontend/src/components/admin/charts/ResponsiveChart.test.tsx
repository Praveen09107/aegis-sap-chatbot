import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { LineChart, Line } from "recharts"
import { ResponsiveChart, CHART_COLORS, CHART_TICK_STYLE } from "./ResponsiveChart"

// ResizeObserver (needed by recharts' ResponsiveContainer) is polyfilled
// globally in vitest.setup.ts.

describe("ResponsiveChart", () => {
  it("renders a labeled chart region with the given aria-label", () => {
    render(
      <ResponsiveChart aria-label="ValidationScore trend">
        <LineChart data={[{ x: 1, y: 2 }]}>
          <Line dataKey="y" />
        </LineChart>
      </ResponsiveChart>
    )
    expect(screen.getByRole("img", { name: "ValidationScore trend" })).toBeInTheDocument()
  })

  it("defaults the aria-label to 'Chart' when none is given", () => {
    render(
      <ResponsiveChart>
        <LineChart data={[{ x: 1, y: 2 }]}>
          <Line dataKey="y" />
        </LineChart>
      </ResponsiveChart>
    )
    expect(screen.getByRole("img", { name: "Chart" })).toBeInTheDocument()
  })

  it("shows loading skeleton bars instead of the chart when isLoading", () => {
    const { container } = render(
      <ResponsiveChart isLoading>
        <LineChart data={[]}>
          <Line dataKey="y" />
        </LineChart>
      </ResponsiveChart>
    )
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(7)
  })
})

describe("CHART_COLORS / CHART_TICK_STYLE", () => {
  it("exposes a stable, complete semantic color palette", () => {
    expect(CHART_COLORS.green).toBe("#10B981")
    expect(CHART_COLORS.red).toBe("#EF4444")
    expect(CHART_COLORS.gridLine).toBeDefined()
    expect(CHART_COLORS.darkGrid).toBeDefined()
  })

  it("exposes a consistent axis tick style", () => {
    expect(CHART_TICK_STYLE.fontSize).toBe(11)
  })
})
