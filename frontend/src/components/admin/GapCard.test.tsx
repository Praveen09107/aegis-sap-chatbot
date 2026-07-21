import { describe, it, expect, vi } from "vitest"
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { GapCard } from "./GapCard"
import type { GapEntry } from "@/hooks/queries/adminData"

function makeEntry(overrides: Partial<GapEntry> = {}): GapEntry {
  return {
    gap_id: "gap-1",
    gap_description: "VL150 delivery error when creating shipment",
    count_7d: 3,
    count_30d: 12,
    example_queries: ["How do I fix VL150?", "VL150 error in VL01N"],
    addressed_by_entry_id: null,
    addressed_at: null,
    addressed_entry_title: null,
    ...overrides,
  }
}

describe("GapCard", () => {
  it("renders the gap description and 7d/30d frequency counts", () => {
    render(<GapCard entry={makeEntry()} onHide={vi.fn()} />)
    expect(screen.getByText("VL150 delivery error when creating shipment")).toBeInTheDocument()
    expect(screen.getByText("3 in 7 days")).toBeInTheDocument()
    expect(screen.getByText("12 in 30 days")).toBeInTheDocument()
  })

  it("derives High severity from count_7d > 6", () => {
    render(<GapCard entry={makeEntry({ count_7d: 8 })} onHide={vi.fn()} />)
    expect(screen.getByText("High severity")).toBeInTheDocument()
  })

  it("derives Medium severity from count_7d between 2 and 6", () => {
    render(<GapCard entry={makeEntry({ count_7d: 4 })} onHide={vi.fn()} />)
    expect(screen.getByText("Medium severity")).toBeInTheDocument()
  })

  it("derives Low severity from count_7d below 2", () => {
    render(<GapCard entry={makeEntry({ count_7d: 1 })} onHide={vi.fn()} />)
    expect(screen.getByText("Low severity")).toBeInTheDocument()
  })

  it("expands and collapses the example queries list", async () => {
    const user = userEvent.setup()
    render(<GapCard entry={makeEntry()} onHide={vi.fn()} />)

    expect(screen.queryByText("How do I fix VL150?")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Show example queries/ }))
    expect(screen.getByText("How do I fix VL150?")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Hide example queries/ }))
    await waitForElementToBeRemoved(() => screen.queryByText("How do I fix VL150?"))
  })

  it("does not render the example-queries toggle when there are none", () => {
    render(<GapCard entry={makeEntry({ example_queries: [] })} onHide={vi.fn()} />)
    expect(screen.queryByText(/example queries/)).not.toBeInTheDocument()
  })

  it("shows 'Create Quick Entry for this gap' linking to /admin/quick-entry/new with gap_id and issue_description when unaddressed", () => {
    render(<GapCard entry={makeEntry({ gap_id: "gap-42", gap_description: "F5201 posting error" })} onHide={vi.fn()} />)
    const link = screen.getByRole("link", { name: /Create Quick Entry for this gap/ })
    expect(link).toHaveAttribute("href", "/admin/quick-entry/new?gap_id=gap-42&issue_description=F5201%20posting%20error")
  })

  it("shows an 'Addressed by' badge linking to the Quick Entry when addressed_by_entry_id is set", () => {
    render(
      <GapCard
        entry={makeEntry({ addressed_by_entry_id: "qe-9", addressed_at: "2026-07-20T00:00:00Z", addressed_entry_title: "VL150 fix guide" })}
        onHide={vi.fn()}
      />
    )
    const link = screen.getByRole("link", { name: /Addressed by VL150 fix guide/ })
    expect(link).toHaveAttribute("href", "/admin/quick-entry/qe-9")
    expect(screen.queryByRole("link", { name: /Create Quick Entry for this gap/ })).not.toBeInTheDocument()
  })

  it("links 'Create document' to /admin/documents", () => {
    render(<GapCard entry={makeEntry()} onHide={vi.fn()} />)
    expect(screen.getByRole("link", { name: /Create document/ })).toHaveAttribute("href", "/admin/documents")
  })

  it("calls onHide with the gap_id when Hide is clicked", async () => {
    const onHide = vi.fn()
    const user = userEvent.setup()
    render(<GapCard entry={makeEntry({ gap_id: "gap-7" })} onHide={onHide} />)

    await user.click(screen.getByRole("button", { name: /Hide/ }))
    expect(onHide).toHaveBeenCalledWith("gap-7")
  })
})
