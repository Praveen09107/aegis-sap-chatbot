import { test, expect } from "@playwright/experimental-ct-react"
import { SessionCard } from "@/components/sessions/SessionCard"
import { SessionSidebar } from "@/components/sessions/SessionSidebar"
import { AttributionPanelShell } from "@/components/chat/AttributionPanelShell"
import type { Session } from "@/types"

// F07 — component-level visual baselines for the layout/session components
// (FRONTEND_09_LAYOUT_COMPONENTS.md), captured via Playwright CT per the
// pattern established in F04/F05/F05b/F06.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and the F04/F05/F05b/F06 CT specs.
//
// Scope note: EmployeeTopbar, AdminNav, AdminTopbar, and both (employee)/
// (admin) layout.tsx files are deliberately NOT included here. This
// project's Playwright CT harness (playwright-ct.config.ts) mounts
// components through a plain Vite build, not a real Next.js app-router
// runtime — no prior F04-F06 CT spec has ever exercised next/navigation
// (usePathname/useRouter), next/image, or next-themes inside a CT mount,
// and all four of those components depend on at least one of them. Since
// screenshot capture is already blocked in this sandbox, there's no way to
// verify here whether such a mount would actually work in a real browser;
// forcing it in would be an unverified first attempt at something every
// prior session has consistently scoped out. SessionCard, SessionSidebar,
// and AttributionPanelShell only depend on the real Zustand stores (which
// work standalone, no provider needed) and plain React, so they're safe.

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    user_id_hash: "h1",
    topic_summary: "VL150 delivery quantity exceeds sales order",
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    turn_count: 4,
    avg_confidence_score: 0.91,
    confidence_badge: "green",
    module_tags: ["SD"],
    is_pinned: false,
    is_unresolved: false,
    ...overrides,
  }
}

test.describe("SessionCard", () => {
  test("renders default, active, and pinned states", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16, background: "white", width: 220 }}>
        <SessionCard session={makeSession()} isActive={false} isPinned={false} onSelect={() => {}} />
        <SessionCard
          session={makeSession({ id: "s2", topic_summary: "MIGO goods receipt posting error" })}
          isActive
          isPinned={false}
          onSelect={() => {}}
        />
        <SessionCard
          session={makeSession({ id: "s3", avg_confidence_score: 0.6, topic_summary: "Low-confidence unresolved query" })}
          isActive={false}
          isPinned
          onSelect={() => {}}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("session-card-states.png")
  })

  // F09 addition — isSelectDisabled (SUPPLEMENT_05-adjacent: a session can't
  // be switched to mid-stream, since that would silently abandon the
  // in-flight response in the currently active session).
  test("renders the select-disabled state", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "white", width: 220 }}>
        <SessionCard
          session={makeSession({ topic_summary: "Another session, unavailable mid-stream" })}
          isActive={false}
          isPinned={false}
          isSelectDisabled
          onSelect={() => {}}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("session-card-select-disabled.png")
  })
})

test.describe("SessionSidebar", () => {
  test("renders a populated session list", async ({ mount }) => {
    const component = await mount(
      <div style={{ height: 500, background: "white" }}>
        <SessionSidebar
          sessions={[
            makeSession({ id: "s1", topic_summary: "VL150 delivery quantity exceeds sales order" }),
            makeSession({ id: "s2", topic_summary: "MIGO goods receipt posting error", avg_confidence_score: 0.74 }),
          ]}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("session-sidebar-populated.png")
  })

  test("renders the empty state with no sessions", async ({ mount }) => {
    const component = await mount(
      <div style={{ height: 500, background: "white" }}>
        <SessionSidebar sessions={[]} />
      </div>
    )
    await expect(component).toHaveScreenshot("session-sidebar-empty.png")
  })

  test("renders the loading skeleton", async ({ mount }) => {
    const component = await mount(
      <div style={{ height: 500, background: "white" }}>
        <SessionSidebar sessions={[]} isLoading />
      </div>
    )
    await expect(component).toHaveScreenshot("session-sidebar-loading.png")
  })
})

test.describe("AttributionPanelShell", () => {
  test("renders the expanded panel with no attribution yet ('no sources' state)", async ({ mount }) => {
    // panelStore's initial `collapsed` value is read from real browser
    // localStorage at module load, so it isn't deterministic across CT
    // runs — the toggle button drives it to a known state instead of
    // relying on whatever the store happened to start with.
    const component = await mount(
      <div style={{ height: 400, width: 220, background: "white" }}>
        <AttributionPanelShell />
      </div>
    )
    const toggle = component.getByRole("button", { name: /source panel/i })
    if ((await toggle.getAttribute("aria-label")) === "Collapse source panel") {
      // already expanded — nothing to do
    } else {
      await toggle.click()
    }
    await expect(component).toHaveScreenshot("attribution-panel-shell-expanded.png")
  })

  test("renders the collapsed icon strip", async ({ mount }) => {
    const component = await mount(
      <div style={{ height: 400, width: 60, background: "white" }}>
        <AttributionPanelShell />
      </div>
    )
    const toggle = component.getByRole("button", { name: /source panel/i })
    if ((await toggle.getAttribute("aria-label")) === "Expand source panel") {
      // already collapsed — nothing to do
    } else {
      await toggle.click()
    }
    await expect(component).toHaveScreenshot("attribution-panel-shell-collapsed.png")
  })
})
