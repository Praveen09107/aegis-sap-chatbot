"use client"

import Link from "next/link"
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatFileSize, formatScore, formatDateLocalized } from "@/lib/utils"
import type { PipelineHealthData, KnowledgeEntrySummary } from "@/hooks/queries/adminHealth"

const BADGE_CONFIG = {
  green: { icon: CheckCircle2, bg: "bg-success-bg border-success-border", text: "text-success-text", label: "Nominal" },
  amber: { icon: AlertTriangle, bg: "bg-warning-bg border-warning-border", text: "text-warning-text", label: "Needs attention" },
  red: { icon: XCircle, bg: "bg-danger-bg border-danger-border", text: "text-danger-text", label: "Critical" },
} as const

interface StatGroupProps {
  title: string
  stats: Array<{ label: string; value: number }>
}

function StatGroup({ title, stats }: StatGroupProps) {
  return (
    <div>
      <p className="section-label mb-2">{title}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {stats.map(({ label, value }) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tabular-nums text-text-primary">{value}</span>
            <span className="text-xs text-text-tertiary">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface QuickEntryPipelineHealthProps {
  data: PipelineHealthData | undefined
  attentionEntries: KnowledgeEntrySummary[]
  isLoading?: boolean
  className?: string
}

/**
 * Quick Entry ingestion pipeline health section — added below the Docker
 * service grid on the System Health page (IMPL_29's own addendum to
 * FRONTEND_22, now wired to the real /api/admin/knowledge-entries/
 * pipeline-health endpoint confirmed live as of DEC-059/060).
 *
 * Adapted from the addendum's assumed layout: there is no Quick-Entry-vs-
 * Document quality comparison in the real response (only quick_entry_avg_score
 * exists — no document-side score to compare against), and storage is
 * converted from raw bytes to a human-readable size client-side. The
 * "entries needing attention" list is a real addition (not in the original
 * addendum) — sourced from the knowledge-entries list endpoint's embedded
 * feedback_summary, since no aggregate feedback endpoint exists. Links to
 * /admin/quick-entry/{id} 404 today (that page is F19's scope, not yet
 * built) — same disclosed-gap pattern as F13's GapCard Quick Entry links.
 */
export function QuickEntryPipelineHealth({ data, attentionEntries, isLoading, className }: QuickEntryPipelineHealthProps) {
  if (isLoading || !data) {
    return (
      <div className={cn("surface-card p-4 space-y-4", className)}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  const badge = BADGE_CONFIG[data.badge]
  const BadgeIcon = badge.icon

  return (
    <div className={cn("surface-card p-4 space-y-5", className)}>
      {/* Header + badge */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Quick Entry pipeline</p>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2.5 py-1", badge.bg, badge.text)}>
          <BadgeIcon className="w-3.5 h-3.5" aria-hidden="true" />
          {badge.label}
        </span>
      </div>

      {/* Row 1: ARQ queue depths + avg processing time */}
      <StatGroup
        title="ARQ queues"
        stats={[
          { label: "form entries pending", value: data.arq_queues.form_entry_queue_pending },
          { label: "screenshots pending", value: data.arq_queues.screenshot_queue_pending },
        ]}
      />
      {data.arq_queues.avg_processing_seconds !== null && (
        <p className="text-xs text-text-tertiary -mt-3">
          Avg processing time (24h): <span className="font-semibold text-text-secondary tabular-nums">{data.arq_queues.avg_processing_seconds.toFixed(1)}s</span>
        </p>
      )}

      {/* Row 2: Entry status distribution */}
      <StatGroup
        title="Entry status"
        stats={[
          { label: "active", value: data.entry_status.active },
          { label: "draft", value: data.entry_status.draft },
          { label: "processing", value: data.entry_status.processing },
          { label: "failed", value: data.entry_status.failed },
          { label: "partial index", value: data.entry_status.partial_index },
          { label: "review required", value: data.entry_status.review_required },
        ]}
      />

      {/* Row 3: Screenshot vision status distribution */}
      <StatGroup
        title="Screenshot vision status"
        stats={[
          { label: "complete", value: data.screenshot_status.complete },
          { label: "processing", value: data.screenshot_status.processing },
          { label: "pending", value: data.screenshot_status.pending },
          { label: "failed", value: data.screenshot_status.failed },
          { label: "not SAP", value: data.screenshot_status.not_sap },
        ]}
      />

      {/* Row 4 + 5 + 6: Quality, feedback, storage */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="section-label mb-1.5">Avg quality score</p>
          <p className="text-sm font-semibold tabular-nums text-text-primary">
            {data.knowledge_quality.quick_entry_avg_score !== null ? formatScore(data.knowledge_quality.quick_entry_avg_score) : "—"}
          </p>
        </div>
        <div>
          <p className="section-label mb-1.5">Net negative feedback (30d)</p>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              data.feedback.entries_with_net_negative_feedback_30d > 0 ? "text-danger" : "text-text-primary"
            )}
          >
            {data.feedback.entries_with_net_negative_feedback_30d}
          </p>
        </div>
        <div>
          <p className="section-label mb-1.5">Screenshot storage</p>
          <p className="text-sm font-semibold tabular-nums text-text-primary">
            {formatFileSize(data.storage.screenshot_storage_bytes)}
            <span className="text-xs font-normal text-text-tertiary ml-1.5">({data.storage.eligible_for_cleanup} eligible for cleanup)</span>
          </p>
        </div>
      </div>

      {/* Entries needing attention */}
      {attentionEntries.length > 0 && (
        <div>
          <p className="section-label mb-2">Entries needing attention</p>
          <div className="space-y-1" role="list">
            {attentionEntries.map((entry) => (
              <Link
                key={entry.id}
                href={`/admin/quick-entry/${entry.id}`}
                role="listitem"
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2 rounded-lg",
                  "hover:bg-bg-secondary transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                )}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{entry.issue_title}</p>
                  <p className="text-[11px] text-text-tertiary">
                    {entry.module} ·{" "}
                    {entry.feedback_summary.last_negative_at ? formatDateLocalized(entry.feedback_summary.last_negative_at) : "—"}
                  </p>
                </div>
                <span className="text-xs font-semibold text-danger tabular-nums shrink-0">{entry.feedback_summary.net}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
