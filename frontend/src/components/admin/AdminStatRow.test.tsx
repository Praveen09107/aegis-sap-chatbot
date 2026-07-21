import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { AdminStatRow } from "./AdminStatRow"

describe("AdminStatRow", () => {
  it("renders each stat's value and label", () => {
    render(
      <AdminStatRow
        stats={[
          { label: "Active", value: 47, color: "green" },
          { label: "Deprecated", value: 12 },
        ]}
      />
    )
    expect(screen.getByText("47")).toBeInTheDocument()
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("Deprecated")).toBeInTheDocument()
  })

  it("applies the color class for the given stat color", () => {
    render(<AdminStatRow stats={[{ label: "Failed", value: 1, color: "red" }]} />)
    expect(screen.getByText("1")).toHaveClass("text-danger")
  })

  it("defaults to the default color when none is given", () => {
    render(<AdminStatRow stats={[{ label: "Total", value: 5 }]} />)
    expect(screen.getByText("5")).toHaveClass("text-text-primary")
  })

  it("appends a suffix when given", () => {
    render(<AdminStatRow stats={[{ label: "Cache hit", value: 34, suffix: "%" }]} />)
    expect(screen.getByText("34%")).toBeInTheDocument()
  })

  it("shows skeletons instead of values when isLoading", () => {
    const { container } = render(<AdminStatRow stats={[{ label: "Active", value: 47 }]} isLoading />)
    expect(screen.queryByText("47")).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("labels the group for assistive tech", () => {
    render(<AdminStatRow stats={[{ label: "Active", value: 47 }]} />)
    expect(screen.getByRole("group", { name: "Statistics" })).toBeInTheDocument()
  })
})
