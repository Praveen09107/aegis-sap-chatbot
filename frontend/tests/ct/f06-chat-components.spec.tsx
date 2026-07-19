import { test, expect } from "@playwright/experimental-ct-react"
import { EntityChip } from "@/components/chat/EntityChip"
import { ConfidenceBadge } from "@/components/chat/ConfidenceBadge"
import { UserBubble } from "@/components/chat/UserBubble"
import { MarkdownMessage } from "@/components/chat/MarkdownMessage"
import { ChatEmptyState } from "@/components/chat/ChatEmptyState"
import { FreshnessIndicator } from "@/components/chat/FreshnessIndicator"
import type { ChatMessage } from "@/types"

// F06 — component-level visual baselines for the chat components
// (FRONTEND_08_CHAT_COMPONENTS.md), captured via Playwright CT per the
// pattern established in F04/F05/F05b.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and the F04/F05/F05b CT specs.

test.describe("EntityChip", () => {
  test("renders error/tcode/doc_number variants with distinct colors", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", gap: 8, padding: 16, background: "white" }}>
        <EntityChip type="error_code" value="VL150" showTooltip={false} />
        <EntityChip type="tcode" value="VL01N" showTooltip={false} />
        <EntityChip type="doc_number" value="4500012345" showTooltip={false} />
      </div>
    )
    await expect(component).toHaveScreenshot("entity-chip-variants.png")
  })
})

test.describe("ConfidenceBadge", () => {
  test("renders green/amber/none with scores", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", gap: 8, padding: 16, background: "white" }}>
        <ConfidenceBadge badge="green" score={0.91} showScore showTooltip={false} />
        <ConfidenceBadge badge="amber" score={0.74} showScore showTooltip={false} />
        <ConfidenceBadge badge="none" showTooltip={false} />
      </div>
    )
    await expect(component).toHaveScreenshot("confidence-badge-variants.png")
  })
})

test.describe("UserBubble", () => {
  test("renders a right-aligned message bubble", async ({ mount }) => {
    const message: ChatMessage = {
      id: "1",
      role: "user",
      content: "How do I fix a VL150 error when creating a delivery?",
      timestamp: new Date("2026-07-19T10:00:00Z"),
    }
    const component = await mount(
      <div style={{ padding: 16, background: "#F8FAFC", width: 500 }}>
        <UserBubble message={message} />
      </div>
    )
    await expect(component).toHaveScreenshot("user-bubble.png")
  })
})

test.describe("MarkdownMessage", () => {
  test("renders formatted markdown with entity-highlighted SAP codes", async ({ mount }) => {
    const component = await mount(
      <div className="aegis-prose" style={{ padding: 16, background: "white", width: 500 }}>
        <MarkdownMessage
          content={
            "**VL150** means the delivery quantity exceeds the sales order quantity.\n\nTo fix it:\n\n1. Open `VL01N`\n2. Check the schedule line\n3. Adjust in `MMBE` if needed"
          }
        />
      </div>
    )
    await expect(component).toHaveScreenshot("markdown-message.png")
  })
})

test.describe("ChatEmptyState", () => {
  test("renders branding and suggestion chips", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, height: 500, background: "white" }}>
        <ChatEmptyState onSuggestionClick={() => {}} />
      </div>
    )
    await expect(component).toHaveScreenshot("chat-empty-state.png")
  })
})

test.describe("FreshnessIndicator", () => {
  test("renders fresh/aging/stale states with distinct colors", async ({ mount }) => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
    const component = await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, background: "white" }}>
        <FreshnessIndicator verifiedDate={daysAgo(5)} />
        <FreshnessIndicator verifiedDate={daysAgo(40)} />
        <FreshnessIndicator verifiedDate={daysAgo(80)} />
      </div>
    )
    await expect(component).toHaveScreenshot("freshness-indicator-states.png")
  })
})
