import { test, expect } from "@playwright/experimental-ct-react"
import { FileText } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { AdminStatRow } from "@/components/admin/AdminStatRow"
import { AdminEmptyPage } from "@/components/admin/AdminEmptyPage"
import { DashboardRefreshIndicator } from "@/components/admin/DashboardRefreshIndicator"
import { RetrievalModeChart } from "@/components/admin/charts/RetrievalModeChart"

// F11 — component-level visual baselines for the admin shell and dashboard
// (FRONTEND_16_ADMIN_SHELL.md, FRONTEND_17_ADMIN_DASHBOARD.md), captured via
// Playwright CT per the pattern established in F04-F10.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and every prior F04-F10 CT spec.
//
// Scope note — deliberately excluded, extending the same reasoning already
// established in f07/f09/f10's own CT specs:
// - ValidationScoreChart / ConfidenceDistChart: both call next-themes's
//   useTheme() unconditionally — no prior CT spec in this project has ever
//   mounted a component depending on next-themes (CommandPalette was
//   excluded from every prior chat/shell CT spec for the same reason).
// - GapEventsList: uses next/link, whose prefetch behavior depends on
//   next/navigation's app-router context in some Next versions — untested
//   in this project's plain-Vite CT harness in any prior session, so not a
//   safe first attempt here either.
// - AdminPageWrapper: a bare padding/max-width div with no visual shape of
//   its own worth baselining in isolation — its effect is already visible
//   in AdminEmptyPage's baseline below, which wraps it.
// - dashboard/page.tsx itself: composes ValidationScoreChart/
//   ConfidenceDistChart/GapEventsList (all excluded above) plus
//   next/navigation's useRouter — inherits every exclusion above.

test.describe("AdminPageHeader", () => {
  test("renders title, description, and actions", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "#060B14" }}>
        <AdminPageHeader
          title="Documents"
          description="Manage the SAP knowledge base documents"
          actions={
            <button
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                background: "#06B6D4",
                color: "white",
                border: "none",
                fontSize: 13,
              }}
            >
              Upload document
            </button>
          }
        />
      </div>
    )
    await expect(component).toHaveScreenshot("admin-page-header.png")
  })
})

test.describe("AdminStatRow", () => {
  test("renders a mixed-color stat row", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "#060B14" }}>
        <AdminStatRow
          stats={[
            { label: "Active", value: 47, color: "green" },
            { label: "Deprecated", value: 12 },
            { label: "Processing", value: 3, color: "info" },
            { label: "Failed", value: 1, color: "red" },
          ]}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("admin-stat-row.png")
  })

  test("renders the loading skeleton state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "#060B14" }}>
        <AdminStatRow stats={[{ label: "Active", value: 47 }, { label: "Deprecated", value: 12 }]} isLoading />
      </div>
    )
    await expect(component).toHaveScreenshot("admin-stat-row-loading.png")
  })
})

test.describe("AdminEmptyPage", () => {
  test("renders the full page-level empty state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 900, height: 500, background: "#060B14" }}>
        <AdminEmptyPage
          title="Documents"
          icon={FileText}
          emptyTitle="No documents uploaded yet"
          emptyDescription="Upload SAP documentation to start training the knowledge base."
        />
      </div>
    )
    await expect(component).toHaveScreenshot("admin-empty-page.png")
  })
})

test.describe("DashboardRefreshIndicator", () => {
  test("renders the just-updated state", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "#060B14" }}>
        <DashboardRefreshIndicator dataUpdatedAt={Date.now()} />
      </div>
    )
    await expect(component).toHaveScreenshot("dashboard-refresh-indicator.png")
  })
})

test.describe("RetrievalModeChart", () => {
  test("renders all 4 mode rows with real percentages", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 400, padding: 16, background: "#060B14" }}>
        <RetrievalModeChart modeA={0.15} modeB={0.51} modeC={0.07} cacheHitRate={0.34} />
      </div>
    )
    await expect(component).toHaveScreenshot("retrieval-mode-chart.png")
  })

  test("renders the loading skeleton state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 400, padding: 16, background: "#060B14" }}>
        <RetrievalModeChart modeA={0} modeB={0} modeC={0} cacheHitRate={0} isLoading />
      </div>
    )
    await expect(component).toHaveScreenshot("retrieval-mode-chart-loading.png")
  })
})
