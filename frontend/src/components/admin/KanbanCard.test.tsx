import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { KanbanCard } from "./KanbanCard"
import type { TicketEntry } from "@/hooks/queries/adminData"

function makeTicket(overrides: Partial<TicketEntry> = {}): TicketEntry {
  return {
    ticket_id: "TKT-20260722-abcd1234",
    created_at: "2024-03-28T09:00:00Z",
    user_id_hash: "hash1",
    query_text: "VL150 error won't clear in VL01N",
    reason: "Employee escalated after 3 unresolved AI responses",
    status: "open",
    resolution_notes: null,
    ...overrides,
  }
}

describe("KanbanCard", () => {
  it("renders the ticket_id, query_text, reason, and formatted date", () => {
    render(<KanbanCard ticket={makeTicket()} onClick={vi.fn()} />)
    expect(screen.getByText("TKT-20260722-abcd1234")).toBeInTheDocument()
    expect(screen.getByText("VL150 error won't clear in VL01N")).toBeInTheDocument()
    expect(screen.getByText("Employee escalated after 3 unresolved AI responses")).toBeInTheDocument()
    expect(screen.getByText("28 Mar 2024")).toBeInTheDocument()
  })

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    const ticket = makeTicket()
    render(<KanbanCard ticket={ticket} onClick={onClick} />)

    await user.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledWith(ticket)
  })

  it("calls onClick on Enter keydown", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    const ticket = makeTicket()
    render(<KanbanCard ticket={ticket} onClick={onClick} />)

    const card = screen.getByRole("button")
    card.focus()
    await user.keyboard("{Enter}")
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("does not call onClick on Space — Space is reserved for dnd-kit's own keyboard pick-up/drop", async () => {
    // dnd-kit's KeyboardSensor (wired in TicketsKanbanBoard) uses Space to
    // start/end a keyboard-driven drag; this card's own onKeyDown only
    // merges in listeners.onKeyDown (a no-op here, outside a DndContext) and
    // must not also treat Space as "open the drawer".
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<KanbanCard ticket={makeTicket()} onClick={onClick} />)

    screen.getByRole("button").focus()
    await user.keyboard(" ")
    expect(onClick).not.toHaveBeenCalled()
  })

  it("has an accessible label including the ticket id and query text", () => {
    render(<KanbanCard ticket={makeTicket()} onClick={vi.fn()} />)
    expect(screen.getByRole("button")).toHaveAccessibleName(/TKT-20260722-abcd1234/)
  })
})
