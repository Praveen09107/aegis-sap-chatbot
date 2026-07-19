import { test, expect } from "@playwright/test"

// F02 visual baseline — globals.css token rendering, both themes.
// Per FRONTEND_VERIFICATION_STANDARDS.md Part 3: component-level (not
// full-page) screenshots, animations disabled globally (playwright.config.ts),
// baselines committed to git as real test artifacts.
//
// NOTE: could not be executed in the sandbox this was authored in — Playwright's
// browser binaries downloaded correctly but the system shared libraries they
// need (libnspr4, libasound2, etc.) require sudo, unavailable there (see F01's
// own report). Run `npx playwright test --update-snapshots` once on a machine
// with `sudo npx playwright install-deps` already done, to generate the real
// baseline images this test then compares future runs against.

test.describe("design tokens (F02)", () => {
  test("root layout renders with correct light-mode token values", async ({ page }) => {
    await page.goto("/")

    const body = page.locator("body")
    await expect(body).toHaveCSS("background-color", "rgb(255, 255, 255)") // --bg-primary light
    await expect(body).toHaveScreenshot("root-layout-light.png")
  })

  test("root layout renders with correct dark-mode token values", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() => document.documentElement.classList.add("dark"))

    const body = page.locator("body")
    await expect(body).toHaveCSS("background-color", "rgb(6, 11, 20)") // --bg-primary dark (navy-900)
    await expect(body).toHaveScreenshot("root-layout-dark.png")
  })

  test("Geist font families are actually applied, not falling back silently", async ({ page }) => {
    await page.goto("/")
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    expect(bodyFont).toContain("Geist")
  })

  test("orgName resolves in the page metadata description, never a hardcoded company name", async ({ page }) => {
    await page.goto("/")
    const description = await page.locator('meta[name="description"]').getAttribute("content")
    expect(description).not.toContain("Sona Comstar")
    expect(description).toMatch(/^SAP ERP Helpdesk AI — .+/)
  })
})
