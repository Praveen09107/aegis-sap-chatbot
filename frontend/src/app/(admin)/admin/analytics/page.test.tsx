import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminAnalyticsPage from "./page"
import { useAdminStore } from "@/stores/adminStore"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}))

const routerReplaceMock = vi.fn()
let searchParamsValue = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  usePathname: () => "/admin/analytics",
  useSearchParams: () => searchParamsValue,
}))

const useAdminAnalyticsMock = vi.fn<() => { data: unknown; isLoading: boolean }>(() => ({ data: undefined, isLoading: true }))
vi.mock("@/hooks/queries", () => ({
  useAdminAnalytics: () => useAdminAnalyticsMock(),
}))

function makeAnalytics() {
  return {
    validation_score_trend: [{ date: "Mon", score: 0.84 }],
    confidence_distribution: [{ date: "Mon", green: 68, amber: 24, none: 8 }],
    cache_performance: [{ date: "Mon", hit_rate: 0.34, total_queries: 100 }],
    retrieval_mode_usage: [{ date: "Mon", mode_a: 0.15, mode_b: 0.51, mode_c: 0.07 }],
    top_modules: [{ module: "SD", query_count: 120, avg_score: 0.9 }],
    query_volume: [{ date: "Mon", value: 120 }],
  }
}

describe("AdminAnalyticsPage", () => {
  beforeEach(() => {
    useAdminAnalyticsMock.mockReset()
    useAdminAnalyticsMock.mockReturnValue({ data: undefined, isLoading: true })
    routerReplaceMock.mockClear()
    searchParamsValue = new URLSearchParams()
    useAdminStore.setState({ analyticsRange: "30d" })
  })

  it("renders the page header", () => {
    render(<AdminAnalyticsPage />)
    expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument()
  })

  it("hydrates the range from the URL on mount (FRONTEND_SUPPLEMENT_02 Part 4)", () => {
    searchParamsValue = new URLSearchParams("range=90d")
    render(<AdminAnalyticsPage />)
    expect(useAdminStore.getState().analyticsRange).toBe("90d")
  })

  it("renders all 4 range buttons and highlights the active one", () => {
    render(<AdminAnalyticsPage />)
    for (const label of ["7 days", "30 days", "90 days", "All time"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole("button", { name: "30 days", pressed: true })).toBeInTheDocument()
  })

  it("switches the active range and calls setAnalyticsRange", async () => {
    const user = userEvent.setup()
    render(<AdminAnalyticsPage />)
    await user.click(screen.getByRole("button", { name: "90 days" }))
    expect(useAdminStore.getState().analyticsRange).toBe("90d")
  })

  it("renders all 6 charts with real data once loaded", () => {
    useAdminAnalyticsMock.mockReturnValue({ data: makeAnalytics(), isLoading: false })
    render(<AdminAnalyticsPage />)

    expect(screen.getByText("ValidationScore — 7-day trend")).toBeInTheDocument()
    expect(screen.getByText("Query volume")).toBeInTheDocument()
    expect(screen.getByText("Confidence distribution — 7 days")).toBeInTheDocument()
    expect(screen.getByText("Cache hit rate")).toBeInTheDocument()
    expect(screen.getByText("Top SAP modules")).toBeInTheDocument()
    expect(screen.getByText("Retrieval mode breakdown")).toBeInTheDocument()
  })

  it("passes the latest retrieval_mode_usage and cache_performance points to RetrievalModeChart", () => {
    useAdminAnalyticsMock.mockReturnValue({ data: makeAnalytics(), isLoading: false })
    render(<AdminAnalyticsPage />)
    expect(screen.getByRole("progressbar", { name: "Mode A: 15%" })).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Cache: 34%" })).toBeInTheDocument()
  })
})
