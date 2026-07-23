import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DuplicateCheckModal } from "./DuplicateCheckModal"
import type { DuplicateMatch } from "@/types"

function makeMatch(overrides: Partial<DuplicateMatch> = {}): DuplicateMatch {
  return {
    document_id: "SD-ERR-001",
    title: "Tax condition issue",
    preview: "Preview text",
    module: "SD",
    content_type: "error_guide",
    status: "active",
    source_type: "form_entry",
    similarity_score: 0.87,
    last_verified: "2026-06-01",
    ...overrides,
  }
}

describe("DuplicateCheckModal", () => {
  it("shows the match count and each match's details", () => {
    render(<DuplicateCheckModal matches={[makeMatch()]} onSubmitAnyway={vi.fn()} onUpdateExisting={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(/1 existing entry may cover/)).toBeInTheDocument()
    expect(screen.getByText("Tax condition issue")).toBeInTheDocument()
    expect(screen.getByText("87% similar")).toBeInTheDocument()
  })

  it("only shows 'Update existing' for form_entry-sourced matches", () => {
    render(<DuplicateCheckModal matches={[makeMatch({ source_type: "document" })]} onSubmitAnyway={vi.fn()} onUpdateExisting={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByText("Update existing")).not.toBeInTheDocument()
  })

  it("calls onUpdateExisting with the matched entry", async () => {
    const user = userEvent.setup()
    const onUpdateExisting = vi.fn()
    const match = makeMatch()
    render(<DuplicateCheckModal matches={[match]} onSubmitAnyway={vi.fn()} onUpdateExisting={onUpdateExisting} onCancel={vi.fn()} />)
    await user.click(screen.getByText("Update existing"))
    expect(onUpdateExisting).toHaveBeenCalledWith(match)
  })

  it("calls onSubmitAnyway and onCancel appropriately", async () => {
    const user = userEvent.setup()
    const onSubmitAnyway = vi.fn()
    const onCancel = vi.fn()
    render(<DuplicateCheckModal matches={[makeMatch()]} onSubmitAnyway={onSubmitAnyway} onUpdateExisting={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByText("My topic is different — submit anyway"))
    expect(onSubmitAnyway).toHaveBeenCalled()
    await user.click(screen.getByText("Go back and review my entry"))
    expect(onCancel).toHaveBeenCalled()
  })
})
