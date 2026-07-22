"use client"

import { useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import { ChevronDown, FileText, PenLine, CheckCircle2, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GAP_EXPAND } from "@/lib/animations"
import type { GapEntry } from "@/hooks/queries/adminData"

type Severity = "high" | "medium" | "low"

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; text: string }> = {
  high: { label: "High", dot: "bg-danger", text: "text-danger" },
  medium: { label: "Medium", dot: "bg-warning", text: "text-warning" },
  low: { label: "Low", dot: "bg-text-tertiary", text: "text-text-tertiary" },
}

/**
 * Severity is derived from count_7d — the real /admin/knowledge-gaps
 * response has no computed priority_score (FRONTEND_20 assumed one).
 * Thresholds mirror the spec's own priority_score bands (>6 high, 2-6
 * medium, <2 low), applied to the closest real analog instead.
 */
function getSeverity(count7d: number): Severity {
  if (count7d > 6) return "high"
  if (count7d >= 2) return "medium"
  return "low"
}

interface GapCardProps {
  entry: GapEntry
  onHide: (gapId: string) => void
}

/**
 * A single knowledge-gap cluster card.
 *
 * Adapted (2026-07-22) from FRONTEND_20's spec to the real, clustered
 * /admin/knowledge-gaps response — no last-seen timestamp or module tags
 * exist on this endpoint, so neither is shown here (see GapEntry's doc
 * comment in adminData.ts for the full real-vs-spec'd field reconciliation).
 *
 * Quick Entry integration (IMPL_29): when addressed_by_entry_id is null,
 * offers to create one for this gap; when set, links to the entry that
 * already addresses it.
 */
export function GapCard({ entry, onHide }: GapCardProps) {
  const [expanded, setExpanded] = useState(false)
  const severity = getSeverity(entry.count_7d)
  const config = SEVERITY_CONFIG[severity]

  return (
    <div className="surface-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", config.dot)} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary leading-snug">{entry.gap_description}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-text-tertiary tabular-nums">
            <span className={cn("font-medium", config.text)}>{config.label} severity</span>
            <span>{entry.count_7d} in 7 days</span>
            <span>{entry.count_30d} in 30 days</span>
          </div>
        </div>
      </div>

      {/* Expandable example queries */}
      {entry.example_queries.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            aria-expanded={expanded}
          >
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
            {expanded ? "Hide" : "Show"} example queries ({entry.example_queries.length})
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.ul
                variants={GAP_EXPAND}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden space-y-1 mt-2"
              >
                {entry.example_queries.map((q, i) => (
                  <li key={i} className="text-xs text-text-secondary surface-sunken rounded-lg px-2.5 py-1.5 leading-relaxed">
                    {q}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Quick Entry integration (IMPL_29) */}
      {entry.addressed_by_entry_id ? (
        <Link
          href={`/admin/quick-entry/${entry.addressed_by_entry_id}`}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium",
            "bg-success-bg text-success-text border border-success-border",
            "rounded-full px-2.5 py-1 hover:opacity-80 transition-opacity"
          )}
        >
          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
          Addressed by {entry.addressed_entry_title ?? "a Quick Entry"}
        </Link>
      ) : (
        <Link
          href={`/admin/quick-entry/new?gap_id=${encodeURIComponent(entry.gap_id)}&issue_description=${encodeURIComponent(entry.gap_description)}`}
        >
          <Button variant="outline" size="sm" className="gap-1.5">
            <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
            Create Quick Entry for this gap
          </Button>
        </Link>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-border-primary">
        <Link href="/admin/documents">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            Create document
          </Button>
        </Link>
        <Button variant="ghost" size="sm" className="gap-1.5 ml-auto" onClick={() => onHide(entry.gap_id)}>
          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
          Hide
        </Button>
      </div>
    </div>
  )
}
