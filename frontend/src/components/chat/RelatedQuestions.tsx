"use client"

import { motion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { CONTAINER_STAGGER, FADE_UP } from "@/lib/animations"

interface RelatedQuestionsProps {
  questions: string[]
  onSelect: (question: string) => void
  className?: string
}

/**
 * Follow-up question chips shown below high-confidence AI responses.
 * Backend generates 2-3 related questions based on the answer context.
 * Clicking a chip pre-fills and sends that question.
 *
 * Each chip fades/slides up individually, staggered by CONTAINER_STAGGER's
 * 40ms — per FRONTEND_23's component table ("RelatedQuestions chips |
 * CONTAINER_STAGGER + FADE_UP per chip").
 *
 * @example
 * <RelatedQuestions
 *   questions={["How do I check stock with MMBE?", "What is safety stock?"]}
 *   onSelect={(q) => chatStore.sendMessage(q)}
 * />
 */
export function RelatedQuestions({ questions, onSelect, className }: RelatedQuestionsProps) {
  if (!questions.length) return null

  return (
    <motion.div
      className={cn("flex flex-wrap gap-2", className)}
      variants={CONTAINER_STAGGER}
      initial="hidden"
      animate="visible"
      role="group"
      aria-label="Related questions"
    >
      {questions.slice(0, 3).map((question, i) => (
        <motion.button
          key={i}
          variants={FADE_UP}
          onClick={() => onSelect(question)}
          className={cn(
            "flex items-center gap-1.5",
            "text-xs text-text-secondary font-medium",
            "bg-bg-secondary border border-border-primary rounded-full",
            "px-3 py-1.5",
            "hover:bg-bg-tertiary hover:text-text-primary hover:border-border-secondary",
            "transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
            "active:scale-95",
            "max-w-[280px] text-left"
          )}
        >
          <span className="truncate">{question}</span>
          <ArrowRight className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
        </motion.button>
      ))}
    </motion.div>
  )
}
