import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminDashboardPage from "./page"
import type { MetricsData } from "@/types"

const pushMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}))

const useAdminMetricsMock = vi.fn<
  () => { data: MetricsData | undefined; isLoading: boolean; dataUpdatedAt: number }
>(() => ({ data: undefined, isLoading: true, dataUpdatedAt: 0 }))
vi.mock("@/hooks/queries", () => ({
  useAdminMetrics: () => useAdminMetricsMock(),
}))

function makeMetrics(overrides: Partial<MetricsData> = {}): MetricsData {
  return {
    total_queries_today: 247,
    avg_validation_score: 0.841,
    green_badge_rate: 0.71,
    amber_badge_rate: 0.22,
    none_badge_rate: 0.07,
    open_tickets: 5,
    cache_hit_rate: 0.34,
    crag_insufficient_rate: 0.07,
    mode_a_rate: 0.15,
    mode_b_rate: 0.51,
    mode_c_rate: 0.07,
    last_updated_at: "2026-07-21T00:00:00Z",
    validation_score_7d: [{ date: "Mon", score: 0.8 }],
    confidence_dist_7d: [{ date: "Mon", green: 68, amber: 24, none: 8 }],
    gap_events: [
      { query_pattern: "VL150 delivery creation error", module: "SD", doc_category: "SD-ERR", count_this_week: 23, severity: "high" },
    ],
    ...overrides,
  }
}

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    pushMock.mockClear()
    useAdminMetricsMock.mockReset()
    useAdminMetricsMock.mockReturnValue({ data: undefined, isLoading: true, dataUpdatedAt: 0 })
  })

  it("renders the page header", () => {
    render(<AdminDashboardPage />)
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument()
    expect(screen.getByText("Live quality overview")).toBeInTheDocument()
  })

  it("does not show the refresh indicator while loading (no real dataUpdatedAt yet)", () => {
    render(<AdminDashboardPage />)
    expect(screen.queryByText(/Updated \d+s ago/)).not.toBeInTheDocument()
  })

  it("shows the refresh indicator once data has loaded", () => {
    useAdminMetricsMock.mockReturnValue({ data: makeMetrics(), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminDashboardPage />)
    expect(screen.getByText(/Updated \d+s ago/)).toBeInTheDocument()
  })

  it("renders all 4 KPI metric cards with real values once loaded", () => {
    useAdminMetricsMock.mockReturnValue({ data: makeMetrics(), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminDashboardPage />)

    // MetricCard animates its displayed number via requestAnimationFrame
    // (animateCount is hardcoded true on this page) — its aria-label,
    // unlike the visible text, is always computed from the real value, not
    // the in-flight animated one, so it's the reliable way to assert the
    // real value reached the card without waiting out the animation.
    expect(screen.getByText("Queries today")).toBeInTheDocument()
    expect(screen.getByLabelText("Queries today: 247")).toBeInTheDocument()
    expect(screen.getByText("Avg ValidationScore")).toBeInTheDocument()
    expect(screen.getByLabelText("Avg ValidationScore: 0.84")).toBeInTheDocument()
    expect(screen.getByText("Green badge rate")).toBeInTheDocument()
    expect(screen.getByLabelText("Green badge rate: 71%")).toBeInTheDocument()
    expect(screen.getByText("Open tickets")).toBeInTheDocument()
    expect(screen.getByLabelText("Open tickets: 5")).toBeInTheDocument()
  })

  it("renders the charts and gap events list with real data", async () => {
    useAdminMetricsMock.mockReturnValue({ data: makeMetrics(), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminDashboardPage />)

    // Charts are loaded via next/dynamic (FRONTEND_28_PERFORMANCE.md
    // bundle-splitting) — their module resolves asynchronously even in
    // tests, so the first render only has the ChartSkeleton fallback.
    expect(await screen.findByText("ValidationScore — 7-day trend")).toBeInTheDocument()
    expect(screen.getByText("Confidence distribution — 7 days")).toBeInTheDocument()
    expect(screen.getByText("Retrieval mode breakdown")).toBeInTheDocument()
    expect(screen.getByText("VL150 delivery creation error")).toBeInTheDocument()
  })

  it("shows the review-queue alert banner when open_tickets > 0", () => {
    useAdminMetricsMock.mockReturnValue({ data: makeMetrics({ open_tickets: 5 }), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminDashboardPage />)
    expect(screen.getByRole("alert")).toHaveTextContent("5 tickets need review")
  })

  it("does not show the alert banner when open_tickets is 0", () => {
    useAdminMetricsMock.mockReturnValue({ data: makeMetrics({ open_tickets: 0 }), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminDashboardPage />)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("uses singular wording for exactly 1 open ticket", () => {
    useAdminMetricsMock.mockReturnValue({ data: makeMetrics({ open_tickets: 1 }), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminDashboardPage />)
    expect(screen.getByRole("alert")).toHaveTextContent("1 ticket needs review")
  })

  it("navigates to /admin/review-queue when 'Review now' is clicked", async () => {
    const user = userEvent.setup()
    useAdminMetricsMock.mockReturnValue({ data: makeMetrics({ open_tickets: 2 }), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminDashboardPage />)

    await user.click(screen.getByRole("button", { name: "Review now" }))
    expect(pushMock).toHaveBeenCalledWith("/admin/review-queue")
  })

  it("navigates via the quick action buttons", async () => {
    const user = userEvent.setup()
    useAdminMetricsMock.mockReturnValue({ data: makeMetrics(), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminDashboardPage />)

    await user.click(screen.getByRole("button", { name: /Upload document/ }))
    expect(pushMock).toHaveBeenCalledWith("/admin/documents")

    await user.click(screen.getByRole("button", { name: /System health/ }))
    expect(pushMock).toHaveBeenCalledWith("/admin/system-health")
  })
})
