import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AuditTrailPage from "./page"
import { useAdminStore } from "@/stores/adminStore"
import type { AuditEntry } from "@/hooks/queries/adminData"

const routerReplaceMock = vi.fn()
let searchParamsValue = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  usePathname: () => "/admin/audit-trail",
  useSearchParams: () => searchParamsValue,
}))

const useAdminAuditTrailMock = vi.fn<() => { data: { entries: AuditEntry[]; total: number } | undefined; isLoading: boolean }>(() => ({
  data: { entries: [], total: 0 },
  isLoading: false,
}))

const exportToCSVMock = vi.fn()

vi.mock("@/hooks/queries", () => ({
  useAdminAuditTrail: () => useAdminAuditTrailMock(),
}))

vi.mock("@/lib/csvExport", () => ({
  exportToCSV: (...args: unknown[]) => exportToCSVMock(...args),
}))

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "a1",
    occurred_at: "2024-03-28T09:00:00Z",
    user_id_hash: "hash1",
    session_id: "sess-abc",
    request_type: "chat",
    confidence_badge: "green",
    validation_score: 0.9,
    model_tier: 1,
    feedback_signal: "none",
    ...overrides,
  }
}

describe("AuditTrailPage", () => {
  beforeEach(() => {
    useAdminAuditTrailMock.mockReset()
    useAdminAuditTrailMock.mockReturnValue({ data: { entries: [], total: 0 }, isLoading: false })
    exportToCSVMock.mockClear()
    routerReplaceMock.mockClear()
    searchParamsValue = new URLSearchParams()
    useAdminStore.setState({ auditFilters: {} })
  })

  it("renders the page header", () => {
    render(<AuditTrailPage />)
    expect(screen.getByRole("heading", { name: "Audit trail" })).toBeInTheDocument()
  })

  it("hydrates auditFilters from the URL on mount (FRONTEND_SUPPLEMENT_02 Part 4)", () => {
    searchParamsValue = new URLSearchParams("days=30&confidence_badge=green")
    render(<AuditTrailPage />)
    expect(useAdminStore.getState().auditFilters).toEqual({ days: 30, confidence_badge: "green" })
  })

  it("defaults to the timeline view showing entries grouped by date", () => {
    useAdminAuditTrailMock.mockReturnValue({ data: { entries: [makeEntry()], total: 1 }, isLoading: false })
    render(<AuditTrailPage />)
    expect(screen.getByRole("link")).toHaveAttribute("href", "/?session=sess-abc")
  })

  it("switches to the table view and renders DataTable columns", async () => {
    useAdminAuditTrailMock.mockReturnValue({ data: { entries: [makeEntry()], total: 1 }, isLoading: false })
    const user = userEvent.setup()
    render(<AuditTrailPage />)

    await user.click(screen.getByRole("button", { name: "Table" }))
    expect(screen.getByRole("columnheader", { name: "Session" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Confidence" })).toBeInTheDocument()
  })

  it("shows the empty state when there are no entries", () => {
    render(<AuditTrailPage />)
    expect(screen.getByText("No audit entries found")).toBeInTheDocument()
  })

  it("sets the days filter when a date range button is clicked", async () => {
    const user = userEvent.setup()
    render(<AuditTrailPage />)
    await user.click(screen.getByRole("button", { name: "30 days" }))
    expect(useAdminStore.getState().auditFilters.days).toBe(30)
  })

  it("filters entries client-side by request type", async () => {
    useAdminAuditTrailMock.mockReturnValue({
      data: {
        entries: [makeEntry({ id: "a1", session_id: "sess-chat", request_type: "chat" }), makeEntry({ id: "a2", session_id: "sess-upload", request_type: "upload" })],
        total: 2,
      },
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AuditTrailPage />)

    await user.selectOptions(screen.getByLabelText("Filter by request type"), "upload")
    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "/?session=sess-upload")
  })

  it("switches back to the timeline view from the table view", async () => {
    useAdminAuditTrailMock.mockReturnValue({ data: { entries: [makeEntry()], total: 1 }, isLoading: false })
    const user = userEvent.setup()
    render(<AuditTrailPage />)

    await user.click(screen.getByRole("button", { name: "Table" }))
    expect(screen.getByRole("columnheader", { name: "Session" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Timeline" }))
    expect(screen.queryByRole("columnheader", { name: "Session" })).not.toBeInTheDocument()
  })

  it("sets the confidence_badge filter from the select, and clears it back to undefined for 'All confidence'", async () => {
    const user = userEvent.setup()
    render(<AuditTrailPage />)

    await user.selectOptions(screen.getByLabelText("Filter by confidence badge"), "green")
    expect(useAdminStore.getState().auditFilters.confidence_badge).toBe("green")

    await user.selectOptions(screen.getByLabelText("Filter by confidence badge"), "")
    expect(useAdminStore.getState().auditFilters.confidence_badge).toBeUndefined()
  })

  it("exports the currently visible entries to CSV", async () => {
    useAdminAuditTrailMock.mockReturnValue({ data: { entries: [makeEntry()], total: 1 }, isLoading: false })
    const user = userEvent.setup()
    render(<AuditTrailPage />)

    await user.click(screen.getByRole("button", { name: /Export CSV/ }))
    expect(exportToCSVMock).toHaveBeenCalledTimes(1)
    const call = exportToCSVMock.mock.calls[0][0] as { data: AuditEntry[]; filename: string }
    expect(call.filename).toBe("audit-trail")
    expect(call.data).toHaveLength(1)
  })
})
