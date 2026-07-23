import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProcessingStatusDrawer } from "./ProcessingStatusDrawer"

const useQuickEntryPollMock = vi.fn()

vi.mock("@/hooks/queries", () => ({
  useQuickEntryPoll: (...args: unknown[]) => useQuickEntryPollMock(...args),
}))

describe("ProcessingStatusDrawer", () => {
  beforeEach(() => {
    useQuickEntryPollMock.mockReset()
  })

  it("shows the queued message when no processing_log exists yet", () => {
    useQuickEntryPollMock.mockReturnValue({ data: { status: "processing", processing_log: null } })
    render(<ProcessingStatusDrawer entryId="entry-1" onClose={vi.fn()} onProcessingComplete={vi.fn()} />)
    expect(screen.getByText("Processing queued — starting shortly…")).toBeInTheDocument()
  })

  it("renders stage rows from the processing log", () => {
    useQuickEntryPollMock.mockReturnValue({
      data: {
        status: "processing",
        processing_log: {
          stages: {
            validation: { status: "success", duration_ms: 12 },
            chunk_assembly: { status: "success", duration_ms: 20, chunks_assembled: 2, chunk_types: ["error_overview", "cause_1"] },
          },
          failure_reason: null,
        },
      },
    })
    render(<ProcessingStatusDrawer entryId="entry-1" onClose={vi.fn()} onProcessingComplete={vi.fn()} />)
    expect(screen.getByText("Schema validation")).toBeInTheDocument()
    expect(screen.getByText("2 chunks: error_overview, cause_1")).toBeInTheDocument()
  })

  it("calls onProcessingComplete once the status reaches a terminal state", () => {
    useQuickEntryPollMock.mockReturnValue({
      data: { status: "active", processing_log: { stages: {}, failure_reason: null } },
    })
    const onProcessingComplete = vi.fn()
    render(<ProcessingStatusDrawer entryId="entry-1" onClose={vi.fn()} onProcessingComplete={onProcessingComplete} />)
    expect(onProcessingComplete).toHaveBeenCalledWith("active")
    expect(screen.getByText("✓ Entry is now active in the knowledge base")).toBeInTheDocument()
  })

  it("shows similar-entries warning when deduplication found matches", () => {
    useQuickEntryPollMock.mockReturnValue({
      data: {
        status: "partial_index",
        processing_log: {
          stages: { deduplication: { status: "success", duration_ms: 5, similar_entries: [{ document_id: "SD-ERR-002", similarity_score: 0.9 }] } },
          failure_reason: null,
        },
      },
    })
    render(<ProcessingStatusDrawer entryId="entry-1" onClose={vi.fn()} onProcessingComplete={vi.fn()} />)
    expect(screen.getByText(/SD-ERR-002/)).toBeInTheDocument()
  })

  it("calls onClose when the close button is clicked", async () => {
    useQuickEntryPollMock.mockReturnValue({ data: undefined })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ProcessingStatusDrawer entryId="entry-1" onClose={onClose} onProcessingComplete={vi.fn()} />)
    await user.click(screen.getByLabelText("Close processing status"))
    expect(onClose).toHaveBeenCalled()
  })
})
