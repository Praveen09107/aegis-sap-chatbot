"use client"

import { useEffect, useState } from "react"
import { useDebounce } from "@/hooks/useDebounce"
import { validateReference } from "@/hooks/queries/quickEntry"

interface CrossReferenceResult {
  exists: boolean
  title: string | null
  source_type: "form_entry" | "document" | null
}

/**
 * Debounced wrapper around GET /api/admin/knowledge-entries/validate-reference,
 * used by Procedure's common_errors.see_document_id and Config's
 * related_errors.see_document_id fields — both set reference_validated from
 * this hook's result before submit, matching the real backend's own field.
 */
export function useCrossReferenceCheck(docId: string) {
  const debouncedDocId = useDebounce(docId, 400)
  // Only ever set from the async fetch's own resolution (an external
  // system update, the compliant effect pattern) — never synchronously in
  // the effect body itself. "checking" / "idle" are derived below by
  // comparing debouncedDocId against which id this state was last checked
  // for, not tracked as their own state.
  const [checked, setChecked] = useState<{ docId: string; result: CrossReferenceResult } | null>(null)

  useEffect(() => {
    if (!debouncedDocId) return
    let cancelled = false
    validateReference(debouncedDocId)
      .then((r) => {
        if (!cancelled) setChecked({ docId: debouncedDocId, result: r })
      })
      .catch(() => {
        if (!cancelled) setChecked({ docId: debouncedDocId, result: { exists: false, title: null, source_type: null } })
      })
    return () => {
      cancelled = true
    }
  }, [debouncedDocId])

  if (!debouncedDocId) return { status: "idle" as const, result: null }
  if (checked?.docId === debouncedDocId) return { status: "done" as const, result: checked.result }
  return { status: "checking" as const, result: null }
}
