import { defineConfig, devices } from "@playwright/test"

// CI-deterministic from the start, not retrofitted after the first flaky
// run — per FRONTEND_VERIFICATION_STANDARDS.md Part 1. 1440x900 matches
// FRONTEND_34's original resolution choice, preserved not arbitrarily
// changed, since AEGIS is confirmed desktop-only (>=1280px).
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
  ],
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.02 } },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
