"use client"

import Link from "next/link"
import { MessageSquare, Upload, Settings, ThumbsUp, ThumbsDown } from "lucide-react"
import { cn, formatDateLocalized, toLocalizedDateString, formatScore } from "@/lib/utils"
import type { AuditEntry } from "@/hooks/queries/adminData"

const REQUEST_TYPE_ICON: Record<AuditEntry["request_type"], typeof MessageSquare> = {
  chat: MessageSquare,
  upload: Upload,
  admin: Settings,
}

const CONFIDENCE_DOT: Record<NonNullable<AuditEntry["confidence_badge"]> | "null", string> = {
  green: "bg-success border-success-border",
  amber: "bg-warning border-warning-border",
  none: "bg-danger border-danger-border",
  null: "bg-text-tertiary border-border-primary",
}

/**
 * Groups entries by deployment-timezone calendar day, using
 * formatDateLocalized for the group label (Today/Yesterday, else the
 * localized date) — required by FRONTEND_20 / FRONTEND_SUPPLEMENT_05 Part 3.
 */
function dateGroupLabel(occurredAt: string): string {
  const entryDay = toLocalizedDateString(new Date(occurredAt))
  const todayDay = toLocalizedDateString(new Date())
  const yesterdayDay = toLocalizedDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))

  if (entryDay === todayDay) return "Today"
  if (entryDay === yesterdayDay) return "Yesterday"
  // formatDateLocalized returns "22 Jul 2026, 02:30 PM" — the date-only
  // group label is everything before the comma.
  return formatDateLocalized(occurredAt).split(",")[0].trim()
}

/** Time-of-day only, reusing formatDateLocalized rather than a second Intl call. */
function timeOnly(occurredAt: string): string {
  const parts = formatDateLocalized(occurredAt).split(",")
  return (parts[1] ?? parts[0]).trim()
}

function groupByDate(entries: AuditEntry[]): Array<[string, AuditEntry[]]> {
  const groups: Record<string, AuditEntry[]> = {}
  const order: string[] = []
  for (const entry of entries) {
    const label = dateGroupLabel(entry.occurred_at)
    if (!groups[label]) {
      groups[label] = []
      order.push(label)
    }
    groups[label].push(entry)
  }
  return order.map((label) => [label, groups[label]])
}

interface AuditTimelineRowProps {
  entry: AuditEntry
}

function AuditTimelineRow({ entry }: AuditTimelineRowProps) {
  const RequestIcon = REQUEST_TYPE_ICON[entry.request_type]
  const dotClass = CONFIDENCE_DOT[entry.confidence_badge ?? "null"]

  return (
    <Link
      href={`/?session=${entry.session_id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-lg",
        "hover:bg-bg-secondary transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      )}
    >
      <span className="text-xs text-text-tertiary tabular-nums w-20 shrink-0">{timeOnly(entry.occurred_at)}</span>

      <span className={cn("w-2 h-2 rounded-full border shrink-0", dotClass)} aria-hidden="true" />

      <RequestIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0" aria-hidden="true" />

      <span className="text-xs text-text-secondary font-mono truncate flex-1 min-w-0">{entry.session_id}</span>

      {entry.model_tier !== null && (
        <span className="text-xs text-text-tertiary tabular-nums shrink-0">Tier {entry.model_tier}</span>
      )}

      <span className="text-xs text-text-tertiary tabular-nums shrink-0 w-14 text-right">
        {entry.validation_score !== null ? formatScore(entry.validation_score) : "—"}
      </span>

      {entry.feedback_signal === "positive" && <ThumbsUp className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />}
      {entry.feedback_signal === "negative" && <ThumbsDown className="w-3.5 h-3.5 text-danger shrink-0" aria-hidden="true" />}
    </Link>
  )
}

interface AuditTimelineProps {
  entries: AuditEntry[]
}

/**
 * Timeline view of the admin audit trail, grouped by day.
 *
 * Adapted (2026-07-22) from FRONTEND_20's spec to the real audit_log
 * columns — there is no query_text/response_summary on this table (see
 * AuditEntry's doc comment in adminData.ts), so rows show session/
 * confidence/validation/tier/feedback signal instead of question/answer
 * text, and link through to the session itself for the full detail.
 */
export function AuditTimeline({ entries }: AuditTimelineProps) {
  const groups = groupByDate(entries)

  return (
    <div className="space-y-6">
      {groups.map(([label, groupEntries]) => (
        <div key={label}>
          <p className="section-label mb-2 px-4">{label}</p>
          <div className="space-y-0.5">
            {groupEntries.map((entry) => (
              <AuditTimelineRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
