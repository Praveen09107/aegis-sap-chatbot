import { test, expect } from "@playwright/test"

// F03 — FRONTEND_VERIFICATION_STANDARDS.md Part 6 (security). Exercises the
// real login flow end to end: /login form submit → /api/auth/login →
// Keycloak ROPC exchange → HttpOnly cookies set on the response.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts (libnspr4/libasound2 need sudo, unavailable
// here) — and this spec additionally needs a live Keycloak instance with a
// real test user provisioned, which the sandbox also does not have running.
// The equivalent assertions are verified in-process (no browser, no Keycloak
// dependency) against the real route handlers in:
//   src/app/api/auth/login/route.test.ts
//   src/app/api/auth/refresh/route.test.ts
//   src/app/api/auth/set-token/route.test.ts
// Run this file for real once on a machine with `sudo npx playwright
// install-deps` done and a reachable aegis-keycloak with a test user.

const TEST_USERNAME = process.env.AEGIS_E2E_USERNAME ?? "test.employee"
const TEST_PASSWORD = process.env.AEGIS_E2E_PASSWORD ?? "test-password"

test.describe("auth security (F03)", () => {
  test("no JWT fragment ever lands in localStorage or sessionStorage after login", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Username").fill(TEST_USERNAME)
    await page.getByLabel("Password").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await page.waitForURL((url) => url.pathname !== "/login")

    const storage = await page.evaluate(() => ({
      ls: { ...localStorage },
      ss: { ...sessionStorage },
    }))
    // "eyJ" is the base64 encoding of '{"' — the start of every JWT segment.
    expect(JSON.stringify(storage)).not.toContain("eyJ")
  })

  test("access_token and refresh_token cookies are HttpOnly and SameSite=Lax; user_role is not HttpOnly", async ({
    page,
    context,
  }) => {
    await page.goto("/login")
    await page.getByLabel("Username").fill(TEST_USERNAME)
    await page.getByLabel("Password").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await page.waitForURL((url) => url.pathname !== "/login")

    const cookies = await context.cookies()
    const access = cookies.find((c) => c.name === "access_token")
    const refresh = cookies.find((c) => c.name === "refresh_token")
    const role = cookies.find((c) => c.name === "user_role")

    expect(access?.httpOnly).toBe(true)
    expect(access?.sameSite).toBe("Lax")
    expect(refresh?.httpOnly).toBe(true)
    expect(refresh?.sameSite).toBe("Lax")
    expect(role?.httpOnly).toBe(false)
  })

  test("logout clears all three auth cookies", async ({ page, context }) => {
    await page.goto("/login")
    await page.getByLabel("Username").fill(TEST_USERNAME)
    await page.getByLabel("Password").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await page.waitForURL((url) => url.pathname !== "/login")

    await page.evaluate(async () => {
      await fetch("/api/auth/set-token", { method: "DELETE" })
    })

    const cookies = await context.cookies()
    expect(cookies.find((c) => c.name === "access_token")).toBeUndefined()
    expect(cookies.find((c) => c.name === "refresh_token")).toBeUndefined()
    expect(cookies.find((c) => c.name === "user_role")).toBeUndefined()
  })
})
