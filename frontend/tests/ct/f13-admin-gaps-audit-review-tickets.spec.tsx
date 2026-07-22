import { test, expect } from "@playwright/experimental-ct-react"
import { ClaimHighlighter } from "@/components/admin/ClaimHighlighter"
import { ReviewItemList } from "@/components/admin/ReviewItemList"
import { ReviewItemDetail } from "@/components/admin/ReviewItemDetail"
import { KanbanColumn } from "@/components/admin/KanbanColumn"
import type { ReviewItem } from "@/hooks/queries/adminData"

// F13 — component-level visual baselines for the admin knowledge-gaps,
// audit-trail, review-queue, and tickets components
// (FRONTEND_20_ADMIN_GAPS_AUDIT.md, FRONTEND_21_ADMIN_REVIEW_TICKETS.md),
// captured via Playwright CT per the pattern established in F04-F12.
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and every prior F04-F12 CT spec.
//
// Scope note — deliberately excluded, extending the same reasoning already
// established in f11/f12's own CT specs:
// - GapCard / AuditTimeline: both use next/link, whose prefetch behavior
//   depends on next/navigation's app-router context in some Next versions —
//   no prior CT spec in this project has ever mounted a next/link-using
//   component (GapEventsList was excluded from f11's CT spec for the exact
//   same reason), so not a safe first attempt here either.
// - knowledge-gaps/page.tsx, audit-trail/page.tsx, review-queue/page.tsx,
//   tickets/page.tsx: all call real TanStack Query hooks with no
//   QueryClientProvider set up in this project's plain-Vite CT harness — no
//   prior session has ever mounted a full page component for this same
//   reason (see f11's dashboard / f12's documents-registry exclusions).
// - KanbanCard/KanbanColumn use @dnd-kit's useSortable/useDroppable, which
//   fall back to safe default context values outside a DndContext ancestor
//   (confirmed via this session's own vitest unit tests) — a real,
//   supported usage pattern, not an unproven one like next/link above.

const reviewItem: ReviewItem = {
  id: "rq1",
  query_text: "How do I fix VL150 in VL01N?",
  answer_text: "The VL150 error occurs when available safety stock is insufficient.",
  unsupported_claims: ["available safety stock is insufficient"],
  status: "pending",
  created_at: "2026-07-20T10:00:00Z",
}

test.describe("ClaimHighlighter", () => {
  test("renders text with an unsupported claim highlighted", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 600, padding: 16, background: "#060B14" }}>
        <ClaimHighlighter
          text="The VL150 error occurs when available safety stock is insufficient."
          claims={["available safety stock is insufficient"]}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("claim-highlighter.png")
  })
})

test.describe("ReviewItemList", () => {
  test("renders the queue list with an active item and shortcut hints", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 288, height: 500, background: "#060B14" }}>
        <ReviewItemList
          items={[
            { ...reviewItem, id: "rq1", query_text: "How do I fix VL150 in VL01N?" },
            { ...reviewItem, id: "rq2", query_text: "F5201 posting period error" },
          ]}
          currentIndex={0}
          onSelect={() => {}}
          totalPending={2}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("review-item-list.png")
  })
})

test.describe("ReviewItemDetail", () => {
  test("renders the full detail pane with a highlighted claim", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, height: 600, background: "#060B14" }}>
        <ReviewItemDetail
          item={reviewItem}
          currentIndex={0}
          totalItems={3}
          correctionText=""
          onCorrectionTextChange={() => {}}
          onApprove={() => {}}
          onSkip={() => {}}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("review-item-detail.png")
  })

  test("renders the empty (no item selected) state", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 700, height: 300, background: "#060B14" }}>
        <ReviewItemDetail
          item={null}
          currentIndex={0}
          totalItems={0}
          correctionText=""
          onCorrectionTextChange={() => {}}
          onApprove={() => {}}
          onSkip={() => {}}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("review-item-detail-empty.png")
  })
})

test.describe("KanbanCard / KanbanColumn", () => {
  test("renders a column with tickets", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 320, padding: 16, background: "#060B14" }}>
        <KanbanColumn
          id="open"
          title="Open"
          tickets={[
            {
              ticket_id: "TKT-20260722-abcd1234",
              created_at: "2024-03-28T09:00:00Z",
              user_id_hash: "hash1",
              query_text: "VL150 error won't clear in VL01N",
              reason: "Employee escalated after 3 unresolved AI responses",
              status: "open",
              resolution_notes: null,
            },
          ]}
          onCardClick={() => {}}
        />
      </div>
    )
    await expect(component).toHaveScreenshot("kanban-column.png")
  })

  test("renders an empty column", async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 320, padding: 16, background: "#060B14" }}>
        <KanbanColumn id="resolved" title="Resolved" tickets={[]} onCardClick={() => {}} />
      </div>
    )
    await expect(component).toHaveScreenshot("kanban-column-empty.png")
  })
})
