import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConflictDrawer } from "./ConflictDrawer"
import type { QuickEntryFull } from "@/types"

const serverEntry: QuickEntryFull = {
  id: "entry-1",
  document_id: "SD-ERR-001",
  content_type: "error_guide",
  module: "SD",
  transactions: ["VK11"],
  status: "active",
  version: 3,
  form_data: {},
  verified_by_name: "Jane Doe",
  verified_date: "2026-06-01",
  review_frequency: null,
  next_review_date: null,
  gap_id: null,
  processing_log: null,
  submitted_by: "jane.doe",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-02T00:00:00Z",
  screenshots: [],
  chunks: [],
}

describe("ConflictDrawer", () => {
  it("shows the server version number in both the summary and the load button", () => {
    render(<ConflictDrawer serverEntry={serverEntry} onAcceptServer={vi.fn()} onKeepLocal={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Current server version is 3/)).toBeInTheDocument()
    expect(screen.getByText("Load server version (v3)")).toBeInTheDocument()
  })

  it("calls onAcceptServer, onKeepLocal, and onClose correctly", async () => {
    const user = userEvent.setup()
    const onAcceptServer = vi.fn()
    const onKeepLocal = vi.fn()
    const onClose = vi.fn()
    render(<ConflictDrawer serverEntry={serverEntry} onAcceptServer={onAcceptServer} onKeepLocal={onKeepLocal} onClose={onClose} />)

    await user.click(screen.getByText("Load server version (v3)"))
    expect(onAcceptServer).toHaveBeenCalled()

    await user.click(screen.getByText("Submit my version"))
    expect(onKeepLocal).toHaveBeenCalled()

    await user.click(screen.getByLabelText("Close"))
    expect(onClose).toHaveBeenCalled()
  })
})
