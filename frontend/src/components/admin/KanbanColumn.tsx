"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { KanbanCard } from "./KanbanCard"
import { cn } from "@/lib/utils"
import type { TicketEntry } from "@/hooks/queries/adminData"

type TicketStatus = TicketEntry["status"]

interface KanbanColumnProps {
  id: TicketStatus
  title: string
  tickets: TicketEntry[]
  onCardClick: (ticket: TicketEntry) => void
  className?: string
}

const COLUMN_ACCENT: Record<TicketStatus, string> = {
  open: "border-t-danger/50",
  in_progress: "border-t-warning/50",
  resolved: "border-t-success/50",
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
        "flex flex-col",
        "bg-bg-secondary rounded-xl border border-border-primary border-t-2",
        COLUMN_ACCENT[id],
        "transition-colors",
        isOver && "bg-bg-tertiary ring-1 ring-border-focus",
        className
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
        <h3 className="text-sm font-semibold text-text-primary capitalize">{title.replace("_", " ")}</h3>
        <span className="text-xs tabular-nums text-text-tertiary bg-bg-tertiary border border-border-primary rounded-full px-2 py-0.5">
          {tickets.length}
        </span>
      </div>

      {/* Cards */}
      <div ref={setNodeRef} className="flex-1 p-3 space-y-2.5 min-h-[200px]" role="list" aria-label={`${title} tickets`}>
        <SortableContext items={tickets.map((t) => t.ticket_id)} strategy={verticalListSortingStrategy}>
          {tickets.map((ticket) => (
            <KanbanCard key={ticket.ticket_id} ticket={ticket} onClick={onCardClick} />
          ))}
        </SortableContext>

        {tickets.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-text-tertiary">
            {isOver ? "Drop here" : "No tickets"}
          </div>
        )}
      </div>
    </div>
  )
}
