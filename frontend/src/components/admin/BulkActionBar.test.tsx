import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BulkActionBar } from "./BulkActionBar"

describe("BulkActionBar", () => {
  it("renders nothing when selectedCount is 0", () => {
    render(<BulkActionBar selectedCount={0} actions={[]} onClearSelection={vi.fn()} />)
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument()
  })

  it("shows the selected count and pluralizes correctly", () => {
    const { rerender } = render(<BulkActionBar selectedCount={1} actions={[]} onClearSelection={vi.fn()} />)
    expect(screen.getByText("item selected")).toBeInTheDocument()

    rerender(<BulkActionBar selectedCount={3} actions={[]} onClearSelection={vi.fn()} />)
    expect(screen.getByText("items selected")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("fires each action's onClick when clicked", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkActionBar
        selectedCount={2}
        actions={[{ label: "Deprecate", onClick, variant: "destructive" }]}
        onClearSelection={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Deprecate" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("fires onClearSelection when the clear button is clicked", async () => {
    const onClearSelection = vi.fn()
    const user = userEvent.setup()
    render(<BulkActionBar selectedCount={2} actions={[]} onClearSelection={onClearSelection} />)

    await user.click(screen.getByRole("button", { name: "Clear selection" }))
    expect(onClearSelection).toHaveBeenCalledTimes(1)
  })
})
