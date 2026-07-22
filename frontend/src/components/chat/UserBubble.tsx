"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { CHAT_MESSAGE } from "@/lib/animations"
import type { ChatMessage } from "@/types"

interface UserBubbleProps {
  message: ChatMessage
  className?: string
}

/**
 * Employee message bubble — right-aligned, blue tint. Displays message
 * text exactly as typed (no entity detection, no markdown rendering, on
 * user messages). Shows timestamp on hover.
 *
 * @example
 * <UserBubble message={message} />
 */
export function UserBubble({ message, className }: UserBubbleProps) {
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(message.timestamp))

  return (
    <motion.div
      className={cn("flex flex-col items-end gap-1 group", className)}
      custom="user"
      variants={CHAT_MESSAGE}
      initial="hidden"
      animate="visible"
      role="listitem"
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-tr-sm",
          "bg-info-bg border border-info-border",
          "px-4 py-3",
          "text-sm text-info-text leading-relaxed",
          "whitespace-pre-wrap break-words"
        )}
      >
        {message.content}
      </div>
      {/* Timestamp — visible on hover */}
      <span className="text-xs text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity pr-1" aria-label={`Sent at ${time}`}>
        {time}
      </span>
    </motion.div>
  )
}
