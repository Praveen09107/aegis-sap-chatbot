import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DataTable, type AegisColumnDef } from "./DataTable"

interface Row {
  id: string
  name: string
  score: number
}

const columns: AegisColumnDef<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, sortable: true },
  { id: "score", header: "Score", cell: (r) => r.score.toFixed(2) },
]

const rows: Row[] = [
  { id: "1", name: "Alpha", score: 0.9 },
  { id: "2", name: "Bravo", score: 0.8 },
  { id: "3", name: "Charlie", score: 0.7 },
]

describe("DataTable — rendering states", () => {
  it("renders skeleton rows while loading", () => {
    const { container } = render(<DataTable data={[]} columns={columns} keyField="id" isLoading skeletonRows={3} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true")
  })

  it("renders the empty state with title, description, and action", () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        keyField="id"
        emptyTitle="No results"
        emptyDescription="Try a different filter."
        emptyAction={<button>Reset filters</button>}
      />
    )
    expect(screen.getByText("No results")).toBeInTheDocument()
    expect(screen.getByText("Try a different filter.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeInTheDocument()
  })

  it("renders row data", () => {
    render(<DataTable data={rows} columns={columns} keyField="id" />)
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("0.90")).toBeInTheDocument()
  })
})

describe("DataTable — sorting", () => {
  it("cycles asc -> desc -> asc across repeated clicks on the same column", async () => {
    const onSortChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <DataTable data={rows} columns={columns} keyField="id" sortState={null} onSortChange={onSortChange} />
    )

    await user.click(screen.getByRole("button", { name: /Name/ }))
    expect(onSortChange).toHaveBeenLastCalledWith({ column: "name", direction: "asc" })

    rerender(
      <DataTable data={rows} columns={columns} keyField="id" sortState={{ column: "name", direction: "asc" }} onSortChange={onSortChange} />
    )
    await user.click(screen.getByRole("button", { name: /Name/ }))
    expect(onSortChange).toHaveBeenLastCalledWith({ column: "name", direction: "desc" })

    rerender(
      <DataTable data={rows} columns={columns} keyField="id" sortState={{ column: "name", direction: "desc" }} onSortChange={onSortChange} />
    )
    await user.click(screen.getByRole("button", { name: /Name/ }))
    expect(onSortChange).toHaveBeenLastCalledWith({ column: "name", direction: "asc" })
  })

  it("exposes aria-sort on the column header, not the inner button", () => {
    render(
      <DataTable data={rows} columns={columns} keyField="id" sortState={{ column: "name", direction: "asc" }} onSortChange={vi.fn()} />
    )
    const header = screen.getByRole("columnheader", { name: /Name/ })
    expect(header).toHaveAttribute("aria-sort", "ascending")
  })
})

describe("DataTable — selection race conditions", () => {
  // Part 2's race-condition standard: a state-changing action firing while
  // the underlying data is still settling (e.g. a query invalidation
  // refetch resolving after the user already interacted) must not leave
  // the UI showing a stale "all selected" indicator against the new data.
  it("select-all reflects the CURRENT data set, not a stale one, after data changes mid-interaction", () => {
    const onSelectionChange = vi.fn()
    const { rerender } = render(
      <DataTable
        data={rows}
        columns={columns}
        keyField="id"
        selectable
        selectedKeys={new Set(["1", "2", "3"])}
        onSelectionChange={onSelectionChange}
      />
    )

    const selectAllBefore = screen.getByRole("checkbox", { name: "Select all rows" })
    expect(selectAllBefore).toHaveAttribute("data-state", "checked")

    // Simulate a query refetch landing with a 4th row while the same
    // (now-stale) selectedKeys set is still in flight from the parent.
    const refreshedRows = [...rows, { id: "4", name: "Delta", score: 0.6 }]
    rerender(
      <DataTable
        data={refreshedRows}
        columns={columns}
        keyField="id"
        selectable
        selectedKeys={new Set(["1", "2", "3"])}
        onSelectionChange={onSelectionChange}
      />
    )

    // Row 4 isn't selected, so "select all" must now read as indeterminate,
    // not still "checked" against the old 3-row set.
    const selectAllAfter = screen.getByRole("checkbox", { name: "Select all rows" })
    expect(selectAllAfter).toHaveAttribute("data-state", "indeterminate")
  })

  it("toggling a row's checkbox always computes the next set from the latest selectedKeys prop, not a captured stale closure", async () => {
    const onSelectionChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <DataTable data={rows} columns={columns} keyField="id" selectable selectedKeys={new Set()} onSelectionChange={onSelectionChange} />
    )

    await user.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["1"]))

    // Parent applies the update (as a real app would after the callback).
    rerender(
      <DataTable data={rows} columns={columns} keyField="id" selectable selectedKeys={new Set(["1"])} onSelectionChange={onSelectionChange} />
    )
    await user.click(screen.getByRole("checkbox", { name: "Select row 2" }))
    // Must include row 1 (already selected) AND row 2 — not just row 2,
    // which would happen if the handler closed over a stale empty set.
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["1", "2"]))
  })
})

describe("DataTable — pagination", () => {
  it("disables First/Prev on page 1 and Next/Last on the final page", () => {
    const onPageChange = vi.fn()
    const { rerender } = render(
      <DataTable data={rows} columns={columns} keyField="id" pagination={{ page: 1, pageSize: 10, total: 25, onPageChange }} />
    )
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled()

    rerender(<DataTable data={rows} columns={columns} keyField="id" pagination={{ page: 3, pageSize: 10, total: 25, onPageChange }} />)
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled()
  })

  it("shows the correct 'Showing X-Y of Z' summary", () => {
    render(<DataTable data={rows} columns={columns} keyField="id" pagination={{ page: 2, pageSize: 10, total: 25, onPageChange: vi.fn() }} />)
    expect(screen.getByText("11–20")).toBeInTheDocument()
    expect(screen.getByText("25", { exact: false })).toBeInTheDocument()
  })
})

describe("DataTable — keyboard navigation", () => {
  it("Enter on a clickable row fires onRowClick", async () => {
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(<DataTable data={rows} columns={columns} keyField="id" onRowClick={onRowClick} />)

    const firstRow = screen.getAllByRole("button")[0].closest("tr") ?? screen.getByText("Alpha").closest("tr")!
    firstRow.focus()
    await user.keyboard("{Enter}")
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
  })
})
