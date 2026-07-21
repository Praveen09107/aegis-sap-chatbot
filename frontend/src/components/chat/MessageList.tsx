"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { ChevronDown } from "lucide-react"
import { UserBubble } from "./UserBubble"
import { AIResponseBubble } from "./AIResponseBubble"
import { ChatEmptyState } from "./ChatEmptyState"
import { cn } from "@/lib/utils"
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery"
import type { ChatMessage, StreamingState } from "@/types"

interface MessageListProps {
  messages: ChatMessage[]
  streamingState: StreamingState
  onFeedback: (messageId: string, signal: "positive" | "negative") => void
  onRelatedQuestion: (question: string) => void
  onRegenerate: (messageId: string) => void
  onSuggestionClick: (question: string) => void
  className?: string
}

/**
 * Scrollable message list with auto-scroll behaviour.
 *
 * Auto-scroll rules:
 * - Scrolls to bottom automatically when: user is within 80px of the bottom
 * - Does NOT scroll when: user has scrolled up to read history
 * - "Scroll to bottom" button appears when user is >80px from bottom
 *
 * Related questions are read directly off the last assistant message
 * (relatedQuestions, set by useWebSocket's validation_result handler) — not
 * threaded down as a separate prop from the page — so they can never go
 * stale relative to whichever response they actually belong to.
 */
export function MessageList({
  messages,
  streamingState,
  onFeedback,
  onRelatedQuestion,
  onRegenerate,
  onSuggestionClick,
  className,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "instant" : behavior })
      setShowScrollButton(false)
      isNearBottomRef.current = true
    },
    [reducedMotion]
  )

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceFromBottom < 80
    isNearBottomRef.current = nearBottom
    setShowScrollButton(!nearBottom && messages.length > 0)
  }, [messages.length])

  // Auto-scroll when messages change (new token added or message added)
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth" })
    }
  }, [messages, reducedMotion])

  // Determine the last AI message (for related questions)
  const lastAIMessageIndex = [...messages]
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.role === "assistant")
    .at(-1)?.i

  if (messages.length === 0) {
    return <ChatEmptyState onSuggestionClick={onSuggestionClick} className={className} />
  }

  return (
    <div className={cn("relative flex-1", className)}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto scrollbar-hide"
      >
        <div
          className="flex flex-col gap-5 px-5 py-5 min-h-full"
          role="list"
          aria-label="Chat messages"
          aria-live="polite"
          aria-atomic="false"
          aria-relevant="additions"
        >
          {messages.map((message, index) => {
            const isLastAI = index === lastAIMessageIndex && message.role === "assistant"
            const isCurrentlyStreaming = isLastAI && streamingState !== "complete" && streamingState !== "error"

            return message.role === "user" ? (
              <UserBubble key={message.id} message={message} />
            ) : (
              <AIResponseBubble
                key={message.id}
                message={message}
                streamingState={isLastAI ? streamingState : "complete"}
                onFeedback={onFeedback}
                onRelatedQuestion={onRelatedQuestion}
                onRegenerate={onRegenerate}
                relatedQuestions={!isCurrentlyStreaming ? message.relatedQuestions ?? [] : []}
              />
            )
          })}

          {/* Bottom anchor for auto-scroll */}
          <div ref={bottomRef} aria-hidden="true" />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={() => scrollToBottom()}
            className={cn(
              "absolute bottom-4 right-4 z-sticky",
              "w-8 h-8 rounded-full",
              "bg-bg-card border border-border-primary shadow-md",
              "flex items-center justify-center",
              "text-text-secondary hover:text-text-primary",
              "transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            )}
            aria-label="Scroll to latest message"
          >
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
