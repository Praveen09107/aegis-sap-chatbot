import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConfidenceBadge } from "./ConfidenceBadge"

describe("ConfidenceBadge", () => {
  it("renders nothing when badge is null (streaming in progress)", () => {
    const { container } = render(<ConfidenceBadge badge={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows 'High confidence' with green tokens for the green badge", () => {
    render(<ConfidenceBadge badge="green" showTooltip={false} />)
    const badge = screen.getByText("High confidence")
    expect(badge.className).toContain("bg-success-bg")
  })

  it("shows the formatted score when showScore is true", () => {
    render(<ConfidenceBadge badge="green" score={0.913} showScore showTooltip={false} />)
    expect(screen.getByText("· 91.3%")).toBeInTheDocument()
  })

  it("does not show a score when showScore is false", () => {
    render(<ConfidenceBadge badge="green" score={0.913} showTooltip={false} />)
    expect(screen.queryByText(/91\.3/)).not.toBeInTheDocument()
  })

  it("renders amber and none variants with the correct labels", () => {
    const { rerender } = render(<ConfidenceBadge badge="amber" showTooltip={false} />)
    expect(screen.getByText("Moderate confidence")).toBeInTheDocument()

    rerender(<ConfidenceBadge badge="none" showTooltip={false} />)
    expect(screen.getByText("Insufficient")).toBeInTheDocument()
  })
})
