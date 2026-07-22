import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { QuickEntryPipelineHealth } from "./QuickEntryPipelineHealth"
import type { PipelineHealthData } from "@/hooks/queries/adminHealth"
import type { KnowledgeEntrySummary } from "@/hooks/queries/adminHealth"

function makeData(overrides: Partial<PipelineHealthData> = {}): PipelineHealthData {
  return {
    badge: "green",
    arq_queues: { form_entry_queue_pending: 2, screenshot_queue_pending: 1, avg_processing_seconds: 4.2 },
    entry_status: { active: 40, draft: 3, processing: 1, failed: 0, partial_index: 0, review_required: 2 },
    screenshot_status: { complete: 10, processing: 1, pending: 0, failed: 0, not_sap: 2 },
    knowledge_quality: { quick_entry_avg_score: 0.881 },
    feedback: { entries_with_net_negative_feedback_30d: 0 },
    storage: { screenshot_storage_bytes: 5_242_880, eligible_for_cleanup: 3 },
    ...overrides,
  }
}

function makeEntry(overrides: Partial<KnowledgeEntrySummary> = {}): KnowledgeEntrySummary {
  return {
    id: "qe-1",
    document_id: "SD-ERR-042",
    content_type: "error_guide",
    module: "SD",
    status: "active",
    version: 2,
    verified_by_name: "admin1",
    verified_date: "2026-07-01",
    submitted_by_name: "uuid-1",
    chunk_count: 3,
    screenshot_count: 1,
    has_failed_screenshots: false,
    next_review_date: null,
    gap_id: null,
    feedback_summary: { positive: 1, negative: 3, net: -2, period_days: 30, last_negative_at: "2026-07-20T10:00:00Z" },
    issue_title: "VL150 delivery error guide",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  }
}

describe("QuickEntryPipelineHealth", () => {
  it("shows a loading skeleton when isLoading", () => {
    render(<QuickEntryPipelineHealth data={undefined} attentionEntries={[]} isLoading />)
    expect(screen.queryByText("Quick Entry pipeline")).not.toBeInTheDocument()
  })

  it("renders the green 'Nominal' badge", () => {
    render(<QuickEntryPipelineHealth data={makeData({ badge: "green" })} attentionEntries={[]} />)
    expect(screen.getByText("Nominal")).toBeInTheDocument()
  })

  it("renders the amber 'Needs attention' badge", () => {
    render(<QuickEntryPipelineHealth data={makeData({ badge: "amber" })} attentionEntries={[]} />)
    expect(screen.getByText("Needs attention")).toBeInTheDocument()
  })

  it("renders the red 'Critical' badge", () => {
    render(<QuickEntryPipelineHealth data={makeData({ badge: "red" })} attentionEntries={[]} />)
    expect(screen.getByText("Critical")).toBeInTheDocument()
  })

  it("renders ARQ queue depths and avg processing time", () => {
    render(<QuickEntryPipelineHealth data={makeData()} attentionEntries={[]} />)
    expect(screen.getByText("form entries pending")).toBeInTheDocument()
    expect(screen.getByText("screenshots pending")).toBeInTheDocument()
    expect(screen.getByText(/4\.2s/)).toBeInTheDocument()
  })

  it("omits the avg processing time line when null", () => {
    render(<QuickEntryPipelineHealth data={makeData({ arq_queues: { form_entry_queue_pending: 0, screenshot_queue_pending: 0, avg_processing_seconds: null } })} attentionEntries={[]} />)
    expect(screen.queryByText(/Avg processing time/)).not.toBeInTheDocument()
  })

  it("renders entry status and screenshot status breakdowns", () => {
    render(<QuickEntryPipelineHealth data={makeData()} attentionEntries={[]} />)
    expect(screen.getByText("active")).toBeInTheDocument()
    expect(screen.getByText("partial index")).toBeInTheDocument()
    expect(screen.getByText("not SAP")).toBeInTheDocument()
  })

  it("shows the quality score formatted as a percentage", () => {
    render(<QuickEntryPipelineHealth data={makeData({ knowledge_quality: { quick_entry_avg_score: 0.881 } })} attentionEntries={[]} />)
    expect(screen.getByText("88.1%")).toBeInTheDocument()
  })

  it("shows '—' when the quality score is null", () => {
    render(<QuickEntryPipelineHealth data={makeData({ knowledge_quality: { quick_entry_avg_score: null } })} attentionEntries={[]} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("converts screenshot storage bytes to a human-readable size", () => {
    render(<QuickEntryPipelineHealth data={makeData({ storage: { screenshot_storage_bytes: 5_242_880, eligible_for_cleanup: 3 } })} attentionEntries={[]} />)
    expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument()
    expect(screen.getByText(/3 eligible for cleanup/)).toBeInTheDocument()
  })

  it("does not render an attention list when there are no entries", () => {
    render(<QuickEntryPipelineHealth data={makeData()} attentionEntries={[]} />)
    expect(screen.queryByText("Entries needing attention")).not.toBeInTheDocument()
  })

  it("renders the attention list with entries linking to /admin/quick-entry/{id}", () => {
    const entry = makeEntry({ id: "qe-99", issue_title: "VL150 delivery error guide", module: "SD" })
    render(<QuickEntryPipelineHealth data={makeData()} attentionEntries={[entry]} />)

    expect(screen.getByText("Entries needing attention")).toBeInTheDocument()
    expect(screen.getByText("VL150 delivery error guide")).toBeInTheDocument()
    const link = screen.getByRole("listitem")
    expect(link).toHaveAttribute("href", "/admin/quick-entry/qe-99")
    expect(screen.getByText("-2")).toBeInTheDocument()
  })
})
