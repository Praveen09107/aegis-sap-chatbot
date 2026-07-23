import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QuickEntryFilters } from "./QuickEntryFilters"

const baseProps = {
  search: "",
  onSearchChange: vi.fn(),
  moduleFilter: "",
  onModuleChange: vi.fn(),
  typeFilter: "",
  onTypeChange: vi.fn(),
  statusFilter: "",
  onStatusChange: vi.fn(),
  includeArchived: false,
  onIncludeArchivedChange: vi.fn(),
  hasActiveFilters: false,
  onClearFilters: vi.fn(),
  resultCount: 12,
  isFetching: false,
}

describe("QuickEntryFilters", () => {
  it("calls onSearchChange as the admin types", async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(<QuickEntryFilters {...baseProps} onSearchChange={onSearchChange} />)
    await user.type(screen.getByLabelText("Search Quick Entries"), "x")
    expect(onSearchChange).toHaveBeenCalledWith("x")
  })

  it("shows the result count", () => {
    render(<QuickEntryFilters {...baseProps} />)
    expect(screen.getByText("12 results")).toBeInTheDocument()
  })

  it("does not show a clear-filters button when there are no active filters", () => {
    render(<QuickEntryFilters {...baseProps} />)
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument()
  })

  it("shows and wires up the clear-filters button when filters are active", async () => {
    const user = userEvent.setup()
    const onClearFilters = vi.fn()
    render(<QuickEntryFilters {...baseProps} hasActiveFilters onClearFilters={onClearFilters} />)
    await user.click(screen.getByText("Clear filters"))
    expect(onClearFilters).toHaveBeenCalled()
  })

  it("calls onIncludeArchivedChange when the archived checkbox is toggled", async () => {
    const user = userEvent.setup()
    const onIncludeArchivedChange = vi.fn()
    render(<QuickEntryFilters {...baseProps} onIncludeArchivedChange={onIncludeArchivedChange} />)
    await user.click(screen.getByRole("checkbox"))
    expect(onIncludeArchivedChange).toHaveBeenCalledWith(true)
  })
})
