"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Calendar, Hash } from "lucide-react"
import { cn, formatDateLocalized } from "@/lib/utils"
import type { TicketEntry } from "@/hooks/queries/adminData"

interface KanbanCardProps {
  ticket: TicketEntry
  onClick: (ticket: TicketEntry) => void
}

/**
 * Draggable kanban card for the tickets board.
 * Uses @dnd-kit/sortable for drag-and-drop between columns.
 * Click opens the ticket detail Drawer.
 *
 * Adapted (2026-07-22) from FRONTEND_21's spec: the real mock_tickets table
 * has no reference_number/title/priority columns (see TicketEntry's doc
 * comment in adminData.ts) — shows query_text as the card's headline and
 * `reason` as the subtitle instead, with ticket_id as the reference. No
 * priority badge, since there's nothing to badge.
 */
export function KanbanCard({ ticket, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.ticket_id,
    data: { type: "ticket", ticket },
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
        "surface-card p-3 space-y-2.5",
        "cursor-grab active:cursor-grabbing",
        "hover:shadow-md transition-shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        isDragging && "opacity-40 shadow-xl"
      )}
      role="button"
      tabIndex={0}
      aria-label={`Ticket ${ticket.ticket_id}: ${ticket.query_text}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick(ticket)
        }
      }}
    >
      {/* Reference */}
      <span className="flex items-center gap-1 text-xs text-text-tertiary font-mono">
        <Hash className="w-3 h-3" aria-hidden="true" />
        {ticket.ticket_id}
      </span>

      {/* Query text (headline) */}
      <p className="text-sm font-medium text-text-primary line-clamp-2 leading-snug">{ticket.query_text}</p>

      {/* Reason (subtitle) */}
      <p className="text-xs text-text-tertiary line-clamp-1">{ticket.reason}</p>

      {/* Creation date */}
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
        {formatDateLocalized(ticket.created_at).split(",")[0]}
      </div>
    </div>
  )
}
