import { test, expect } from "@playwright/experimental-ct-react"
import { useEffect } from "react"
import { MultiTabWarningBanner } from "@/components/shared/MultiTabWarningBanner"
import { ComposeBar } from "@/components/chat/ComposeBar"
import { useUIStore } from "@/stores/uiStore"

// F09 — component-level visual baselines for the employee chat interface
// (FRONTEND_12_EMPLOYEE_CHAT.md, FRONTEND_13_EMPLOYEE_CHAT_FEATURES.md,
// FRONTEND_SUPPLEMENT_05_PRODUCTION_HARDENING.md), captured via Playwright CT
// per the pattern established in F04-F07.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and every prior F04-F07 CT spec.
//
// Scope note: MessageList, AIResponseBubble, ChatInterface, and the
// (employee)/page.tsx route are deliberately NOT included here, for the same
// reasons already established in f07-layout.spec.tsx's own scope note.
// AIResponseBubble (and therefore MessageList, which renders it) uses
// next/image for the AEGIS avatar mark — never exercised in a CT mount by
// any prior session, and unverifiable here since screenshot capture is
// already blocked. ChatInterface depends on useWebSocket (a real hook that
// would attempt a real WebSocket connection on render) and useSubmitFeedback
// (needs a live QueryClientProvider) — neither is meaningful to mount in
// isolation. useWebSocket.ts's exported initMultiTabDetection function and
// the WebSocket message-handling logic itself are functional, not visual,
// and are already covered by useWebSocket.test.tsx's 25 unit tests instead.
//
// ComposeBar's pendingScreenshot/screenshotPreviewUrl states are also
// skipped here: rendering a screenshot preview mounts ScreenshotThumbnail,
// which itself uses next/image — the same excluded dependency.

function BannerVisible() {
  // MultiTabWarningBanner has no props of its own — it reads uiStore
  // directly, and is normally driven by a real BroadcastChannel message
  // from another tab (see useWebSocket.ts's initMultiTabDetection). There's
  // no way to simulate that from outside the mounted component, so this
  // thin wrapper sets the same store state the real trigger would, from
  // inside the mounted tree (in-browser, not from the Node-side test
  // script, since CT mounts run in a real browser with independent module
  // state from the test runner).
  useEffect(() => {
    useUIStore.setState({ multiTabWarning: true })
    return () => useUIStore.setState({ multiTabWarning: false })
  }, [])
  return <MultiTabWarningBanner />
}

test.describe("MultiTabWarningBanner", () => {
  test("renders nothing when only one tab is open", async ({ mount }) => {
    const component = await mount(
      <div style={{ background: "white", minHeight: 40 }}>
        <MultiTabWarningBanner />
      </div>
    )
    await expect(component).toHaveScreenshot("multi-tab-warning-hidden.png")
  })

  test("renders the informational banner when another tab is detected", async ({ mount }) => {
    const component = await mount(
      <div style={{ background: "white" }}>
        <BannerVisible />
      </div>
    )
    await expect(component).toHaveScreenshot("multi-tab-warning-visible.png")
  })
})

test.describe("ComposeBar", () => {
  test("renders the idle empty state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, background: "white" }}>
        <ComposeBar
          value=""
          onChange={() => {}}
          onSend={() => {}}
          onAttachClick={() => {}}
          onRemoveScreenshot={() => {}}
          streamingState="idle"
          pendingScreenshot={null}
          screenshotPreviewUrl={null}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("compose-bar-idle.png")
  })

  test("renders the live SAP entity detection preview (SUPPLEMENT_05-adjacent feature)", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, background: "white" }}>
        <ComposeBar
          value="Getting a VL150 error in VL01N when posting delivery 4500012345"
          onChange={() => {}}
          onSend={() => {}}
          onAttachClick={() => {}}
          onRemoveScreenshot={() => {}}
          streamingState="idle"
          pendingScreenshot={null}
          screenshotPreviewUrl={null}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("compose-bar-entity-preview.png")
  })

  test("renders the waiting-for-response (streaming) state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, background: "white" }}>
        <ComposeBar
          value=""
          onChange={() => {}}
          onSend={() => {}}
          onAttachClick={() => {}}
          onRemoveScreenshot={() => {}}
          streamingState="streaming"
          pendingScreenshot={null}
          screenshotPreviewUrl={null}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("compose-bar-streaming.png")
  })

  test("renders the disabled state (no active session)", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, background: "white" }}>
        <ComposeBar
          value=""
          onChange={() => {}}
          onSend={() => {}}
          onAttachClick={() => {}}
          onRemoveScreenshot={() => {}}
          streamingState="idle"
          pendingScreenshot={null}
          screenshotPreviewUrl={null}
          disabled
        />
      </div>
    )
    await expect(component).toHaveScreenshot("compose-bar-disabled.png")
  })
})
