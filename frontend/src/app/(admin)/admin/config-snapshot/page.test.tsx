import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminConfigSnapshotPage from "./page"
import type { ConfigEntry } from "@/hooks/queries/adminData"

const useConfigSnapshotMock = vi.fn<() => { data: ConfigEntry[]; isLoading: boolean }>(() => ({ data: [], isLoading: false }))
const updateConfigMutateAsync = vi.fn().mockResolvedValue(undefined)

vi.mock("@/hooks/queries", () => ({
  useConfigSnapshot: () => useConfigSnapshotMock(),
  useUpdateConfig: () => ({ mutateAsync: updateConfigMutateAsync }),
}))

function makeEntry(overrides: Partial<ConfigEntry> = {}): ConfigEntry {
  return {
    config_category: "AR",
    config_key: "credit_days",
    config_value: "30",
    last_updated_at: "2026-07-01",
    updated_by: "admin1",
    staleness: "fresh",
    age_days: 5,
    ...overrides,
  }
}

describe("AdminConfigSnapshotPage", () => {
  beforeEach(() => {
    useConfigSnapshotMock.mockReset()
    useConfigSnapshotMock.mockReturnValue({ data: [], isLoading: false })
    updateConfigMutateAsync.mockClear()
  })

  it("renders the page header", () => {
    render(<AdminConfigSnapshotPage />)
    expect(screen.getByRole("heading", { name: "Config snapshot" })).toBeInTheDocument()
  })

  it("shows 'All values fresh' when nothing is stale", () => {
    useConfigSnapshotMock.mockReturnValue({ data: [makeEntry({ staleness: "fresh" })], isLoading: false })
    render(<AdminConfigSnapshotPage />)
    expect(screen.getByText("All values fresh")).toBeInTheDocument()
  })

  it("shows the stale-value count badge when entries are stale", () => {
    useConfigSnapshotMock.mockReturnValue({
      data: [makeEntry({ config_key: "k1", staleness: "critical" }), makeEntry({ config_key: "k2", staleness: "warning" })],
      isLoading: false,
    })
    render(<AdminConfigSnapshotPage />)
    expect(screen.getByText("2 stale values")).toBeInTheDocument()
  })

  it("renders rows with real field names (config_category, config_key, config_value)", () => {
    useConfigSnapshotMock.mockReturnValue({ data: [makeEntry()], isLoading: false })
    render(<AdminConfigSnapshotPage />)
    // "AR" appears twice — once as the category filter button, once as the
    // row's category badge — assert via the row-scoped, unique fields.
    expect(screen.getAllByText("AR").length).toBeGreaterThan(0)
    expect(screen.getByText("credit_days")).toBeInTheDocument()
    expect(screen.getByText("30")).toBeInTheDocument()
  })

  it("filters by category", async () => {
    useConfigSnapshotMock.mockReturnValue({
      data: [makeEntry({ config_category: "AR", config_key: "k1" }), makeEntry({ config_category: "MM", config_key: "k2" })],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminConfigSnapshotPage />)

    await user.click(screen.getByRole("button", { name: "MM" }))

    expect(screen.queryByText("k1")).not.toBeInTheDocument()
    expect(screen.getByText("k2")).toBeInTheDocument()
  })

  it("filters to stale-only entries via the Stale only button, using the real staleness field", async () => {
    useConfigSnapshotMock.mockReturnValue({
      data: [makeEntry({ config_key: "fresh-one", staleness: "fresh" }), makeEntry({ config_key: "stale-one", staleness: "critical" })],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminConfigSnapshotPage />)

    await user.click(screen.getByRole("button", { name: /Stale only/ }))

    expect(screen.queryByText("fresh-one")).not.toBeInTheDocument()
    expect(screen.getByText("stale-one")).toBeInTheDocument()
  })

  it("resets both filters via the All button", async () => {
    useConfigSnapshotMock.mockReturnValue({
      data: [makeEntry({ config_category: "AR", config_key: "k1", staleness: "critical" }), makeEntry({ config_category: "MM", config_key: "k2" })],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminConfigSnapshotPage />)

    await user.click(screen.getByRole("button", { name: "MM" }))
    await user.click(screen.getByRole("button", { name: "All" }))

    expect(screen.getByText("k1")).toBeInTheDocument()
    expect(screen.getByText("k2")).toBeInTheDocument()
  })

  it("removes the category filter chip via its own remove control", async () => {
    useConfigSnapshotMock.mockReturnValue({
      data: [makeEntry({ config_category: "AR", config_key: "k1" }), makeEntry({ config_category: "MM", config_key: "k2" })],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminConfigSnapshotPage />)

    await user.click(screen.getByRole("button", { name: "MM" }))
    expect(screen.queryByText("k1")).not.toBeInTheDocument()

    await user.click(screen.getByLabelText("Remove Category filter"))
    expect(screen.getByText("k1")).toBeInTheDocument()
  })

  it("removes the stale-only filter chip via its own remove control", async () => {
    useConfigSnapshotMock.mockReturnValue({
      data: [makeEntry({ config_key: "fresh-one", staleness: "fresh" }), makeEntry({ config_key: "stale-one", staleness: "critical" })],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<AdminConfigSnapshotPage />)

    await user.click(screen.getByRole("button", { name: /Stale only/ }))
    expect(screen.queryByText("fresh-one")).not.toBeInTheDocument()

    await user.click(screen.getByLabelText("Remove Filter filter"))
    expect(screen.getByText("fresh-one")).toBeInTheDocument()
  })

  it("edits a value inline and saves via useUpdateConfig with the correct category/key/value", async () => {
    useConfigSnapshotMock.mockReturnValue({ data: [makeEntry({ config_category: "AR", config_key: "credit_days", config_value: "30" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminConfigSnapshotPage />)

    await user.click(screen.getByRole("button", { name: "Edit value: 30" }))
    const input = screen.getByDisplayValue("30")
    await user.clear(input)
    await user.type(input, "45{Enter}")

    await waitFor(() => expect(updateConfigMutateAsync).toHaveBeenCalledWith({ category: "AR", key: "credit_days", value: "45" }))
  })

  it("uses the composite (category:key) row key so same-key rows across categories don't collide", () => {
    useConfigSnapshotMock.mockReturnValue({
      data: [
        makeEntry({ config_category: "AR", config_key: "threshold", config_value: "10" }),
        makeEntry({ config_category: "MM", config_key: "threshold", config_value: "20" }),
      ],
      isLoading: false,
    })
    render(<AdminConfigSnapshotPage />)
    expect(screen.getByText("10")).toBeInTheDocument()
    expect(screen.getByText("20")).toBeInTheDocument()
  })

  it("passes the real staleness field to StalenessIndicator rather than recomputing from age_days alone", async () => {
    // age_days=10 alone would compute as Fresh under CONFIDENCE's
    // thresholds, but the real, authoritative staleness is "critical".
    useConfigSnapshotMock.mockReturnValue({ data: [makeEntry({ age_days: 10, staleness: "critical" })], isLoading: false })
    const user = userEvent.setup()
    render(<AdminConfigSnapshotPage />)

    await user.hover(screen.getByText("10d"))
    expect((await screen.findAllByText("Stale")).length).toBeGreaterThan(0)
  })

  it("shows the empty state when there are no config entries", () => {
    render(<AdminConfigSnapshotPage />)
    expect(screen.getByText("No configuration entries")).toBeInTheDocument()
  })
})
