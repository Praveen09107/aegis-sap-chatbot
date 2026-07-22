import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import KnowledgeGapsPage from "./page"
import { useAdminStore } from "@/stores/adminStore"
import type { GapEntry } from "@/hooks/queries/adminData"

const routerReplaceMock = vi.fn()
let searchParamsValue = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  usePathname: () => "/admin/knowledge-gaps",
  useSearchParams: () => searchParamsValue,
}))

const useAdminGapsMock = vi.fn<() => { data: GapEntry[]; isLoading: boolean }>(() => ({ data: [], isLoading: false }))

vi.mock("@/hooks/queries", () => ({
  useAdminGaps: () => useAdminGapsMock(),
}))

function makeGap(overrides: Partial<GapEntry> = {}): GapEntry {
  return {
    gap_id: "gap-1",
    gap_description: "VL150 delivery error when creating shipment",
    count_7d: 8,
    count_30d: 20,
    example_queries: ["VL150 error"],
    addressed_by_entry_id: null,
    addressed_at: null,
    addressed_entry_title: null,
    ...overrides,
  }
}

describe("KnowledgeGapsPage", () => {
  beforeEach(() => {
    useAdminGapsMock.mockReset()
    useAdminGapsMock.mockReturnValue({ data: [], isLoading: false })
    routerReplaceMock.mockClear()
    searchParamsValue = new URLSearchParams()
    useAdminStore.setState({ gapsRangeDays: 30, gapsSearch: "" })
    window.localStorage.clear()
  })

  it("renders the page header", () => {
    render(<KnowledgeGapsPage />)
    expect(screen.getByRole("heading", { name: "Knowledge gaps" })).toBeInTheDocument()
  })

  it("hydrates the range from the URL on mount (FRONTEND_SUPPLEMENT_02 Part 4)", () => {
    searchParamsValue = new URLSearchParams("range=90")
    render(<KnowledgeGapsPage />)
    expect(useAdminStore.getState().gapsRangeDays).toBe(90)
  })

  it("groups gaps into severity sections derived from count_7d", () => {
    useAdminGapsMock.mockReturnValue({
      data: [
        makeGap({ gap_id: "high", gap_description: "High severity gap", count_7d: 8 }),
        makeGap({ gap_id: "medium", gap_description: "Medium severity gap", count_7d: 4 }),
        makeGap({ gap_id: "low", gap_description: "Low severity gap", count_7d: 1 }),
      ],
      isLoading: false,
    })
    render(<KnowledgeGapsPage />)

    expect(screen.getByText("High severity gap")).toBeInTheDocument()
    expect(screen.getByText("Medium severity gap")).toBeInTheDocument()
    expect(screen.getByText("Low severity gap")).toBeInTheDocument()
    expect(screen.getByText("High severity (1)")).toBeInTheDocument()
    expect(screen.getByText("Medium severity (1)")).toBeInTheDocument()
    expect(screen.getByText("Low severity (1)")).toBeInTheDocument()
  })

  it("shows the empty state when there are no gaps at all", () => {
    render(<KnowledgeGapsPage />)
    expect(screen.getByText("No knowledge gaps found")).toBeInTheDocument()
  })

  it("filters gaps by the search box (matches gap_description)", async () => {
    useAdminGapsMock.mockReturnValue({
      data: [
        makeGap({ gap_id: "g1", gap_description: "VL150 pattern", example_queries: [] }),
        makeGap({ gap_id: "g2", gap_description: "F5201 pattern", example_queries: [] }),
      ],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<KnowledgeGapsPage />)

    await user.type(screen.getByLabelText("Search knowledge gaps"), "VL150")

    expect(screen.getByText("VL150 pattern")).toBeInTheDocument()
    expect(screen.queryByText("F5201 pattern")).not.toBeInTheDocument()
    expect(useAdminStore.getState().gapsSearch).toBe("VL150")
  })

  it("hides a gap when its Hide button is clicked, persisting the id to localStorage", async () => {
    useAdminGapsMock.mockReturnValue({ data: [makeGap({ gap_id: "gap-hide-me" })], isLoading: false })
    const user = userEvent.setup()
    render(<KnowledgeGapsPage />)

    await user.click(screen.getByRole("button", { name: /Hide/ }))
    expect(screen.getByText("No knowledge gaps found")).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem("aegis:hidden-gap-ids") ?? "[]")).toContain("gap-hide-me")
  })

  it("matches search against example_queries as well as gap_description", async () => {
    useAdminGapsMock.mockReturnValue({
      data: [
        makeGap({ gap_id: "g1", gap_description: "Unrelated description", example_queries: ["VL150 error in VL01N"] }),
        makeGap({ gap_id: "g2", gap_description: "F5201 pattern", example_queries: [] }),
      ],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<KnowledgeGapsPage />)

    await user.type(screen.getByLabelText("Search knowledge gaps"), "VL150")

    expect(screen.getByText("Unrelated description")).toBeInTheDocument()
    expect(screen.queryByText("F5201 pattern")).not.toBeInTheDocument()
  })

  it("shows a loading skeleton while gaps are loading", () => {
    useAdminGapsMock.mockReturnValue({ data: [], isLoading: true })
    render(<KnowledgeGapsPage />)
    expect(screen.queryByText("No knowledge gaps found")).not.toBeInTheDocument()
  })

  it("switches the active range button and calls setGapsRangeDays", async () => {
    const user = userEvent.setup()
    render(<KnowledgeGapsPage />)
    await user.click(screen.getByRole("button", { name: "7 days" }))
    expect(useAdminStore.getState().gapsRangeDays).toBe(7)
  })
})
