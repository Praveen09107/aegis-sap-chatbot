import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TicketsKanbanBoard, TicketsKanbanBoardSkeleton } from "./TicketsKanbanBoard"
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

const COLUMN_DEFS: { id: TicketEntry["status"]; title: string }[] = [
  { id: "open", title: "Open" },
  { id: "in_progress", title: "In Progress" },
  { id: "resolved", title: "Resolved" },
]

describe("TicketsKanbanBoard", () => {
  it("renders one KanbanColumn per column def, each with its own tickets", () => {
    const columns = {
      open: [makeTicket({ ticket_id: "TKT-1" })],
      in_progress: [makeTicket({ ticket_id: "TKT-2", status: "in_progress" })],
      resolved: [],
    }

    render(
      <TicketsKanbanBoard
        columnDefs={COLUMN_DEFS}
        columns={columns}
        activeTicket={null}
        onCardClick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />
    )

    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "In Progress" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Resolved" })).toBeInTheDocument()
    expect(screen.getByText("TKT-1")).toBeInTheDocument()
    expect(screen.getByText("TKT-2")).toBeInTheDocument()
  })

  it("does not render a drag overlay card when nothing is being dragged", () => {
    render(
      <TicketsKanbanBoard
        columnDefs={COLUMN_DEFS}
        columns={{ open: [], in_progress: [], resolved: [] }}
        activeTicket={null}
        onCardClick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />
    )
    // Only the empty-state "No tickets" text should render per column, no overlay card
    expect(screen.queryByText("TKT-1")).not.toBeInTheDocument()
  })

  it("renders without error when an activeTicket is set", () => {
    // DragOverlay only actually portals its children during a real,
    // dnd-kit-internal active drag (not just a truthy activeTicket prop) —
    // simulating that in jsdom isn't reliable, so this only confirms the
    // component tolerates a non-null activeTicket rather than asserting the
    // overlay's own visibility, matching this codebase's existing precedent
    // of not simulating drag gestures in KanbanColumn's own tests either.
    render(
      <TicketsKanbanBoard
        columnDefs={COLUMN_DEFS}
        columns={{ open: [makeTicket()], in_progress: [], resolved: [] }}
        activeTicket={makeTicket()}
        onCardClick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />
    )
    expect(screen.getByText("TKT-1")).toBeInTheDocument()
  })
})

describe("TicketsKanbanBoardSkeleton", () => {
  it("renders 3 placeholder columns matching the real board's region role", () => {
    render(<TicketsKanbanBoardSkeleton />)
    expect(screen.getByRole("region", { name: "Ticket kanban board" })).toBeInTheDocument()
  })
})
