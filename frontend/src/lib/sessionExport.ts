/**
 * AEGIS Session PDF Export
 *
 * Exports a chat session as a formatted PDF document, client-side, via
 * @react-pdf/renderer. The actual document layout lives in
 * src/components/pdf/SessionDocument.tsx (FRONTEND_SUPPLEMENT_02's more
 * complete version — confidence-badge styling, page numbers — supersedes
 * the thinner inline version originally spec'd directly in this file).
 *
 * @react-pdf/renderer is ~350KB and used only when a user actually triggers
 * an export, so both it and SessionDocument are imported dynamically inside
 * exportSessionAsPDF() rather than at module top-level (FRONTEND_28_PERFORMANCE.md)
 * — a top-level import would pull the whole renderer into every chunk that
 * merely references this function (SessionContextMenu, chat keyboard shortcuts),
 * none of which need it on initial load.
 */

import { createElement, type ReactElement } from "react"
import type { ChatMessage } from "@/types"
import { LIMITS } from "@/lib/constants"

/**
 * Generate and download a PDF export of a session.
 */
export async function exportSessionAsPDF(messages: ChatMessage[], topic: string): Promise<void> {
  const [{ pdf }, { SessionDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/pdf/SessionDocument"),
  ])

  const exportedAt = new Date()
  // pdf() types its argument as ReactElement<DocumentProps> (i.e. literally
  // <Document>), but SessionDocument is a wrapper component that renders one
  // — a well-known typing friction point with react-pdf's own recommended
  // wrapper-component pattern. Safe: react-pdf's renderer only cares about
  // the eventual rendered <Document> tree, not the element passed in.
  const document = createElement(SessionDocument, {
    messages: messages.slice(0, LIMITS.MAX_SESSION_EXPORT_MESSAGES),
    topic,
    exportedAt,
  }) as ReactElement<import("@react-pdf/renderer").DocumentProps>
  const blob = await pdf(document).toBlob()

  const url = URL.createObjectURL(blob)
  const link = window.document.createElement("a")
  link.href = url
  link.download = `AEGIS-session-${exportedAt.toISOString().slice(0, 10)}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
