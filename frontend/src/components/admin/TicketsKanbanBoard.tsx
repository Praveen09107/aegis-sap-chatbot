"use client"

import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { KanbanColumn } from "@/components/admin/KanbanColumn"
import { KanbanCard } from "@/components/admin/KanbanCard"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { TicketEntry } from "@/hooks/queries/adminData"

type TicketStatus = TicketEntry["status"]

interface TicketsKanbanBoardProps {
  columnDefs: { id: TicketStatus; title: string }[]
  columns: Record<TicketStatus, TicketEntry[]>
  activeTicket: TicketEntry | null
  onCardClick: (ticket: TicketEntry) => void
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void
}

/**
 * The drag-and-drop ticket board — isolated into its own component so
 * @dnd-kit (~28KB, only ever used on this one admin route) can be loaded via
 * next/dynamic from tickets/page.tsx instead of shipping in every admin
 * route's bundle (FRONTEND_28_PERFORMANCE.md).
 */
export function TicketsKanbanBoard({ columnDefs, columns, activeTicket, onCardClick, onDragStart, onDragEnd }: TicketsKanbanBoardProps) {
  // dnd-kit sensors — PointerSensor requires 8px move before drag starts
  // (prevents accidental drags on click); KeyboardSensor gives keyboard
  // users the same Space-to-pick-up/arrow-keys-to-move/Space-to-drop flow
  // (FRONTEND_27_ACCESSIBILITY.md's audit checklist, "Kanban board: keyboard
  // drag-drop functional") — KanbanCard's own onKeyDown merges with this
  // sensor's handler rather than overriding it.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-3 gap-4" role="region" aria-label="Ticket kanban board">
        {columnDefs.map(({ id, title }) => (
          <KanbanColumn key={id} id={id} title={title} tickets={columns[id]} onCardClick={onCardClick} />
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
  )
}

/**
 * next/dynamic loading fallback for TicketsKanbanBoard — mirrors the real
 * 3-column layout (including KanbanColumn's own `min-h-[200px]` body) so
 * there's no layout shift once the real, dnd-kit-backed board mounts.
 */
export function TicketsKanbanBoardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-3 gap-4", className)} role="region" aria-label="Ticket kanban board" aria-busy="true">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex flex-col bg-bg-secondary rounded-xl border border-border-primary border-t-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-6 rounded-full" />
          </div>
          <div className="flex-1 p-3 space-y-2.5 min-h-[200px]">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}
