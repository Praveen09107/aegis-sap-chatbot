import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { KanbanColumn } from "./KanbanColumn"
import type { TicketEntry } from "@/hooks/queries/adminData"

function makeTicket(overrides: Partial<TicketEntry> = {}): TicketEntry {
  return {
    ticket_id: "TKT-1",
    created_at: "2024-03-28T09:00:00Z",
    user_id_hash: "hash1",
    query_text: "VL150 error",
    reason: "Escalated",
    status: "open",
    resolution_notes: null,
    ...overrides,
  }
}

describe("KanbanColumn", () => {
  it("renders the column title and ticket count", () => {
    render(<KanbanColumn id="open" title="Open" tickets={[makeTicket()]} onCardClick={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("renders a KanbanCard per ticket", () => {
    render(
      <KanbanColumn
        id="open"
        title="Open"
        tickets={[makeTicket({ ticket_id: "TKT-1" }), makeTicket({ ticket_id: "TKT-2" })]}
        onCardClick={vi.fn()}
      />
    )
    expect(screen.getByText("TKT-1")).toBeInTheDocument()
    expect(screen.getByText("TKT-2")).toBeInTheDocument()
  })

  it("shows the 'No tickets' empty message when the column is empty", () => {
    render(<KanbanColumn id="resolved" title="Resolved" tickets={[]} onCardClick={vi.fn()} />)
    expect(screen.getByText("No tickets")).toBeInTheDocument()
  })
})
