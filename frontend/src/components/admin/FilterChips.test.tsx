import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FilterChips } from "./FilterChips"

describe("FilterChips", () => {
  it("renders nothing when there are no chips", () => {
    const { container } = render(<FilterChips chips={[]} onRemove={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders each chip's label and value", () => {
    render(
      <FilterChips
        chips={[
          { id: "module", label: "Module", value: "SD" },
          { id: "badge", label: "Confidence", value: "Green" },
        ]}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByText("SD")).toBeInTheDocument()
    expect(screen.getByText("Green")).toBeInTheDocument()
  })

  it("calls onRemove with the chip's id when its remove button is clicked", async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(<FilterChips chips={[{ id: "module", label: "Module", value: "SD" }]} onRemove={onRemove} />)

    await user.click(screen.getByRole("button", { name: "Remove Module filter" }))
    expect(onRemove).toHaveBeenCalledWith("module")
  })

  it("only shows 'Clear all' when there is more than one chip and onClearAll is provided", () => {
    const { rerender } = render(<FilterChips chips={[{ id: "a", label: "A", value: "1" }]} onRemove={vi.fn()} onClearAll={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Clear all filters" })).not.toBeInTheDocument()

    rerender(
      <FilterChips
        chips={[
          { id: "a", label: "A", value: "1" },
          { id: "b", label: "B", value: "2" },
        ]}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />
    )
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeInTheDocument()
  })

  it("calls onClearAll when clicked", async () => {
    const onClearAll = vi.fn()
    const user = userEvent.setup()
    render(
      <FilterChips
        chips={[
          { id: "a", label: "A", value: "1" },
          { id: "b", label: "B", value: "2" },
        ]}
        onRemove={vi.fn()}
        onClearAll={onClearAll}
      />
    )
    await user.click(screen.getByRole("button", { name: "Clear all filters" }))
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })
})
