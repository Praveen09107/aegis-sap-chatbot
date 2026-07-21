import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HistoryFilters, DEFAULT_FILTERS, type HistoryFilterState } from "./HistoryFilters"

function renderFilters(overrides: Partial<HistoryFilterState> = {}, extraProps: Partial<React.ComponentProps<typeof HistoryFilters>> = {}) {
  const onChange = vi.fn()
  const onClearAll = vi.fn()
  render(
    <HistoryFilters
      filters={{ ...DEFAULT_FILTERS, ...overrides }}
      onChange={onChange}
      onClearAll={onClearAll}
      totalResults={5}
      {...extraProps}
    />
  )
  return { onChange, onClearAll }
}

describe("HistoryFilters", () => {
  it("renders all four filter selects and the unresolved checkbox", () => {
    renderFilters()
    expect(screen.getByLabelText("Module")).toBeInTheDocument()
    expect(screen.getByLabelText("Confidence")).toBeInTheDocument()
    expect(screen.getByLabelText("Date")).toBeInTheDocument()
    expect(screen.getByLabelText("Sort")).toBeInTheDocument()
    expect(screen.getByLabelText("Show unresolved sessions only")).toBeInTheDocument()
  })

  it("calls onChange with the selected module when the Module select changes", async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    await user.selectOptions(screen.getByLabelText("Module"), "SD")
    expect(onChange).toHaveBeenCalledWith({ module: "SD" })
  })

  it("calls onChange with module: null when 'All modules' is re-selected", async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters({ module: "SD" })
    await user.selectOptions(screen.getByLabelText("Module"), "")
    expect(onChange).toHaveBeenCalledWith({ module: null })
  })

  it("calls onChange with the badge value when the Confidence select changes", async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    await user.selectOptions(screen.getByLabelText("Confidence"), "green")
    expect(onChange).toHaveBeenCalledWith({ badge: "green" })
  })

  it("calls onChange with unresolvedOnly: true when the checkbox is checked", async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    await user.click(screen.getByLabelText("Show unresolved sessions only"))
    expect(onChange).toHaveBeenCalledWith({ unresolvedOnly: true })
  })

  it("does not show 'Clear all' when no filters are active", () => {
    renderFilters()
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument()
  })

  it("shows 'Clear all' and calls onClearAll when a filter is active", async () => {
    const user = userEvent.setup()
    const { onClearAll } = renderFilters({ module: "SD" })
    const clearButton = screen.getByText("Clear all")
    expect(clearButton).toBeInTheDocument()
    await user.click(clearButton)
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it("shows the result count with 'matching your filters' when a filter is active", () => {
    renderFilters({ module: "SD" }, { totalResults: 3 })
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText(/matching your filters/)).toBeInTheDocument()
  })

  it("shows 'total' (not 'matching your filters') when no filters are active", () => {
    renderFilters({}, { totalResults: 7 })
    expect(screen.getByText(/total/)).toBeInTheDocument()
  })

  it("shows 'No sessions found' when totalResults is 0", () => {
    renderFilters({}, { totalResults: 0 })
    expect(screen.getByText("No sessions found")).toBeInTheDocument()
  })

  it("hides the result count while isLoading is true", () => {
    renderFilters({}, { isLoading: true, totalResults: 0 })
    expect(screen.queryByText("No sessions found")).not.toBeInTheDocument()
  })
})
