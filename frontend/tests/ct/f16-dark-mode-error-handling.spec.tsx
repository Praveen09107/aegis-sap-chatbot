import { test, expect } from "@playwright/experimental-ct-react"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { OfflineBanner } from "@/components/shared/OfflineBanner"

// F16 — component-level visual baselines for the dark mode audit / error
// handling session (FRONTEND_25_DARK_MODE.md, FRONTEND_26_ERROR_HANDLING.md),
// captured via Playwright CT per the pattern established in F04-F15.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and every prior F04-F15 CT spec.
//
// Scope note:
// - FRONTEND_25 (dark mode) was mostly a real-code audit this session, not
//   new components — the confirmed real bug found and fixed (admin layout
//   unconditionally forcing dark mode, ignoring an explicit light
//   preference) has no visual signature of its own to baseline (it's a
//   `setTheme()` call-timing fix, not a rendered element).
// - (employee)/error.tsx and (admin)/error.tsx use next/link — no prior CT
//   spec in this project has ever mounted a next/link-using component
//   (GapCard/AuditTimeline excluded from f13's spec, QuickEntryPipelineHealth
//   from f14's, for the same reason), so not a safe first attempt here.
// - ErrorBoundary's new variant="page" fallback and OfflineBanner's new
//   motion/react animation are both genuinely new, pure, next/link-free —
//   safe to baseline below.

function Bomb(): never {
  throw new Error("Simulated render error for the CT baseline")
}

test.describe("ErrorBoundary", () => {
  test("variant='section' (default) fallback", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 500, padding: 16, background: "#060B14" }}>
        <ErrorBoundary section="metrics panel">
          <Bomb />
        </ErrorBoundary>
      </div>
    )
    await expect(component).toHaveScreenshot("error-boundary-section.png")
  })

  test("variant='page' fallback", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "#060B14" }}>
        <ErrorBoundary section="documents table" variant="page">
          <Bomb />
        </ErrorBoundary>
      </div>
    )
    await expect(component).toHaveScreenshot("error-boundary-page.png")
  })
})

test.describe("OfflineBanner", () => {
  test("renders nothing while online (baseline: empty)", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 500, height: 60, background: "#060B14" }}>
        <OfflineBanner />
      </div>
    )
    await expect(component).toHaveScreenshot("offline-banner-empty.png")
  })
})
