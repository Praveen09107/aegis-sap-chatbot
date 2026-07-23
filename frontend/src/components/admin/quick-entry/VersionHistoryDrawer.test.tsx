import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { VersionHistoryDrawer } from "./VersionHistoryDrawer"

const useQuickEntryVersionsMock = vi.fn()
const mutateMock = vi.fn()

vi.mock("@/hooks/queries", () => ({
  useQuickEntryVersions: (...args: unknown[]) => useQuickEntryVersionsMock(...args),
  useRestoreQuickEntryVersion: () => ({ mutate: mutateMock }),
}))

describe("VersionHistoryDrawer", () => {
  beforeEach(() => {
    useQuickEntryVersionsMock.mockReset()
    mutateMock.mockReset()
  })

  it("shows a loading skeleton while versions are loading", () => {
    useQuickEntryVersionsMock.mockReturnValue({ data: undefined, isLoading: true })
    const { container } = render(<VersionHistoryDrawer entryId="entry-1" currentVersion={2} onClose={vi.fn()} onRestored={vi.fn()} />)
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0)
  })

  it("marks the current version and doesn't offer to restore it", () => {
    useQuickEntryVersionsMock.mockReturnValue({
      data: {
        entry_id: "entry-1",
        current_version: 2,
        versions: [
          { id: "v2", version: 2, changed_by_name: "Jane", changed_at: "2026-06-02T00:00:00Z", change_summary: null },
          { id: "v1", version: 1, changed_by_name: "Jane", changed_at: "2026-06-01T00:00:00Z", change_summary: "Initial draft" },
        ],
      },
      isLoading: false,
    })
    render(<VersionHistoryDrawer entryId="entry-1" currentVersion={2} onClose={vi.fn()} onRestored={vi.fn()} />)

    expect(screen.getByText("Current")).toBeInTheDocument()
    expect(screen.getAllByText("Restore")).toHaveLength(1)
    expect(screen.getByText('"Initial draft"')).toBeInTheDocument()
  })

  it("restores a version and calls onRestored on success", async () => {
    useQuickEntryVersionsMock.mockReturnValue({
      data: {
        entry_id: "entry-1",
        current_version: 2,
        versions: [
          { id: "v2", version: 2, changed_by_name: "Jane", changed_at: "2026-06-02T00:00:00Z", change_summary: null },
          { id: "v1", version: 1, changed_by_name: "Jane", changed_at: "2026-06-01T00:00:00Z", change_summary: null },
        ],
      },
      isLoading: false,
    })
    mutateMock.mockImplementation((_version, { onSuccess }) => onSuccess())

    const user = userEvent.setup()
    const onRestored = vi.fn()
    render(<VersionHistoryDrawer entryId="entry-1" currentVersion={2} onClose={vi.fn()} onRestored={onRestored} />)

    await user.click(screen.getByText("Restore"))
    expect(mutateMock).toHaveBeenCalledWith(1, expect.any(Object))
    await waitFor(() => expect(onRestored).toHaveBeenCalled())
  })

  it("calls onClose when the close button is clicked", async () => {
    useQuickEntryVersionsMock.mockReturnValue({ data: { versions: [] }, isLoading: false })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<VersionHistoryDrawer entryId="entry-1" currentVersion={1} onClose={onClose} onRestored={vi.fn()} />)
    await user.click(screen.getByLabelText("Close version history"))
    expect(onClose).toHaveBeenCalled()
  })
})
