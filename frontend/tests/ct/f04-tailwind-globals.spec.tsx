import { test, expect } from "@playwright/experimental-ct-react"

// F04 — component-level visual baselines for the new @layer components /
// @utility classes added to globals.css (FRONTEND_03_TAILWIND_GLOBALS.md
// Part 1), captured via Playwright Component Testing since no real page
// renders these yet. Light and dark are separate mounts (.dark class on a
// wrapper), matching the CSS variable system's own dark-mode mechanism —
// not next-themes, which isn't present in this bare CT context.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts (libnspr4/libasound2 need sudo,
// unavailable here). Run `npx playwright test -c playwright-ct.config.ts
// --update-snapshots` once on a machine with `sudo npx playwright
// install-deps` already done, to generate the real baseline images.

test.describe("SAP entity chips (light)", () => {
  test("chip-error / chip-tcode / chip-docnum render with distinct semantic colors", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", gap: 8, padding: 16, background: "white" }}>
        <span className="chip-error">VL150</span>
        <span className="chip-tcode">VL01N</span>
        <span className="chip-docnum">4500012345</span>
      </div>
    )
    await expect(component).toHaveScreenshot("chips-light.png")
  })
})

test.describe("SAP entity chips (dark)", () => {
  test("chips remain legible against the dark admin surface", async ({ mount }) => {
    const component = await mount(
      <div className="dark" style={{ display: "flex", gap: 8, padding: 16, background: "#060B14" }}>
        <span className="chip-error">VL150</span>
        <span className="chip-tcode">VL01N</span>
        <span className="chip-docnum">4500012345</span>
      </div>
    )
    await expect(component).toHaveScreenshot("chips-dark.png")
  })
})

test.describe("surface classes", () => {
  test("surface-card / surface-elevated / surface-sunken render with distinct shadow/bg tiers", async ({
    mount,
  }) => {
    const component = await mount(
      <div style={{ display: "flex", gap: 12, padding: 16, background: "#F8FAFC" }}>
        <div className="surface-card" style={{ width: 120, height: 60 }} />
        <div className="surface-elevated" style={{ width: 120, height: 60 }} />
        <div className="surface-sunken" style={{ width: 120, height: 60 }} />
      </div>
    )
    await expect(component).toHaveScreenshot("surfaces-light.png")
  })
})

test.describe("aegis-prose", () => {
  test("renders paragraph/list/code formatting for AI chat messages", async ({ mount }) => {
    const component = await mount(
      <div className="aegis-prose" style={{ width: 360, padding: 16, background: "white" }}>
        <p>
          VL150 means the delivery quantity exceeds the <strong>sales order</strong> quantity.
        </p>
        <ol>
          <li>Open VA02</li>
          <li>Check the schedule line</li>
        </ol>
        <p>
          Run <code>VL01N</code> to retry.
        </p>
      </div>
    )
    await expect(component).toHaveScreenshot("aegis-prose.png")
  })
})

test.describe("status badges", () => {
  test("status-healthy/degraded/unhealthy/unknown are visually distinct", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", gap: 8, padding: 16, background: "#060B14" }} className="dark">
        <span className="status-healthy chip-base">healthy</span>
        <span className="status-degraded chip-base">degraded</span>
        <span className="status-unhealthy chip-base">unhealthy</span>
        <span className="status-unknown chip-base">unknown</span>
      </div>
    )
    await expect(component).toHaveScreenshot("status-badges-dark.png")
  })
})

test.describe("metric display", () => {
  test("metric-value / metric-label render the admin KPI number style", async ({ mount }) => {
    const component = await mount(
      <div className="dark" style={{ padding: 16, background: "#060B14", width: 160 }}>
        <div className="metric-value" style={{ color: "white" }}>
          847
        </div>
        <div className="metric-label">Queries today</div>
      </div>
    )
    await expect(component).toHaveScreenshot("metric-display-dark.png")
  })
})
