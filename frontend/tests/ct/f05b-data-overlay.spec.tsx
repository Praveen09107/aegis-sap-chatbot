import { test, expect } from "@playwright/experimental-ct-react"
import { DataTable, type ColumnDef } from "@/components/admin/DataTable"
import { MetricCard, MetricCardGrid } from "@/components/admin/MetricCard"
import { BulkActionBar } from "@/components/admin/BulkActionBar"
import { EmptyState } from "@/components/admin/EmptyState"
import { FilterChips } from "@/components/admin/FilterChips"
import { ChartTooltip } from "@/components/admin/charts/ChartTooltip"
import { FileText, Archive } from "lucide-react"

// F05b — component-level visual baselines for the data/overlay components
// (FRONTEND_06_DATA_COMPONENTS.md, FRONTEND_07_OVERLAY_COMPONENTS.md),
// captured via Playwright CT per the pattern established in F04/F05.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and the F04/F05 CT specs.

interface Row {
  id: string
  name: string
  score: number
}

const columns: ColumnDef<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, sortable: true },
  { id: "score", header: "Score", cell: (r) => r.score.toFixed(2) },
]

const rows: Row[] = [
  { id: "1", name: "SD-ERR-001", score: 0.91 },
  { id: "2", name: "MM-ERR-014", score: 0.76 },
]

test.describe("DataTable", () => {
  test("renders with data, sort state, and selection", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "white", width: 500 }}>
        <DataTable
          data={rows}
          columns={columns}
          keyField="id"
          selectable
          selectedKeys={new Set(["1"])}
          sortState={{ column: "name", direction: "asc" }}
          aria-label="Registry"
        />
      </div>
    )
    await expect(component).toHaveScreenshot("data-table-with-data.png")
  })

  test("loading skeleton state", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "white", width: 500 }}>
        <DataTable data={[]} columns={columns} keyField="id" isLoading skeletonRows={3} />
      </div>
    )
    await expect(component).toHaveScreenshot("data-table-loading.png")
  })

  test("empty state", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "white", width: 500 }}>
        <DataTable data={[]} columns={columns} keyField="id" emptyTitle="No registry entries" emptyDescription="Upload documents to auto-generate entries." />
      </div>
    )
    await expect(component).toHaveScreenshot("data-table-empty.png")
  })
})

test.describe("MetricCardGrid", () => {
  test("renders a 4-card KPI row with distinct colors and trends", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "#F8FAFC" }}>
        <MetricCardGrid>
          <MetricCard label="Queries today" value={247} format="integer" animateCount={false} trend={{ value: "up 18%", direction: "up" }} />
          <MetricCard label="Avg score" value={0.87} format="score" color="green" animateCount={false} />
          <MetricCard label="Green rate" value={0.71} format="percentage" color="green" animateCount={false} />
          <MetricCard
            label="Open tickets"
            value={12}
            format="integer"
            color="amber"
            animateCount={false}
            trend={{ value: "3 new", direction: "up", upIsPositive: false }}
          />
        </MetricCardGrid>
      </div>
    )
    await expect(component).toHaveScreenshot("metric-card-grid.png")
  })
})

test.describe("BulkActionBar", () => {
  test("renders with count and actions when rows are selected", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, height: 120, background: "white", position: "relative" }}>
        <BulkActionBar
          selectedCount={3}
          onClearSelection={() => {}}
          actions={[
            { label: "Deprecate", icon: <Archive className="w-3.5 h-3.5" />, onClick: () => {}, variant: "destructive" },
            { label: "Export CSV", onClick: () => {} },
          ]}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("bulk-action-bar.png")
  })
})

test.describe("EmptyState", () => {
  test("page and inline variants", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", flexDirection: "column", background: "white", width: 400 }}>
        <EmptyState icon={FileText} title="No documents uploaded yet" description="Upload SAP documentation to start." variant="page" />
        <EmptyState title="No items match your filters" variant="inline" />
      </div>
    )
    await expect(component).toHaveScreenshot("empty-state-variants.png")
  })
})

test.describe("FilterChips", () => {
  test("renders active filters with remove buttons", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "white" }}>
        <FilterChips
          chips={[
            { id: "module", label: "Module", value: "SD" },
            { id: "badge", label: "Confidence", value: "Green" },
          ]}
          onRemove={() => {}}
          onClearAll={() => {}}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("filter-chips.png")
  })
})

test.describe("ChartTooltip", () => {
  test("renders a multi-series tooltip", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "#F8FAFC" }}>
        <ChartTooltip
          active
          label="Mon"
          payload={[
            { name: "green", value: 0.847, color: "#10B981" },
            { name: "amber", value: 0.12, color: "#F59E0B" },
          ]}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("chart-tooltip.png")
  })
})
