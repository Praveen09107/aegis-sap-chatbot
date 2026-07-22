import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

// F17 — FRONTEND_VERIFICATION_STANDARDS.md Part 4: zero axe-core violations
// is a hard CI gate, not a warning, at WCAG 2.2 AA (not FRONTEND_27's
// originally-specified 2.1 AA — 2.2 is current practice, confirmed in
// FRONTEND_RECONCILIATION_FINDINGS.md Finding 3). F17 explicitly extends this
// gate app-wide instead of per-page (as each earlier session's own spec
// scoped it) — this file now covers every route that exists, not just the
// root layout the original F02 version checked.
//
// NOTE: could not be executed in the sandbox this was authored in — the same
// Playwright browser-binary limitation disclosed in
// tests/e2e/design-tokens.spec.ts and tests/e2e/security.spec.ts
// (libnspr4/libasound2 need sudo, unavailable here). The authenticated
// routes additionally need a live Keycloak with the seeded test users this
// project provisions via scripts/setup_keycloak.py. Run for real once on a
// machine with `sudo npx playwright install-deps` done and the Docker stack
// (including aegis-keycloak) reachable.

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

const EMPLOYEE_USERNAME = process.env.AEGIS_E2E_USERNAME ?? "employee1"
const EMPLOYEE_PASSWORD = process.env.AEGIS_E2E_PASSWORD ?? "Employee@123"
const ADMIN_USERNAME = process.env.AEGIS_E2E_ADMIN_USERNAME ?? "itadmin1"
const ADMIN_PASSWORD = process.env.AEGIS_E2E_ADMIN_PASSWORD ?? "ITAdmin@123"

async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Username").fill(username)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL((url) => url.pathname !== "/login")
}

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  expect(results.violations).toEqual([])
}

test.describe("accessibility — unauthenticated (WCAG 2.2 AA)", () => {
  test("login page has zero violations", async ({ page }) => {
    await page.goto("/login")
    await expectNoA11yViolations(page)
  })
})

test.describe("accessibility — employee portal (WCAG 2.2 AA)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, EMPLOYEE_USERNAME, EMPLOYEE_PASSWORD)
  })

  test("chat page ('/') has zero violations", async ({ page }) => {
    await page.goto("/")
    await expectNoA11yViolations(page)
  })

  test("session history page has zero violations", async ({ page }) => {
    await page.goto("/history")
    await expectNoA11yViolations(page)
  })
})

test.describe("accessibility — admin portal (WCAG 2.2 AA)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_USERNAME, ADMIN_PASSWORD)
  })

  // Mirrors ADMIN_NAV_ITEMS (src/lib/constants.ts) — every route reachable
  // from the admin sidebar, not a hand-picked subset.
  const ADMIN_ROUTES = [
    "/admin/dashboard",
    "/admin/documents",
    "/admin/registry",
    "/admin/config-snapshot",
    "/admin/knowledge-gaps",
    "/admin/audit-trail",
    "/admin/review-queue",
    "/admin/tickets",
    "/admin/system-health",
    "/admin/analytics",
  ]

  for (const route of ADMIN_ROUTES) {
    test(`${route} has zero violations`, async ({ page }) => {
      await page.goto(route)
      await expectNoA11yViolations(page)
    })
  }
})
