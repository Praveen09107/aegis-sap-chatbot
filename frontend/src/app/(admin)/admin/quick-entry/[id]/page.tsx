"use client"

import { useParams } from "next/navigation"
import { QuickEntryForm } from "@/components/admin/quick-entry/QuickEntryForm"

/** Thin wrapper (FRONTEND_37) — QuickEntryForm owns its own layout and data fetching. */
export default function EditQuickEntryPage() {
  const params = useParams<{ id: string }>()
  return <QuickEntryForm mode="edit" entryId={params.id} />
}
