import { test, expect } from "@playwright/test"

// F01 scaffold smoke test — proves the Playwright runner is wired correctly
// against a real running dev server. Replaced by real page-level tests as
// each session builds real routes (FRONTEND_VERIFICATION_STANDARDS.md Part 3).
test("scaffold responds and renders the Next.js default page", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.ok()).toBe(true)
  await expect(page).toHaveTitle(/Create Next App|Next\.js/i)
})
