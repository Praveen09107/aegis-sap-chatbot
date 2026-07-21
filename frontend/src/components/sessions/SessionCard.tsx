"use client"

import { cn } from "@/lib/utils"
import { Pin } from "lucide-react"
import { SessionContextMenu } from "./SessionContextMenu"
import type { Session } from "@/types"

interface SessionCardProps {
  session: Session
  isActive: boolean
  isPinned: boolean
  /** True while a response is streaming in a different session — switching mid-stream would abandon it silently. */
  isSelectDisabled?: boolean
  onSelect: () => void
}

/**
 * Individual session list item in the sidebar.
 * Shows: topic title (truncated), turn count, avg quality indicator.
 * Active session: white card with left accent border.
 * Hover: reveals pin indicator and context menu trigger.
 */
export function SessionCard({ session, isActive, isPinned, isSelectDisabled = false, onSelect }: SessionCardProps) {
  const handleSelect = () => {
    if (!isSelectDisabled) onSelect()
  }
  const qualityColor =
    session.avg_confidence_score == null
      ? "bg-border-primary"
      : session.avg_confidence_score >= 0.85
      ? "bg-success"
      : session.avg_confidence_score >= 0.70
      ? "bg-warning"
      : "bg-danger"

  const avgPercent =
    session.avg_confidence_score != null
      ? `${Math.round(session.avg_confidence_score * 100)}%`
      : null

  return (
    <SessionContextMenu session={session} isPinned={isPinned}>
      <div
        role="listitem"
        onClick={handleSelect}
        tabIndex={isSelectDisabled ? -1 : 0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? handleSelect() : null)}
        className={cn(
          "group relative mx-1.5 my-0.5 rounded-lg",
          "px-2.5 py-2",
          "transition-all duration-[var(--duration-normal)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
          isSelectDisabled
            ? "pointer-events-none opacity-60"
            : "cursor-pointer",
          isActive
            ? [
                "bg-bg-card border border-border-primary shadow-sm",
                "border-l-2 border-l-accent",
              ]
            : !isSelectDisabled && "hover:bg-bg-card hover:border hover:border-border-primary",
        )}
        aria-current={isActive ? "page" : undefined}
        aria-label={
          isSelectDisabled
            ? `Session: ${session.topic_summary} (unavailable until the current response completes)`
            : `Session: ${session.topic_summary}`
        }
        title={isSelectDisabled ? "Wait for the current response to complete" : undefined}
      >
        {/* Pin indicator (shown when pinned) */}
        {isPinned && (
          <Pin
            className="absolute top-2 right-2 w-2.5 h-2.5 text-text-tertiary opacity-60"
            aria-label="Pinned"
          />
        )}

        {/* Title */}
        <p className="text-xs font-medium text-text-primary leading-snug pr-4 truncate-2">
          {session.topic_summary}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className={cn("w-1.5 h-1.5 rounded-full shrink-0", qualityColor)}
            aria-hidden="true"
          />
          <span className="text-xs text-text-tertiary truncate">
            {session.turn_count} {session.turn_count === 1 ? "turn" : "turns"}
            {avgPercent && ` · ${avgPercent}`}
          </span>
        </div>
      </div>
    </SessionContextMenu>
  )
}
