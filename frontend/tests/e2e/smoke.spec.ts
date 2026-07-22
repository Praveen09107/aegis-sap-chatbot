import { test, expect } from "@playwright/test"

// F01's original assertion (title matches the create-next-app scaffold) was
// left stale after F16 deleted the orphaned scaffold page at src/app/page.tsx
// — "/" has rendered the real app since F04, and by F16 the scaffold's own
// route conflict was removed entirely. Updated to prove the Playwright
// runner hits a real running dev server without depending on whether the
// visit lands on "/" itself or gets redirected to "/login" (proxy.ts
// redirects unauthenticated requests) — both share the root layout's
// default document title, since neither is a Server Component and neither
// overrides it.
test("root route responds and renders the real AEGIS app (not the create-next-app scaffold)", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.ok()).toBe(true)
  await expect(page).toHaveTitle(/AEGIS/i)
  await expect(page).not.toHaveTitle(/Create Next App/i)
})
