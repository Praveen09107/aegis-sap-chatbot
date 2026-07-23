import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QuickEntryFormActions } from "./QuickEntryFormActions"

const baseProps = {
  formState: "draft_editing",
  status: "draft",
  contentType: "error_guide" as const,
  savedEntryId: "entry-1",
  onSaveDraft: vi.fn(),
  onSubmit: vi.fn(),
  onViewProcessing: vi.fn(),
}

describe("QuickEntryFormActions", () => {
  it("shows the archived notice and no actions when formState is archived", () => {
    render(<QuickEntryFormActions {...baseProps} formState="archived" />)
    expect(screen.getByText(/Archived entries cannot be edited/)).toBeInTheDocument()
    expect(screen.queryByText("Submit to Knowledge Base")).not.toBeInTheDocument()
  })

  it("shows Save draft only once an entry exists and status is draft", () => {
    render(<QuickEntryFormActions {...baseProps} />)
    expect(screen.getByText("Save draft")).toBeInTheDocument()
  })

  it("hides Save draft when there's no saved entry yet", () => {
    render(<QuickEntryFormActions {...baseProps} savedEntryId={null} />)
    expect(screen.queryByText("Save draft")).not.toBeInTheDocument()
  })

  it("disables submit when no content type is chosen yet", () => {
    render(<QuickEntryFormActions {...baseProps} contentType={null} />)
    expect(screen.getByText("Submit to Knowledge Base").closest("button")).toBeDisabled()
  })

  it("calls onSubmit when the submit button is clicked", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuickEntryFormActions {...baseProps} onSubmit={onSubmit} />)
    await user.click(screen.getByText("Submit to Knowledge Base"))
    expect(onSubmit).toHaveBeenCalled()
  })

  it("shows a view-processing link while processing", () => {
    render(<QuickEntryFormActions {...baseProps} formState="processing" />)
    expect(screen.getByText("View processing status")).toBeInTheDocument()
    expect(screen.getByText("Processing…")).toBeInTheDocument()
  })
})
