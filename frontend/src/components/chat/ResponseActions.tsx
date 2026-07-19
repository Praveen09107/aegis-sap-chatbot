"use client"

import { useState } from "react"
import { Copy, Check, ThumbsUp, ThumbsDown, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { toastSuccess } from "@/lib/toast"

interface ResponseActionsProps {
  messageContent: string
  onFeedback: (signal: "positive" | "negative") => void
  onRegenerate?: () => void
  feedbackGiven?: "positive" | "negative" | null
  canRegenerate?: boolean
  className?: string
}

/**
 * Hover toolbar shown below AI response bubbles. Revealed on group-hover —
 * invisible at rest, visible on message hover.
 *
 * Actions:
 * - Copy: copies message content to clipboard
 * - Thumbs up: positive feedback to backend
 * - Thumbs down: negative feedback, creates review item
 * - Regenerate: re-sends last query (shown for amber/none badges only)
 */
export function ResponseActions({ messageContent, onFeedback, onRegenerate, feedbackGiven, canRegenerate = false, className }: ResponseActionsProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(messageContent)
    setCopied(true)
    toastSuccess("Copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn("flex items-center gap-1", "opacity-0 group-hover:opacity-100", "transition-opacity duration-150", className)}
      role="toolbar"
      aria-label="Message actions"
    >
      {/* Copy */}
      <ActionButton onClick={handleCopy} label={copied ? "Copied" : "Copy message"} active={copied}>
        {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
      </ActionButton>

      {/* Thumbs up */}
      <ActionButton onClick={() => onFeedback("positive")} label="Helpful" active={feedbackGiven === "positive"} disabled={!!feedbackGiven}>
        <ThumbsUp className={cn("w-3.5 h-3.5", feedbackGiven === "positive" ? "text-success fill-success" : "")} />
      </ActionButton>

      {/* Thumbs down */}
      <ActionButton
        onClick={() => onFeedback("negative")}
        label="Not helpful — flag for review"
        active={feedbackGiven === "negative"}
        disabled={!!feedbackGiven}
      >
        <ThumbsDown className={cn("w-3.5 h-3.5", feedbackGiven === "negative" ? "text-danger fill-danger" : "")} />
      </ActionButton>

      {/* Regenerate (only for amber/none confidence) */}
      {canRegenerate && onRegenerate && (
        <ActionButton onClick={onRegenerate} label="Try different approach">
          <RefreshCw className="w-3.5 h-3.5" />
        </ActionButton>
      )}
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  label,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "w-6 h-6 rounded-md flex items-center justify-center",
        "text-text-tertiary",
        "transition-all duration-100",
        "hover:text-text-primary hover:bg-bg-secondary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        "disabled:opacity-40 disabled:pointer-events-none",
        active && "text-text-primary bg-bg-secondary"
      )}
    >
      {children}
    </button>
  )
}
