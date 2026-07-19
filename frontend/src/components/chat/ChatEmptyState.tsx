"use client"

import { cn } from "@/lib/utils"
import Image from "next/image"
import { orgName } from "@/lib/constants"

interface SuggestionChip {
  module: string
  question: string
}

const SUGGESTIONS: SuggestionChip[] = [
  { module: "SD", question: "How do I fix a VL150 error in VL01N?" },
  { module: "SD", question: "How do I create a scheduling agreement with YDSA?" },
  { module: "FI", question: "What causes the F5201 billing error?" },
  { module: "MM", question: "How do I check stock availability with MMBE?" },
  { module: "MM", question: "What does the MB1A transaction do?" },
  { module: "FI", question: "How do I check the current posting period?" },
]

const MODULE_COLORS: Record<string, string> = {
  SD: "bg-info-bg border-info-border text-info-text",
  FI: "bg-success-bg border-success-border text-success-text",
  MM: "bg-purple-bg border-purple-border text-purple-text",
  HR: "bg-warning-bg border-warning-border text-warning-text",
}

interface ChatEmptyStateProps {
  onSuggestionClick: (question: string) => void
  className?: string
}

/**
 * Initial empty state shown before the first message. Shows AEGIS
 * branding and categorised suggestion chips.
 */
export function ChatEmptyState({ onSuggestionClick, className }: ChatEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-8 p-8 h-full", className)}>
      {/* Brand */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shadow-md">
          <Image
            src="/logo.svg"
            alt={orgName}
            width={32}
            height={32}
            className="object-contain brightness-0 invert"
            onError={(e) => {
              const t = e.target as HTMLImageElement
              t.style.display = "none"
            }}
          />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">AEGIS SAP Intelligence</h1>
          <p className="text-sm text-text-secondary mt-1">Ask about any SAP error, transaction, or procedure</p>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="w-full max-w-lg">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider text-center mb-4">Try asking</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s.question)}
              className={cn(
                "flex items-center gap-2",
                "text-xs rounded-full border px-3 py-1.5",
                "transition-all duration-150 hover:shadow-sm active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                "bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary hover:border-border-secondary"
              )}
            >
              <span className={cn("text-[10px] font-bold rounded px-1 py-0.5 border", MODULE_COLORS[s.module] ?? "bg-bg-tertiary border-border-primary text-text-tertiary")}>
                {s.module}
              </span>
              {s.question}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
