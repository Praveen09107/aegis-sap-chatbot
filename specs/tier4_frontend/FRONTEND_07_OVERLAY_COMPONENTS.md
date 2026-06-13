# FRONTEND_07: OVERLAY COMPONENTS
## CommandPalette, Drawer, Toast Utilities, Keyboard Shortcuts Overlay
## Session F04 Implementation Guide (Part 2)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F04 Part 2: Overlay components.
Run after FRONTEND_06_DATA_COMPONENTS.md in the same session.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates:**
```
src/components/shared/
├── CommandPalette.tsx            ← ⌘K command palette (cmdk-based)
├── KeyboardShortcutsOverlay.tsx  ← ⌘/ shortcuts reference overlay

src/hooks/
└── useCommandPalette.ts          ← Open/close state + history

src/lib/
└── toast.ts                      ← Typed toast helper functions

src/components/ui/
└── drawer.tsx                    ← Side-panel drawer (re-exports Sheet)
```

**Note on Zustand stores:** The CommandPalette references `uiStore` for its
open state. The uiStore is fully specified in FRONTEND_10_ZUSTAND_STORES.md.
For this session, implement the CommandPalette to accept `open` and `onOpenChange`
props. The layouts will wire up uiStore once it exists.

---

## FILE 1: src/lib/toast.ts (COMPLETE)

```typescript
/**
 * AEGIS Typed Toast Helpers
 *
 * Wraps Sonner's toast functions with consistent AEGIS styling and messages.
 * Always use these helpers instead of calling sonner's toast directly.
 *
 * @example
 * toastSuccess('Document deprecated successfully')
 * toastError('Failed to upload file — check file size and try again')
 * toastLoading('Uploading document...')
 * toastPromise(uploadDoc(), { loading: 'Uploading...', success: 'Uploaded!', error: 'Failed' })
 */

import { toast } from 'sonner'

// ── Core helpers ──────────────────────────────────────────────

export function toastSuccess(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 4000,
  })
}

export function toastError(message: string, description?: string) {
  toast.error(message, {
    description,
    duration: 6000,    // Errors stay longer
  })
}

export function toastWarning(message: string, description?: string) {
  toast.warning(message, {
    description,
    duration: 5000,
  })
}

export function toastInfo(message: string, description?: string) {
  toast.info(message, {
    description,
    duration: 4000,
  })
}

/**
 * Dismissible loading toast — returns toast ID for dismissal.
 * Must call toast.dismiss(id) when operation completes.
 *
 * @example
 * const id = toastLoading('Generating PDF...')
 * await generatePDF()
 * toast.dismiss(id)
 * toastSuccess('PDF downloaded')
 */
export function toastLoading(message: string): string | number {
  return toast.loading(message, { duration: Infinity })
}

/**
 * Promise-based toast — automatically transitions between loading/success/error.
 * The cleanest pattern for async operations.
 *
 * @example
 * toastPromise(api.post('admin/registry/abc/approve'), {
 *   loading: 'Approving entry...',
 *   success: 'Registry entry approved',
 *   error: 'Failed to approve entry',
 * })
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((error: unknown) => string)
  }
): Promise<T> {
  return toast.promise(promise, messages) as Promise<T>
}

// ── AEGIS-specific toast messages ────────────────────────────

export const TOAST = {
  // Document operations
  documentUploaded: () => toastSuccess('Document uploaded', 'Ingestion started in background'),
  documentDeprecated: (id: string) => toastSuccess(`${id} deprecated`),
  documentsFailed: () => toastError('Upload failed', 'Check file size (max 50MB) and format'),

  // Registry operations
  registryApproved: () => toastSuccess('Registry entry approved'),
  registryRejected: () => toastSuccess('Registry entry rejected'),

  // Config operations
  configSaved: (key: string) => toastSuccess(`${key} saved`),
  configSaveFailed: () => toastError('Save failed', 'Check your connection and retry'),

  // Review queue
  correctionSubmitted: () => toastSuccess('Correction submitted to knowledge base'),
  correctionSkipped: () => toastInfo('Item skipped — moved to end of queue'),

  // Ticket operations
  ticketUpdated: () => toastSuccess('Ticket updated'),
  ticketMoved: (status: string) => toastSuccess(`Ticket moved to ${status}`),

  // Session operations
  sessionPinned: () => toastSuccess('Session pinned'),
  sessionUnpinned: () => toastInfo('Session unpinned'),
  sessionRenamed: () => toastSuccess('Session renamed'),
  sessionDeleted: () => toastSuccess('Session deleted'),
  sessionExported: () => toastSuccess('PDF downloaded'),

  // Auth
  sessionExpired: () => toastError('Session expired', 'Redirecting to login...'),
  networkError: () => toastError('Network error', 'Check your connection and try again'),

  // Feedback
  feedbackPositive: () => toastSuccess('Thanks! Positive feedback recorded'),
  feedbackNegative: () => toastInfo('Feedback recorded — question flagged for review'),
} as const
```

---

## FILE 2: src/hooks/useCommandPalette.ts (COMPLETE)

```typescript
'use client'

import { useState, useCallback } from 'react'
import { STORAGE_KEYS, LIMITS } from '@/lib/constants'

/**
 * Manages CommandPalette open state and command history.
 *
 * The open/close state is kept locally in layouts.
 * Once uiStore (FRONTEND_10) is created, wire this to uiStore.commandPaletteOpen.
 *
 * @example
 * // In employee layout:
 * const { isOpen, open, close, toggle } = useCommandPalette()
 * useKeyboardShortcuts([{ key: 'k', meta: true, handler: toggle, preventDefault: true }])
 * <CommandPalette open={isOpen} onOpenChange={close} />
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return { isOpen, open, close, toggle }
}

/**
 * Tracks recently used commands for "Recent" section in CommandPalette.
 */
export function useCommandHistory() {
  function getHistory(): string[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.COMMAND_PALETTE_HISTORY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  function addToHistory(commandId: string) {
    const history = getHistory().filter((id) => id !== commandId)
    const next = [commandId, ...history].slice(0, LIMITS.MAX_RECENT_COMMANDS)
    try {
      localStorage.setItem(STORAGE_KEYS.COMMAND_PALETTE_HISTORY, JSON.stringify(next))
    } catch {
      // localStorage full — ignore
    }
  }

  return { getHistory, addToHistory }
}
```

---

## FILE 3: src/components/shared/CommandPalette.tsx (COMPLETE)

```typescript
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Command } from 'cmdk'
import { useRouter, usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Search, Plus, History, LayoutDashboard, FileText, Link2,
  Settings, SearchCode, ClipboardList, CheckSquare, Ticket,
  Activity, BarChart2, Moon, Sun, Keyboard, X,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useDebounce } from '@/hooks/useDebounce'
import { useCommandHistory } from '@/hooks/useCommandPalette'
import { useAuth } from '@/hooks/useAuth'
import { cn, truncate, formatRelativeDate } from '@/lib/utils'
import { ADMIN_NAV_ITEMS, LIMITS } from '@/lib/constants'
import type { Session } from '@/types'

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

// ── Admin navigation commands ────────────────────────────────

const ADMIN_NAV_COMMANDS: CommandItem[] = ADMIN_NAV_ITEMS.map((item) => ({
  id: `nav:${item.href}`,
  label: item.label,
  sublabel: 'Admin portal',
  icon: <NavIcon name={item.icon} />,
  action: () => {},   // router.push set at runtime
  keywords: [item.label.toLowerCase()],
}))

// ── Icon lookup for admin nav ─────────────────────────────────

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    LayoutDashboard: <LayoutDashboard className="w-4 h-4" />,
    FileText:        <FileText className="w-4 h-4" />,
    Link2:           <Link2 className="w-4 h-4" />,
    Settings:        <Settings className="w-4 h-4" />,
    Search:          <SearchCode className="w-4 h-4" />,
    ClipboardList:   <ClipboardList className="w-4 h-4" />,
    CheckSquare:     <CheckSquare className="w-4 h-4" />,
    Ticket:          <Ticket className="w-4 h-4" />,
    Activity:        <Activity className="w-4 h-4" />,
    BarChart2:       <BarChart2 className="w-4 h-4" />,
  }
  return <>{icons[name] ?? <Settings className="w-4 h-4" />}</>
}

// ── Main component ───────────────────────────────────────────

export function CommandPalette({
  open,
  onOpenChange,
  sessions = [],
  isAdmin = false,
}: CommandPaletteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { addToHistory, getHistory } = useCommandHistory()
  const reducedMotion = useReducedMotion()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 150)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset search when closed
  useEffect(() => {
    if (!open) {
      setTimeout(() => setSearch(''), 200)
    } else {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
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
      id: 'action:new-chat',
      label: 'New chat',
      sublabel: 'Start a fresh session',
      icon: <Plus className="w-4 h-4" />,
      shortcut: ['⌘', 'N'],
      action: () => {
        if (pathname !== '/') router.push('/')
        // chatStore.startNewSession() — wired by parent
      },
    },
    {
      id: 'action:history',
      label: 'Session history',
      sublabel: 'Browse all past sessions',
      icon: <History className="w-4 h-4" />,
      action: () => router.push('/history'),
    },
    {
      id: 'action:toggle-theme',
      label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      sublabel: 'Toggle display theme',
      icon: theme === 'dark'
        ? <Sun className="w-4 h-4" />
        : <Moon className="w-4 h-4" />,
      action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'action:shortcuts',
      label: 'Keyboard shortcuts',
      sublabel: 'View all shortcuts',
      icon: <Keyboard className="w-4 h-4" />,
      shortcut: ['⌘', '/'],
      action: () => {
        // Emit event to open shortcuts overlay
        document.dispatchEvent(new CustomEvent('aegis:open-shortcuts'))
      },
    },
  ]

  // ── Session search results ──────────────────────────────────

  const searchResults: Session[] = debouncedSearch.length > 1
    ? sessions
        .filter((s) =>
          s.topic_summary.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          s.module_tags.some((t) => t.toLowerCase().includes(debouncedSearch.toLowerCase()))
        )
        .slice(0, LIMITS.MAX_COMMAND_PALETTE_RESULTS)
    : []

  const recentSessions = sessions
    .slice(0, LIMITS.MAX_RECENT_COMMANDS)

  // ── Admin navigation ────────────────────────────────────────

  const adminNavCommands = ADMIN_NAV_COMMANDS.map((cmd) => ({
    ...cmd,
    action: () => router.push(cmd.id.replace('nav:', '')),
  }))

  // ── Render ──────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.15 }}
            className="fixed inset-0 z-overlay bg-black/40 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />

          {/* Palette */}
          <motion.div
            key="palette"
            initial={reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'fixed top-[20%] left-1/2 -translate-x-1/2',
              'z-command w-full max-w-[560px] mx-4',
            )}
            role="dialog"
            aria-label="Command palette"
            aria-modal="true"
          >
            <Command
              className={cn(
                'bg-bg-card border border-border-primary rounded-xl',
                'shadow-xl overflow-hidden',
              )}
              shouldFilter={false}   // We handle filtering ourselves
              loop
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 border-b border-border-primary">
                <Search className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
                <Command.Input
                  ref={inputRef}
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search sessions, navigate, or take action..."
                  className={cn(
                    'flex-1 h-12 bg-transparent',
                    'text-sm text-text-primary placeholder:text-text-tertiary',
                    'focus:outline-none',
                    'border-0 ring-0',
                  )}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
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
              <Command.List
                className="max-h-80 overflow-y-auto py-2 scrollbar-hide"
                aria-label="Command results"
              >
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
                        onSelect={() =>
                          runCommand(`session:${session.id}`, () =>
                            router.push(`/?session=${session.id}`)
                          )
                        }
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

                {/* Admin navigation (admin users only, when searching or always) */}
                {isAdmin && (
                  <Command.Group
                    heading="Navigate"
                    className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2"
                  >
                    {adminNavCommands
                      .filter((cmd) =>
                        !debouncedSearch ||
                        cmd.label.toLowerCase().includes(debouncedSearch.toLowerCase())
                      )
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
                        onSelect={() =>
                          runCommand(`recent:${session.id}`, () =>
                            router.push(`/?session=${session.id}`)
                          )
                        }
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
        'flex items-center gap-3 px-4 py-2.5 mx-1 rounded-lg',
        'text-sm text-text-primary cursor-pointer',
        'transition-colors duration-100',
        'aria-selected:bg-bg-secondary',
        'focus:outline-none',
        'group',
      )}
    >
      {/* Icon */}
      <span
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-lg shrink-0',
          'bg-bg-tertiary border border-border-primary',
          'text-text-secondary',
          'group-aria-selected:bg-accent-subtle group-aria-selected:border-border-focus group-aria-selected:text-accent',
          'transition-colors duration-100',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <span className="block font-medium truncate">{label}</span>
        {sublabel && (
          <span className="block text-xs text-text-tertiary truncate mt-0.5">{sublabel}</span>
        )}
      </div>

      {/* Shortcut */}
      {shortcut && (
        <div className="flex items-center gap-1 shrink-0">
          {shortcut.map((key, i) => (
            <kbd
              key={i}
              className={cn(
                'inline-flex items-center justify-center',
                'bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5',
                'text-[10px] text-text-tertiary font-medium',
                'min-w-[20px]',
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
```

---

## FILE 4: src/components/shared/KeyboardShortcutsOverlay.tsx (COMPLETE)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface ShortcutEntry {
  keys: string[]
  description: string
  category: string
}

const EMPLOYEE_SHORTCUTS: ShortcutEntry[] = [
  // Chat
  { keys: ['Enter'],          description: 'Send message',          category: 'Chat' },
  { keys: ['Shift', 'Enter'], description: 'New line in message',    category: 'Chat' },
  { keys: ['⌘', 'N'],         description: 'New chat session',       category: 'Chat' },
  { keys: ['⌘', 'K'],         description: 'Open command palette',   category: 'Navigation' },
  { keys: ['⌘', '/'],         description: 'Keyboard shortcuts',     category: 'Navigation' },
  { keys: ['⌘', 'F'],         description: 'Search sessions',        category: 'Navigation' },
  { keys: ['Esc'],            description: 'Close overlay / cancel', category: 'Navigation' },
]

const ADMIN_SHORTCUTS: ShortcutEntry[] = [
  // Review queue
  { keys: ['J'],   description: 'Next review item',       category: 'Review Queue' },
  { keys: ['K'],   description: 'Previous review item',   category: 'Review Queue' },
  { keys: ['A'],   description: 'Approve correction',     category: 'Review Queue' },
  { keys: ['X'],   description: 'Skip item',              category: 'Review Queue' },
  // Navigation
  { keys: ['⌘', 'K'], description: 'Command palette',    category: 'Navigation' },
  { keys: ['⌘', '/'], description: 'Keyboard shortcuts', category: 'Navigation' },
]

/**
 * Full-screen keyboard shortcuts reference overlay.
 * Opened via ⌘/ keyboard shortcut or "Keyboard shortcuts" command palette item.
 * Listens for the custom 'aegis:open-shortcuts' event dispatched by CommandPalette.
 */
export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false)
  const { isAdmin } = useAuth()
  const reducedMotion = useReducedMotion()

  // Listen for open event from CommandPalette
  useEffect(() => {
    function handleOpen() { setOpen(true) }
    document.addEventListener('aegis:open-shortcuts', handleOpen)
    return () => document.removeEventListener('aegis:open-shortcuts', handleOpen)
  }, [])

  // ⌘/ keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const shortcuts = isAdmin
    ? [...EMPLOYEE_SHORTCUTS, ...ADMIN_SHORTCUTS]
    : EMPLOYEE_SHORTCUTS

  // Group by category
  const grouped = shortcuts.reduce<Record<string, ShortcutEntry[]>>((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = []
    acc[shortcut.category].push(shortcut)
    return acc
  }, {})

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="shortcuts-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.15 }}
            className="fixed inset-0 z-overlay bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="shortcuts-panel"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
              'z-modal w-full max-w-lg mx-4',
              'bg-bg-card border border-border-primary rounded-xl shadow-xl',
              'overflow-hidden',
            )}
            role="dialog"
            aria-label="Keyboard shortcuts"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
              <div className="flex items-center gap-2.5">
                <Keyboard className="w-4 h-4 text-text-secondary" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-text-primary">Keyboard shortcuts</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className={cn(
                  'w-7 h-7 rounded-md flex items-center justify-center',
                  'text-text-tertiary hover:text-text-primary hover:bg-bg-secondary',
                  'transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                )}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shortcuts grid */}
            <div className="p-5 grid grid-cols-1 gap-5 sm:grid-cols-2 max-h-[70vh] overflow-y-auto">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <h3 className="section-label mb-3">{category}</h3>
                  <div className="space-y-1.5">
                    {items.map((shortcut, i) => (
                      <div key={i} className="flex items-center justify-between gap-4">
                        <span className="text-sm text-text-secondary">{shortcut.description}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {shortcut.keys.map((key, j) => (
                            <kbd
                              key={j}
                              className={cn(
                                'inline-flex items-center justify-center',
                                'bg-bg-tertiary border border-border-secondary',
                                'rounded-md px-2 py-1',
                                'text-xs text-text-secondary font-medium',
                                'min-w-[28px]',
                                'shadow-sm',
                              )}
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

## FILE 5: src/components/ui/drawer.tsx (COMPLETE)

```typescript
/**
 * AEGIS Drawer Component
 *
 * A slide-in side panel for detail views, confirmations, and secondary content.
 * Built on top of shadcn Sheet (Radix Dialog).
 *
 * Used in:
 * - Ticket detail view (slides in from right, full height)
 * - Document preview (slides in from right)
 * - Config change history (slides in from right)
 * - Audit trail session replay (slides in from right)
 *
 * @example
 * <Drawer
 *   open={ticketOpen}
 *   onOpenChange={setTicketOpen}
 *   title="Ticket #TKT-0042"
 *   description="VL150 delivery error — reported by r.suresh1"
 *   width="lg"
 * >
 *   <TicketDetailContent ticket={selectedTicket} />
 * </Drawer>
 */

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type DrawerWidth = 'sm' | 'md' | 'lg' | 'xl'

const WIDTH_CLASSES: Record<DrawerWidth, string> = {
  sm: 'sm:max-w-sm',    // 384px — narrow detail panels
  md: 'sm:max-w-md',    // 448px — default detail view
  lg: 'sm:max-w-lg',    // 512px — wider detail with forms
  xl: 'sm:max-w-xl',    // 576px — full ticket detail
}

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  width?: DrawerWidth
  children: React.ReactNode
  /** Content rendered in the drawer footer (e.g., action buttons) */
  footer?: React.ReactNode
  className?: string
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  width = 'md',
  children,
  footer,
  className,
}: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'flex flex-col gap-0 p-0',
          'bg-bg-card border-l border-border-primary',
          WIDTH_CLASSES[width],
          className,
        )}
        // Override shadcn default close button placement
      >
        {/* Header */}
        <SheetHeader className="flex flex-row items-start justify-between gap-4 px-5 py-4 border-b border-border-primary shrink-0">
          <div className="space-y-1 min-w-0">
            <SheetTitle className="text-base font-semibold text-text-primary truncate">
              {title}
            </SheetTitle>
            {description && (
              <SheetDescription className="text-sm text-text-secondary leading-snug">
                {description}
              </SheetDescription>
            )}
          </div>

          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 mt-0.5"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </Button>
          </SheetClose>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {children}
        </div>

        {/* Optional footer */}
        {footer && (
          <div className="shrink-0 border-t border-border-primary px-5 py-4">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

---

## INTEGRATION: MOUNTING IN LAYOUTS

### Employee portal layout integration

```typescript
// src/app/(employee)/layout.tsx
'use client'

import { useCommandPalette } from '@/hooks/useCommandPalette'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { CommandPalette } from '@/components/shared/CommandPalette'
import { KeyboardShortcutsOverlay } from '@/components/shared/KeyboardShortcutsOverlay'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { useAuth } from '@/hooks/useAuth'
// ... other imports

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { isOpen: cmdOpen, toggle: toggleCmd, close: closeCmd } = useCommandPalette()
  const { role } = useAuth()
  // sessions will come from sessionStore (FRONTEND_10)
  const sessions = [] // placeholder until sessionStore is implemented

  // Register ⌘K shortcut
  useKeyboardShortcuts([
    { key: 'k', meta: true, handler: toggleCmd, preventDefault: true },
  ])

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <OfflineBanner />
      {/* ... topbar, sidebar, children ... */}

      {/* Global overlays */}
      <CommandPalette
        open={cmdOpen}
        onOpenChange={closeCmd}
        sessions={sessions}
        isAdmin={role === 'it-admin'}
      />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
```

### Admin portal layout integration

```typescript
// src/app/(admin)/layout.tsx
// Same pattern — CommandPalette receives isAdmin={true}
// Admin layout also forces dark mode (see FRONTEND_03 Part 3)
```

---

## TOAST USAGE PATTERNS

```typescript
// ── Import ──
import { toastSuccess, toastError, toastPromise, TOAST } from '@/lib/toast'

// ── Simple operations ──
// After successful row action
toastSuccess('Registry entry approved')

// After API error
toastError('Failed to save', 'Check your connection and retry')

// ── Preferred: Promise pattern ──
// The cleanest pattern for any async admin operation
async function handleDeprecate(docId: string) {
  await toastPromise(
    api.patch(`admin/documents/${docId}`, { status: 'deprecated' }),
    {
      loading: 'Deprecating document...',
      success: `Document deprecated`,
      error: 'Failed to deprecate document',
    }
  )
  queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })
}

// ── AEGIS predefined messages ──
TOAST.documentUploaded()      // "Document uploaded · Ingestion started in background"
TOAST.correctionSubmitted()   // "Correction submitted to knowledge base"
TOAST.sessionExported()       // "PDF downloaded"
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: CommandPalette opens on ⌘K
# → Press ⌘K (Mac) / Ctrl+K (Windows)
# → Backdrop should appear, palette should scale in
# → Should see "Actions" group with Quick actions

# Step 2: CommandPalette search works
# → Type "dashboard"
# → If isAdmin=true: should show admin navigation results

# Step 3: CommandPalette closes on Escape
# → Press Escape — palette should fade out

# Step 4: Keyboard shortcuts overlay opens
# → Press ⌘/
# → Should show keyboard shortcut reference modal

# Step 5: Drawer opens and closes
# <Drawer open={true} onOpenChange={() => {}} title="Test drawer">
#   <p>Content</p>
# </Drawer>
# → Should slide in from the right

# Step 6: Toast functions
# → Call toastSuccess('Test message')
# → Should appear bottom-right, auto-dismiss after 4s

# Step 7: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F04: Overlay components — CommandPalette, KeyboardShortcutsOverlay, Drawer, toast utils"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F04 (Part 2)*
