import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QuickEntryListCard, QuickEntryListSkeleton } from "./QuickEntryListCard"
import type { QuickEntryListItem } from "@/types"

function makeEntry(overrides: Partial<QuickEntryListItem> = {}): QuickEntryListItem {
  return {
    id: "entry-1",
    document_id: "SD-ERR-001",
    content_type: "error_guide",
    module: "SD",
    status: "active",
    version: 1,
    verified_by_name: "Jane Doe",
    verified_date: "2026-06-01",
    submitted_by_name: "jane.doe",
    chunk_count: 4,
    screenshot_count: 0,
    has_failed_screenshots: false,
    next_review_date: null,
    gap_id: null,
    feedback_summary: { positive: 0, negative: 0, net: 0, period_days: 30, last_negative_at: null },
    issue_title: "Tax condition not capturing",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  }
}

describe("QuickEntryListCard", () => {
  it("renders the issue title, document id, and status", () => {
    render(<QuickEntryListCard entry={makeEntry()} onEdit={vi.fn()} />)
    expect(screen.getByText("Tax condition not capturing")).toBeInTheDocument()
    expect(screen.getByText("SD-ERR-001")).toBeInTheDocument()
    expect(screen.getByText("Active")).toBeInTheDocument()
  })

  it("calls onEdit when clicked", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<QuickEntryListCard entry={makeEntry()} onEdit={onEdit} />)
    await user.click(screen.getByRole("button", { name: /Tax condition not capturing/ }))
    expect(onEdit).toHaveBeenCalled()
  })

  it("calls onEdit on Enter key press", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<QuickEntryListCard entry={makeEntry()} onEdit={onEdit} />)
    screen.getByRole("button").focus()
    await user.keyboard("{Enter}")
    expect(onEdit).toHaveBeenCalled()
  })

  it("shows a from-gap badge when gap_id is set", () => {
    render(<QuickEntryListCard entry={makeEntry({ gap_id: "gap-1" })} onEdit={vi.fn()} />)
    expect(screen.getByText("From gap")).toBeInTheDocument()
  })

  it("shows a failed-screenshots indicator when applicable", () => {
    render(<QuickEntryListCard entry={makeEntry({ screenshot_count: 2, has_failed_screenshots: true })} onEdit={vi.fn()} />)
    expect(screen.getByText(/vision failed/)).toBeInTheDocument()
  })

  it("shows a review-overdue badge when status is review_required", () => {
    render(<QuickEntryListCard entry={makeEntry({ status: "review_required", next_review_date: "2026-01-01" })} onEdit={vi.fn()} />)
    expect(screen.getByText("Review overdue")).toBeInTheDocument()
  })
})

describe("QuickEntryListSkeleton", () => {
  it("renders the given number of skeleton rows", () => {
    const { container } = render(<QuickEntryListSkeleton count={3} />)
    expect(container.querySelectorAll(":scope > div > div")).toHaveLength(3)
  })
})
