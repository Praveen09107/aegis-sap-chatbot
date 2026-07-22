"use client"

import { useState, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core"
import { AdminPageWrapper } from "@/components/admin/AdminPageWrapper"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"
import { TicketsKanbanBoardSkeleton } from "@/components/admin/TicketsKanbanBoard"
import { Drawer } from "@/components/ui/drawer"
import { AdminStatRow } from "@/components/admin/AdminStatRow"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { useAdminTickets, useUpdateTicketStatus } from "@/hooks/queries"
import { useAdminStore } from "@/stores/adminStore"
import { formatDateLocalized } from "@/lib/utils"
import type { TicketEntry } from "@/hooks/queries/adminData"

type TicketStatus = TicketEntry["status"]

// @dnd-kit (~28KB) is only ever used on this one admin route — code split it
// out via next/dynamic rather than shipping it in every admin bundle
// (FRONTEND_28_PERFORMANCE.md). ssr:false because dnd-kit's sensors need
// real pointer/DOM APIs.
const TicketsKanbanBoard = dynamic(
  () => import("@/components/admin/TicketsKanbanBoard").then((m) => m.TicketsKanbanBoard),
  { loading: () => <TicketsKanbanBoardSkeleton />, ssr: false }
)

const COLUMNS: { id: TicketStatus; title: string }[] = [
  { id: "open", title: "Open" },
  { id: "in_progress", title: "In Progress" },
  { id: "resolved", title: "Resolved" },
]

/**
 * Adapted (2026-07-22) from FRONTEND_21's spec: the real mock_tickets table
 * has no priority column at all (see TicketEntry's doc comment in
 * adminData.ts) — the priority badge/legend is dropped, and the drawer
 * shows query_text/reason/resolution_notes instead of title/description.
 * The status enum matches the spec exactly, so drag-and-drop and the
 * column grouping are unchanged.
 */
export default function AdminTicketsPage() {
  const { data: allTickets = [], isLoading } = useAdminTickets()
  const updateStatus = useUpdateTicketStatus()
  const { activeTicketId, setActiveTicketId } = useAdminStore()

  const [activeId, setActiveId] = useState<string | null>(null)

  // Group tickets by status
  const columns = useMemo(() => {
    const map: Record<TicketStatus, typeof allTickets> = {
      open: [],
      in_progress: [],
      resolved: [],
    }
    for (const ticket of allTickets) {
      map[ticket.status]?.push(ticket)
    }
    return map
  }, [allTickets])

  const activeTicket = allTickets.find((t) => t.ticket_id === activeId) ?? null
  const selectedTicket = allTickets.find((t) => t.ticket_id === activeTicketId) ?? null

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
      const ticket = allTickets.find((t) => t.ticket_id === ticketId)
      if (!ticket) return

      // `over.id` is either a column ID or a ticket ID
      // If it's a ticket ID, find its parent column
      const targetStatus = COLUMNS.find((c) => c.id === over.id)?.id ?? allTickets.find((t) => t.ticket_id === over.id)?.status

      if (targetStatus && targetStatus !== ticket.status) {
        updateStatus.mutate({ ticketId, status: targetStatus })
      }
    },
    [allTickets, updateStatus]
  )

  const stats = {
    open: columns.open.length,
    in_progress: columns.in_progress.length,
    resolved: columns.resolved.length,
  }

  return (
    <AdminPageWrapper width="wide">
      <AdminPageHeader
        title="Tickets"
        description="Escalated support tickets"
        leftSlot={
          <AdminStatRow
            stats={[
              { label: "Open", value: stats.open, color: stats.open > 0 ? "amber" : "green" },
              { label: "In progress", value: stats.in_progress, color: "info" },
              { label: "Resolved", value: stats.resolved, color: "green" },
            ]}
            isLoading={isLoading}
          />
        }
      />

      {/* Kanban board */}
      <ErrorBoundary section="kanban board">
        <TicketsKanbanBoard
          columnDefs={COLUMNS}
          columns={columns}
          activeTicket={activeTicket}
          onCardClick={(ticket) => setActiveTicketId(ticket.ticket_id)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      </ErrorBoundary>

      {/* Ticket detail drawer */}
      <Drawer
        open={!!selectedTicket}
        onOpenChange={(open) => !open && setActiveTicketId(null)}
        title={selectedTicket ? `Ticket ${selectedTicket.ticket_id}` : ""}
        description={selectedTicket?.query_text}
        width="lg"
      >
        {selectedTicket && (
          <div className="space-y-5">
            {/* Reason */}
            <div>
              <p className="section-label mb-2">Reason</p>
              <p className="text-sm text-text-secondary leading-relaxed">{selectedTicket.reason}</p>
            </div>

            {/* Resolution notes */}
            {selectedTicket.resolution_notes && (
              <div>
                <p className="section-label mb-2">Resolution notes</p>
                <p className="text-sm text-text-secondary leading-relaxed">{selectedTicket.resolution_notes}</p>
              </div>
            )}

            {/* Dates */}
            <div>
              <p className="section-label mb-2">Created</p>
              <p className="text-sm text-text-secondary">{formatDateLocalized(selectedTicket.created_at)}</p>
            </div>

            {/* Quick status change */}
            <div>
              <p className="section-label mb-2">Move to</p>
              <div className="flex gap-2">
                {COLUMNS.filter((c) => c.id !== selectedTicket.status).map(({ id, title }) => (
                  <button
                    key={id}
                    onClick={() => {
                      updateStatus.mutate({ ticketId: selectedTicket.ticket_id, status: id })
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
