import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

// Real coverage thresholds, not aspirational ones — per
// FRONTEND_VERIFICATION_STANDARDS.md Part 1. Branches lower than the rest
// deliberately: conditional rendering branches (loading/error/empty states)
// are the hardest to hit 100% and least worth forcing; the other three
// numbers are the real bar.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    passWithNoTests: true,
    // tests/e2e/** is Playwright's own test directory (real end-to-end specs
    // using Playwright's test()/expect(), not Vitest's) — excluded here so
    // Vitest's default *.spec.ts glob doesn't try to run them as unit tests.
    exclude: ["node_modules/**", "tests/e2e/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "src/components/ui/**", // shadcn-generated primitives, not hand-authored application code
        "**/*.config.*",
        "**/*.d.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
})
