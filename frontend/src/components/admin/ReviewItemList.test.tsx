import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReviewItemList } from "./ReviewItemList"
import type { ReviewItem } from "@/hooks/queries/adminData"

function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: "rq1",
    query_text: "How do I fix VL150 in VL01N?",
    answer_text: "The VL150 error occurs when stock is insufficient.",
    unsupported_claims: [],
    status: "pending",
    created_at: "2026-07-20T10:00:00Z",
    ...overrides,
  }
}

describe("ReviewItemList", () => {
  it("renders the pending count and each item's query text", () => {
    render(<ReviewItemList items={[makeItem()]} currentIndex={0} onSelect={vi.fn()} totalPending={1} />)
    expect(screen.getByText("1 item pending")).toBeInTheDocument()
    expect(screen.getByText("How do I fix VL150 in VL01N?")).toBeInTheDocument()
  })

  it("pluralizes the pending count", () => {
    render(<ReviewItemList items={[]} currentIndex={0} onSelect={vi.fn()} totalPending={3} />)
    expect(screen.getByText("3 items pending")).toBeInTheDocument()
  })

  it("marks the item at currentIndex as active via aria-current", () => {
    const items = [makeItem({ id: "rq1" }), makeItem({ id: "rq2" })]
    render(<ReviewItemList items={items} currentIndex={1} onSelect={vi.fn()} totalPending={2} />)
    const listItems = screen.getAllByRole("listitem")
    expect(listItems[0]).toHaveAttribute("aria-current", "false")
    expect(listItems[1]).toHaveAttribute("aria-current", "true")
  })

  it("calls onSelect with the clicked item's index", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    const items = [makeItem({ id: "rq1" }), makeItem({ id: "rq2" })]
    render(<ReviewItemList items={items} currentIndex={0} onSelect={onSelect} totalPending={2} />)

    await user.click(screen.getAllByRole("listitem")[1])
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it("shows the J/K/A/X keyboard shortcut hints", () => {
    render(<ReviewItemList items={[]} currentIndex={0} onSelect={vi.fn()} totalPending={0} />)
    expect(screen.getByText("J / K")).toBeInTheDocument()
    expect(screen.getByText("A")).toBeInTheDocument()
    expect(screen.getByText("X")).toBeInTheDocument()
  })
})
