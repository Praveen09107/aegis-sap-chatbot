# FRONTEND_21: ADMIN REVIEW QUEUE & TICKETS
## Review Split-Pane with Keyboard Shortcuts and Tickets Kanban Drag-and-Drop
## Session F14 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F14: Review queue and tickets admin pages.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates:**
```
src/app/(admin)/admin/review-queue/
├── page.tsx
└── loading.tsx

src/app/(admin)/admin/tickets/
├── page.tsx
└── loading.tsx

src/components/admin/
├── ReviewSplitPane.tsx      ← Left list + right detail pane layout
├── ReviewItemList.tsx        ← Left: queue items list with active indicator
├── ReviewItemDetail.tsx      ← Right: query + problematic claim + correction input
├── ClaimHighlighter.tsx      ← Highlights problematic claim text in red
├── KanbanBoard.tsx           ← dnd-kit kanban container
├── KanbanColumn.tsx          ← Droppable column
└── KanbanCard.tsx            ← Draggable ticket card
```

---

## REVIEW QUEUE PAGE — COMPLETE SPECIFICATION

### Layout: split-pane

```
┌────────────────────────┐ ┌────────────────────────────────────────┐
│  Review queue          │ │  Item 3 of 12 pending                  │
│  ─────────────────     │ │                                        │
│  ○ Item 1              │ │  Employee's question                   │
│  ○ Item 2              │ │  ─────────────────────────────────     │
│  ● Item 3 (active)     │ │  "How do I fix VL150 in VL01N?"        │
│  ○ Item 4              │ │                                        │
│  ○ Item 5              │ │  Original AEGIS response               │
│  ...                   │ │  ─────────────────────────────────     │
│                        │ │  The VL150 error occurs when available │
│                        │ │  ████████████████████████████████████  │ ← problematic claim
│  ─────────────────     │ │  safety stock is insufficient.         │
│  J · Next item         │ │                                        │
│  K · Prev item         │ │  Your correction (optional)            │
│  A · Approve           │ │  ─────────────────────────────────     │
│  X · Skip              │ │  [Textarea for correction text...]     │
└────────────────────────┘ │                                        │
                            │  [Approve correction]  [Skip]         │
                            └────────────────────────────────────────┘
```

### Keyboard shortcuts (registered with `useKeyboardShortcuts`)

| Key | Action | Condition |
|-----|--------|-----------|
| `J` | Move to next item | Always |
| `K` | Move to previous item | Always |
| `A` | Approve correction (submit) | Current item loaded |
| `X` | Skip current item | Current item loaded |

These shortcuts work even when focused inside the correction textarea.
Set `ignoreInInput: false` for J/K/A/X shortcuts.

---

## FILE 1: src/components/admin/ClaimHighlighter.tsx (COMPLETE)

```typescript
'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface ClaimHighlighterProps {
  text: string
  claim: string
  className?: string
}

/**
 * Highlights a specific claim substring within a response text.
 * Used in the review queue to show which part of the response is problematic.
 *
 * The problematic_claim from the backend is a substring of original_answer.
 * If the claim is found, it's wrapped in a red highlight.
 * If not found (claim slightly differs), renders plain text.
 */
export function ClaimHighlighter({ text, claim, className }: ClaimHighlighterProps) {
  const segments = useMemo(() => {
    if (!claim) return [{ type: 'text' as const, content: text }]

    const idx = text.toLowerCase().indexOf(claim.toLowerCase())
    if (idx === -1) return [{ type: 'text' as const, content: text }]

    return [
      { type: 'text'  as const, content: text.slice(0, idx) },
      { type: 'claim' as const, content: text.slice(idx, idx + claim.length) },
      { type: 'text'  as const, content: text.slice(idx + claim.length) },
    ]
  }, [text, claim])

  return (
    <p className={cn('text-sm text-text-primary leading-relaxed whitespace-pre-wrap', className)}>
      {segments.map((seg, i) =>
        seg.type === 'claim' ? (
          <mark
            key={i}
            className="bg-danger-bg text-danger-text rounded px-0.5 not-italic border-b border-danger-border"
            title="Problematic claim identified for review"
          >
            {seg.content}
          </mark>
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </p>
  )
}
```

---

## FILE 2: src/components/admin/ReviewItemList.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import { Keyboard } from 'lucide-react'

interface ReviewItem {
  id: string
  query_text: string
  status: 'pending' | 'resolved' | 'skipped'
  created_at: string
}

interface ReviewItemListProps {
  items: ReviewItem[]
  currentIndex: number
  onSelect: (index: number) => void
  totalPending: number
}

/**
 * Left panel of the review queue split-pane.
 * Shows a scrollable list of pending items with active indicator.
 * Below the list: keyboard shortcut hints.
 */
export function ReviewItemList({
  items,
  currentIndex,
  onSelect,
  totalPending,
}: ReviewItemListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-primary shrink-0">
        <p className="section-label">Review queue</p>
        <p className="text-xs text-text-tertiary mt-1">
          {totalPending} item{totalPending !== 1 ? 's' : ''} pending
        </p>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-2" role="list">
        {items.map((item, index) => {
          const isActive = index === currentIndex
          return (
            <button
              key={item.id}
              onClick={() => onSelect(index)}
              className={cn(
                'w-full text-left px-4 py-3 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
                isActive
                  ? 'bg-bg-secondary border-l-2 border-l-accent'
                  : 'hover:bg-bg-secondary/50 border-l-2 border-l-transparent',
              )}
              aria-current={isActive ? 'true' : 'false'}
              role="listitem"
            >
              <div className="flex items-center gap-2">
                {/* Active dot */}
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                    isActive ? 'bg-accent' : 'bg-border-secondary',
                  )}
                  aria-hidden="true"
                />
                {/* Index */}
                <span className="text-xs text-text-tertiary tabular-nums w-6 shrink-0">
                  {index + 1}
                </span>
              </div>
              {/* Query preview */}
              <p className="text-xs text-text-secondary line-clamp-2 mt-1 leading-snug ml-5">
                {item.query_text}
              </p>
            </button>
          )
        })}
      </div>

      {/* Keyboard shortcuts hints */}
      <div className="px-4 py-3 border-t border-border-primary shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5 mb-1">
          <Keyboard className="w-3 h-3 text-text-tertiary" aria-hidden="true" />
          <span className="section-label">Shortcuts</span>
        </div>
        {[
          { key: 'J / K', label: 'Navigate' },
          { key: 'A',     label: 'Approve' },
          { key: 'X',     label: 'Skip' },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <kbd className="text-[10px] font-medium bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5 text-text-secondary">
              {key}
            </kbd>
            <span className="text-xs text-text-tertiary">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 3: src/components/admin/ReviewItemDetail.tsx (COMPLETE)

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClaimHighlighter } from './ClaimHighlighter'
import { cn } from '@/lib/utils'

interface ReviewItem {
  id: string
  query_text: string
  original_answer: string
  problematic_claim: string
  suggested_correction: string | null
  document_reference: string | null
  created_at: string
  status: 'pending' | 'resolved' | 'skipped'
}

interface ReviewItemDetailProps {
  item: ReviewItem | null
  currentIndex: number
  totalItems: number
  onApprove: (item: ReviewItem, correctionText: string) => Promise<void>
  onSkip: (item: ReviewItem) => Promise<void>
  isSubmitting?: boolean
}

/**
 * Right panel of the review queue split-pane.
 * Shows the full query, original AI response with problematic claim highlighted,
 * and an editable correction textarea.
 *
 * The correction textarea is pre-filled with `suggested_correction` if provided.
 * Submitting sends the correction to the backend and advances to next item.
 */
export function ReviewItemDetail({
  item,
  currentIndex,
  totalItems,
  onApprove,
  onSkip,
  isSubmitting = false,
}: ReviewItemDetailProps) {
  const [correctionText, setCorrectionText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Pre-fill with suggested correction when item changes
  useEffect(() => {
    if (item) {
      setCorrectionText(item.suggested_correction ?? '')
    }
  }, [item?.id])

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-tertiary">
        Select an item from the queue
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: progress indicator */}
      <div className="px-6 py-3 border-b border-border-primary shrink-0 flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">
          Item {currentIndex + 1} of {totalItems} pending
        </p>
        <p className="text-xs text-text-tertiary">
          {new Date(item.created_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Employee's question */}
        <section>
          <p className="section-label mb-2">Employee&apos;s question</p>
          <div className="surface-sunken rounded-xl p-3">
            <p className="text-sm text-text-primary leading-relaxed">{item.query_text}</p>
          </div>
        </section>

        {/* Original AI response with highlighted claim */}
        <section>
          <p className="section-label mb-2">Original AI response</p>
          <div className="surface-sunken rounded-xl p-3">
            <ClaimHighlighter
              text={item.original_answer}
              claim={item.problematic_claim}
            />
          </div>
          {item.problematic_claim && (
            <p className="text-xs text-danger-text mt-1.5 flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-sm bg-danger-bg border border-danger-border inline-block"
                aria-hidden="true"
              />
              Highlighted text flagged as problematic
            </p>
          )}
        </section>

        {/* Document reference */}
        {item.document_reference && (
          <section>
            <p className="section-label mb-1">Source document</p>
            <p className="font-mono text-sm text-text-secondary">{item.document_reference}</p>
          </section>
        )}

        {/* Correction input */}
        <section>
          <p className="section-label mb-2">Your correction</p>
          <p className="text-xs text-text-tertiary mb-2 leading-relaxed">
            Provide the correct information. This will be added to the knowledge base
            and used in future responses.
          </p>
          <textarea
            ref={textareaRef}
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            placeholder="Enter the correct answer or procedure..."
            rows={5}
            disabled={isSubmitting}
            className={cn(
              'w-full rounded-xl border border-border-primary bg-bg-secondary',
              'text-sm text-text-primary placeholder:text-text-tertiary',
              'px-4 py-3 resize-none',
              'focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus',
              'disabled:opacity-50',
            )}
            aria-label="Correction text"
          />
          <p className="text-xs text-text-tertiary mt-1">
            Optional — you can approve without providing a correction
          </p>
        </section>
      </div>

      {/* Footer: action buttons */}
      <div
        className="px-6 py-4 border-t border-border-primary shrink-0 flex items-center gap-3"
      >
        <Button
          size="default"
          onClick={() => onApprove(item, correctionText)}
          loading={isSubmitting}
          className="gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          Approve correction
          <kbd className="text-[10px] bg-white/20 rounded px-1 py-0.5">A</kbd>
        </Button>

        <Button
          variant="outline"
          size="default"
          onClick={() => onSkip(item)}
          disabled={isSubmitting}
          className="gap-2"
        >
          <SkipForward className="w-4 h-4" />
          Skip
          <kbd className="text-[10px] bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-text-tertiary">X</kbd>
        </Button>
      </div>
    </div>
  )
}
```

---

## FILE 4: src/app/(admin)/admin/review-queue/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function ReviewLoading() {
  return (
    <div className="flex h-[calc(100vh-52px)]">
      {/* Left panel skeleton */}
      <div className="w-72 border-r border-border-primary p-4 space-y-3">
        <Skeleton className="h-3 w-24 mb-4" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="space-y-1.5 py-1">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-4/5" />
          </div>
        ))}
      </div>
      {/* Right panel skeleton */}
      <div className="flex-1 p-6 space-y-5">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <div className="flex gap-3 mt-auto pt-4 border-t border-border-primary">
          <Skeleton className="h-10 w-44 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
```

---

## FILE 5: src/app/(admin)/admin/review-queue/page.tsx (COMPLETE)

```typescript
'use client'

import { useCallback } from 'react'
import { CheckCircle } from 'lucide-react'
import { ReviewItemList } from '@/components/admin/ReviewItemList'
import { ReviewItemDetail } from '@/components/admin/ReviewItemDetail'
import { EmptyState } from '@/components/admin/EmptyState'
import { useAdminReviewQueue, useResolveReview } from '@/hooks/queries'
import { useAdminStore } from '@/stores/adminStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

/**
 * Review queue page — full viewport split-pane layout.
 * Does NOT use AdminPageWrapper (takes full height).
 * Keyboard shortcuts: J=next, K=prev, A=approve, X=skip.
 */
export default function AdminReviewQueuePage() {
  const { data: items = [], isLoading } = useAdminReviewQueue('pending')
  const resolve = useResolveReview()
  const { reviewQueueIndex, setReviewQueueIndex, advanceReviewQueue } = useAdminStore()

  const currentItem = items[reviewQueueIndex] ?? null

  // ── Navigation ────────────────────────────────────────────

  const goNext = useCallback(() => {
    setReviewQueueIndex(Math.min(reviewQueueIndex + 1, items.length - 1))
  }, [reviewQueueIndex, items.length, setReviewQueueIndex])

  const goPrev = useCallback(() => {
    setReviewQueueIndex(Math.max(reviewQueueIndex - 1, 0))
  }, [reviewQueueIndex, setReviewQueueIndex])

  // ── Approve / Skip ────────────────────────────────────────

  const handleApprove = useCallback(
    async (item: any, correctionText: string) => {
      await resolve.mutateAsync({
        item_id: item.id,
        action: 'approve_correction',
        correction_text: correctionText || undefined,
      })
      advanceReviewQueue()
    },
    [resolve, advanceReviewQueue]
  )

  const handleSkip = useCallback(
    async (item: any) => {
      await resolve.mutateAsync({
        item_id: item.id,
        action: 'skip',
      })
      advanceReviewQueue()
    },
    [resolve, advanceReviewQueue]
  )

  // ── Keyboard shortcuts ────────────────────────────────────
  // ignoreInInput: false so shortcuts work even in the correction textarea

  useKeyboardShortcuts([
    { key: 'j', handler: goNext, ignoreInInput: false },
    { key: 'k', handler: goPrev, ignoreInInput: false },
    {
      key: 'a',
      handler: () => currentItem && handleApprove(currentItem, ''),
      ignoreInInput: false,
    },
    {
      key: 'x',
      handler: () => currentItem && handleSkip(currentItem),
      ignoreInInput: false,
    },
  ])

  // ── Empty state ───────────────────────────────────────────

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          icon={CheckCircle}
          title="Review queue is empty"
          description="All items have been reviewed. New items will appear here when employees submit feedback on AI responses."
          variant="page"
        />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden" role="main" aria-label="Review queue">
      {/* Left: item list — fixed 288px */}
      <div className="w-72 border-r border-border-primary flex-shrink-0 overflow-hidden bg-bg-primary">
        <ReviewItemList
          items={items}
          currentIndex={reviewQueueIndex}
          onSelect={setReviewQueueIndex}
          totalPending={items.length}
        />
      </div>

      {/* Right: item detail — flex */}
      <div className="flex-1 overflow-hidden bg-bg-card">
        <ReviewItemDetail
          item={currentItem}
          currentIndex={reviewQueueIndex}
          totalItems={items.length}
          onApprove={handleApprove}
          onSkip={handleSkip}
          isSubmitting={resolve.isPending}
        />
      </div>
    </div>
  )
}
```

---

## FILE 6: src/components/admin/KanbanCard.tsx (COMPLETE)

```typescript
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, Hash } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type TicketPriority = 'low' | 'medium' | 'high'

interface TicketEntry {
  id: string
  reference_number: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'resolved'
  priority: TicketPriority
  created_at: string
}

const PRIORITY_VARIANT: Record<TicketPriority, 'default' | 'warning' | 'danger'> = {
  low:    'default',
  medium: 'warning',
  high:   'danger',
}

interface KanbanCardProps {
  ticket: TicketEntry
  onClick: (ticket: TicketEntry) => void
}

/**
 * Draggable kanban card for the tickets board.
 * Uses @dnd-kit/sortable for drag-and-drop between columns.
 * Click opens the ticket detail Drawer.
 */
export function KanbanCard({ ticket, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ticket.id,
    data: { type: 'ticket', ticket },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(ticket)}
      className={cn(
        'surface-card p-3 space-y-2.5',
        'cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-shadow',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        isDragging && 'opacity-40 shadow-xl',
      )}
      role="button"
      tabIndex={0}
      aria-label={`Ticket ${ticket.reference_number}: ${ticket.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(ticket)
        }
      }}
    >
      {/* Reference + priority */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-text-tertiary font-mono">
          <Hash className="w-3 h-3" aria-hidden="true" />
          {ticket.reference_number}
        </span>
        <Badge variant={PRIORITY_VARIANT[ticket.priority]}>
          {ticket.priority}
        </Badge>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-text-primary line-clamp-2 leading-snug">
        {ticket.title}
      </p>

      {/* Creation date */}
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
        {new Date(ticket.created_at).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short',
        })}
      </div>
    </div>
  )
}
```

---

## FILE 7: src/components/admin/KanbanColumn.tsx (COMPLETE)

```typescript
'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanCard } from './KanbanCard'
import { cn } from '@/lib/utils'

type TicketStatus = 'open' | 'in_progress' | 'resolved'

interface TicketEntry {
  id: string
  reference_number: string
  title: string
  description: string
  status: TicketStatus
  priority: 'low' | 'medium' | 'high'
  created_at: string
}

interface KanbanColumnProps {
  id: TicketStatus
  title: string
  tickets: TicketEntry[]
  onCardClick: (ticket: TicketEntry) => void
  className?: string
}

const COLUMN_ACCENT: Record<TicketStatus, string> = {
  open:        'border-t-danger/50',
  in_progress: 'border-t-warning/50',
  resolved:    'border-t-success/50',
}

/**
 * A droppable kanban column.
 * Highlights when a card is dragged over it.
 * Uses SortableContext for ordering within the column.
 */
export function KanbanColumn({ id, title, tickets, onCardClick, className }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      className={cn(
        'flex flex-col',
        'bg-bg-secondary rounded-xl border border-border-primary border-t-2',
        COLUMN_ACCENT[id],
        'transition-colors',
        isOver && 'bg-bg-tertiary ring-1 ring-border-focus',
        className,
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
        <h3 className="text-sm font-semibold text-text-primary capitalize">
          {title.replace('_', ' ')}
        </h3>
        <span className="text-xs tabular-nums text-text-tertiary bg-bg-tertiary border border-border-primary rounded-full px-2 py-0.5">
          {tickets.length}
        </span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 p-3 space-y-2.5 min-h-[200px]"
        role="list"
        aria-label={`${title} tickets`}
      >
        <SortableContext
          items={tickets.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tickets.map((ticket) => (
            <KanbanCard key={ticket.id} ticket={ticket} onClick={onCardClick} />
          ))}
        </SortableContext>

        {tickets.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-text-tertiary">
            {isOver ? 'Drop here' : 'No tickets'}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## FILE 8: src/app/(admin)/admin/tickets/loading.tsx

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function TicketsLoading() {
  return (
    <div className="px-6 py-5 max-w-[1200px]">
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {['Open','In Progress','Resolved'].map((col) => (
          <div key={col} className="bg-bg-secondary rounded-xl border border-border-primary border-t-2">
            <div className="flex justify-between px-4 py-3 border-b border-border-primary">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <div className="p-3 space-y-2.5">
              {[...Array(col === 'Open' ? 3 : 2)].map((_, i) => (
                <div key={i} className="surface-card p-3 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## FILE 9: src/app/(admin)/admin/tickets/page.tsx (COMPLETE)

```typescript
'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { AdminPageWrapper } from '@/components/admin/AdminPageWrapper'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { KanbanColumn } from '@/components/admin/KanbanColumn'
import { KanbanCard } from '@/components/admin/KanbanCard'
import { Drawer } from '@/components/ui/drawer'
import { AdminStatRow } from '@/components/admin/AdminStatRow'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAdminTickets, useUpdateTicketStatus } from '@/hooks/queries'
import { useAdminStore } from '@/stores/adminStore'
import { cn } from '@/lib/utils'

type TicketStatus = 'open' | 'in_progress' | 'resolved'

const COLUMNS: { id: TicketStatus; title: string }[] = [
  { id: 'open',        title: 'Open' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'resolved',    title: 'Resolved' },
]

export default function AdminTicketsPage() {
  const { data: allTickets = [], isLoading } = useAdminTickets()
  const updateStatus = useUpdateTicketStatus()
  const { activeTicketId, setActiveTicketId } = useAdminStore()

  const [activeId, setActiveId] = useState<string | null>(null)

  // dnd-kit sensors — requires 8px move before drag starts (prevents accidental drags on click)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Group tickets by status
  const columns = useMemo(() => {
    const map: Record<TicketStatus, typeof allTickets> = {
      open:        [],
      in_progress: [],
      resolved:    [],
    }
    for (const ticket of allTickets) {
      map[ticket.status]?.push(ticket)
    }
    return map
  }, [allTickets])

  const activeTicket = allTickets.find((t) => t.id === activeId) ?? null
  const selectedTicket = allTickets.find((t) => t.id === activeTicketId) ?? null

  // ── Drag handlers ────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      if (!over) return

      const ticketId = String(active.id)
      const ticket = allTickets.find((t) => t.id === ticketId)
      if (!ticket) return

      // `over.id` is either a column ID or a ticket ID
      // If it's a ticket ID, find its parent column
      const targetStatus = COLUMNS.find((c) => c.id === over.id)?.id
        ?? allTickets.find((t) => t.id === over.id)?.status

      if (targetStatus && targetStatus !== ticket.status) {
        updateStatus.mutate({ ticketId, status: targetStatus })
      }
    },
    [allTickets, updateStatus]
  )

  const stats = {
    open:        columns.open.length,
    in_progress: columns.in_progress.length,
    resolved:    columns.resolved.length,
  }

  return (
    <AdminPageWrapper width="wide">
      <AdminPageHeader
        title="Tickets"
        description="Escalated support tickets"
        leftSlot={
          <AdminStatRow
            stats={[
              { label: 'Open',        value: stats.open,        color: stats.open > 0 ? 'amber' : 'green' },
              { label: 'In progress', value: stats.in_progress, color: 'info' },
              { label: 'Resolved',    value: stats.resolved,    color: 'green' },
            ]}
            isLoading={isLoading}
          />
        }
      />

      {/* Kanban board */}
      <ErrorBoundary section="kanban board">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-3 gap-4" role="region" aria-label="Ticket kanban board">
            {COLUMNS.map(({ id, title }) => (
              <KanbanColumn
                key={id}
                id={id}
                title={title}
                tickets={columns[id]}
                onCardClick={(ticket) => setActiveTicketId(ticket.id)}
              />
            ))}
          </div>

          {/* Drag overlay — shows floating card while dragging */}
          <DragOverlay>
            {activeTicket ? (
              <div className="rotate-2 opacity-90 shadow-xl">
                <KanbanCard ticket={activeTicket} onClick={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </ErrorBoundary>

      {/* Ticket detail drawer */}
      <Drawer
        open={!!selectedTicket}
        onOpenChange={(open) => !open && setActiveTicketId(null)}
        title={selectedTicket ? `Ticket ${selectedTicket.reference_number}` : ''}
        description={selectedTicket?.title}
        width="lg"
      >
        {selectedTicket && (
          <div className="space-y-5">
            {/* Priority */}
            <div className="flex items-center gap-2">
              <span className="section-label">Priority:</span>
              <span className={cn(
                'text-xs font-semibold capitalize',
                selectedTicket.priority === 'high' ? 'text-danger' :
                selectedTicket.priority === 'medium' ? 'text-warning' : 'text-text-secondary',
              )}>
                {selectedTicket.priority}
              </span>
            </div>

            {/* Description */}
            <div>
              <p className="section-label mb-2">Description</p>
              <p className="text-sm text-text-secondary leading-relaxed">
                {selectedTicket.description}
              </p>
            </div>

            {/* Dates */}
            <div>
              <p className="section-label mb-2">Created</p>
              <p className="text-sm text-text-secondary">
                {new Date(selectedTicket.created_at).toLocaleString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>

            {/* Quick status change */}
            <div>
              <p className="section-label mb-2">Move to</p>
              <div className="flex gap-2">
                {COLUMNS.filter((c) => c.id !== selectedTicket.status).map(({ id, title }) => (
                  <button
                    key={id}
                    onClick={() => {
                      updateStatus.mutate({ ticketId: selectedTicket.id, status: id })
                      setActiveTicketId(null)
                    }}
                    className="text-xs font-medium px-3 h-8 rounded-lg border bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary hover:border-border-secondary transition-colors"
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </AdminPageWrapper>
  )
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Review Queue
# Step 1: Split pane renders
# → Two panels: list (288px) + detail (flex)
# → First item automatically selected

# Step 2: Keyboard navigation
# → Press J → moves to next item in list
# → Press K → moves to previous item
# → Active item has blue left border + accent dot
# → Works even when cursor is in correction textarea

# Step 3: Problematic claim highlighted
# → Detail pane shows original response
# → The problematic_claim substring highlighted in red background

# Step 4: Approve action (A)
# → Press A → resolveReview mutation fires → item removed from list
# → Next item auto-selected (advanceReviewQueue)

# Step 5: Skip action (X)
# → Press X → item skipped → advances to next

# Tickets Kanban
# Step 6: Three columns render
# → Open / In Progress / Resolved columns
# → Cards show reference number, title, priority badge, date

# Step 7: Drag card between columns
# → Pick up a card from Open → drag to In Progress
# → useUpdateTicketStatus fires optimistically → card moves immediately
# → On API success: confirmed
# → On API error: card moves back (optimistic rollback)

# Step 8: Drag overlay
# → While dragging: floating card preview with rotation appears

# Step 9: Click card → drawer opens
# → Drawer slides in from right
# → Shows description, priority, date, "Move to" quick actions

npx tsc --noEmit  # Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F14: Review queue + tickets — split pane, J/K/A/X shortcuts, ClaimHighlighter, KanbanBoard with dnd-kit"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F14*
