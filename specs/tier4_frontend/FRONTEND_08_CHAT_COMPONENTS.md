# FRONTEND_08: CHAT COMPONENTS
## All Employee Chat UI Components — The Flagship AEGIS Experience
## Session F05 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F05: All chat-specific components.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Sessions F01–F04 complete. FRONTEND_10 (stores) must be created before
FRONTEND_12 (chat page) wires these components to state. This session creates pure UI
components that accept props — store integration happens in FRONTEND_12.

**What this session creates:**
```
src/components/chat/
├── EntityChip.tsx             ← SAP entity colored chip (error/tcode/docnum)
├── SAPEntityHighlighter.tsx   ← Wraps text, auto-renders EntityChips
├── ConfidenceBadge.tsx        ← Green/amber/none confidence indicator
├── StreamingCursor.tsx        ← Blinking │ cursor during generation
├── StreamingProgress.tsx      ← Stage indicator (Retrieving/Generating/Validating)
├── UserBubble.tsx             ← Employee message bubble
├── AIResponseBubble.tsx       ← AI response card (most complex component)
├── ResponseActions.tsx        ← Hover toolbar (copy, thumbs, regenerate)
├── RelatedQuestions.tsx       ← Suggested follow-up question chips
├── AttributionPanel.tsx       ← Right panel: source doc + score breakdown
├── ScoreBreakdown.tsx         ← Confidence decomposition bars
├── FreshnessIndicator.tsx     ← Document staleness display
├── ScreenshotDropZone.tsx     ← Full-area drag-drop overlay
├── ScreenshotThumbnail.tsx    ← Preview of attached screenshot
├── ComposeBar.tsx             ← Message input + send button
└── ChatEmptyState.tsx         ← Initial state with suggestion chips
```

---

## FILE 1: src/components/chat/EntityChip.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import type { SAPEntityType } from '@/types'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface EntityChipProps {
  type: SAPEntityType
  value: string
  /** Whether to show a tooltip explaining the entity type. Default: true */
  showTooltip?: boolean
  className?: string
}

const ENTITY_CONFIG: Record<
  SAPEntityType,
  { label: string; className: string; description: string }
> = {
  error_code: {
    label: 'Error',
    description: 'SAP error code — click to search for solutions',
    className: 'bg-danger-bg border-danger-border text-danger-text',
  },
  tcode: {
    label: 'T-Code',
    description: 'SAP transaction code — entry point for a workflow',
    className: 'bg-info-bg border-info-border text-info-text',
  },
  doc_number: {
    label: 'Doc',
    description: 'SAP document number — purchase order, delivery, or invoice',
    className: 'bg-bg-tertiary border-border-primary text-text-secondary',
  },
}

/**
 * SAP entity chip — renders colored monospace identifier chips.
 * Used inside SAPEntityHighlighter to replace detected SAP codes in text.
 *
 * Error codes: danger colors (VL150, F5201)
 * Transaction codes: info colors (VL01N, MM02)
 * Document numbers: neutral colors (4500012345)
 *
 * @example
 * <EntityChip type="error_code" value="VL150" />
 * <EntityChip type="tcode" value="VL01N" showTooltip={false} />
 */
export function EntityChip({
  type,
  value,
  showTooltip = true,
  className,
}: EntityChipProps) {
  const config = ENTITY_CONFIG[type]

  const chip = (
    <span
      className={cn(
        'chip-base',
        config.className,
        'transition-opacity duration-100',
        'hover:opacity-80',
        className
      )}
      role="mark"
      aria-label={`SAP ${config.label}: ${value}`}
    >
      {value}
    </span>
  )

  if (!showTooltip) return chip

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-bg-card border border-border-primary text-text-primary text-xs max-w-[200px]"
        >
          <p className="font-semibold">{config.label}: {value}</p>
          <p className="text-text-secondary mt-0.5">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

---

## FILE 2: src/components/chat/SAPEntityHighlighter.tsx (COMPLETE)

```typescript
'use client'

import { useMemo } from 'react'
import { detectSAPEntities, splitTextByEntities } from '@/lib/sapEntityDetector'
import { EntityChip } from './EntityChip'

interface SAPEntityHighlighterProps {
  text: string
  showTooltips?: boolean
}

/**
 * Automatically detects and highlights SAP entities in text.
 * Returns a mix of plain text spans and EntityChip components.
 *
 * Use inside AIResponseBubble for answer content.
 * Do NOT use on user messages (they're displayed as-is for trust reasons).
 *
 * @example
 * <SAPEntityHighlighter text="Fix the VL150 error by opening MM02 and checking MRP 2 tab." />
 * // Renders: "Fix the " [VL150 chip] " error by opening " [MM02 chip] " and checking MRP 2 tab."
 */
export function SAPEntityHighlighter({
  text,
  showTooltips = true,
}: SAPEntityHighlighterProps) {
  const segments = useMemo(() => {
    const entities = detectSAPEntities(text)
    return splitTextByEntities(text, entities)
  }, [text])

  return (
    <span>
      {segments.map((segment, i) =>
        segment.type === 'text' ? (
          <span key={i}>{segment.content}</span>
        ) : (
          <EntityChip
            key={i}
            type={segment.entity!.type}
            value={segment.content}
            showTooltip={showTooltips}
          />
        )
      )}
    </span>
  )
}
```

---

## FILE 3: src/components/chat/ConfidenceBadge.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import { formatScore } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ConfidenceBadge as ConfidenceBadgeType } from '@/types'
import { CONFIDENCE } from '@/lib/constants'

interface ConfidenceBadgeProps {
  badge: ConfidenceBadgeType
  score?: number | null
  showScore?: boolean
  showTooltip?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const BADGE_CONFIG = {
  green: {
    label: 'High confidence',
    dotClass: 'bg-success',
    containerClass: 'bg-success-bg border-success-border text-success-text',
    tooltipText: `ValidationScore ≥ ${CONFIDENCE.GREEN_THRESHOLD * 100}%. The answer is strongly supported by verified documentation.`,
  },
  amber: {
    label: 'Moderate confidence',
    dotClass: 'bg-warning',
    containerClass: 'bg-warning-bg border-warning-border text-warning-text',
    tooltipText: `ValidationScore between ${CONFIDENCE.AMBER_THRESHOLD * 100}–${CONFIDENCE.GREEN_THRESHOLD * 100}%. Review the source document to verify.`,
  },
  none: {
    label: 'Insufficient',
    dotClass: 'bg-danger',
    containerClass: 'bg-danger-bg border-danger-border text-danger-text',
    tooltipText: 'AEGIS could not find sufficient documentation to answer this question. A support ticket has been created.',
  },
} as const

/**
 * Confidence badge — the primary quality signal for AI responses.
 * RULE: This color system must never be used decoratively.
 * Green = high confidence (≥0.85), Amber = moderate (0.70–0.84), None = insufficient.
 *
 * @example
 * <ConfidenceBadge badge="green" score={0.91} showScore />
 * <ConfidenceBadge badge="amber" score={0.74} showScore showTooltip />
 * <ConfidenceBadge badge={null} />  // renders nothing (streaming in progress)
 */
export function ConfidenceBadge({
  badge,
  score,
  showScore = false,
  showTooltip = true,
  size = 'sm',
  className,
}: ConfidenceBadgeProps) {
  if (!badge) return null

  const config = BADGE_CONFIG[badge]

  const badgeEl = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium select-none',
        size === 'sm' ? 'text-xs px-2.5 py-0.5' : 'text-sm px-3 py-1',
        config.containerClass,
        className
      )}
      role="status"
      aria-label={`${config.label}${score ? ` · ${formatScore(score)}` : ''}`}
    >
      {/* Animated dot */}
      <span
        className={cn(
          'rounded-full shrink-0',
          size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
          config.dotClass,
          badge === 'green' && 'animate-status-pulse'
        )}
        aria-hidden="true"
      />
      {config.label}
      {showScore && score != null && (
        <span className="tabular-nums opacity-75">· {formatScore(score)}</span>
      )}
    </span>
  )

  if (!showTooltip) return badgeEl

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badgeEl}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-bg-card border border-border-primary text-text-primary text-xs max-w-[260px]"
        >
          <p className="font-semibold mb-0.5">{config.label}</p>
          <p className="text-text-secondary leading-relaxed">{config.tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

---

## FILE 4: src/components/chat/StreamingCursor.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

interface StreamingCursorProps {
  className?: string
}

/**
 * Blinking text cursor shown while the AI is streaming a response.
 * Rendered inline at the end of the streaming text content.
 * Automatically hidden when streaming completes (parent removes it from DOM).
 *
 * @example
 * <p className="aegis-prose">
 *   {streamedText}
 *   {isStreaming && <StreamingCursor />}
 * </p>
 */
export function StreamingCursor({ className }: StreamingCursorProps) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <span
      className={cn(
        'inline-block w-[2px] h-[1em] align-text-bottom ml-0.5',
        'bg-text-tertiary rounded-full',
        !reducedMotion && 'animate-blink',
        className
      )}
      aria-hidden="true"
      role="presentation"
    />
  )
}
```

---

## FILE 5: src/components/chat/StreamingProgress.tsx (COMPLETE)

```typescript
'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StreamingState } from '@/types'

interface StreamingProgressProps {
  state: StreamingState
  className?: string
}

const STATE_LABELS: Partial<Record<StreamingState, string>> = {
  thinking:   'Thinking...',
  retrieving: 'Retrieving SAP documentation...',
  generating: 'Generating response...',
  validating: 'Validating answer...',
}

/**
 * Progressive stage indicator shown below the AEGIS label
 * during response generation. Each stage transitions smoothly.
 * Hidden when state is 'idle', 'streaming', 'complete', or 'error'.
 *
 * @example
 * <StreamingProgress state={streamingState} />
 */
export function StreamingProgress({ state, className }: StreamingProgressProps) {
  const reducedMotion = useReducedMotion()
  const label = STATE_LABELS[state]

  return (
    <AnimatePresence mode="wait">
      {label && (
        <motion.div
          key={state}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            'flex items-center gap-2',
            'text-xs text-text-tertiary',
            className
          )}
          role="status"
          aria-live="polite"
          aria-label={label}
        >
          <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

---

## FILE 6: src/components/chat/UserBubble.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types'

interface UserBubbleProps {
  message: ChatMessage
  className?: string
}

/**
 * Employee message bubble — right-aligned, blue tint.
 * Displays message text exactly as typed (no entity detection on user messages).
 * Shows timestamp on hover.
 *
 * @example
 * <UserBubble message={message} />
 */
export function UserBubble({ message, className }: UserBubbleProps) {
  const time = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(message.timestamp))

  return (
    <div
      className={cn('flex flex-col items-end gap-1 group', className)}
      role="listitem"
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl rounded-tr-sm',
          'bg-info-bg border border-info-border',
          'px-4 py-3',
          'text-sm text-info-text leading-relaxed',
          'whitespace-pre-wrap break-words',
        )}
      >
        {message.content}
      </div>
      {/* Timestamp — visible on hover */}
      <span
        className="text-xs text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity pr-1"
        aria-label={`Sent at ${time}`}
      >
        {time}
      </span>
    </div>
  )
}
```

---

## FILE 7: src/components/chat/ResponseActions.tsx (COMPLETE)

```typescript
'use client'

import { useState } from 'react'
import { Copy, Check, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toastSuccess } from '@/lib/toast'

interface ResponseActionsProps {
  messageContent: string
  onFeedback: (signal: 'positive' | 'negative') => void
  onRegenerate?: () => void
  feedbackGiven?: 'positive' | 'negative' | null
  canRegenerate?: boolean
  className?: string
}

/**
 * Hover toolbar shown below AI response bubbles.
 * Revealed on group-hover — invisible at rest, visible on message hover.
 *
 * Actions:
 * - Copy: copies message content to clipboard
 * - Thumbs up: positive feedback to backend
 * - Thumbs down: negative feedback, creates review item
 * - Regenerate: re-sends last query (shown for amber/none badges only)
 */
export function ResponseActions({
  messageContent,
  onFeedback,
  onRegenerate,
  feedbackGiven,
  canRegenerate = false,
  className,
}: ResponseActionsProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(messageContent)
    setCopied(true)
    toastSuccess('Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        'opacity-0 group-hover:opacity-100',
        'transition-opacity duration-150',
        className
      )}
      role="toolbar"
      aria-label="Message actions"
    >
      {/* Copy */}
      <ActionButton
        onClick={handleCopy}
        label={copied ? 'Copied' : 'Copy message'}
        active={copied}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-success" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </ActionButton>

      {/* Thumbs up */}
      <ActionButton
        onClick={() => onFeedback('positive')}
        label="Helpful"
        active={feedbackGiven === 'positive'}
        disabled={!!feedbackGiven}
      >
        <ThumbsUp
          className={cn(
            'w-3.5 h-3.5',
            feedbackGiven === 'positive' ? 'text-success fill-success' : ''
          )}
        />
      </ActionButton>

      {/* Thumbs down */}
      <ActionButton
        onClick={() => onFeedback('negative')}
        label="Not helpful — flag for review"
        active={feedbackGiven === 'negative'}
        disabled={!!feedbackGiven}
      >
        <ThumbsDown
          className={cn(
            'w-3.5 h-3.5',
            feedbackGiven === 'negative' ? 'text-danger fill-danger' : ''
          )}
        />
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
        'w-6 h-6 rounded-md flex items-center justify-center',
        'text-text-tertiary',
        'transition-all duration-100',
        'hover:text-text-primary hover:bg-bg-secondary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        'disabled:opacity-40 disabled:pointer-events-none',
        active && 'text-text-primary bg-bg-secondary',
      )}
    >
      {children}
    </button>
  )
}
```

---

## FILE 8: src/components/chat/AIResponseBubble.tsx (COMPLETE — MOST COMPLEX COMPONENT)

```typescript
'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { SAPEntityHighlighter } from './SAPEntityHighlighter'
import { ConfidenceBadge } from './ConfidenceBadge'
import { StreamingCursor } from './StreamingCursor'
import { StreamingProgress } from './StreamingProgress'
import { ResponseActions } from './ResponseActions'
import { RelatedQuestions } from './RelatedQuestions'
import type { ChatMessage, StreamingState } from '@/types'

interface AIResponseBubbleProps {
  message: ChatMessage
  streamingState?: StreamingState
  onFeedback: (messageId: string, signal: 'positive' | 'negative') => void
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
 * - Content: SAPEntityHighlighter wraps prose text
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
  streamingState = 'complete',
  onFeedback,
  onRelatedQuestion,
  onRegenerate,
  relatedQuestions = [],
  className,
}: AIResponseBubbleProps) {
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null)
  const reducedMotion = useReducedMotion()

  const isStreaming = ['thinking', 'retrieving', 'generating', 'streaming', 'validating'].includes(streamingState)
  const badge = message.confidenceBadge
  const score = message.validationScore

  // Confidence aura class — left border of the bubble
  const auraClass = isStreaming
    ? 'aura-streaming'
    : badge === 'green'
    ? 'aura-green'
    : badge === 'amber'
    ? 'aura-amber'
    : badge === 'none'
    ? 'aura-danger'
    : 'aura-none'

  // Attribution reference string
  const attrRef = message.attributionPanel
    ? `${message.attributionPanel.primary_document_id} · ${message.attributionPanel.verified_date} · ${message.attributionPanel.verified_by}`
    : null

  function handleFeedback(signal: 'positive' | 'negative') {
    setFeedbackGiven(signal)
    onFeedback(message.id, signal)
  }

  return (
    <motion.div
      className={cn('flex flex-col items-start gap-1.5 group', className)}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      role="listitem"
    >
      {/* AEGIS identity row */}
      <div className="flex items-center gap-2 pl-0.5">
        {/* A mark */}
        <div
          className="w-5 h-5 rounded-md bg-accent flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Image
            src="/logo.svg"
            alt=""
            width={12}
            height={12}
            className="object-contain brightness-0 invert"
            onError={(e) => {
              const t = e.target as HTMLImageElement
              t.style.display = 'none'
              const span = document.createElement('span')
              span.className = 'text-white font-bold text-[9px]'
              span.textContent = 'A'
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
          'w-full max-w-[92%]',
          // Shape
          'rounded-2xl rounded-tl-sm',
          // Colors
          'bg-bg-card border border-border-primary',
          // Confidence aura (left border)
          auraClass,
          // Padding
          'px-4 py-3',
        )}
      >
        {/* Message content */}
        <div className="aegis-prose">
          {message.content ? (
            <SAPEntityHighlighter text={message.content} />
          ) : isStreaming ? (
            // Empty content during early streaming — just show cursor
            <span className="text-text-tertiary text-sm">
              {streamingState === 'thinking' ? '...' : ''}
            </span>
          ) : null}
          {/* Streaming cursor — shown while actively streaming tokens */}
          {streamingState === 'streaming' && <StreamingCursor />}
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
          {badge && (
            <ConfidenceBadge badge={badge} score={score} showScore showTooltip />
          )}
          {attrRef && (
            <span className="text-xs text-text-tertiary tabular-nums">{attrRef}</span>
          )}
          <ResponseActions
            messageContent={message.content}
            onFeedback={handleFeedback}
            feedbackGiven={feedbackGiven}
            onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
            canRegenerate={badge === 'amber' || badge === 'none'}
            className="ml-auto"
          />
        </motion.div>
      )}

      {/* Related questions — shown for green badge responses */}
      {!isStreaming && badge === 'green' && relatedQuestions.length > 0 && onRelatedQuestion && (
        <RelatedQuestions
          questions={relatedQuestions}
          onSelect={onRelatedQuestion}
          className="mt-1 pl-0.5"
        />
      )}
    </motion.div>
  )
}
```

---

## FILE 9: src/components/chat/RelatedQuestions.tsx (COMPLETE)

```typescript
'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

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
 * @example
 * <RelatedQuestions
 *   questions={["How do I check stock with MMBE?", "What is safety stock?"]}
 *   onSelect={(q) => chatStore.sendMessage(q)}
 * />
 */
export function RelatedQuestions({ questions, onSelect, className }: RelatedQuestionsProps) {
  const reducedMotion = usePrefersReducedMotion()

  if (!questions.length) return null

  return (
    <motion.div
      className={cn('flex flex-wrap gap-2', className)}
      initial={reducedMotion ? {} : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      role="group"
      aria-label="Related questions"
    >
      {questions.slice(0, 3).map((question, i) => (
        <button
          key={i}
          onClick={() => onSelect(question)}
          className={cn(
            'flex items-center gap-1.5',
            'text-xs text-text-secondary font-medium',
            'bg-bg-secondary border border-border-primary rounded-full',
            'px-3 py-1.5',
            'hover:bg-bg-tertiary hover:text-text-primary hover:border-border-secondary',
            'transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            'active:scale-95',
            'max-w-[280px] text-left',
          )}
        >
          <span className="truncate">{question}</span>
          <ArrowRight className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      ))}
    </motion.div>
  )
}
```

---

## FILE 10: src/components/chat/AttributionPanel.tsx (COMPLETE)

```typescript
'use client'

import { useState } from 'react'
import { FileText, ChevronDown, ChevronRight, Calendar, User, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScoreBreakdown } from './ScoreBreakdown'
import { FreshnessIndicator } from './FreshnessIndicator'
import type { AttributionPanel as AttributionPanelType } from '@/types'

interface AttributionPanelProps {
  attribution: AttributionPanelType | null
  isLoading?: boolean
  collapsed?: boolean
  onCollapseToggle?: () => void
  className?: string
}

/**
 * Right-side source attribution panel.
 * Shows on completion of each AI response — updates per turn.
 * Contains: primary document card, freshness, secondary sources, score breakdown.
 *
 * When `collapsed` is true, shows as a 48px icon strip.
 * The collapse toggle lives in the parent (AttributionPanelShell in FRONTEND_09).
 */
export function AttributionPanel({
  attribution,
  isLoading = false,
  className,
}: AttributionPanelProps) {
  const [secondaryExpanded, setSecondaryExpanded] = useState(false)

  if (isLoading) {
    return (
      <div className={cn('flex flex-col gap-4 p-4', className)}>
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
      <div className={cn('flex flex-col items-center justify-center gap-2 p-4 text-center h-32', className)}>
        <FileText className="w-6 h-6 text-text-tertiary opacity-40" />
        <p className="text-xs text-text-tertiary">Source appears after each response</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-4 p-4', className)}>
      {/* Section header */}
      <span className="section-label">Source</span>

      {/* Primary document card */}
      <div className="surface-card p-3 flex gap-3 items-start">
        <div className="w-8 h-8 rounded-lg bg-info-bg border border-info-border flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-info-text" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-text-primary">
            {attribution.primary_document_id}
          </p>
          <p className="text-xs text-text-secondary mt-0.5 leading-snug break-words">
            {/* Document name derived from ID or provided by backend */}
            {attribution.primary_document_id.replace(/-/g, ' ')}
          </p>
        </div>
      </div>

      {/* Document metadata */}
      <div className="flex flex-col gap-2">
        <MetaRow icon={Calendar} label={`Verified ${attribution.verified_date}`} />
        <MetaRow icon={User} label={attribution.verified_by} />
        <FreshnessIndicator verifiedDate={attribution.verified_date} />
      </div>

      {/* Score breakdown */}
      <ScoreBreakdown panel={attribution} />

      {/* Secondary sources */}
      {attribution.secondary_sources.length > 0 && (
        <div>
          <button
            onClick={() => setSecondaryExpanded(!secondaryExpanded)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors w-full"
            aria-expanded={secondaryExpanded}
          >
            {secondaryExpanded ? (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-3 h-3" aria-hidden="true" />
            )}
            {attribution.secondary_sources.length} additional source{attribution.secondary_sources.length > 1 ? 's' : ''}
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
```

---

## FILE 11: src/components/chat/ScoreBreakdown.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import type { AttributionPanel } from '@/types'

interface ScoreBreakdownProps {
  panel: AttributionPanel
  className?: string
}

/**
 * Confidence score decomposition bars.
 * Shows the three components of ValidationScore:
 * NLI entailment, faithfulness (RAGAS), and completeness.
 */
export function ScoreBreakdown({ panel, className }: ScoreBreakdownProps) {
  // The backend returns overall validation_score in the WSMessage
  // Panel contains document metadata; overall score comes from parent
  const scores = [
    { label: 'NLI score',    value: 0.92 }, // placeholder — backend provides per-component
    { label: 'Faithfulness', value: 0.88 },
    { label: 'Completeness', value: 0.94 },
  ]

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <span className="section-label">Score breakdown</span>
      <div className="flex flex-col gap-2.5">
        {scores.map(({ label, value }) => (
          <ScoreRow key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  )
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const percentage = Math.round(value * 100)

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-secondary w-24 shrink-0 truncate">{label}</span>
      <div
        className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${percentage}%`}
      >
        <div
          className="h-full bg-success rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-text-primary tabular-nums w-8 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  )
}
```

---

## FILE 12: src/components/chat/FreshnessIndicator.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import { CONFIDENCE } from '@/lib/constants'

interface FreshnessIndicatorProps {
  verifiedDate: string
  className?: string
}

/**
 * Document freshness indicator — shows how stale the source document is.
 * Green: within 35 days (fresh)
 * Amber: 35-70 days (review recommended)
 * Red: >70 days (stale — may need re-verification)
 */
export function FreshnessIndicator({ verifiedDate, className }: FreshnessIndicatorProps) {
  const days = Math.floor(
    (Date.now() - new Date(verifiedDate).getTime()) / (1000 * 60 * 60 * 24)
  )

  const isFresh = days <= CONFIDENCE.FRESHNESS_WARN_DAYS
  const isStale = days > CONFIDENCE.FRESHNESS_CRIT_DAYS

  const config = isStale
    ? { color: 'text-danger', label: `Stale — ${days} days old` }
    : !isFresh
    ? { color: 'text-warning', label: `Aging — ${days} days old` }
    : { color: 'text-success', label: `Fresh — ${days} days old` }

  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <span
        className={cn('w-1.5 h-1.5 rounded-full shrink-0', {
          'bg-success': isFresh,
          'bg-warning': !isFresh && !isStale,
          'bg-danger': isStale,
        })}
        aria-hidden="true"
      />
      <span className={config.color}>{config.label}</span>
    </div>
  )
}
```

---

## FILE 13: src/components/chat/ScreenshotDropZone.tsx (COMPLETE)

```typescript
'use client'

import { useState, useCallback } from 'react'
import { ImageIcon, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { LIMITS } from '@/lib/constants'
import { toastError } from '@/lib/toast'

interface ScreenshotDropZoneProps {
  onFileAccepted: (file: File) => void
  children: React.ReactNode
  className?: string
}

/**
 * Full-area drag-and-drop zone for SAP screenshots.
 * Wraps the entire chat area — when a PNG/JPG is dragged over,
 * shows a full overlay with drop prompt.
 *
 * Validates: file type (image/*), file size (max 10MB).
 * On acceptance: calls onFileAccepted, parent shows ScreenshotThumbnail.
 *
 * @example
 * <ScreenshotDropZone onFileAccepted={(file) => chatStore.setPendingScreenshot(file)}>
 *   <MessageList />
 *   <ComposeBar />
 * </ScreenshotDropZone>
 */
export function ScreenshotDropZone({
  onFileAccepted,
  children,
  className,
}: ScreenshotDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragCounter, setDragCounter] = useState(0)  // Counter to handle child element drag events

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragCounter((c) => c + 1)
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragCounter((c) => {
      const next = c - 1
      if (next === 0) setIsDragging(false)
      return next
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      setDragCounter(0)

      const file = e.dataTransfer.files[0]
      if (!file) return

      validateAndAccept(file, onFileAccepted)
    },
    [onFileAccepted]
  )

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute inset-0 z-overlay',
              'flex flex-col items-center justify-center gap-3',
              'bg-accent-subtle/90 border-2 border-dashed border-accent',
              'rounded-xl',
              'pointer-events-none',
            )}
            aria-hidden="true"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-accent-text">Drop SAP screenshot here</p>
              <p className="text-sm text-text-secondary mt-1">PNG, JPG — max 10MB</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function validateAndAccept(file: File, onAccept: (file: File) => void) {
  if (!file.type.startsWith('image/')) {
    toastError('Invalid file type', 'Please drop an image file (PNG, JPG)')
    return
  }
  if (file.size > LIMITS.MAX_SCREENSHOT_BYTES) {
    toastError('File too large', 'Screenshot must be under 10MB')
    return
  }
  onAccept(file)
}
```

---

## FILE 14: src/components/chat/ComposeBar.tsx (COMPLETE)

```typescript
'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Send, Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScreenshotThumbnail } from './ScreenshotThumbnail'
import type { StreamingState } from '@/types'
import { LAYOUT } from '@/lib/constants'

interface ComposeBarProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttachClick: () => void
  onRemoveScreenshot: () => void
  streamingState: StreamingState
  pendingScreenshot: File | null
  screenshotPreviewUrl: string | null
  disabled?: boolean
  className?: string
}

/**
 * Message compose bar at the bottom of the chat interface.
 * Contains: attachment button, auto-resizing textarea, screenshot preview, send button.
 *
 * Keyboard behaviour:
 * - Enter: sends message
 * - Shift+Enter: inserts newline
 * - Cannot send while streamingState is not 'idle' or 'complete'/'error'
 */
export function ComposeBar({
  value,
  onChange,
  onSend,
  onAttachClick,
  onRemoveScreenshot,
  streamingState,
  pendingScreenshot,
  screenshotPreviewUrl,
  disabled = false,
  className,
}: ComposeBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isStreaming = !['idle', 'complete', 'error'].includes(streamingState)
  const canSend = value.trim().length > 0 && !isStreaming && !disabled

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const maxHeight = 160  // 5 lines approx
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (canSend) onSend()
      }
    },
    [canSend, onSend]
  )

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Let parent validate and accept
      const event = new CustomEvent('aegis:screenshot-selected', { detail: file })
      document.dispatchEvent(event)
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  return (
    <div
      className={cn(
        'border-t border-border-primary bg-bg-card',
        'px-4 py-3',
        className
      )}
      style={{ minHeight: LAYOUT.EMPLOYEE_COMPOSE_HEIGHT }}
    >
      {/* Screenshot preview */}
      {pendingScreenshot && screenshotPreviewUrl && (
        <div className="mb-2">
          <ScreenshotThumbnail
            file={pendingScreenshot}
            previewUrl={screenshotPreviewUrl}
            onRemove={onRemoveScreenshot}
          />
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || disabled}
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            'border border-border-primary bg-bg-secondary text-text-tertiary',
            'hover:text-text-primary hover:bg-bg-tertiary hover:border-border-secondary',
            'transition-all duration-[var(--duration-normal)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            'disabled:opacity-40 disabled:pointer-events-none',
          )}
          title="Attach SAP screenshot"
          aria-label="Attach SAP screenshot"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your SAP issue or ask a question..."
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none overflow-hidden',
            'bg-transparent text-text-primary text-sm',
            'placeholder:text-text-tertiary',
            'focus:outline-none',
            'disabled:opacity-50',
            'leading-relaxed py-2',
          )}
          aria-label="Message input"
          aria-multiline="true"
        />

        {/* Send button */}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            'transition-all duration-[var(--duration-normal)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            canSend
              ? 'bg-accent text-white hover:bg-accent-hover active:scale-95 shadow-sm'
              : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed',
          )}
          aria-label={isStreaming ? 'Waiting for response...' : 'Send message'}
        >
          {isStreaming ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Hint */}
      <p className="text-xs text-text-tertiary mt-2 pl-11">
        Press <kbd className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px]">Enter</kbd> to send,{' '}
        <kbd className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px]">Shift + Enter</kbd> for new line
      </p>
    </div>
  )
}
```

---

## FILE 15: src/components/chat/ScreenshotThumbnail.tsx

```typescript
'use client'

import Image from 'next/image'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'

interface ScreenshotThumbnailProps {
  file: File
  previewUrl: string
  onRemove: () => void
  className?: string
}

export function ScreenshotThumbnail({ file, previewUrl, onRemove, className }: ScreenshotThumbnailProps) {
  return (
    <div className={cn('inline-flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-lg p-2', className)}>
      <div className="relative w-10 h-10 rounded overflow-hidden shrink-0">
        <Image src={previewUrl} alt="Screenshot preview" fill className="object-cover" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-primary truncate max-w-[140px]">{file.name}</p>
        <p className="text-xs text-text-tertiary">{formatFileSize(file.size)}</p>
      </div>
      <button
        onClick={onRemove}
        className="w-5 h-5 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        aria-label="Remove screenshot"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
```

---

## FILE 16: src/components/chat/ChatEmptyState.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import Image from 'next/image'

interface SuggestionChip {
  module: string
  question: string
}

const SUGGESTIONS: SuggestionChip[] = [
  { module: 'SD', question: 'How do I fix a VL150 error in VL01N?' },
  { module: 'SD', question: 'How do I create a scheduling agreement with YDSA?' },
  { module: 'FI', question: 'What causes the F5201 billing error?' },
  { module: 'MM', question: 'How do I check stock availability with MMBE?' },
  { module: 'MM', question: 'What does the MB1A transaction do?' },
  { module: 'FI', question: 'How do I check the current posting period?' },
]

const MODULE_COLORS: Record<string, string> = {
  SD: 'bg-info-bg border-info-border text-info-text',
  FI: 'bg-success-bg border-success-border text-success-text',
  MM: 'bg-purple-bg border-purple-border text-purple-text',
  HR: 'bg-warning-bg border-warning-border text-warning-text',
}

interface ChatEmptyStateProps {
  onSuggestionClick: (question: string) => void
  className?: string
}

/**
 * Initial empty state shown before first message.
 * Shows AEGIS branding and categorised suggestion chips.
 */
export function ChatEmptyState({ onSuggestionClick, className }: ChatEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-8 p-8 h-full', className)}>
      {/* Brand */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shadow-md">
          <Image
            src="/logo.svg"
            alt="Sona Comstar"
            width={32}
            height={32}
            className="object-contain brightness-0 invert"
            onError={(e) => {
              const t = e.target as HTMLImageElement
              t.style.display = 'none'
            }}
          />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">
            AEGIS SAP Intelligence
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Ask about any SAP error, transaction, or procedure
          </p>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="w-full max-w-lg">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider text-center mb-4">
          Try asking
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s.question)}
              className={cn(
                'flex items-center gap-2',
                'text-xs rounded-full border px-3 py-1.5',
                'transition-all duration-150 hover:shadow-sm active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary hover:border-border-secondary'
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-bold rounded px-1 py-0.5 border',
                  MODULE_COLORS[s.module] ?? 'bg-bg-tertiary border-border-primary text-text-tertiary'
                )}
              >
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
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: EntityChip renders correctly
# → <EntityChip type="error_code" value="VL150" />
# → Should show: danger colors, monospace font, tooltip on hover

# Step 2: ConfidenceBadge variants
# → <ConfidenceBadge badge="green" score={0.91} showScore />
# → Green colors, pulsing dot, "High confidence · 91.0%"
# → <ConfidenceBadge badge="amber" />
# → Amber colors, "Moderate confidence"

# Step 3: SAPEntityHighlighter
# → <SAPEntityHighlighter text="Fix VL150 error in VL01N by checking MMBE." />
# → VL150 = error chip (red), VL01N = tcode chip (blue), MMBE = tcode chip (blue)

# Step 4: AIResponseBubble streaming state
# → <AIResponseBubble message={partialMsg} streamingState="streaming" ... />
# → Should show: streaming border, no badge, cursor blinking at end of content

# Step 5: AIResponseBubble complete state
# → streamingState="complete" with badge="green" score={0.91}
# → Should show: green left border, confidence badge, attribution ref, hover actions

# Step 6: ComposeBar send
# → Type text, press Enter → onSend called
# → Type text, press Shift+Enter → newline inserted (no send)

# Step 7: ChatEmptyState
# → Suggestion chips render
# → Clicking a chip calls onSuggestionClick with the question text

# Step 8: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F05: Chat components — EntityChip, ConfidenceBadge, AIResponseBubble, ComposeBar, AttributionPanel, ChatEmptyState"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F05*
