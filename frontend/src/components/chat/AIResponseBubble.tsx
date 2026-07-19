"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { MarkdownMessage } from "./MarkdownMessage"
import { ConfidenceBadge } from "./ConfidenceBadge"
import { StreamingCursor } from "./StreamingCursor"
import { StreamingProgress } from "./StreamingProgress"
import { ResponseActions } from "./ResponseActions"
import { RelatedQuestions } from "./RelatedQuestions"
import type { ChatMessage, StreamingState } from "@/types"

interface AIResponseBubbleProps {
  message: ChatMessage
  streamingState?: StreamingState
  onFeedback: (messageId: string, signal: "positive" | "negative") => void
  onRelatedQuestion?: (question: string) => void
  onRegenerate?: (messageId: string) => void
  /** Related questions to show below high-confidence responses */
  relatedQuestions?: string[]
  className?: string
}

/**
 * AI response bubble — the flagship AEGIS UI element.
 *
 * Visual system:
 * - Left border (confidence aura): green / amber / border-color (streaming/none)
 * - AEGIS avatar mark + label + streaming progress
 * - Content: MarkdownMessage renders the model's markdown, with SAP entity
 *   chips composed into its text nodes (see MarkdownMessage's own docs for
 *   the sanitization approach — this is real LLM output, treated as an XSS
 *   surface, not markup we control)
 * - Streaming cursor: shown while streaming, removed on complete
 * - Metadata row: ConfidenceBadge + attribution ref + ResponseActions
 * - Related questions: shown on high-confidence responses
 *
 * States:
 * - Streaming: shows cursor, no badge, aura-streaming border
 * - Complete (green): green aura, badge, attribution, response actions
 * - Complete (amber): amber aura, badge, regenerate button shown
 * - Complete (none): danger aura, badge with "escalated" message
 *
 * @example
 * <AIResponseBubble
 *   message={msg}
 *   streamingState={chatStore.streamingState}
 *   onFeedback={(id, signal) => sendFeedback(id, signal)}
 * />
 */
export function AIResponseBubble({
  message,
  streamingState = "complete",
  onFeedback,
  onRelatedQuestion,
  onRegenerate,
  relatedQuestions = [],
  className,
}: AIResponseBubbleProps) {
  const [feedbackGiven, setFeedbackGiven] = useState<"positive" | "negative" | null>(null)
  const reducedMotion = useReducedMotion()

  const isStreaming = ["thinking", "retrieving", "generating", "streaming", "validating"].includes(streamingState)
  const badge = message.confidenceBadge
  const score = message.validationScore

  // Confidence aura class — left border of the bubble
  const auraClass = isStreaming
    ? "aura-streaming"
    : badge === "green"
      ? "aura-green"
      : badge === "amber"
        ? "aura-amber"
        : badge === "none"
          ? "aura-danger"
          : "aura-none"

  // Attribution reference string
  const attrRef = message.attributionPanel
    ? `${message.attributionPanel.primary_document_id} · ${message.attributionPanel.verified_date} · ${message.attributionPanel.verified_by}`
    : null

  function handleFeedback(signal: "positive" | "negative") {
    setFeedbackGiven(signal)
    onFeedback(message.id, signal)
  }

  return (
    <motion.div
      className={cn("flex flex-col items-start gap-1.5 group", className)}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      role="listitem"
    >
      {/* AEGIS identity row */}
      <div className="flex items-center gap-2 pl-0.5">
        {/* A mark */}
        <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center shrink-0" aria-hidden="true">
          <Image
            src="/logo.svg"
            alt=""
            width={12}
            height={12}
            className="object-contain brightness-0 invert"
            onError={(e) => {
              const t = e.target as HTMLImageElement
              t.style.display = "none"
              const span = document.createElement("span")
              span.className = "text-white font-bold text-[9px]"
              span.textContent = "A"
              t.parentElement?.appendChild(span)
            }}
          />
        </div>
        <span className="text-xs font-semibold text-text-tertiary">AEGIS</span>
        {/* Streaming stage indicator */}
        {isStreaming && <StreamingProgress state={streamingState} />}
      </div>

      {/* Response bubble */}
      <div
        className={cn(
          // Layout
          "w-full max-w-[92%]",
          // Shape
          "rounded-2xl rounded-tl-sm",
          // Colors
          "bg-bg-card border border-border-primary",
          // Confidence aura (left border)
          auraClass,
          // Padding
          "px-4 py-3"
        )}
      >
        {/* Message content */}
        <div className="aegis-prose">
          {message.content ? (
            <MarkdownMessage content={message.content} />
          ) : isStreaming ? (
            // Empty content during early streaming — just show cursor
            <span className="text-text-tertiary text-sm">{streamingState === "thinking" ? "..." : ""}</span>
          ) : null}
          {/* Streaming cursor — shown while actively streaming tokens */}
          {streamingState === "streaming" && <StreamingCursor />}
        </div>
      </div>

      {/* Metadata row — shown after completion */}
      {!isStreaming && (badge || attrRef) && (
        <motion.div
          className="flex items-center flex-wrap gap-2 pl-0.5"
          initial={reducedMotion ? {} : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          {badge && <ConfidenceBadge badge={badge} score={score} showScore showTooltip />}
          {attrRef && <span className="text-xs text-text-tertiary tabular-nums">{attrRef}</span>}
          <ResponseActions
            messageContent={message.content}
            onFeedback={handleFeedback}
            feedbackGiven={feedbackGiven}
            onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
            canRegenerate={badge === "amber" || badge === "none"}
            className="ml-auto"
          />
        </motion.div>
      )}

      {/* Related questions — shown for green badge responses */}
      {!isStreaming && badge === "green" && relatedQuestions.length > 0 && onRelatedQuestion && (
        <RelatedQuestions questions={relatedQuestions} onSelect={onRelatedQuestion} className="mt-1 pl-0.5" />
      )}
    </motion.div>
  )
}
