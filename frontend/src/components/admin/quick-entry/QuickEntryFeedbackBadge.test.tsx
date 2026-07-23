import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { QuickEntryFeedbackBadge } from "./QuickEntryFeedbackBadge"

const summary = (positive: number, negative: number) => ({
  positive,
  negative,
  net: positive - negative,
  period_days: 30,
  last_negative_at: null,
})

describe("QuickEntryFeedbackBadge", () => {
  it("renders nothing when there is no feedback at all", () => {
    const { container } = render(<QuickEntryFeedbackBadge summary={summary(0, 0)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows a negative-feedback warning when net is more than 1 point negative", () => {
    render(<QuickEntryFeedbackBadge summary={summary(1, 4)} />)
    expect(screen.getByText("4 negative (30d)")).toBeInTheDocument()
  })

  it("shows the positive/negative counts when net isn't strongly negative", () => {
    render(<QuickEntryFeedbackBadge summary={summary(5, 1)} />)
    expect(screen.getByText(/5↑/)).toBeInTheDocument()
    expect(screen.getByText(/1↓/)).toBeInTheDocument()
  })
})
