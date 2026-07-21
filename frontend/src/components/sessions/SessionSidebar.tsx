"use client"

import { useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { cn, groupSessionsByDate } from "@/lib/utils"
import { useDebounce } from "@/hooks/useDebounce"
import { useSessionStore } from "@/stores/sessionStore"
import { useChatStore } from "@/stores/chatStore"
import { SessionCard } from "./SessionCard"
import { Skeleton } from "@/components/ui/skeleton"
import type { Session } from "@/types"
import { LAYOUT } from "@/lib/constants"

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
        className="flex-1 overflow-y-auto scrollbar-hide pb-4"
        role="list"
        aria-label="Sessions"
      >
        {isLoading ? (
          <SessionListSkeleton />
        ) : sortedFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
            <p className="text-xs text-text-tertiary">
              {debouncedSearch ? "No sessions match your search" : "No sessions yet"}
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
