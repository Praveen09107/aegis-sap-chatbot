import { test, expect } from "@playwright/experimental-ct-react"
import { UploadDropZone } from "@/components/admin/UploadDropZone"
import { DocumentMetadataModal } from "@/components/admin/DocumentMetadataModal"
import { IngestionProgressRow } from "@/components/admin/IngestionProgressRow"
import { StalenessIndicator } from "@/components/admin/StalenessIndicator"
import { InlineEditCell } from "@/components/admin/InlineEditCell"

// F12 — component-level visual baselines for the admin documents and
// registry components (FRONTEND_18_ADMIN_DOCUMENTS.md,
// FRONTEND_19_ADMIN_REGISTRY_CONFIG.md), captured via Playwright CT per the
// pattern established in F04-F11.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and every prior F04-F11 CT spec.
//
// Scope note — deliberately excluded, extending the same reasoning already
// established in f07/f09/f10/f11's own CT specs:
// - documents/page.tsx, registry/page.tsx, config-snapshot/page.tsx: all
//   three call real TanStack Query hooks (useAdminDocuments,
//   useAdminRegistry, useConfigSnapshot) with no QueryClientProvider set up
//   in this project's plain-Vite CT harness — no prior session has ever
//   mounted a full page component for this same reason (see f11's dashboard
//   exclusion). The individual presentational components below (already
//   used by those pages) are the safe, real CT surface.
// - DataTable itself already has its own baseline from F05b
//   (f05b-data-overlay.spec.tsx) — not re-baselined per page here.

test.describe("UploadDropZone", () => {
  test("renders the default (non-dragging) state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "#060B14" }}>
        <UploadDropZone onFileReady={() => {}} />
      </div>
    )
    await expect(component).toHaveScreenshot("upload-drop-zone-default.png")
  })

  test("renders the disabled (uploading) state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "#060B14" }}>
        <UploadDropZone onFileReady={() => {}} uploading />
      </div>
    )
    await expect(component).toHaveScreenshot("upload-drop-zone-uploading.png")
  })
})

test.describe("DocumentMetadataModal", () => {
  test("renders the full module + content-type selection form", async ({ mount }) => {
    const file = new File(["x"], "VL150-guide.pdf", { type: "application/pdf" })
    const component = await mount(
      <div style={{ width: 900, height: 700, background: "#060B14" }}>
        <DocumentMetadataModal file={file} open onOpenChange={() => {}} onUpload={async () => {}} />
      </div>
    )
    await expect(component).toHaveScreenshot("document-metadata-modal.png")
  })
})

test.describe("IngestionProgressRow", () => {
  test("renders the uploading and processing states", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 500, padding: 16, background: "#060B14" }}>
        <IngestionProgressRow filename="SD-Error-Guide-v2.pdf" fileSize={2_400_000} progress={68} />
        <IngestionProgressRow filename="FI-Billing-Guide.pdf" fileSize={1_100_000} progress={100} />
      </div>
    )
    await expect(component).toHaveScreenshot("ingestion-progress-row-states.png")
  })
})

test.describe("StalenessIndicator", () => {
  test("renders Fresh, Aging, and Stale states", async ({ mount }) => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
    const component = await mount(
      <div style={{ display: "flex", gap: 12, padding: 16, background: "#060B14" }}>
        <StalenessIndicator verifiedDate={daysAgo(5)} />
        <StalenessIndicator verifiedDate={daysAgo(40)} />
        <StalenessIndicator verifiedDate={daysAgo(80)} />
      </div>
    )
    await expect(component).toHaveScreenshot("staleness-indicator-states.png")
  })
})

test.describe("InlineEditCell", () => {
  test("renders the static and editing states", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 300, padding: 16, background: "#060B14" }}>
        <InlineEditCell value="30" onSave={async () => {}} />
      </div>
    )
    await expect(component).toHaveScreenshot("inline-edit-cell-static.png")

    await component.getByRole("button", { name: "Edit value: 30" }).click()
    await expect(component).toHaveScreenshot("inline-edit-cell-editing.png")
  })
})
