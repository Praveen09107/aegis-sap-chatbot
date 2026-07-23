import { describe, it, expect } from "vitest"
import { pdf, type DocumentProps } from "@react-pdf/renderer"
import { createElement, type ReactElement } from "react"
import { SessionDocument } from "./SessionDocument"
import type { ChatMessage } from "@/types"

// F03: this project's research flagged @react-pdf/renderer as historically
// lagging major React versions — package.json declares peer support for
// React 19, but a real render is the only thing that actually confirms it
// works under React 19.2.7 / react-dom 19.2.7, not just that npm let the
// install through.
describe("SessionDocument PDF render (@react-pdf/renderer + React 19 compatibility)", () => {
  const messages: ChatMessage[] = [
    { id: "1", role: "user", content: "Getting VL150 when creating a delivery", timestamp: new Date() },
    {
      id: "2",
      role: "assistant",
      content: "VL150 means the delivery quantity exceeds the sales order quantity.",
      timestamp: new Date(),
      confidenceBadge: "green",
      validationScore: 0.91,
      attributionPanel: {
        primary_document_id: "SD-ERR-001",
        primary_document_name: "Delivery error guide",
        verified_by: "admin",
        verified_date: "2026-01-01",
        secondary_sources: [],
        confidence_badge: "green",
        form_entry_id: null,
        screenshots: [],
      },
    },
  ]

  it("renders to a real PDF buffer without throwing", async () => {
    const doc = createElement(SessionDocument, {
      messages,
      topic: "VL150 delivery error",
      exportedAt: new Date("2026-07-19T10:00:00Z"),
    }) as ReactElement<DocumentProps>

    const buffer = await pdf(doc).toBuffer()
    const chunks: Buffer[] = []
    for await (const chunk of buffer) {
      chunks.push(chunk as Buffer)
    }
    const output = Buffer.concat(chunks)

    // A real PDF starts with the "%PDF-" magic bytes and is non-trivial in size.
    expect(output.subarray(0, 5).toString("ascii")).toBe("%PDF-")
    expect(output.length).toBeGreaterThan(500)
  })

  it("renders correctly with zero messages (empty session edge case)", async () => {
    const doc = createElement(SessionDocument, {
      messages: [],
      topic: "Empty session",
      exportedAt: new Date("2026-07-19T10:00:00Z"),
    }) as ReactElement<DocumentProps>

    const buffer = await pdf(doc).toBuffer()
    const chunks: Buffer[] = []
    for await (const chunk of buffer) {
      chunks.push(chunk as Buffer)
    }
    const output = Buffer.concat(chunks)

    expect(output.subarray(0, 5).toString("ascii")).toBe("%PDF-")
  })
})
