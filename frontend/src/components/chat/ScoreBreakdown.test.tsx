import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ScoreBreakdown } from "./ScoreBreakdown"

describe("ScoreBreakdown", () => {
  it("renders nothing when no score is available (null or undefined)", () => {
    const { container: c1 } = render(<ScoreBreakdown score={null} />)
    expect(c1).toBeEmptyDOMElement()

    const { container: c2 } = render(<ScoreBreakdown score={undefined} />)
    expect(c2).toBeEmptyDOMElement()
  })

  it("renders the real overall score as a percentage, not invented sub-scores", () => {
    render(<ScoreBreakdown score={0.913} />)
    expect(screen.getByText("91%")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "91")
  })

  it("handles a 0 score correctly (falsy but valid)", () => {
    render(<ScoreBreakdown score={0} />)
    expect(screen.getByText("0%")).toBeInTheDocument()
  })
})
