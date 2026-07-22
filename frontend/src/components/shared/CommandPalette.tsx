"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Command } from "cmdk"
import { useRouter, usePathname } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import {
  Search,
  Plus,
  History,
  LayoutDashboard,
  FileText,
  Link2,
  Settings,
  SearchCode,
  ClipboardList,
  CheckSquare,
  Ticket,
  Activity,
  BarChart2,
  Moon,
  Sun,
  Keyboard,
  HelpCircle,
  X,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useDebounce } from "@/hooks/useDebounce"
import { useCommandHistory } from "@/hooks/useCommandPalette"
import { useUIStore } from "@/stores/uiStore"
import { cn, truncate, formatRelativeDate } from "@/lib/utils"
import { ADMIN_NAV_ITEMS, LIMITS, STORAGE_KEYS, FEATURES } from "@/lib/constants"
import { FADE_IN, SCALE_IN } from "@/lib/animations"
import type { Session } from "@/types"

// ── Command item types ───────────────────────────────────────

interface CommandItem {
  id: string
  label: string
  sublabel?: string
  icon: React.ReactNode
  shortcut?: string[]
  action: () => void
  keywords?: string[]
}

// ── Props ────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sessions list from sessionStore — used for search */
  sessions?: Session[]
  /** Whether the current user is an IT admin (shows admin navigation) */
  isAdmin?: boolean
}

// ── Icon lookup for admin nav ─────────────────────────────────

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    LayoutDashboard: <LayoutDashboard className="w-4 h-4" />,
    FileText: <FileText className="w-4 h-4" />,
    Link2: <Link2 className="w-4 h-4" />,
    Settings: <Settings className="w-4 h-4" />,
    Search: <SearchCode className="w-4 h-4" />,
    ClipboardList: <ClipboardList className="w-4 h-4" />,
    CheckSquare: <CheckSquare className="w-4 h-4" />,
    Ticket: <Ticket className="w-4 h-4" />,
    Activity: <Activity className="w-4 h-4" />,
    BarChart2: <BarChart2 className="w-4 h-4" />,
  }
  return <>{icons[name] ?? <Settings className="w-4 h-4" />}</>
}

// ── Admin navigation commands ────────────────────────────────

const ADMIN_NAV_COMMANDS: CommandItem[] = ADMIN_NAV_ITEMS.map((item) => ({
  id: `nav:${item.href}`,
  label: item.label,
  sublabel: "Admin portal",
  icon: <NavIcon name={item.icon} />,
  action: () => {}, // router.push set at runtime
  keywords: [item.label.toLowerCase()],
}))

// ── Main component ───────────────────────────────────────────

export function CommandPalette({ open, onOpenChange, sessions = [], isAdmin = false }: CommandPaletteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { addToHistory } = useCommandHistory()

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 150)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset search when closed
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setSearch(""), 200)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [open])

  // ── Action handler ──────────────────────────────────────────

  const runCommand = useCallback(
    (commandId: string, action: () => void) => {
      addToHistory(commandId)
      onOpenChange(false)
      // Small delay so the palette closes before navigation
      setTimeout(action, 50)
    },
    [addToHistory, onOpenChange]
  )

  // ── Static commands ─────────────────────────────────────────

  const quickActions: CommandItem[] = [
    {
      id: "action:new-chat",
      label: "New chat",
      sublabel: "Start a fresh session",
      icon: <Plus className="w-4 h-4" />,
      shortcut: ["⌘", "N"],
      action: () => {
        if (pathname !== "/") router.push("/")
        // chatStore.startNewSession() — wired by parent
      },
    },
    {
      id: "action:history",
      label: "Session history",
      sublabel: "Browse all past sessions",
      icon: <History className="w-4 h-4" />,
      action: () => router.push("/history"),
    },
    {
      id: "action:toggle-theme",
      label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
      sublabel: "Toggle display theme",
      icon: theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
      action: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
    {
      id: "action:shortcuts",
      label: "Keyboard shortcuts",
      sublabel: "View all shortcuts",
      icon: <Keyboard className="w-4 h-4" />,
      shortcut: ["⌘", "/"],
      action: () => {
        // Emit event to open shortcuts overlay
        document.dispatchEvent(new CustomEvent("aegis:open-shortcuts"))
      },
    },
    // Onboarding re-trigger (FRONTEND_15) — employee-only, feature-flagged.
    // Clears the completion flag and flips the same uiStore.onboardingVisible
    // flag the employee layout's first-time check reads, so OnboardingModal
    // (rendered once, at the layout level) reopens from step 1.
    ...(!isAdmin && FEATURES.ONBOARDING
      ? [
          {
            id: "action:restart-onboarding",
            label: "Restart walkthrough",
            sublabel: "Replay the AEGIS onboarding guide",
            icon: <HelpCircle className="w-4 h-4" />,
            action: () => {
              localStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
              useUIStore.getState().setOnboardingVisible(true)
            },
          },
        ]
      : []),
  ]

  // ── Session search results ──────────────────────────────────

  const searchResults: Session[] =
    debouncedSearch.length > 1
      ? sessions
          .filter(
            (s) =>
              s.topic_summary.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
              s.module_tags.some((t) => t.toLowerCase().includes(debouncedSearch.toLowerCase()))
          )
          .slice(0, LIMITS.MAX_COMMAND_PALETTE_RESULTS)
      : []

  const recentSessions = sessions.slice(0, LIMITS.MAX_RECENT_COMMANDS)

  // ── Admin navigation ────────────────────────────────────────

  const adminNavCommands = ADMIN_NAV_COMMANDS.map((cmd) => ({
    ...cmd,
    action: () => router.push(cmd.id.replace("nav:", "")),
  }))

  // ── Render ──────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            variants={FADE_IN}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-overlay bg-black/40 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />

          {/* Palette */}
          <motion.div
            key="palette"
            variants={SCALE_IN}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn("fixed top-[20%] left-1/2 -translate-x-1/2", "z-command w-full max-w-[560px] mx-4")}
            role="dialog"
            aria-label="Command palette"
            aria-modal="true"
          >
            <Command className={cn("bg-bg-card border border-border-primary rounded-xl", "shadow-xl overflow-hidden")} shouldFilter={false} loop>
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 border-b border-border-primary">
                <Search className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
                <Command.Input
                  ref={inputRef}
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search sessions, navigate, or take action..."
                  className={cn(
                    "flex-1 h-12 bg-transparent",
                    "text-sm text-text-primary placeholder:text-text-tertiary",
                    "focus:outline-none",
                    "border-0 ring-0"
                  )}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-text-tertiary hover:text-text-secondary transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="hidden sm:flex items-center gap-1 text-text-tertiary text-xs">
                  <span>esc</span>
                </kbd>
              </div>

              {/* Results */}
              <Command.List className="max-h-80 overflow-y-auto py-2 scrollbar-hide" aria-label="Command results">
                <Command.Empty className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-text-tertiary">
                  <Search className="w-8 h-8 opacity-30" />
                  <span>No results for &ldquo;{search}&rdquo;</span>
                </Command.Empty>

                {/* Session search results */}
                {searchResults.length > 0 && (
                  <Command.Group
                    heading="Sessions"
                    className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2"
                  >
                    {searchResults.map((session) => (
                      <CommandRow
                        key={session.id}
                        id={`session:${session.id}`}
                        icon={<History className="w-4 h-4" />}
                        label={truncate(session.topic_summary, 60)}
                        sublabel={`${formatRelativeDate(session.updated_at)} · ${session.turn_count} turns`}
                        onSelect={() => runCommand(`session:${session.id}`, () => router.push(`/?session=${session.id}`))}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Quick actions (always shown when not searching) */}
                {!debouncedSearch && (
                  <Command.Group
                    heading="Actions"
                    className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2"
                  >
                    {quickActions.map((cmd) => (
                      <CommandRow
                        key={cmd.id}
                        id={cmd.id}
                        icon={cmd.icon}
                        label={cmd.label}
                        sublabel={cmd.sublabel}
                        shortcut={cmd.shortcut}
                        onSelect={() => runCommand(cmd.id, cmd.action)}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Admin navigation (admin users only) */}
                {isAdmin && (
                  <Command.Group
                    heading="Navigate"
                    className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2"
                  >
                    {adminNavCommands
                      .filter((cmd) => !debouncedSearch || cmd.label.toLowerCase().includes(debouncedSearch.toLowerCase()))
                      .slice(0, debouncedSearch ? 10 : 5)
                      .map((cmd) => (
                        <CommandRow
                          key={cmd.id}
                          id={cmd.id}
                          icon={cmd.icon}
                          label={cmd.label}
                          sublabel={cmd.sublabel}
                          onSelect={() => runCommand(cmd.id, cmd.action)}
                        />
                      ))}
                  </Command.Group>
                )}

                {/* Recent sessions (when not searching) */}
                {!debouncedSearch && recentSessions.length > 0 && (
                  <Command.Group
                    heading="Recent sessions"
                    className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2"
                  >
                    {recentSessions.map((session) => (
                      <CommandRow
                        key={session.id}
                        id={`recent:${session.id}`}
                        icon={<History className="w-4 h-4" />}
                        label={truncate(session.topic_summary, 60)}
                        sublabel={formatRelativeDate(session.updated_at)}
                        onSelect={() => runCommand(`recent:${session.id}`, () => router.push(`/?session=${session.id}`))}
                      />
                    ))}
                  </Command.Group>
                )}
              </Command.List>

              {/* Footer hint */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-border-primary">
                <div className="flex items-center gap-3 text-xs text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <kbd className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px]">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px]">↵</kbd>
                    select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px]">esc</kbd>
                    close
                  </span>
                </div>
                <span className="text-xs text-text-tertiary">AEGIS</span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── CommandRow sub-component ─────────────────────────────────

interface CommandRowProps {
  id: string
  icon: React.ReactNode
  label: string
  sublabel?: string
  shortcut?: string[]
  onSelect: () => void
}

function CommandRow({ id, icon, label, sublabel, shortcut, onSelect }: CommandRowProps) {
  return (
    <Command.Item
      value={id}
      onSelect={onSelect}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 mx-1 rounded-lg",
        "text-sm text-text-primary cursor-pointer",
        "transition-colors duration-100",
        "aria-selected:bg-bg-secondary",
        "focus:outline-none",
        "group"
      )}
    >
      {/* Icon */}
      <span
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-lg shrink-0",
          "bg-bg-tertiary border border-border-primary",
          "text-text-secondary",
          "group-aria-selected:bg-accent-subtle group-aria-selected:border-border-focus group-aria-selected:text-accent",
          "transition-colors duration-100"
        )}
        aria-hidden="true"
      >
        {icon}
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <span className="block font-medium truncate">{label}</span>
        {sublabel && <span className="block text-xs text-text-tertiary truncate mt-0.5">{sublabel}</span>}
      </div>

      {/* Shortcut */}
      {shortcut && (
        <div className="flex items-center gap-1 shrink-0">
          {shortcut.map((key, i) => (
            <kbd
              key={i}
              className={cn(
                "inline-flex items-center justify-center",
                "bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5",
                "text-[10px] text-text-tertiary font-medium",
                "min-w-[20px]"
              )}
            >
              {key}
            </kbd>
          ))}
        </div>
      )}
    </Command.Item>
  )
}
