"use client"

import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { MessageSquare, Calendar } from "lucide-react"
import { cn, formatDateLocalized } from "@/lib/utils"
import { ConfidenceBadge } from "@/components/chat/ConfidenceBadge"
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery"
import type { Session } from "@/types"

interface HistorySessionCardProps {
  session: Session
  index: number
}

/**
 * Expanded session card for the history page.
 * Shows more detail than the sidebar's compact SessionCard.
 * Clicking opens the session in the chat interface.
 */
export function HistorySessionCard({ session, index }: HistorySessionCardProps) {
  const router = useRouter()
  const reducedMotion = usePrefersReducedMotion()

  const date = formatDateLocalized(session.updated_at)

  function handleOpen() {
    router.push(`/?session=${session.id}`)
  }

  return (
    <motion.div
      initial={reducedMotion ? {} : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
    >
      <button
        onClick={handleOpen}
        className={cn(
          "w-full text-left",
          "surface-card p-4",
          "hover:shadow-md",
          "transition-all duration-[var(--duration-slow)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
          "group",
          "active:scale-[0.995]"
        )}
        aria-label={`Open session: ${session.topic_summary}`}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Session info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title */}
            <h3 className="text-sm font-semibold text-text-primary leading-snug truncate-2 group-hover:text-accent transition-colors">
              {session.topic_summary}
            </h3>

            {/* Module tags */}
            {session.module_tags.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5">
                {session.module_tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-medium bg-bg-tertiary border border-border-primary text-text-tertiary rounded px-1.5 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Meta row */}
            <div className="flex items-center flex-wrap gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" aria-hidden="true" />
                {session.turn_count} {session.turn_count === 1 ? "turn" : "turns"}
              </span>

              <span className="flex items-center gap-1.5 tabular-nums">
                <Calendar className="w-3 h-3" aria-hidden="true" />
                {date}
              </span>

              {session.is_unresolved && (
                <span className="text-xs font-medium text-warning" aria-label="Session unresolved">
                  ● Unresolved
                </span>
              )}
            </div>
          </div>

          {/* Confidence badge */}
          <div className="shrink-0 mt-0.5">
            <ConfidenceBadge
              badge={session.confidence_badge}
              score={session.avg_confidence_score ?? undefined}
              showScore
              showTooltip={false}
            />
          </div>
        </div>
      </button>
    </motion.div>
  )
}
