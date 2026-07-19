import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmDialog } from "./ConfirmDialog"

describe("ConfirmDialog", () => {
  it("opens the dialog when the trigger is clicked, showing title and description", async () => {
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        trigger={<button>Deprecate document</button>}
        title="Deprecate SD-ERR-001?"
        description="This action cannot be undone."
        onConfirm={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Deprecate document" }))

    expect(await screen.findByText("Deprecate SD-ERR-001?")).toBeInTheDocument()
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument()
  })

  it("calls onConfirm when the confirm action is clicked", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        trigger={<button>Delete</button>}
        title="Delete?"
        description="Cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />
    )

    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it("does not call onConfirm when cancelled", async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog trigger={<button>Delete</button>} title="Delete?" description="Cannot be undone." onConfirm={onConfirm} />
    )

    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(await screen.findByRole("button", { name: "Cancel" }))

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("shows a loading state while onConfirm is in flight and disables the confirm button", async () => {
    let resolveConfirm: () => void = () => {}
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve
        })
    )
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        trigger={<button>Delete</button>}
        title="Delete?"
        description="Cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />
    )

    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    // The nested Spinner's own aria-label="Loading" folds into the button's
    // computed accessible name, so query by visible text instead.
    const processingText = await screen.findByText("Processing...")
    const processingButton = processingText.closest("button")
    expect(processingButton).toBeDisabled()

    resolveConfirm()
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })
})
