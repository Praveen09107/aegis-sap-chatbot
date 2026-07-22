"use client"

import { useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Plus, Search } from "lucide-react"
import { cn, groupSessionsByDate } from "@/lib/utils"
import { useDebounce } from "@/hooks/useDebounce"
import { useSessionStore } from "@/stores/sessionStore"
import { useChatStore } from "@/stores/chatStore"
import { SessionCard } from "./SessionCard"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/admin/EmptyState"
import type { Session } from "@/types"
import { LAYOUT } from "@/lib/constants"

// Above this many sessions, render via TanStack Virtual instead of the plain
// mapped list (FRONTEND_28_PERFORMANCE.md) — most employees never approach
// this, so the plain list stays the default path and virtualization only
// activates for real power users with a large history.
const VIRTUALIZE_THRESHOLD = 100
const ESTIMATED_HEADER_ROW_HEIGHT = 32
const ESTIMATED_SESSION_ROW_HEIGHT = 56

type FlatRow =
  | { type: "header"; key: string; label: string }
  | { type: "session"; key: string; session: Session; groupHeaderId: string }

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
  const router = useRouter()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const searchQuery = useSessionStore((s) => s.searchQuery)
  const pinnedIds = useSessionStore((s) => s.pinnedIds)
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery)
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId)
  const resetForNewSession = useChatStore((s) => s.resetForNewSession)
  const streamingState = useChatStore((s) => s.streamingState)
  const isStreaming = !["idle", "complete", "error"].includes(streamingState)

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
  const grouped = useMemo(() => groupSessionsByDate(sortedFiltered), [sortedFiltered])

  const shouldVirtualize = sortedFiltered.length > VIRTUALIZE_THRESHOLD

  // Flattened header+session rows for the virtualized path only — TanStack
  // Virtual positions each row as an independent absolute sibling, so the
  // plain list's nested `role="group"` wrapper per date-group isn't
  // representable here; each session row instead carries aria-describedby
  // pointing at its group header's id.
  const flatRows = useMemo<FlatRow[]>(() => {
    if (!shouldVirtualize) return []
    const rows: FlatRow[] = []
    for (const [label, groupSessions] of grouped) {
      const headerId = `session-group-${label.replace(/\s+/g, "-")}`
      rows.push({ type: "header", key: headerId, label })
      for (const session of groupSessions) {
        rows.push({ type: "session", key: session.id, session, groupHeaderId: headerId })
      }
    }
    return rows
  }, [grouped, shouldVirtualize])

  const scrollParentRef = useRef<HTMLDivElement>(null)
  // React Compiler correctly can't prove @tanstack/react-virtual's returned
  // functions (getVirtualItems/getTotalSize/measureElement) are safe to
  // memoize, so it skips optimizing this component — expected and harmless
  // here: nothing in this component depends on those functions having
  // stable identity across renders, only on their (always-fresh) return
  // values being read during render, which the compiler's fallback (treat
  // this component as un-memoized) still handles correctly.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => (flatRows[index]?.type === "header" ? ESTIMATED_HEADER_ROW_HEIGHT : ESTIMATED_SESSION_ROW_HEIGHT),
    overscan: 5,
    enabled: shouldVirtualize,
  })

  const handleNewSession = useCallback(() => {
    resetForNewSession()
    setActiveSessionId(null)
    // router.replace (not push) — a URL history entry for "the moment I
    // cleared the chat" isn't a meaningful back-navigation target, and
    // without clearing the param at all, page.tsx's historical-session
    // effect would immediately reload the OLD session on the next render.
    router.replace("/")
  }, [resetForNewSession, setActiveSessionId, router])

  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId)
      // Navigate via URL (not just store state) so the session is a real,
      // bookmarkable deep link and page.tsx's ?session= loader picks it up.
      router.push(`/?session=${sessionId}`)
    },
    [setActiveSessionId, router]
  )

  return (
    <aside
      className={cn(
        "flex flex-col h-full",
        "bg-bg-secondary border-r border-border-primary",
        "overflow-hidden",
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
            "w-6 h-6 rounded-md flex items-center justify-center",
            "border border-border-primary bg-bg-card text-text-tertiary",
            "hover:text-text-primary hover:border-border-secondary hover:bg-bg-tertiary",
            "transition-all duration-[var(--duration-normal)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
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
              "w-full h-7 rounded-lg bg-bg-card border border-border-primary",
              "text-xs text-text-primary placeholder:text-text-tertiary",
              "pl-7 pr-3",
              "focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus",
              "transition-colors",
            )}
            aria-label="Search sessions"
          />
        </div>
      </div>

      {/* Session list */}
      <div
        ref={scrollParentRef}
        className="flex-1 overflow-y-auto scrollbar-hide pb-4"
        role="list"
        aria-label="Sessions"
      >
        {isLoading ? (
          <SessionListSkeleton />
        ) : sortedFiltered.length === 0 ? (
          <EmptyState
            variant="inline"
            title={debouncedSearch ? "No sessions match your search" : "No sessions yet"}
            description={debouncedSearch ? undefined : "Start a new chat to begin"}
          />
        ) : shouldVirtualize ? (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = flatRows[virtualRow.index]
              if (!row) return null
              return (
                <div
                  key={row.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.type === "header" ? (
                    <p id={row.key} className="section-label px-3 py-2">
                      {row.label}
                    </p>
                  ) : (
                    <SessionCard
                      session={row.session}
                      isActive={row.session.id === activeSessionId}
                      isPinned={pinnedIds.has(row.session.id)}
                      isSelectDisabled={isStreaming && row.session.id !== activeSessionId}
                      onSelect={() => handleSessionSelect(row.session.id)}
                      describedById={row.groupHeaderId}
                    />
                  )}
                </div>
              )
            })}
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
                  isSelectDisabled={isStreaming && session.id !== activeSessionId}
                  onSelect={() => handleSessionSelect(session.id)}
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
