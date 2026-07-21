import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import HistoryPage from "./page"
import { useSessionStore } from "@/stores/sessionStore"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import type { Session, SessionFilters } from "@/types"

const pushMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useSessionsMock = vi.fn<(filters?: SessionFilters) => { data: Session[]; isLoading: boolean; isFetching: boolean }>(
  () => ({ data: [], isLoading: false, isFetching: false })
)
vi.mock("@/hooks/queries", () => ({
  useSessions: (filters?: SessionFilters) => useSessionsMock(filters),
}))

const exportToCSVMock = vi.fn()
vi.mock("@/lib/csvExport", () => ({
  exportToCSV: (...args: unknown[]) => exportToCSVMock(...args),
}))

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    user_id_hash: "h1",
    topic_summary: "VL150 delivery error",
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    turn_count: 3,
    avg_confidence_score: 0.9,
    confidence_badge: "green",
    module_tags: ["SD"],
    is_pinned: false,
    is_unresolved: false,
    ...overrides,
  }
}

function renderPage() {
  const { Wrapper } = createQueryWrapper()
  return render(<HistoryPage />, { wrapper: Wrapper })
}

describe("HistoryPage", () => {
  beforeEach(() => {
    pushMock.mockClear()
    exportToCSVMock.mockClear()
    useSessionsMock.mockReset()
    useSessionsMock.mockReturnValue({ data: [], isLoading: false, isFetching: false })
    useSessionStore.setState({ searchQuery: "" })
  })

  it("renders the page header and search input", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: "Session history" })).toBeInTheDocument()
    expect(screen.getByLabelText("Search sessions by topic, error code, or SAP module")).toBeInTheDocument()
  })

  it("shows the loading skeleton while isLoading is true", () => {
    useSessionsMock.mockReturnValue({ data: [], isLoading: true, isFetching: true })
    renderPage()
    expect(screen.queryByRole("list", { name: "Session history" })).not.toBeInTheDocument()
  })

  it("shows the empty state with a generic message when there are no sessions and no filters", () => {
    renderPage()
    // "No sessions found" appears twice — HistoryFilters' own results-count
    // line AND the EmptyState title both say it — assert the unique
    // description text instead of the ambiguous shared title.
    expect(screen.getByText("You haven't started any sessions yet. Go to the chat to begin.")).toBeInTheDocument()
  })

  it("renders a session card per returned session, sorted by date (most recent first) by default", () => {
    useSessionsMock.mockReturnValue({
      data: [
        makeSession({ id: "old", updated_at: "2026-01-01T00:00:00Z", topic_summary: "Old session" }),
        makeSession({ id: "new", updated_at: "2026-07-20T00:00:00Z", topic_summary: "New session" }),
      ],
      isLoading: false,
      isFetching: false,
    })
    renderPage()

    const items = screen.getAllByRole("button", { name: /Open session/ })
    expect(items[0]).toHaveAccessibleName(expect.stringContaining("New session"))
    expect(items[1]).toHaveAccessibleName(expect.stringContaining("Old session"))
  })

  it("sorts by confidence when the Sort filter is set to Highest confidence", async () => {
    const user = userEvent.setup()
    useSessionsMock.mockReturnValue({
      data: [
        makeSession({ id: "low", avg_confidence_score: 0.5, topic_summary: "Low confidence" }),
        makeSession({ id: "high", avg_confidence_score: 0.95, topic_summary: "High confidence session" }),
      ],
      isLoading: false,
      isFetching: false,
    })
    renderPage()

    await user.selectOptions(screen.getByLabelText("Sort"), "confidence")

    const items = screen.getAllByRole("button", { name: /Open session/ })
    expect(items[0]).toHaveAccessibleName(expect.stringContaining("High confidence session"))
  })

  it("passes the debounced search query from sessionStore through to useSessions", async () => {
    useSessionStore.setState({ searchQuery: "VL150" })
    renderPage()

    await waitFor(() =>
      expect(useSessionsMock).toHaveBeenCalledWith(expect.objectContaining({ search: "VL150" }))
    )
  })

  it("passes module/badge/unresolved filters through to useSessions", async () => {
    const user = userEvent.setup()
    renderPage()

    await user.selectOptions(screen.getByLabelText("Module"), "SD")
    await user.selectOptions(screen.getByLabelText("Confidence"), "green")
    await user.click(screen.getByLabelText("Show unresolved sessions only"))

    await waitFor(() =>
      expect(useSessionsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ module: "SD", confidence_badge: "green", is_unresolved: true })
      )
    )
  })

  it("sets date_from as a YYYY-MM-DD string when a date range filter is applied", async () => {
    const user = userEvent.setup()
    renderPage()

    await user.selectOptions(screen.getByLabelText("Date"), "7d")

    await waitFor(() => {
      const lastCall = useSessionsMock.mock.calls.at(-1)?.[0] as SessionFilters
      expect(lastCall.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it("sets date_from to the start of today (deploy-timezone) when 'Today' is selected", async () => {
    const user = userEvent.setup()
    renderPage()

    await user.selectOptions(screen.getByLabelText("Date"), "today")

    await waitFor(() => {
      const lastCall = useSessionsMock.mock.calls.at(-1)?.[0] as SessionFilters
      const todayInDeployTz = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
      expect(lastCall.date_from).toBe(todayInDeployTz)
    })
  })

  it("sorts by turn count when Sort is set to Most turns", async () => {
    const user = userEvent.setup()
    useSessionsMock.mockReturnValue({
      data: [
        makeSession({ id: "few", turn_count: 1, topic_summary: "Few turns" }),
        makeSession({ id: "many", turn_count: 9, topic_summary: "Many turns session" }),
      ],
      isLoading: false,
      isFetching: false,
    })
    renderPage()

    await user.selectOptions(screen.getByLabelText("Sort"), "turns")

    const items = screen.getAllByRole("button", { name: /Open session/ })
    expect(items[0]).toHaveAccessibleName(expect.stringContaining("Many turns session"))
  })

  it("clicking Clear filters resets filters and the search query", async () => {
    const user = userEvent.setup()
    useSessionStore.setState({ searchQuery: "VL150" })
    useSessionsMock.mockReturnValue({ data: [], isLoading: false, isFetching: false })
    renderPage()

    await user.selectOptions(screen.getByLabelText("Module"), "SD")
    await user.click(screen.getByText("Clear filters"))

    expect(useSessionStore.getState().searchQuery).toBe("")
    await waitFor(() => expect(screen.getByLabelText("Module")).toHaveValue(""))
  })

  it("disables the Export CSV button when there are no sessions", () => {
    renderPage()
    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeDisabled()
  })

  it("exports the correctly-shaped columns, whose accessors produce the correct plain values", async () => {
    const user = userEvent.setup()
    const session = makeSession({
      id: "s1",
      topic_summary: "VL150 delivery error",
      updated_at: "2024-03-28T09:00:00Z",
      turn_count: 4,
      avg_confidence_score: 0.847,
      confidence_badge: "amber",
      module_tags: ["SD", "FI"],
      is_unresolved: true,
    })
    useSessionsMock.mockReturnValue({ data: [session], isLoading: false, isFetching: false })
    renderPage()

    await user.click(screen.getByRole("button", { name: /Export CSV/ }))

    expect(exportToCSVMock).toHaveBeenCalledTimes(1)
    const call = exportToCSVMock.mock.calls[0][0] as {
      filename: string
      columns: { header: string; accessor: (s: Session) => string | number }[]
      data: Session[]
    }
    expect(call.filename).toBe("aegis-session-history")
    const values = Object.fromEntries(call.columns.map((c) => [c.header, c.accessor(session)]))
    expect(values).toEqual({
      Topic: "VL150 delivery error",
      Date: "28 Mar 2024, 02:30 pm",
      Turns: 4,
      "Avg confidence": "0.85",
      Badge: "amber",
      Modules: "SD, FI",
      Unresolved: "Yes",
    })
    expect(call.data).toHaveLength(1)
  })

  it("Badge accessor falls back to 'none' when confidence_badge is null", async () => {
    const user = userEvent.setup()
    const session = makeSession({ confidence_badge: null, avg_confidence_score: null })
    useSessionsMock.mockReturnValue({ data: [session], isLoading: false, isFetching: false })
    renderPage()

    await user.click(screen.getByRole("button", { name: /Export CSV/ }))

    const call = exportToCSVMock.mock.calls[0][0] as {
      columns: { header: string; accessor: (s: Session) => string | number }[]
    }
    const badgeAccessor = call.columns.find((c) => c.header === "Badge")!.accessor
    const avgAccessor = call.columns.find((c) => c.header === "Avg confidence")!.accessor
    expect(badgeAccessor(session)).toBe("none")
    expect(avgAccessor(session)).toBe("")
  })

  it("shows pagination controls only when there are more than 50 results", () => {
    useSessionsMock.mockReturnValue({
      data: Array.from({ length: 60 }, (_, i) => makeSession({ id: `s${i}`, topic_summary: `Session ${i}` })),
      isLoading: false,
      isFetching: false,
    })
    renderPage()

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "← Previous" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next →" })).not.toBeDisabled()
  })

  it("does not show pagination controls for 50 or fewer results", () => {
    useSessionsMock.mockReturnValue({
      data: [makeSession()],
      isLoading: false,
      isFetching: false,
    })
    renderPage()
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument()
  })

  it("Next/Previous buttons page through results correctly", async () => {
    const user = userEvent.setup()
    useSessionsMock.mockReturnValue({
      data: Array.from({ length: 60 }, (_, i) => makeSession({ id: `s${i}`, topic_summary: `Session ${i}` })),
      isLoading: false,
      isFetching: false,
    })
    renderPage()

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Next →" }))
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "← Previous" })).not.toBeDisabled()

    await user.click(screen.getByRole("button", { name: "← Previous" }))
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
  })
})
