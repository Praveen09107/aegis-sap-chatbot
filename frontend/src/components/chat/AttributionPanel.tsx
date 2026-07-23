"use client"

import { useState } from "react"
import { FileText, ChevronDown, ChevronRight, Calendar, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScoreBreakdown } from "./ScoreBreakdown"
import { FreshnessIndicator } from "./FreshnessIndicator"
import { AttributionScreenshotsSection } from "./AttributionScreenshotsSection"
import type { AttributionPanel as AttributionPanelType } from "@/types"

interface AttributionPanelProps {
  attribution: AttributionPanelType | null
  /** Overall ValidationScore for this turn — ChatMessage.validationScore. */
  score?: number | null
  isLoading?: boolean
  collapsed?: boolean
  onCollapseToggle?: () => void
  className?: string
}

/**
 * Right-side source attribution panel. Shows on completion of each AI
 * response — updates per turn. Contains: primary document card,
 * freshness, secondary sources, score breakdown.
 *
 * When `collapsed` is true, shows as a 48px icon strip. The collapse
 * toggle lives in the parent (AttributionPanelShell in F07).
 */
export function AttributionPanel({ attribution, score, isLoading = false, className }: AttributionPanelProps) {
  const [secondaryExpanded, setSecondaryExpanded] = useState(false)

  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-4 p-4", className)}>
        <div className="section-label">Source</div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-3 bg-bg-tertiary rounded animate-pulse" style={{ width: `${70 + i * 5}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!attribution) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 p-4 text-center h-32", className)}>
        <FileText className="w-6 h-6 text-text-tertiary opacity-40" />
        <p className="text-xs text-text-tertiary">Source appears after each response</p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Section header */}
      <span className="section-label">Source</span>

      {/* Primary document card */}
      <div className="surface-card p-3 flex gap-3 items-start">
        <div className="w-8 h-8 rounded-lg bg-info-bg border border-info-border flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-info-text" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-text-primary">{attribution.primary_document_id}</p>
          <p className="text-xs text-text-secondary mt-0.5 leading-snug break-words">{attribution.primary_document_name}</p>
        </div>
      </div>

      {/* Document metadata */}
      <div className="flex flex-col gap-2">
        <MetaRow icon={Calendar} label={`Verified ${attribution.verified_date}`} />
        <MetaRow icon={User} label={attribution.verified_by} />
        <FreshnessIndicator verifiedDate={attribution.verified_date} />
      </div>

      <AttributionScreenshotsSection screenshots={attribution.screenshots} />

      {/* Score breakdown */}
      <ScoreBreakdown score={score} />

      {/* Secondary sources */}
      {attribution.secondary_sources.length > 0 && (
        <div>
          <button
            onClick={() => setSecondaryExpanded(!secondaryExpanded)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors w-full"
            aria-expanded={secondaryExpanded}
          >
            {secondaryExpanded ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
            {attribution.secondary_sources.length} additional source{attribution.secondary_sources.length > 1 ? "s" : ""}
          </button>
          {secondaryExpanded && (
            <div className="mt-2 space-y-1.5 pl-4">
              {attribution.secondary_sources.map((src, i) => (
                <div key={i} className="text-xs text-text-tertiary">
                  <span className="font-mono">{src.document_id}</span>
                  <span className="mx-1">·</span>
                  <span>{src.verified_date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetaRow({ icon: Icon, label }: { icon: typeof Calendar; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-text-secondary">
      <Icon className="w-3 h-3 text-text-tertiary shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
