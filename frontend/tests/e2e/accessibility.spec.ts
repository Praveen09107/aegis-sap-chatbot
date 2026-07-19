import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

// F02 axe-core gate on the root layout — per
// FRONTEND_VERIFICATION_STANDARDS.md Part 4: zero violations is a hard CI
// gate, not a warning, at WCAG 2.2 AA (not the original spec's 2.1 AA —
// 2.2 is current practice, confirmed in FRONTEND_RECONCILIATION_FINDINGS.md
// Finding 3). Same sandbox execution caveat as design-tokens.spec.ts.
test("root layout has zero WCAG 2.2 AA violations — accessibility", async ({ page }) => {
  await page.goto("/")

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()

  expect(results.violations).toEqual([])
})
