"use client"

import { useSearchParams } from "next/navigation"
import { QuickEntryForm } from "@/components/admin/quick-entry/QuickEntryForm"

/**
 * Thin wrapper (FRONTEND_37) — QuickEntryForm owns its own full-height
 * layout and header chrome. Reads gap-triggered prefill params from the
 * URL (set by the admin gaps page when creating an entry from a gap).
 */
export default function NewQuickEntryPage() {
  const searchParams = useSearchParams()

  const gapId = searchParams.get("gap_id")
  const issueDescription = searchParams.get("issue_description")
  const sapModule = searchParams.get("module")
  const transactionsParam = searchParams.get("transactions")

  return (
    <QuickEntryForm
      mode="create"
      prefill={{
        gap_id: gapId,
        issue_description: issueDescription,
        module: sapModule,
        transactions: transactionsParam
          ? transactionsParam
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      }}
    />
  )
}
