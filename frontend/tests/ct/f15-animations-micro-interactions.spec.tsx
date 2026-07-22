import { test, expect } from "@playwright/experimental-ct-react"
import { PageTransition } from "@/components/shared/PageTransition"

// F15 — component-level visual baseline for this session's one genuinely
// new, screenshot-worthy component (FRONTEND_23_FRAMER_MOTION.md,
// FRONTEND_24_MICRO_INTERACTIONS.md), captured via Playwright CT per the
// pattern established in F04-F14.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and every prior F04-F14 CT spec.
//
// Scope note — this session is mostly an internal refactor (centralizing
// inline motion/react variants into src/lib/animations.ts, extracting
// useCountUp, adding a global <MotionConfig reducedMotion="user">), not new
// visual surface:
// - This project's playwright-ct.config.ts already sets
//   `expect.toHaveScreenshot: { animations: "disabled" }` globally (FRONTEND_
//   VERIFICATION_STANDARDS Part 1) — every CT screenshot, past and future,
//   captures the settled end-state, never mid-transition. That's exactly
//   Part 3's requirement, already satisfied by existing config; nothing new
//   to add here.
// - Because captures are always the settled state, none of the 13
//   components refactored this session (BulkActionBar, GapCard,
//   UploadDropZone, AIResponseBubble, UserBubble, MessageList,
//   RelatedQuestions, ScreenshotDropZone, StreamingProgress,
//   OnboardingModal, HistorySessionCard, CommandPalette,
//   KeyboardShortcutsOverlay) render any differently than before — only
//   their animation *timing* internals changed, not their final DOM/CSS
//   state. Their existing baselines from F06/F07/F09/F10/F11/F13 remain
//   valid; no new screenshots needed.
// - PageTransition.tsx is genuinely new but has no visual signature of its
//   own beyond "whatever children renders" once settled — mounted below
//   mainly to confirm it renders real content through the wrapper, not as
//   a meaningful visual regression baseline.

test.describe("PageTransition", () => {
  test("renders wrapped content", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 500, padding: 16, background: "#060B14" }}>
        <PageTransition>
          <p style={{ color: "#E2E8F0", margin: 0 }}>Page content rendered through PageTransition</p>
        </PageTransition>
      </div>
    )
    await expect(component).toHaveScreenshot("page-transition.png")
  })
})
