"use client"

import { useRef, useEffect } from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/sessionStore"

interface SessionSearchProps {
  /** If true, auto-focuses on mount (used in the history page) */
  autoFocus?: boolean
  placeholder?: string
  className?: string
}

/**
 * Standalone session search input, reading/writing sessionStore.searchQuery.
 * Intended for the Session History page (not yet built — F10). The
 * employee sidebar (SessionSidebar) keeps its own inline search input,
 * built in F07 before this component existed; both read the same
 * sessionStore.searchQuery, so ⌘F's focus target
 * (aside[aria-label="Session history"] input[type="search"]) already
 * matches the sidebar's input regardless of which component is on screen.
 */
export function SessionSearch({ autoFocus = false, placeholder = "Search sessions...", className }: SessionSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const searchQuery = useSessionStore((s) => s.searchQuery)
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="absolute left-3 w-3.5 h-3.5 text-text-tertiary pointer-events-none" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-9 rounded-lg",
          "bg-bg-secondary border border-border-primary",
          "text-sm text-text-primary placeholder:text-text-tertiary",
          "pl-9 pr-8",
          "focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus",
          "transition-colors duration-[var(--duration-normal)]"
        )}
        aria-label="Search sessions by topic, error code, or SAP module"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery("")}
          className="absolute right-2.5 text-text-tertiary hover:text-text-secondary transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
