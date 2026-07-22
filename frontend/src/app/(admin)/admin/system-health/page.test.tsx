import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminSystemHealthPage from "./page"
import type { SystemHealthData } from "@/types"
import type { PipelineHealthData, InferenceHealthData, KnowledgeEntrySummary } from "@/hooks/queries/adminHealth"

const useSystemHealthMock = vi.fn<() => { data: SystemHealthData | undefined; isLoading: boolean; dataUpdatedAt: number }>(() => ({
  data: undefined,
  isLoading: true,
  dataUpdatedAt: 0,
}))
const usePipelineHealthMock = vi.fn<() => { data: PipelineHealthData | undefined; isLoading: boolean }>(() => ({ data: undefined, isLoading: true }))
const useInferenceHealthMock = vi.fn<() => { data: InferenceHealthData | undefined; isLoading: boolean }>(() => ({ data: undefined, isLoading: true }))
const useAttentionEntriesMock = vi.fn<() => { data: KnowledgeEntrySummary[] }>(() => ({ data: [] }))

vi.mock("@/hooks/queries", () => ({
  useSystemHealth: () => useSystemHealthMock(),
  usePipelineHealth: () => usePipelineHealthMock(),
  useInferenceHealth: () => useInferenceHealthMock(),
  useAttentionEntries: () => useAttentionEntriesMock(),
}))

function makeHealth(overrides: Partial<SystemHealthData> = {}): SystemHealthData {
  return {
    services: [{ name: "aegis-nginx", container_name: "aegis-nginx", status: "healthy", response_time_ms: 12, last_checked_at: "2026-07-22T10:00:00Z" }],
    total_healthy: 18,
    total_unhealthy: 1,
    overall_status: "degraded",
    checked_at: "2026-07-22T10:00:00Z",
    ...overrides,
  }
}

describe("AdminSystemHealthPage", () => {
  beforeEach(() => {
    useSystemHealthMock.mockReset()
    useSystemHealthMock.mockReturnValue({ data: undefined, isLoading: true, dataUpdatedAt: 0 })
    usePipelineHealthMock.mockReset()
    usePipelineHealthMock.mockReturnValue({ data: undefined, isLoading: true })
    useInferenceHealthMock.mockReset()
    useInferenceHealthMock.mockReturnValue({ data: undefined, isLoading: true })
    useAttentionEntriesMock.mockReset()
    useAttentionEntriesMock.mockReturnValue({ data: [] })
  })

  it("renders the page header", () => {
    render(<AdminSystemHealthPage />)
    expect(screen.getByRole("heading", { name: "System health" })).toBeInTheDocument()
  })

  it("does not show the refresh indicator or banner while loading", () => {
    render(<AdminSystemHealthPage />)
    expect(screen.queryByText(/Updated \d+s ago/)).not.toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("shows the degraded overall banner with healthy/down/total counts once loaded", () => {
    useSystemHealthMock.mockReturnValue({ data: makeHealth(), isLoading: false, dataUpdatedAt: Date.now() })
    render(<AdminSystemHealthPage />)

    expect(screen.getByText("Some services degraded")).toBeInTheDocument()
    expect(screen.getByText("18 healthy")).toBeInTheDocument()
    expect(screen.getByText("1 down")).toBeInTheDocument()
    expect(screen.getByText("1 total")).toBeInTheDocument()
  })

  it("shows the healthy overall banner without a down count", () => {
    useSystemHealthMock.mockReturnValue({
      data: makeHealth({ overall_status: "healthy", total_unhealthy: 0 }),
      isLoading: false,
      dataUpdatedAt: Date.now(),
    })
    render(<AdminSystemHealthPage />)
    expect(screen.getByText("All services healthy")).toBeInTheDocument()
    expect(screen.queryByText(/down$/)).not.toBeInTheDocument()
  })

  it("opens the service detail drawer when a tile is clicked", async () => {
    useSystemHealthMock.mockReturnValue({ data: makeHealth(), isLoading: false, dataUpdatedAt: Date.now() })
    const user = userEvent.setup()
    render(<AdminSystemHealthPage />)

    await user.click(screen.getByRole("button", { name: /nginx/ }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Response time")).toBeInTheDocument()
  })

  it("closes the drawer via its own close button", async () => {
    useSystemHealthMock.mockReturnValue({ data: makeHealth(), isLoading: false, dataUpdatedAt: Date.now() })
    const user = userEvent.setup()
    render(<AdminSystemHealthPage />)

    await user.click(screen.getByRole("button", { name: /nginx/ }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Close drawer" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows the error message section when the selected service is unhealthy with an error", async () => {
    useSystemHealthMock.mockReturnValue({
      data: makeHealth({
        services: [
          {
            name: "aegis-qdrant",
            container_name: "aegis-qdrant",
            status: "unhealthy",
            response_time_ms: null,
            last_checked_at: "2026-07-22T10:00:00Z",
            error_message: "Connection refused",
          },
        ],
      }),
      isLoading: false,
      dataUpdatedAt: Date.now(),
    })
    const user = userEvent.setup()
    render(<AdminSystemHealthPage />)

    await user.click(screen.getByRole("button", { name: /qdrant/ }))
    expect(screen.getByText("Error message")).toBeInTheDocument()
    expect(screen.getByText("Connection refused")).toBeInTheDocument()
  })

  it("renders both the Quick Entry pipeline and inference orchestration sections", () => {
    usePipelineHealthMock.mockReturnValue({
      data: {
        badge: "green",
        arq_queues: { form_entry_queue_pending: 0, screenshot_queue_pending: 0, avg_processing_seconds: null },
        entry_status: { active: 1, draft: 0, processing: 0, failed: 0, partial_index: 0, review_required: 0 },
        screenshot_status: { complete: 0, processing: 0, pending: 0, failed: 0, not_sap: 0 },
        knowledge_quality: { quick_entry_avg_score: null },
        feedback: { entries_with_net_negative_feedback_30d: 0 },
        storage: { screenshot_storage_bytes: 0, eligible_for_cleanup: 0 },
      },
      isLoading: false,
    })
    useInferenceHealthMock.mockReturnValue({ data: { badge: "green", chains: {}, last_health_check: null }, isLoading: false })

    render(<AdminSystemHealthPage />)
    expect(screen.getByText("Quick Entry pipeline")).toBeInTheDocument()
    expect(screen.getByText("Inference orchestration")).toBeInTheDocument()
  })
})
