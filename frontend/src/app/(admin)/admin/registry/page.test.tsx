import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminRegistryPage from "./page"
import { useAdminStore } from "@/stores/adminStore"
import type { RegistryEntry } from "@/hooks/queries/adminData"

const useAdminRegistryMock = vi.fn<() => { data: RegistryEntry[]; isLoading: boolean }>(() => ({ data: [], isLoading: false }))
const approveMutate = vi.fn()
const rejectMutate = vi.fn()

vi.mock("@/hooks/queries", () => ({
  useAdminRegistry: () => useAdminRegistryMock(),
  useApproveRegistry: () => ({ mutate: approveMutate, isPending: false }),
  useRejectRegistry: () => ({ mutate: rejectMutate, isPending: false }),
}))

function makeEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: "r1",
    pattern_string: "VL150 delivery error resolution procedure",
    linked_document_id: "SD-ERR-001",
    status: "draft",
    created_at: "2026-07-19T10:00:00Z",
    ...overrides,
  }
}

describe("AdminRegistryPage", () => {
  beforeEach(() => {
    useAdminRegistryMock.mockReset()
    useAdminRegistryMock.mockReturnValue({ data: [], isLoading: false })
    approveMutate.mockClear()
    rejectMutate.mockClear()
    useAdminStore.setState({ registrySearch: "" })
  })

  it("renders the page header", () => {
    render(<AdminRegistryPage />)
    expect(screen.getByRole("heading", { name: "Registry" })).toBeInTheDocument()
  })

  it("shows pending (draft) entries in the Pending review section using formatDateLocalized", () => {
    useAdminRegistryMock.mockReturnValue({
      data: [makeEntry({ status: "draft", created_at: "2024-03-28T09:00:00Z" })],
      isLoading: false,
    })
    render(<AdminRegistryPage />)

    expect(screen.getAllByText("Pending review").length).toBeGreaterThan(0)
    expect(screen.getByText("VL150 delivery error resolution procedure")).toBeInTheDocument()
    // formatDateLocalized default (en-IN/Asia-Kolkata): "28 Mar 2024, 02:30 pm"
    expect(screen.getByText("28 Mar 2024, 02:30 pm")).toBeInTheDocument()
  })

  it("does not show the Pending review section when there are no draft entries", () => {
    useAdminRegistryMock.mockReturnValue({ data: [makeEntry({ status: "approved" })], isLoading: false })
    render(<AdminRegistryPage />)
    expect(screen.queryByText("Pending review", { selector: "p" })).not.toBeInTheDocument()
  })

  it("approves a pending entry directly (no confirmation)", async () => {
    useAdminRegistryMock.mockReturnValue({ data: [makeEntry({ id: "r1", status: "draft" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminRegistryPage />)

    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(approveMutate).toHaveBeenCalledWith("r1")
  })

  it("rejects a pending entry via ConfirmDialog", async () => {
    useAdminRegistryMock.mockReturnValue({ data: [makeEntry({ id: "r1", status: "draft" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminRegistryPage />)

    // Opens the dialog — its trigger and the dialog's own confirm action
    // are both labeled "Reject" (confirmLabel="Reject"), so after opening,
    // the confirm action is the last of the two matches.
    await user.click(screen.getByRole("button", { name: "Reject" }))
    expect(screen.getByText("Reject this pattern?")).toBeInTheDocument()

    const rejectButtons = screen.getAllByRole("button", { name: "Reject" })
    await user.click(rejectButtons[rejectButtons.length - 1])

    expect(rejectMutate).toHaveBeenCalledWith("r1")
  })

  it("shows approved/deprecated/rejected entries in the non-pending table with correct badge labels", () => {
    useAdminRegistryMock.mockReturnValue({
      data: [
        makeEntry({ id: "r2", status: "approved", pattern_string: "Approved pattern", approved_by: "admin1" }),
        makeEntry({ id: "r3", status: "deprecated", pattern_string: "Deprecated pattern" }),
      ],
      isLoading: false,
    })
    render(<AdminRegistryPage />)

    expect(screen.getByText("Approved pattern")).toBeInTheDocument()
    expect(screen.getByText("admin1")).toBeInTheDocument()
    expect(screen.getByText("Deprecated pattern")).toBeInTheDocument()
    expect(screen.getByText("approved")).toBeInTheDocument()
    expect(screen.getByText("deprecated")).toBeInTheDocument()
  })

  it("shows '—' for approved_by when absent", () => {
    useAdminRegistryMock.mockReturnValue({ data: [makeEntry({ status: "approved", approved_by: undefined })], isLoading: false })
    render(<AdminRegistryPage />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("filters the non-pending table by status", async () => {
    useAdminRegistryMock.mockReturnValue({
      data: [
        makeEntry({ id: "r2", status: "approved", pattern_string: "Approved pattern" }),
        makeEntry({ id: "r3", status: "deprecated", pattern_string: "Deprecated pattern" }),
      ],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminRegistryPage />)

    await user.click(screen.getByRole("button", { name: "Deprecated" }))

    expect(screen.queryByText("Approved pattern")).not.toBeInTheDocument()
    expect(screen.getByText("Deprecated pattern")).toBeInTheDocument()
  })

  it("filters the non-pending table by search query from the registrySearch store field", async () => {
    useAdminRegistryMock.mockReturnValue({
      data: [
        makeEntry({ id: "r2", status: "approved", pattern_string: "VL150 pattern" }),
        makeEntry({ id: "r3", status: "approved", pattern_string: "F5201 pattern" }),
      ],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminRegistryPage />)

    await user.type(screen.getByLabelText("Search registry patterns"), "VL150")

    expect(screen.getByText("VL150 pattern")).toBeInTheDocument()
    expect(screen.queryByText("F5201 pattern")).not.toBeInTheDocument()
    expect(useAdminStore.getState().registrySearch).toBe("VL150")
  })

  it("shows the empty state when there are no non-pending entries", () => {
    render(<AdminRegistryPage />)
    expect(screen.getByText("No registry entries")).toBeInTheDocument()
  })

  it("shows all 4 real-status stats in the header stat row", () => {
    useAdminRegistryMock.mockReturnValue({
      data: [makeEntry({ id: "r1", status: "draft" }), makeEntry({ id: "r2", status: "approved" }), makeEntry({ id: "r3", status: "deprecated" })],
      isLoading: false,
    })
    render(<AdminRegistryPage />)
    expect(screen.getAllByText("Pending review").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Deprecated").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0)
  })
})
