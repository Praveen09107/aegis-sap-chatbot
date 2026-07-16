# FRONTEND_09: LAYOUT COMPONENTS
## Portal Shells, Navigation, Session Sidebar, Admin Nav — The Structural Skeleton
## Session F05 Implementation Guide (Part 2)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F05 Part 2: All layout and navigation components.
Run after FRONTEND_08_CHAT_COMPONENTS in the same session.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Note on query hooks:** This document references `@/hooks/queries` for data fetching.
Create the stub file `src/hooks/queries/index.ts` as shown below in Step 0.
The complete implementation is provided in FRONTEND_11 (Session F06) — the stub
is replaced without breaking existing imports.

**What this session creates:**
```
src/app/
├── (employee)/layout.tsx             ← Employee portal shell
├── (admin)/layout.tsx                ← Admin portal shell (forces dark mode)

src/components/shared/
└── EmployeeTopbar.tsx                ← Chat portal top bar

src/components/sessions/
├── SessionSidebar.tsx                ← Session list left panel
├── SessionCard.tsx                   ← Individual session list item
└── SessionContextMenu.tsx            ← Right-click session actions

src/components/chat/
└── AttributionPanelShell.tsx         ← Right panel wrapper with collapse

src/components/admin/
├── AdminNav.tsx                      ← Admin sidebar navigation
└── AdminTopbar.tsx                   ← Admin page header bar

src/hooks/queries/
└── index.ts                          ← Query hook stubs (replaced by FRONTEND_11)
```

---

## STEP 0: Create Query Hook Stubs

Create this file now. FRONTEND_11 (Session F06) replaces it with complete implementations.
**Do not change the export names** — they are imported across all layout and page components.

### src/hooks/queries/index.ts (STUB — replaced in FRONTEND_11)

```typescript
/**
 * TanStack Query hooks — STUB version.
 * Full implementation: FRONTEND_11_TANSTACK_QUERY.md (Session F06)
 * Do NOT rename exports — they are imported by all layout and page components.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { api } from '@/lib/api'
import { TIMING } from '@/lib/constants'
import type {
  Session, MetricsData, DocumentRecord, SystemHealthData,
  SessionFilters, DocFilters, AuditFilters,
} from '@/types'

// ── Session hooks ─────────────────────────────────────────────

export function useSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: queryKeys.sessions.list(filters),
    queryFn: () => api.get<Session[]>('sessions'),
    staleTime: 30_000,
  })
}

export function useSession(id: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(id ?? ''),
    queryFn: () => api.get<Session>(`sessions/${id}`),
    enabled: !!id,
  })
}

// ── Admin metric hooks ────────────────────────────────────────

export function useAdminMetrics() {
  return useQuery({
    queryKey: queryKeys.admin.metrics(),
    queryFn: () => api.get<MetricsData>('admin/metrics'),
    staleTime: 0,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

export function useAdminDocuments(filters?: DocFilters) {
  return useQuery({
    queryKey: queryKeys.admin.documents(filters),
    queryFn: () => api.get<DocumentRecord[]>('admin/documents'),
  })
}

export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.admin.systemHealth(),
    queryFn: () => api.get<SystemHealthData>('admin/system-health'),
    staleTime: 0,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
  })
}

export function useReviewQueueCount() {
  return useQuery({
    queryKey: queryKeys.admin.reviewQueue('pending'),
    queryFn: () => api.get<{ count: number }>('admin/review-queue/count'),
    staleTime: TIMING.ADMIN_POLL_INTERVAL_MS,
    refetchInterval: TIMING.ADMIN_POLL_INTERVAL_MS,
    select: (data) => data.count,
  })
}

export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences.all(),
    queryFn: () => api.get('preferences'),
    staleTime: Infinity,
  })
}
```

---

## FILE 1: src/hooks/queries/index.ts — see Step 0 above

---

## FILE 2: src/app/(employee)/layout.tsx (COMPLETE)

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingScreen } from '@/components/shared/LoadingScreen'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { EmployeeTopbar } from '@/components/shared/EmployeeTopbar'
import { SessionSidebar } from '@/components/sessions/SessionSidebar'
import { AttributionPanelShell } from '@/components/chat/AttributionPanelShell'
import { CommandPalette } from '@/components/shared/CommandPalette'
import { KeyboardShortcutsOverlay } from '@/components/shared/KeyboardShortcutsOverlay'
import { useAuth } from '@/hooks/useAuth'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUIStore } from '@/stores/uiStore'
import { usePanelStore } from '@/stores/panelStore'
import { useSessions } from '@/hooks/queries'
import { useSessionStore } from '@/stores/sessionStore'
import { LAYOUT } from '@/lib/constants'

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isAdmin, initializing } = useAuth() as any
  const {
    commandPaletteOpen,
    toggleCommandPalette,
    closeCommandPalette,
  } = useUIStore()
  const { collapsed } = usePanelStore()

  // Data
  const { data: sessions = [] } = useSessions()
  const searchQuery = useSessionStore((s) => s.searchQuery)

  // Redirect non-employees (IT admins go to admin portal)
  useEffect(() => {
    if (!initializing && isAuthenticated && isAdmin) {
      router.replace('/admin/dashboard')
    }
  }, [isAuthenticated, isAdmin, initializing, router])

  // Global keyboard shortcut: ⌘K
  useKeyboardShortcuts([
    {
      key: 'k',
      meta: true,
      handler: toggleCommandPalette,
      preventDefault: true,
    },
  ])

  if (initializing) return <LoadingScreen />

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg-secondary">
      {/* Offline banner sits above everything */}
      <OfflineBanner />

      {/* Top bar — fixed height */}
      <EmployeeTopbar />

      {/* Three-panel body */}
      <div
        className="flex-1 overflow-hidden grid"
        style={{
          gridTemplateColumns: collapsed
            ? `${LAYOUT.EMPLOYEE_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EMPLOYEE_SOURCE_PANEL_ICON_WIDTH}px`
            : `${LAYOUT.EMPLOYEE_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EMPLOYEE_SOURCE_PANEL_WIDTH}px`,
          // Animate column width change when panel collapses
          transition: `grid-template-columns ${LAYOUT.EMPLOYEE_SOURCE_PANEL_WIDTH * 0.5}ms cubic-bezier(0.16,1,0.3,1)`,
        }}
      >
        {/* Left: Session sidebar */}
        <SessionSidebar sessions={sessions} />

        {/* Center: Chat interface (from page.tsx) */}
        <main className="min-w-0 flex flex-col overflow-hidden bg-bg-card">
          {children}
        </main>

        {/* Right: Source attribution panel */}
        <AttributionPanelShell />
      </div>

      {/* Global overlays */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={closeCommandPalette}
        sessions={sessions}
        isAdmin={false}
      />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
```

---

## FILE 3: src/components/shared/EmployeeTopbar.tsx (COMPLETE)

```typescript
'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { StatusDot } from '@/components/ui/status-dot'
import { useChatStore } from '@/stores/chatStore'
import { useAuth } from '@/hooks/useAuth'
import { LAYOUT } from '@/lib/constants'

/**
 * Employee portal top bar.
 * Fixed height (52px). Contains:
 * - Left: Sona Comstar logo + "AEGIS" brand name
 * - Center: WebSocket connection status
 * - Right: Dark mode toggle + user avatar
 */
export function EmployeeTopbar() {
  const { websocket } = useChatStore()
  const { role } = useAuth()

  // Derive connection status from WebSocket readyState
  const wsStatus =
    !websocket ? 'offline'
    : websocket.readyState === WebSocket.OPEN ? 'online'
    : websocket.readyState === WebSocket.CONNECTING ? 'connecting'
    : 'offline'

  return (
    <header
      className={cn(
        'flex items-center justify-between',
        'bg-bg-card border-b border-border-primary',
        'px-4 shrink-0 z-sticky',
      )}
      style={{ height: LAYOUT.EMPLOYEE_TOPBAR_HEIGHT }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0 shadow-sm">
          <Image
            src="/logo.svg"
            alt="Sona Comstar"
            width={18}
            height={18}
            className="object-contain brightness-0 invert"
            onError={(e) => {
              const t = e.target as HTMLImageElement
              t.style.display = 'none'
            }}
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-text-primary tracking-tight">AEGIS</span>
          <span className="text-xs text-text-tertiary font-normal hidden lg:block">
            SAP Intelligence
          </span>
        </div>
      </div>

      {/* Connection status */}
      <StatusDot status={wsStatus} showLabel size="sm" />

      {/* Controls */}
      <div className="flex items-center gap-2">
        <ThemeToggle size="sm" />
        <UserAvatar role={role} />
      </div>
    </header>
  )
}

function UserAvatar({ role }: { role: string | null }) {
  const initials = role === 'it-admin' ? 'IT' : 'U'

  return (
    <div
      className={cn(
        'w-7 h-7 rounded-full',
        'bg-accent-subtle border border-border-focus/30',
        'flex items-center justify-center',
        'text-xs font-semibold text-accent-text',
        'select-none',
      )}
      role="img"
      aria-label={`Logged in as ${role ?? 'user'}`}
    >
      {initials}
    </div>
  )
}
```

---

## FILE 4: src/components/sessions/SessionSidebar.tsx (COMPLETE)

```typescript
'use client'

import { useMemo, useCallback } from 'react'
import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupSessionsByDate } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useSessionStore } from '@/stores/sessionStore'
import { useChatStore } from '@/stores/chatStore'
import { SessionCard } from './SessionCard'
import { Skeleton } from '@/components/ui/skeleton'
import type { Session } from '@/types'
import { LAYOUT } from '@/lib/constants'

interface SessionSidebarProps {
  sessions: Session[]
  isLoading?: boolean
}

/**
 * Left sidebar panel of the employee portal.
 * Shows session history grouped by date with search.
 *
 * Width: LAYOUT.EMPLOYEE_SIDEBAR_WIDTH (180px)
 * Layout: header (label + new button) → search input → grouped session list
 */
export function SessionSidebar({ sessions, isLoading = false }: SessionSidebarProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const searchQuery = useSessionStore((s) => s.searchQuery)
  const pinnedIds = useSessionStore((s) => s.pinnedIds)
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery)
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId)
  const resetForNewSession = useChatStore((s) => s.resetForNewSession)

  // Debounce client-side search filter
  const debouncedSearch = useDebounce(searchQuery, 200)

  // Sort + filter sessions
  const sortedFiltered = useMemo(() => {
    let result = [...sessions]

    // Sort: pinned first, then by date descending
    result.sort((a, b) => {
      const aPinned = pinnedIds.has(a.id)
      const bPinned = pinnedIds.has(b.id)
      if (aPinned && !bPinned) return -1
      if (!aPinned && bPinned) return 1
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

    // Filter by search query
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (s) =>
          s.topic_summary.toLowerCase().includes(q) ||
          s.module_tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    return result
  }, [sessions, pinnedIds, debouncedSearch])

  // Group by date label
  const grouped = useMemo(
    () => groupSessionsByDate(sortedFiltered),
    [sortedFiltered]
  )

  const handleNewSession = useCallback(() => {
    resetForNewSession()
    setActiveSessionId(null)
  }, [resetForNewSession, setActiveSessionId])

  return (
    <aside
      className={cn(
        'flex flex-col h-full',
        'bg-bg-secondary border-r border-border-primary',
        'overflow-hidden',
      )}
      style={{ width: LAYOUT.EMPLOYEE_SIDEBAR_WIDTH }}
      aria-label="Session history"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <span className="section-label">Sessions</span>
        <button
          onClick={handleNewSession}
          className={cn(
            'w-6 h-6 rounded-md flex items-center justify-center',
            'border border-border-primary bg-bg-card text-text-tertiary',
            'hover:text-text-primary hover:border-border-secondary hover:bg-bg-tertiary',
            'transition-all duration-[var(--duration-normal)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
          aria-label="New chat session"
          title="New chat (⌘N)"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pb-2 shrink-0">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className={cn(
              'w-full h-7 rounded-lg bg-bg-card border border-border-primary',
              'text-xs text-text-primary placeholder:text-text-tertiary',
              'pl-7 pr-3',
              'focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus',
              'transition-colors',
            )}
            aria-label="Search sessions"
          />
        </div>
      </div>

      {/* Session list */}
      <div
        className="flex-1 overflow-y-auto scrollbar-hide pb-4"
        role="list"
        aria-label="Sessions"
      >
        {isLoading ? (
          <SessionListSkeleton />
        ) : sortedFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
            <p className="text-xs text-text-tertiary">
              {debouncedSearch ? 'No sessions match your search' : 'No sessions yet'}
            </p>
            {!debouncedSearch && (
              <p className="text-xs text-text-tertiary opacity-60">
                Start a new chat to begin
              </p>
            )}
          </div>
        ) : (
          grouped.map(([label, groupSessions]) => (
            <div key={label} role="group" aria-label={label}>
              <p className="section-label px-3 py-2">{label}</p>
              {groupSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  isPinned={pinnedIds.has(session.id)}
                  onSelect={() => setActiveSessionId(session.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

function SessionListSkeleton() {
  return (
    <div className="px-2 space-y-1 pt-1">
      <Skeleton className="h-2.5 w-16 mb-3 ml-1" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="space-y-1.5 p-2 rounded-lg">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2 w-3/5" />
        </div>
      ))}
    </div>
  )
}
```

---

## FILE 5: src/components/sessions/SessionCard.tsx (COMPLETE)

```typescript
'use client'

import { cn } from '@/lib/utils'
import { Pin } from 'lucide-react'
import { SessionContextMenu } from './SessionContextMenu'
import type { Session } from '@/types'

interface SessionCardProps {
  session: Session
  isActive: boolean
  isPinned: boolean
  onSelect: () => void
}

/**
 * Individual session list item in the sidebar.
 * Shows: topic title (truncated), turn count, avg quality indicator.
 * Active session: white card with left accent border.
 * Hover: reveals pin indicator and context menu trigger.
 */
export function SessionCard({
  session,
  isActive,
  isPinned,
  onSelect,
}: SessionCardProps) {
  const qualityColor =
    session.avg_confidence_score == null
      ? 'bg-border-primary'
      : session.avg_confidence_score >= 0.85
      ? 'bg-success'
      : session.avg_confidence_score >= 0.70
      ? 'bg-warning'
      : 'bg-danger'

  const avgPercent =
    session.avg_confidence_score != null
      ? `${Math.round(session.avg_confidence_score * 100)}%`
      : null

  return (
    <SessionContextMenu session={session} isPinned={isPinned}>
      <div
        role="listitem"
        onClick={onSelect}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? onSelect() : null}
        className={cn(
          'group relative mx-1.5 my-0.5 rounded-lg cursor-pointer',
          'px-2.5 py-2',
          'transition-all duration-[var(--duration-normal)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          isActive
            ? [
                'bg-bg-card border border-border-primary shadow-sm',
                'border-l-2 border-l-accent',
              ]
            : 'hover:bg-bg-card hover:border hover:border-border-primary',
        )}
        aria-current={isActive ? 'page' : undefined}
        aria-label={`Session: ${session.topic_summary}`}
      >
        {/* Pin indicator (shown when pinned or on hover) */}
        {isPinned && (
          <Pin
            className="absolute top-2 right-2 w-2.5 h-2.5 text-text-tertiary opacity-60"
            aria-label="Pinned"
          />
        )}

        {/* Title */}
        <p className="text-xs font-medium text-text-primary leading-snug pr-4 truncate-2">
          {session.topic_summary}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 mt-1.5">
          {/* Quality dot */}
          <span
            className={cn('w-1.5 h-1.5 rounded-full shrink-0', qualityColor)}
            aria-hidden="true"
          />
          <span className="text-xs text-text-tertiary truncate">
            {session.turn_count} {session.turn_count === 1 ? 'turn' : 'turns'}
            {avgPercent && ` · ${avgPercent}`}
          </span>
        </div>
      </div>
    </SessionContextMenu>
  )
}
```

---

## FILE 6: src/components/sessions/SessionContextMenu.tsx (COMPLETE)

```typescript
'use client'

import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Pin, PinOff, Pencil, Trash2, Download } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { exportSessionAsPDF } from '@/lib/sessionExport'
import { TOAST } from '@/lib/toast'
import { api } from '@/lib/api'
import type { Session } from '@/types'

interface SessionContextMenuProps {
  session: Session
  isPinned: boolean
  children: React.ReactNode
}

/**
 * Right-click context menu for session cards.
 * Built on Radix DropdownMenu — triggered by right-click on the session card.
 * Actions: pin/unpin, rename, delete, export PDF.
 */
export function SessionContextMenu({
  session,
  isPinned,
  children,
}: SessionContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(session.topic_summary)

  const { togglePin, renameSession, removeSession } = useSessionStore()

  async function handleDelete() {
    removeSession(session.id) // optimistic
    await api.delete(`sessions/${session.id}`)
    TOAST.sessionDeleted()
  }

  async function handleRename() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === session.topic_summary) {
      setRenaming(false)
      return
    }
    renameSession(session.id, trimmed) // optimistic
    await api.put(`sessions/${session.id}`, { topic_summary: trimmed })
    TOAST.sessionRenamed()
    setRenaming(false)
  }

  async function handleExport() {
    // Load full messages for this session, then export
    const sessionData = await api.get<{ messages: any[] }>(`sessions/${session.id}`)
    await exportSessionAsPDF(sessionData.messages, session.topic_summary)
    TOAST.sessionExported()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/* Trigger is the right-click on the child element */}
      <DropdownMenuTrigger
        asChild
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
            isPinned ? TOAST.sessionUnpinned() : TOAST.sessionPinned()
          }}
          className="flex items-center gap-2.5 text-sm cursor-pointer"
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          {isPinned ? 'Unpin session' : 'Pin session'}
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
    </DropdownMenu>
  )
}
```

---

## FILE 7: src/components/chat/AttributionPanelShell.tsx (COMPLETE)

```typescript
'use client'

import { ChevronRight, ChevronLeft, PanelRightClose, PanelRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { AttributionPanel } from '@/components/chat/AttributionPanel'
import { usePanelStore } from '@/stores/panelStore'
import { useChatStore } from '@/stores/chatStore'
import { LAYOUT } from '@/lib/constants'

/**
 * Right panel wrapper for the source attribution panel.
 * Contains: collapse toggle button + AttributionPanel content.
 *
 * When collapsed: shows a 48px icon strip with a expand chevron.
 * When expanded: shows full 210px attribution panel.
 *
 * The panel width is controlled by the parent grid (employee layout).
 * This component handles only its internal content display.
 */
export function AttributionPanelShell() {
  const { collapsed, toggle } = usePanelStore()
  const { messages, streamingState } = useChatStore()

  // Get the last AI message's attribution data
  const lastAIMessage = [...messages].reverse().find((m) => m.role === 'assistant')
  const attribution = lastAIMessage?.attributionPanel ?? null
  const isStreaming = !['idle', 'complete', 'error'].includes(streamingState)

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full',
        'bg-bg-secondary border-l border-border-primary',
        'overflow-hidden',
        'transition-all duration-[250ms]',
      )}
      aria-label="Source attribution panel"
    >
      {/* Collapse toggle button */}
      <button
        onClick={toggle}
        className={cn(
          'absolute top-3 left-2 z-dropdown',
          'w-6 h-6 rounded-md flex items-center justify-center',
          'text-text-tertiary',
          'hover:text-text-primary hover:bg-bg-card hover:border hover:border-border-primary',
          'transition-all duration-[var(--duration-normal)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        )}
        aria-label={collapsed ? 'Expand source panel' : 'Collapse source panel'}
        title={collapsed ? 'Expand source panel' : 'Collapse source panel'}
      >
        {collapsed ? (
          <PanelRight className="w-3.5 h-3.5" />
        ) : (
          <PanelRightClose className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Panel content — hidden when collapsed */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-hide pt-1">
          <AttributionPanel
            attribution={attribution}
            isLoading={isStreaming && !attribution}
          />
        </div>
      )}

      {/* Collapsed icon strip */}
      {collapsed && (
        <div className="flex-1 flex flex-col items-center pt-12 gap-3">
          {/* Visual hint that panel has content */}
          {attribution && (
            <div
              className="w-1.5 h-1.5 rounded-full bg-success animate-status-pulse"
              aria-hidden="true"
              title="Source available — expand panel to view"
            />
          )}
        </div>
      )}
    </aside>
  )
}
```

---

## FILE 8: src/app/(admin)/layout.tsx (COMPLETE)

```typescript
'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { AdminNav } from '@/components/admin/AdminNav'
import { AdminTopbar } from '@/components/admin/AdminTopbar'
import { CommandPalette } from '@/components/shared/CommandPalette'
import { KeyboardShortcutsOverlay } from '@/components/shared/KeyboardShortcutsOverlay'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { LoadingScreen } from '@/components/shared/LoadingScreen'
import { useUIStore } from '@/stores/uiStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAuth } from '@/hooks/useAuth'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()
  const router = useRouter()
  const { isAuthenticated, isAdmin, initializing } = useAuth() as any
  const { commandPaletteOpen, toggleCommandPalette, closeCommandPalette } = useUIStore()

  // Force dark mode for admin portal — the monitoring console aesthetic
  useEffect(() => {
    setTheme('dark')
  }, [setTheme])

  // Redirect non-admin users
  useEffect(() => {
    if (!initializing && isAuthenticated && !isAdmin) {
      router.replace('/')
    }
  }, [isAuthenticated, isAdmin, initializing, router])

  // ⌘K
  useKeyboardShortcuts([
    { key: 'k', meta: true, handler: toggleCommandPalette, preventDefault: true },
  ])

  if (initializing) return <LoadingScreen />

  return (
    <div className="flex h-dvh overflow-hidden bg-bg-primary">
      <OfflineBanner />

      {/* Fixed-width sidebar */}
      <AdminNav />

      {/* Scrollable main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminTopbar />
        <main
          className="flex-1 overflow-y-auto"
          id="admin-main-content"
        >
          {children}
        </main>
      </div>

      {/* Global overlays */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={closeCommandPalette}
        isAdmin
      />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
```

---

## FILE 9: src/components/admin/AdminNav.tsx (COMPLETE)

```typescript
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { logout } from '@/lib/auth'
import { useReviewQueueCount } from '@/hooks/queries'
import { ADMIN_NAV_ITEMS, LAYOUT } from '@/lib/constants'
import { LogOut } from 'lucide-react'

// Pages that get a "new" badge (added beyond original spec)
const NEW_PAGES = new Set(['/admin/dashboard', '/admin/system-health', '/admin/analytics'])

/**
 * Admin portal navigation sidebar.
 * Fixed width: LAYOUT.ADMIN_SIDEBAR_WIDTH (220px).
 *
 * Contains:
 * - Brand: Sona Comstar logo + "Admin" text
 * - Nav items list with new/badge indicators
 * - Review queue live count badge
 * - Bottom: user info + logout
 */
export function AdminNav() {
  const pathname = usePathname()
  const { data: reviewCount = 0 } = useReviewQueueCount()

  return (
    <nav
      className={cn(
        'flex flex-col h-dvh shrink-0',
        'bg-bg-primary border-r border-border-primary',
        'overflow-hidden z-sticky',
      )}
      style={{ width: LAYOUT.ADMIN_SIDEBAR_WIDTH }}
      aria-label="Admin navigation"
    >
      {/* Brand */}
      <div
        className="flex items-center gap-2.5 px-4 border-b border-border-primary shrink-0"
        style={{ height: LAYOUT.ADMIN_TOPBAR_HEIGHT }}
      >
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <Image
            src="/logo.svg"
            alt="Sona Comstar"
            width={18}
            height={18}
            className="object-contain brightness-0 invert"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary leading-none">AEGIS</p>
          <p className="text-xs text-text-tertiary mt-0.5">Admin</p>
        </div>
      </div>

      {/* Navigation items */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/admin/dashboard'
              ? pathname === '/admin/dashboard' || pathname === '/admin'
              : pathname.startsWith(item.href)

          const isReviewQueue = item.href === '/admin/review-queue'
          const isNew = NEW_PAGES.has(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'nav-item w-full',
                isActive && 'active',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="flex-1 text-sm">{item.label}</span>

              {/* Review queue count badge */}
              {isReviewQueue && reviewCount > 0 && (
                <Badge
                  variant="warning"
                  className="tabular-nums text-[10px] px-1.5 py-0 min-w-[18px] h-4 flex items-center justify-center"
                >
                  {reviewCount > 99 ? '99+' : reviewCount}
                </Badge>
              )}

              {/* New page badge */}
              {isNew && !isReviewQueue && (
                <span className="text-[9px] font-bold text-accent bg-accent-subtle border border-border-focus/30 rounded px-1 py-0.5 uppercase tracking-wide">
                  new
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Bottom: user + logout */}
      <div className="border-t border-border-primary p-3 shrink-0">
        <button
          onClick={logout}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg',
            'text-sm text-text-secondary',
            'hover:bg-bg-secondary hover:text-text-primary',
            'transition-colors duration-[var(--duration-normal)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </nav>
  )
}
```

---

## FILE 10: src/components/admin/AdminTopbar.tsx (COMPLETE)

```typescript
'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { ADMIN_NAV_ITEMS, LAYOUT } from '@/lib/constants'

/**
 * Admin portal page-level header.
 * Fixed height (52px). Content:
 * - Left: current page title + short description
 * - Right: skip-to-content link (a11y) + theme toggle
 *
 * Page titles and descriptions are derived from the current pathname
 * matched against ADMIN_NAV_ITEMS.
 */
export function AdminTopbar() {
  const pathname = usePathname()

  // Match current pathname to nav item for page title
  const currentNav = ADMIN_NAV_ITEMS.find((item) =>
    item.href === '/admin/dashboard'
      ? pathname === '/admin/dashboard' || pathname === '/admin'
      : pathname.startsWith(item.href)
  )

  const pageTitle = currentNav?.label ?? 'Admin'

  // Short descriptions per admin page
  const PAGE_DESCRIPTIONS: Record<string, string> = {
    '/admin/dashboard':      'Live quality overview',
    '/admin/documents':      'Manage knowledge documents',
    '/admin/registry':       'Known error patterns',
    '/admin/config-snapshot':'SAP configuration values',
    '/admin/knowledge-gaps': 'Unanswered query analysis',
    '/admin/audit-trail':    'Employee interaction history',
    '/admin/review-queue':   'Human review workflow',
    '/admin/tickets':        'Escalated support tickets',
    '/admin/system-health':  '19 Docker service statuses',
    '/admin/analytics':      'Quality trend reporting',
  }

  const pageDesc = PAGE_DESCRIPTIONS[currentNav?.href ?? ''] ?? ''

  return (
    <header
      className={cn(
        'flex items-center justify-between',
        'border-b border-border-primary bg-bg-primary',
        'px-6 shrink-0',
      )}
      style={{ height: LAYOUT.ADMIN_TOPBAR_HEIGHT }}
    >
      {/* Page identity */}
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold text-text-primary">{pageTitle}</h1>
        {pageDesc && (
          <span className="text-xs text-text-tertiary hidden lg:block">{pageDesc}</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Skip to main content link (a11y) */}
        <a
          href="#admin-main-content"
          className="sr-only focus:not-sr-only focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-xs focus:bg-bg-secondary focus:text-text-primary focus:ring-2 focus:ring-border-focus"
        >
          Skip to content
        </a>
        <ThemeToggle size="sm" />
      </div>
    </header>
  )
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Employee portal loads
# → http://localhost:3000/
# → Should see: topbar + session sidebar (left) + main area + collapsed panel (right)
# → SessionSidebar: "Sessions" label, "+" button, search input
# → Topbar: AEGIS brand, status dot, theme toggle

# Step 2: Panel collapse works
# → Click the collapse button in the attribution panel shell
# → Right column should animate to 48px width
# → Panel content disappears, icon strip shows
# → Click again → expands back to 210px

# Step 3: Admin portal loads
# → http://localhost:3000/admin/dashboard (must be it-admin role)
# → Should see: dark background, admin nav sidebar (220px), topbar, main area
# → Dark mode should be active (navy background, light text)
# → AdminNav: "AEGIS Admin" brand, all 10 nav items

# Step 4: AdminNav active state
# → Current route shows: white text, left cyan border indicator (3px)

# Step 5: Session context menu
# → Right-click a session card
# → Context menu appears with: pin, rename, export PDF, delete
# → Delete shows ConfirmDialog

# Step 6: New session button
# → Click "+" in session sidebar
# → Chat resets, no active session

# Step 7: TypeScript
npx tsc --noEmit
# Expected: 0 errors (query stub file resolves imports)
```

---

## COMMIT

```bash
git add -A
git commit -m "F05: Layout components — employee shell, admin shell, SessionSidebar, SessionCard, AdminNav, AdminTopbar, AttributionPanelShell"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F05 (Part 2)*
