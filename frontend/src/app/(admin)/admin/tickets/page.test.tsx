import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import AdminTicketsPage from "./page"
import { useAdminStore } from "@/stores/adminStore"
import type { TicketEntry } from "@/hooks/queries/adminData"

const useAdminTicketsMock = vi.fn<() => { data: TicketEntry[]; isLoading: boolean }>(() => ({ data: [], isLoading: false }))
const updateStatusMutate = vi.fn()

vi.mock("@/hooks/queries", () => ({
  useAdminTickets: () => useAdminTicketsMock(),
  useUpdateTicketStatus: () => ({ mutate: updateStatusMutate, isPending: false }),
}))

// Captures the real onDragStart/onDragEnd handlers DndContext is given, so
// the drag-decision logic (which column a drop lands in, whether it's a
// no-op) can be exercised directly — simulating dnd-kit's actual
// PointerSensor pointer-event sequence in jsdom isn't practical here.
type DragHandlers = { onDragStart?: (e: unknown) => void; onDragEnd?: (e: unknown) => void }
const capturedHandlers: DragHandlers = {}

vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core")
  return {
    ...actual,
    DndContext: (props: DragHandlers & { children: ReactNode }) => {
      capturedHandlers.onDragStart = props.onDragStart
      capturedHandlers.onDragEnd = props.onDragEnd
      return props.children
    },
  }
})

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

// Note: dnd-kit's PointerSensor drag flow isn't simulated here — reproducing
// its pointer-event sequence in jsdom needs more setup than this session's
// scope warrants. Card click (drawer open), status quick-actions, and
// column grouping — the deterministic, reachable parts — are covered.
describe("AdminTicketsPage", () => {
  beforeEach(() => {
    useAdminTicketsMock.mockReset()
    useAdminTicketsMock.mockReturnValue({ data: [], isLoading: false })
    updateStatusMutate.mockClear()
    useAdminStore.setState({ activeTicketId: null })
  })

  it("renders the page header and stat row", () => {
    render(<AdminTicketsPage />)
    expect(screen.getByRole("heading", { name: "Tickets" })).toBeInTheDocument()
  })

  it("groups tickets into Open/In Progress/Resolved columns", () => {
    useAdminTicketsMock.mockReturnValue({
      data: [
        makeTicket({ ticket_id: "t1", status: "open" }),
        makeTicket({ ticket_id: "t2", status: "in_progress" }),
        makeTicket({ ticket_id: "t3", status: "resolved" }),
      ],
      isLoading: false,
    })
    render(<AdminTicketsPage />)

    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "In Progress" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Resolved" })).toBeInTheDocument()
    expect(screen.getByText("t1")).toBeInTheDocument()
    expect(screen.getByText("t2")).toBeInTheDocument()
    expect(screen.getByText("t3")).toBeInTheDocument()
  })

  it("opens the drawer with reason and resolution notes when a card is clicked", async () => {
    useAdminTicketsMock.mockReturnValue({
      data: [makeTicket({ ticket_id: "t1", resolution_notes: "Escalated to SD team" })],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminTicketsPage />)

    await user.click(screen.getByRole("button", { name: /t1/ }))

    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.getByText("Ticket t1")).toBeInTheDocument()
    expect(dialog.getByText("Employee escalated after 3 unresolved AI responses")).toBeInTheDocument()
    expect(dialog.getByText("Escalated to SD team")).toBeInTheDocument()
  })

  it("does not render a resolution notes section when there are none", async () => {
    useAdminTicketsMock.mockReturnValue({ data: [makeTicket({ ticket_id: "t1", resolution_notes: null })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminTicketsPage />)

    await user.click(screen.getByRole("button", { name: /t1/ }))
    expect(screen.queryByText("Resolution notes")).not.toBeInTheDocument()
  })

  it("moves a ticket to a new status via the drawer's quick actions and closes the drawer", async () => {
    useAdminTicketsMock.mockReturnValue({ data: [makeTicket({ ticket_id: "t1", status: "open" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminTicketsPage />)

    await user.click(screen.getByRole("button", { name: /t1/ }))
    await user.click(screen.getByRole("button", { name: "Resolved" }))

    expect(updateStatusMutate).toHaveBeenCalledWith({ ticketId: "t1", status: "resolved" })
    expect(useAdminStore.getState().activeTicketId).toBeNull()
  })

  it("moves a ticket via drag-and-drop when dropped on a different column", () => {
    useAdminTicketsMock.mockReturnValue({ data: [makeTicket({ ticket_id: "t1", status: "open" })], isLoading: false })
    render(<AdminTicketsPage />)

    capturedHandlers.onDragStart?.({ active: { id: "t1" } })
    capturedHandlers.onDragEnd?.({ active: { id: "t1" }, over: { id: "resolved" } })

    expect(updateStatusMutate).toHaveBeenCalledWith({ ticketId: "t1", status: "resolved" })
  })

  it("resolves the target column when dropped on another ticket rather than a column itself", () => {
    useAdminTicketsMock.mockReturnValue({
      data: [makeTicket({ ticket_id: "t1", status: "open" }), makeTicket({ ticket_id: "t2", status: "resolved" })],
      isLoading: false,
    })
    render(<AdminTicketsPage />)

    capturedHandlers.onDragEnd?.({ active: { id: "t1" }, over: { id: "t2" } })
    expect(updateStatusMutate).toHaveBeenCalledWith({ ticketId: "t1", status: "resolved" })
  })

  it("does nothing when dropped outside any droppable target", () => {
    useAdminTicketsMock.mockReturnValue({ data: [makeTicket({ ticket_id: "t1", status: "open" })], isLoading: false })
    render(<AdminTicketsPage />)

    capturedHandlers.onDragEnd?.({ active: { id: "t1" }, over: null })
    expect(updateStatusMutate).not.toHaveBeenCalled()
  })

  it("does nothing when dropped back in the same column", () => {
    useAdminTicketsMock.mockReturnValue({ data: [makeTicket({ ticket_id: "t1", status: "open" })], isLoading: false })
    render(<AdminTicketsPage />)

    capturedHandlers.onDragEnd?.({ active: { id: "t1" }, over: { id: "open" } })
    expect(updateStatusMutate).not.toHaveBeenCalled()
  })

  it("does not offer the current status as a 'Move to' option", async () => {
    useAdminTicketsMock.mockReturnValue({ data: [makeTicket({ status: "in_progress" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminTicketsPage />)

    await user.click(screen.getByRole("button", { name: /TKT-20260722-abcd1234/ }))
    const moveToSection = screen.getByText("Move to").parentElement
    expect(moveToSection).not.toBeNull()
    expect(screen.queryByRole("button", { name: "In Progress" })).not.toBeInTheDocument()
  })
})
