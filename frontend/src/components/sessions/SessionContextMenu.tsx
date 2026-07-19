"use client"

import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Pin, PinOff, Pencil, Trash2, Download } from "lucide-react"
import { useSessionStore } from "@/stores/sessionStore"
import { exportSessionAsPDF } from "@/lib/sessionExport"
import { TOAST } from "@/lib/toast"
import { api } from "@/lib/api"
import type { ChatMessage, Session } from "@/types"

interface SessionContextMenuProps {
  session: Session
  isPinned: boolean
  children: React.ReactNode
}

/**
 * Right-click context menu for session cards.
 * Built on Radix DropdownMenu — triggered by right-click on the session card.
 * Actions: pin/unpin, rename, delete, export PDF.
 *
 * Rename/delete call the API directly and rely on useSessions()'s own
 * refetch (mount / window focus) to reflect the change in the sidebar list —
 * this stub session doesn't yet have query-cache access to optimistically
 * patch the list in place. That's F08's job (queryClient.setQueryData, per
 * FRONTEND_11_TANSTACK_QUERY.md); pin/unpin is instant since it's tracked
 * locally in sessionStore, not the session list itself.
 */
export function SessionContextMenu({ session, isPinned, children }: SessionContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(session.topic_summary)

  const togglePin = useSessionStore((s) => s.togglePin)

  async function handleDelete() {
    await api.delete(`sessions/${session.id}`)
    TOAST.sessionDeleted()
  }

  async function handleRename() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === session.topic_summary) {
      setRenaming(false)
      return
    }
    await api.put(`sessions/${session.id}`, { topic_summary: trimmed })
    TOAST.sessionRenamed()
    setRenaming(false)
  }

  async function handleExport() {
    const sessionData = await api.get<{ messages: ChatMessage[] }>(`sessions/${session.id}`)
    await exportSessionAsPDF(sessionData.messages, session.topic_summary)
    TOAST.sessionExported()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/* Trigger is the right-click on the child element — Radix's
          DropdownMenuTrigger also opens on any left pointerdown by default,
          which would pop the menu open on an ordinary click-to-select.
          preventDefault() on pointerdown suppresses that internal handler
          (Radix's composeEventHandlers skips its own handler once
          defaultPrevented is set) without affecting the click event that
          fires the card's own onSelect. */}
      <DropdownMenuTrigger
        asChild
        onPointerDown={(e) => e.preventDefault()}
        onContextMenu={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        {children}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-48 bg-bg-card border-border-primary shadow-lg"
        side="right"
        align="start"
      >
        {/* Pin / Unpin */}
        <DropdownMenuItem
          onClick={() => {
            togglePin(session.id)
            if (isPinned) TOAST.sessionUnpinned()
            else TOAST.sessionPinned()
          }}
          className="flex items-center gap-2.5 text-sm cursor-pointer"
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          {isPinned ? "Unpin session" : "Pin session"}
        </DropdownMenuItem>

        {/* Rename */}
        <DropdownMenuItem
          onClick={() => {
            setRenaming(true)
            setOpen(false)
          }}
          className="flex items-center gap-2.5 text-sm cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
          Rename
        </DropdownMenuItem>

        {/* Export PDF */}
        <DropdownMenuItem
          onClick={handleExport}
          className="flex items-center gap-2.5 text-sm cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export as PDF
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border-primary" />

        {/* Delete */}
        <ConfirmDialog
          trigger={
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="flex items-center gap-2.5 text-sm cursor-pointer text-danger-text focus:text-danger-text focus:bg-danger-bg"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete session
            </DropdownMenuItem>
          }
          title={`Delete "${session.topic_summary.slice(0, 40)}..."?`}
          description="This session and all its messages will be permanently deleted. This cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleDelete}
        />
      </DropdownMenuContent>

      {renaming && (
        <RenameDialog
          value={renameValue}
          onChange={setRenameValue}
          onCancel={() => {
            setRenameValue(session.topic_summary)
            setRenaming(false)
          }}
          onConfirm={handleRename}
        />
      )}
    </DropdownMenu>
  )
}

function RenameDialog({
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/40"
      role="dialog"
      aria-label="Rename session"
      onClick={onCancel}
    >
      <div
        className="bg-bg-card border border-border-primary rounded-lg shadow-lg p-4 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <label htmlFor="session-rename-input" className="text-sm font-medium text-text-primary block mb-2">
          Rename session
        </label>
        <input
          id="session-rename-input"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm()
            if (e.key === "Escape") onCancel()
          }}
          className="w-full h-8 rounded-md bg-bg-secondary border border-border-primary text-sm text-text-primary px-2.5 focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
