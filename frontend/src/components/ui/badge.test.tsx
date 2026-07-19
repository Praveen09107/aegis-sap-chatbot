import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Badge } from "./badge"

describe("Badge", () => {
  it("renders the success (confidence) variant with success tokens", () => {
    render(<Badge variant="success">High confidence</Badge>)
    const badge = screen.getByText("High confidence")
    expect(badge.className).toContain("bg-success-bg")
    expect(badge.className).toContain("text-success-text")
  })

  it("renders document-status variants (active/deprecated/processing/failed/pending)", () => {
    const { rerender } = render(<Badge variant="active">active</Badge>)
    expect(screen.getByText("active").className).toContain("bg-success-bg")

    rerender(<Badge variant="deprecated">deprecated</Badge>)
    expect(screen.getByText("deprecated").className).toContain("text-text-tertiary")

    rerender(<Badge variant="failed">failed</Badge>)
    expect(screen.getByText("failed").className).toContain("bg-danger-bg")
  })

  it("shows a dot in the color matching the variant when dot is true", () => {
    render(<Badge variant="warning" dot>Moderate</Badge>)
    const badge = screen.getByText("Moderate")
    const dot = badge.querySelector("span")
    expect(dot?.className).toContain("bg-warning")
  })

  it("renders no dot element when dot is false", () => {
    render(<Badge variant="success">High</Badge>)
    expect(screen.getByText("High").querySelector("span")).toBeNull()
  })
})
