import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { ArchiveConfirmModal } from "./ArchiveConfirmModal"

const mutateAsyncMock = vi.fn()

vi.mock("@/hooks/queries", () => ({
  useArchiveQuickEntry: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}))

function renderModal(onSuccess = vi.fn(), onCancel = vi.fn()) {
  const { Wrapper } = createQueryWrapper()
  return render(<ArchiveConfirmModal entryId="entry-1" documentId="SD-ERR-001" onSuccess={onSuccess} onCancel={onCancel} />, { wrapper: Wrapper })
}

describe("ArchiveConfirmModal", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue(undefined)
  })

  it("keeps the archive button disabled until the typed ID matches exactly", async () => {
    const user = userEvent.setup()
    renderModal()
    const button = screen.getByText("Archive entry").closest("button")
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/Type/), "SD-ERR-00")
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/Type/), "1")
    expect(button).toBeEnabled()
  })

  it("archives with the confirmed document ID and calls onSuccess", async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderModal(onSuccess)

    await user.type(screen.getByLabelText(/Type/), "SD-ERR-001")
    await user.click(screen.getByText("Archive entry"))

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledWith({ id: "entry-1", confirmedDocumentId: "SD-ERR-001" }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("calls onCancel when Cancel or the close button is clicked", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderModal(vi.fn(), onCancel)
    await user.click(screen.getByText("Cancel"))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await user.click(screen.getByLabelText("Close"))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
