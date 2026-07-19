import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test-tooling output, not source — added when setting up
    // FRONTEND_VERIFICATION_STANDARDS.md's Part 1 tooling.
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    // Vite's build cache for Playwright Component Testing (F04) — bundled
    // vendor JS, not source.
    "playwright/.cache/**",
  ]),
]);

export default eslintConfig;
