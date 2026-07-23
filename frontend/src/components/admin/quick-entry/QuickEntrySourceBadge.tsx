export function QuickEntrySourceBadge({ sourceType }: { sourceType: "form_entry" | "document" }) {
  if (sourceType === "form_entry") {
    return (
      <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-accent-subtle text-accent">
        Quick Entry
      </span>
    )
  }
  return (
    <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
      Document
    </span>
  )
}
