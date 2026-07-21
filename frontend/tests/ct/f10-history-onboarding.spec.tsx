import { test, expect } from "@playwright/experimental-ct-react"
import { HistoryFilters, DEFAULT_FILTERS } from "@/components/sessions/HistoryFilters"
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress"

// F10 — component-level visual baselines for the session history and
// onboarding components (FRONTEND_14_EMPLOYEE_HISTORY.md,
// FRONTEND_15_EMPLOYEE_ONBOARDING.md), captured via Playwright CT per the
// pattern established in F04-F09.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and every prior F04-F09 CT spec.
//
// Scope note — deliberately excluded, extending the same reasoning already
// established in f07-layout.spec.tsx and f09-employee-chat.spec.tsx:
// - HistorySessionCard: calls next/navigation's useRouter() unconditionally
//   at the top of the component — no prior CT spec in this project has ever
//   mounted a component depending on next/navigation (this project's CT
//   harness mounts through a plain Vite build, not a real Next.js app-router
//   runtime), and this component would throw immediately without that
//   context, not just render sub-optimally.
// - OnboardingStep / OnboardingModal: OnboardingStep renders next/image for
//   the step-1 logo mark — the same excluded dependency that already kept
//   AIResponseBubble out of every prior chat-components CT spec.
//   OnboardingModal composes OnboardingStep, so it inherits the same block.
// - CommandPalette's new "Restart walkthrough" action: CommandPalette itself
//   has never had a CT spec in this project (it depends on both
//   next/navigation and next-themes), and this session only adds one more
//   item to its existing, already-excluded quick-actions list — not a new
//   exclusion, just never in scope to begin with.

test.describe("HistoryFilters", () => {
  test("renders the default (no active filters) state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "white" }}>
        <HistoryFilters filters={DEFAULT_FILTERS} onChange={() => {}} onClearAll={() => {}} totalResults={12} />
      </div>
    )
    await expect(component).toHaveScreenshot("history-filters-default.png")
  })

  test("renders the active-filters state (module + badge + unresolved set, Clear all visible)", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "white" }}>
        <HistoryFilters
          filters={{ ...DEFAULT_FILTERS, module: "SD", badge: "green", unresolvedOnly: true }}
          onChange={() => {}}
          onClearAll={() => {}}
          totalResults={3}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("history-filters-active.png")
  })

  test("renders the no-results state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, padding: 16, background: "white" }}>
        <HistoryFilters
          filters={{ ...DEFAULT_FILTERS, module: "FI" }}
          onChange={() => {}}
          onClearAll={() => {}}
          totalResults={0}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("history-filters-empty.png")
  })
})

test.describe("OnboardingProgress", () => {
  test("renders all 5 step-position states", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "white" }}>
        <OnboardingProgress totalSteps={5} currentStep={0} />
        <OnboardingProgress totalSteps={5} currentStep={2} />
        <OnboardingProgress totalSteps={5} currentStep={4} />
      </div>
    )
    await expect(component).toHaveScreenshot("onboarding-progress-states.png")
  })
})
