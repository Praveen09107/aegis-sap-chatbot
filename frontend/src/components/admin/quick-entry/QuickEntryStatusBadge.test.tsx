import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { QuickEntryStatusBadge } from "./QuickEntryStatusBadge"

describe("QuickEntryStatusBadge", () => {
  it("renders the label for each real status", () => {
    const cases: Array<[Parameters<typeof QuickEntryStatusBadge>[0]["status"], string]> = [
      ["draft", "Draft"],
      ["processing", "Processing…"],
      ["active", "Active"],
      ["archived", "Archived"],
      ["low_quality", "Low quality"],
      ["failed", "Failed"],
      ["partial_index", "Partial index"],
      ["review_required", "Review required"],
    ]
    for (const [status, label] of cases) {
      const { unmount } = render(<QuickEntryStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it("applies the larger text size when size='sm'", () => {
    render(<QuickEntryStatusBadge status="active" size="sm" />)
    expect(screen.getByText("Active")).toHaveClass("text-xs")
  })
})
