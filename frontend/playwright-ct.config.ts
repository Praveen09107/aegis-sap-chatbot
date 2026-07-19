import { defineConfig, devices } from "@playwright/experimental-ct-react"
import path from "node:path"

// Component-level visual regression per FRONTEND_VERIFICATION_STANDARDS.md
// Part 3 ("component-level screenshots, not full-page"). Introduced in F04:
// no real page exists yet that renders any of these components in isolation
// (chat/admin pages don't land until F06+), and CT mounts components
// directly without needing one — the standard tool for exactly this gap,
// not a Next.js route invented for testing purposes.
export default defineConfig({
  testDir: "./tests/ct",
  snapshotDir: "./tests/ct/__snapshots__",
  timeout: 10_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
    ctPort: 3100,
    ctViteConfig: {
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "./src"),
        },
      },
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.02 } },
})
