# FRONTEND_05: CORE COMPONENTS
## Foundational UI Components — Used Across Both Portals
## Session F03 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F03: All core foundational components.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Sessions F04 (dependencies installed) and F01 (design system) complete.

**Note:** Button, Badge, Card, Input, and Skeleton were already customized in FRONTEND_04_DEPENDENCIES.md Step 6. This session creates the remaining foundational components not covered by shadcn/ui.

**What this session creates:**

```
src/components/ui/
├── spinner.tsx              ← Loading spinner (inline + full-screen variants)
├── avatar-fallback.tsx      ← Enhanced avatar with initials fallback
├── status-dot.tsx           ← Animated connection status indicator

src/components/shared/
├── ThemeToggle.tsx          ← Dark/light mode toggle button
├── ConfirmDialog.tsx        ← Destructive action confirmation modal
├── OfflineBanner.tsx        ← Network offline notification bar
├── LoadingScreen.tsx        ← Full-page loading screen

src/hooks/
├── useLocalStorage.ts       ← Type-safe localStorage hook
├── useDebounce.ts           ← Debounce for search inputs
├── useMediaQuery.ts         ← Viewport detection
├── useKeyboardShortcuts.ts  ← Global keyboard shortcut system
└── usePolling.ts            ← TanStack Query polling wrapper
```

---

## FILE 1: src/components/ui/spinner.tsx

```typescript
'use client'

import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const spinnerVariants = cva(
  [
    'inline-block border-2 border-current border-t-transparent',
    'rounded-full animate-spin',
    'text-text-tertiary',
  ].join(' '),
  {
    variants: {
      size: {
        xs:  'w-3 h-3 border-[1.5px]',
        sm:  'w-4 h-4 border-2',
        md:  'w-5 h-5 border-2',
        lg:  'w-8 h-8 border-[3px]',
        xl:  'w-12 h-12 border-4',
      },
      color: {
        default: 'text-text-tertiary',
        accent:  'text-accent',
        white:   'text-white',
        success: 'text-success',
        muted:   'text-border-secondary',
      },
    },
    defaultVariants: {
      size: 'md',
      color: 'default',
    },
  }
)

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string
}

/**
 * Inline loading spinner.
 * Use inside buttons, data tables, and inline loading states.
 *
 * @example
 * <Spinner size="sm" color="white" />
 * <Spinner size="lg" color="accent" label="Loading sessions..." />
 */
export function Spinner({ className, size, color, label = 'Loading', ...props }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} {...props}>
      <span className={cn(spinnerVariants({ size, color }), className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * Full-page centered loading screen.
 * Use for page-level loading states before data arrives.
 */
export function LoadingSpinner({
  label = 'Loading...',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        'min-h-[200px] w-full',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner size="lg" color="accent" label={label} />
      <p className="text-sm text-text-tertiary animate-pulse">{label}</p>
    </div>
  )
}
```

---

## FILE 2: src/components/ui/status-dot.tsx

```typescript
'use client'

import { cn } from '@/lib/utils'

type StatusType = 'online' | 'offline' | 'connecting' | 'error' | 'warning'

interface StatusDotProps {
  status: StatusType
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const STATUS_CONFIG: Record<
  StatusType,
  { color: string; pulse: boolean; label: string }
> = {
  online:     { color: 'bg-success',    pulse: true,  label: 'Connected' },
  offline:    { color: 'bg-text-tertiary', pulse: false, label: 'Offline' },
  connecting: { color: 'bg-warning',    pulse: true,  label: 'Connecting...' },
  error:      { color: 'bg-danger',     pulse: false, label: 'Error' },
  warning:    { color: 'bg-warning',    pulse: false, label: 'Degraded' },
}

const SIZE_CLASSES = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
}

/**
 * Animated status indicator dot.
 * Used in employee topbar (WebSocket connection status) and
 * admin system health grid (per-service status).
 *
 * @example
 * <StatusDot status="online" showLabel />
 * <StatusDot status="error" size="lg" />
 */
export function StatusDot({ status, size = 'md', showLabel = false, className }: StatusDotProps) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      role="status"
      aria-label={config.label}
    >
      <span className="relative inline-flex">
        {/* Pulse ring for active states */}
        {config.pulse && (
          <span
            className={cn(
              'absolute inline-flex rounded-full opacity-75 animate-status-pulse',
              config.color,
              SIZE_CLASSES[size]
            )}
            aria-hidden="true"
          />
        )}
        {/* Core dot */}
        <span
          className={cn(
            'relative inline-flex rounded-full',
            config.color,
            SIZE_CLASSES[size]
          )}
          aria-hidden="true"
        />
      </span>

      {showLabel && (
        <span className="text-xs text-text-secondary font-medium">{config.label}</span>
      )}
    </span>
  )
}
```

---

## FILE 3: src/components/shared/ThemeToggle.tsx

```typescript
'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Dark / light mode toggle button.
 * Uses next-themes to persist preference in localStorage under 'aegis:dark-mode'.
 *
 * Placed in:
 * - Employee portal topbar (right side)
 * - Admin portal topbar (right side)
 *
 * @example
 * <ThemeToggle />
 * <ThemeToggle size="sm" className="ml-2" />
 */
export function ThemeToggle({ className, size = 'md' }: ThemeToggleProps) {
  // Prevent hydration mismatch by waiting for mount
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  // Smooth color transition on theme change
  function toggleTheme() {
    const root = document.documentElement
    root.style.transition = 'background-color 200ms, color 200ms, border-color 200ms'
    setTheme(theme === 'dark' ? 'light' : 'dark')
    setTimeout(() => {
      root.style.transition = ''
    }, 200)
  }

  if (!mounted) {
    // Placeholder to avoid layout shift during SSR
    return (
      <div
        className={cn(
          size === 'sm' ? 'w-7 h-7' : 'w-9 h-9',
          'rounded-lg bg-bg-secondary animate-pulse',
          className
        )}
        aria-hidden="true"
      />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'inline-flex items-center justify-center rounded-lg',
        'text-text-secondary',
        'transition-all duration-[var(--duration-normal)]',
        'hover:bg-bg-secondary hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        'active:scale-95',
        size === 'sm' ? 'w-7 h-7' : 'w-9 h-9',
        className
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        <Sun className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
      ) : (
        <Moon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
      )}
    </button>
  )
}
```

---

## FILE 4: src/components/shared/ConfirmDialog.tsx

```typescript
'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  /** The element that triggers the dialog (e.g., a delete button) */
  trigger: React.ReactNode
  title: string
  description: string
  /** Label for the confirm action button */
  confirmLabel?: string
  /** Label for the cancel button */
  cancelLabel?: string
  /** Visual weight of the confirm action */
  variant?: 'destructive' | 'default'
  /** Called when user confirms. Can be async. */
  onConfirm: () => void | Promise<void>
  /** Whether the dialog is currently open (controlled mode) */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Confirmation dialog for destructive or significant admin actions.
 * RULE: Every delete, deprecate, bulk-action, or irreversible operation must use this.
 *
 * @example
 * <ConfirmDialog
 *   trigger={<Button variant="destructive">Deprecate document</Button>}
 *   title="Deprecate SD-ERR-001?"
 *   description="This document will no longer appear in AI responses. This action cannot be undone."
 *   confirmLabel="Deprecate"
 *   variant="destructive"
 *   onConfirm={handleDeprecate}
 * />
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  onConfirm,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault()
    setIsLoading(true)
    try {
      await onConfirm()
      onOpenChange?.(false)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>

      <AlertDialogContent className="bg-bg-card border-border-primary shadow-xl max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-text-primary text-lg font-semibold">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-text-secondary text-sm leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            className={cn(
              'border border-border-primary bg-transparent text-text-primary',
              'hover:bg-bg-secondary',
              'h-9 px-4 text-sm font-medium rounded-lg',
              'transition-colors duration-[var(--duration-normal)]'
            )}
          >
            {cancelLabel}
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              'h-9 px-4 text-sm font-medium rounded-lg',
              'inline-flex items-center gap-2',
              'transition-all duration-[var(--duration-normal)]',
              'disabled:opacity-50 disabled:pointer-events-none',
              variant === 'destructive'
                ? 'bg-danger text-white hover:bg-danger/90'
                : 'bg-accent text-white hover:bg-accent-hover'
            )}
          >
            {isLoading && <Spinner size="xs" color="white" />}
            {isLoading ? 'Processing...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

---

## FILE 5: src/components/shared/OfflineBanner.tsx

```typescript
'use client'

import { useEffect, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Offline detection banner.
 * Appears at the very top of the page when network connection is lost.
 * Automatically dismisses when connection is restored.
 *
 * Mount once in each portal layout (employee + admin).
 */
export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true)
  const [wasOffline, setWasOffline] = useState(false)
  const [showReconnected, setShowReconnected] = useState(false)

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      if (wasOffline) {
        setShowReconnected(true)
        setTimeout(() => setShowReconnected(false), 3000)
      }
    }

    function handleOffline() {
      setIsOnline(false)
      setWasOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check initial state
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wasOffline])

  if (isOnline && !showReconnected) return null

  return (
    <div
      className={cn(
        'fixed top-0 inset-x-0 z-notification',
        'flex items-center justify-center gap-2',
        'py-2 px-4 text-sm font-medium',
        'transition-all duration-[var(--duration-slow)]',
        !isOnline
          ? 'bg-danger text-white'
          : 'bg-success text-white'
      )}
      role="status"
      aria-live="assertive"
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>No network connection — your work is saved locally</span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Connection restored</span>
        </>
      )}
    </div>
  )
}
```

---

## FILE 6: src/components/shared/LoadingScreen.tsx

```typescript
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LoadingScreenProps {
  /** Minimum display time in ms. Prevents flash for fast loads. */
  minDurationMs?: number
  label?: string
}

/**
 * Full-page loading screen shown during initial auth check and route transitions.
 * Shows the Sona Comstar logo with a subtle pulse animation.
 */
export function LoadingScreen({
  minDurationMs = 400,
  label = 'Loading AEGIS...',
}: LoadingScreenProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), minDurationMs)
    return () => clearTimeout(timer)
  }, [minDurationMs])

  if (!visible) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-modal',
        'flex flex-col items-center justify-center gap-6',
        'bg-bg-primary',
        'animate-fade-in'
      )}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      {/* Logo mark */}
      <div className="relative w-14 h-14">
        <div
          className={cn(
            'w-14 h-14 rounded-2xl bg-accent',
            'flex items-center justify-center',
            'shadow-lg animate-pulse-subtle'
          )}
        >
          <Image
            src="/logo.svg"
            alt="Sona Comstar"
            width={36}
            height={36}
            className="object-contain brightness-0 invert"
            priority
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.nextElementSibling?.classList.remove('hidden')
            }}
          />
          <span className="hidden text-white font-bold text-xl">A</span>
        </div>
      </div>

      {/* Brand */}
      <div className="text-center">
        <p className="text-lg font-bold text-text-primary tracking-tight">AEGIS</p>
        <p className="text-sm text-text-tertiary mt-0.5">SAP Intelligence</p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-subtle"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      <span className="sr-only">{label}</span>
    </div>
  )
}
```

---

## FILE 7: src/hooks/useLocalStorage.ts

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Type-safe localStorage hook with SSR safety.
 * Synchronises state with localStorage across components.
 *
 * @example
 * const [collapsed, setCollapsed] = useLocalStorage('aegis:panel-collapsed', false)
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // Initialize from localStorage or use default
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  // Persist to localStorage whenever value changes
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value
        try {
          window.localStorage.setItem(key, JSON.stringify(next))
        } catch (error) {
          console.warn(`localStorage.setItem(${key}) failed:`, error)
        }
        return next
      })
    },
    [key]
  )

  // Remove from localStorage
  const remove = useCallback(() => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore
    }
    setStoredValue(initialValue)
  }, [key, initialValue])

  // Sync across tabs
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T)
        } catch {
          // Ignore malformed values
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [key])

  return [storedValue, setValue, remove] as const
}
```

---

## FILE 8: src/hooks/useDebounce.ts

```typescript
'use client'

import { useState, useEffect } from 'react'
import { TIMING } from '@/lib/constants'

/**
 * Debounces a value by the given delay.
 * Used for search inputs to avoid excessive API calls.
 *
 * @param value The value to debounce
 * @param delay Delay in ms (default: TIMING.SEARCH_DEBOUNCE_MS = 300ms)
 *
 * @example
 * const debouncedSearch = useDebounce(searchQuery, 300)
 * // debouncedSearch only updates 300ms after searchQuery stops changing
 */
export function useDebounce<T>(value: T, delay = TIMING.SEARCH_DEBOUNCE_MS): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
```

---

## FILE 9: src/hooks/useMediaQuery.ts

```typescript
'use client'

import { useState, useEffect } from 'react'
import { LAYOUT } from '@/lib/constants'

/**
 * Tracks whether a CSS media query is currently matched.
 *
 * @example
 * const isWide = useMediaQuery('(min-width: 1440px)')
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)

    function handleChange(e: MediaQueryListEvent) {
      setMatches(e.matches)
    }

    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [query])

  return matches
}

/**
 * Returns true if the viewport is at the optimal AEGIS width (≥1440px).
 */
export function useIsOptimalWidth(): boolean {
  return useMediaQuery(`(min-width: ${LAYOUT.OPTIMAL_VIEWPORT_WIDTH}px)`)
}

/**
 * Returns true if the user prefers reduced motion.
 * RULE: Every Framer Motion component must check this.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
```

---

## FILE 10: src/hooks/useKeyboardShortcuts.ts

```typescript
'use client'

import { useEffect, useCallback, useRef } from 'react'

type ShortcutHandler = (event: KeyboardEvent) => void

interface Shortcut {
  key: string
  /** ctrl or meta (cmd on Mac) */
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  /** Prevent default browser action */
  preventDefault?: boolean
  /** Do not fire when focus is inside an input/textarea */
  ignoreInInput?: boolean
  handler: ShortcutHandler
}

/**
 * Registers global keyboard shortcuts.
 * Handles both macOS (meta/cmd) and Windows (ctrl) conventions.
 *
 * @example
 * useKeyboardShortcuts([
 *   {
 *     key: 'k',
 *     meta: true,
 *     preventDefault: true,
 *     handler: () => setCommandPaletteOpen(true),
 *   },
 *   {
 *     key: 'Escape',
 *     handler: () => setCommandPaletteOpen(false),
 *   },
 * ])
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  // Use ref to always have current shortcuts without re-registering listeners
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    for (const shortcut of shortcutsRef.current) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
      if (!keyMatch) continue

      const metaMatch = shortcut.meta ? (event.metaKey || event.ctrlKey) : !event.metaKey && !event.ctrlKey
      const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !shortcut.ctrl || true
      const shiftMatch = shortcut.shift !== undefined ? event.shiftKey === shortcut.shift : true
      const altMatch = shortcut.alt !== undefined ? event.altKey === shortcut.alt : !event.altKey

      if (!metaMatch || !shiftMatch || !altMatch) continue

      // Skip if focus is in an input element (unless explicitly allowed)
      if (shortcut.ignoreInInput !== false) {
        const target = event.target as HTMLElement
        const isInInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.closest('[role="textbox"]') !== null
        if (isInInput) continue
      }

      if (shortcut.preventDefault) event.preventDefault()
      shortcut.handler(event)
      break
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
```

---

## FILE 11: src/hooks/usePolling.ts

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TIMING } from '@/lib/constants'

interface UsePollingOptions {
  /** Query key to invalidate/refetch on each interval */
  queryKey: readonly unknown[]
  /** Polling interval in ms. Default: 30s (TIMING.ADMIN_POLL_INTERVAL_MS) */
  intervalMs?: number
  /** Whether polling is active. Set to false to pause. */
  enabled?: boolean
}

/**
 * TanStack Query polling hook.
 * Invalidates a query key on a fixed interval to trigger background refetch.
 *
 * Used for:
 * - Admin dashboard metrics (30s)
 * - Review queue badge count (30s)
 * - System health grid (30s)
 *
 * @example
 * usePolling({
 *   queryKey: queryKeys.admin.metrics(),
 *   intervalMs: TIMING.ADMIN_POLL_INTERVAL_MS,
 *   enabled: isAdminUser,
 * })
 */
export function usePolling({
  queryKey,
  intervalMs = TIMING.ADMIN_POLL_INTERVAL_MS,
  enabled = true,
}: UsePollingOptions) {
  const queryClient = useQueryClient()
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (!enabled) return

    intervalRef.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey })
    }, intervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [queryClient, queryKey, intervalMs, enabled])
}

/**
 * Returns seconds until the next scheduled poll.
 * Used to display "Updated Xs ago / Next refresh in Ys" in admin topbar.
 */
export function usePollingCountdown(intervalMs: number) {
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
  }, [intervalMs])

  function getSecondsUntilNext(): number {
    const elapsed = (Date.now() - startRef.current) % intervalMs
    return Math.ceil((intervalMs - elapsed) / 1000)
  }

  return getSecondsUntilNext
}
```

---

## FILE 12: src/hooks/useAuth.ts

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuthState,
  refreshAccessToken,
  logout,
  type AuthState,
} from '@/lib/auth'
import { TIMING } from '@/lib/constants'

/**
 * Auth state hook for use in protected page components.
 * Handles token refresh on a 12-minute cycle.
 * Redirects to /login on 401 errors.
 *
 * @example
 * const { role, isAuthenticated } = useAuth()
 * if (!isAuthenticated) return <LoadingScreen />
 */
export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>(() => getAuthState())
  const router = useRouter()

  // Refresh auth state (useful after login callback)
  const refreshAuthState = useCallback(() => {
    setAuthState(getAuthState())
  }, [])

  // Silent token refresh every 12 minutes
  useEffect(() => {
    if (!authState.isAuthenticated) return

    const interval = setInterval(async () => {
      const ok = await refreshAccessToken()
      if (!ok) {
        // Refresh failed — token expired, go to login
        await logout()
      }
    }, TIMING.TOKEN_REFRESH_MS)

    return () => clearInterval(interval)
  }, [authState.isAuthenticated, router])

  return {
    isAuthenticated: authState.isAuthenticated,
    role: authState.isAuthenticated ? authState.role : null,
    isEmployee: authState.isAuthenticated && authState.role === 'employee',
    isAdmin: authState.isAuthenticated && authState.role === 'it-admin',
    refreshAuthState,
    logout,
  }
}
```

---

## FILE 13: src/components/shared/ErrorBoundary.tsx

```typescript
'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Optional custom fallback. Receives the error. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode
  /** Optional label for the section (e.g., "metrics panel") for error message */
  section?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * React class-based error boundary.
 * Wrap individual page sections to isolate failures.
 * Pages use the global error.tsx for full-page errors.
 *
 * @example
 * <ErrorBoundary section="validation score chart">
 *   <ValidationScoreChart />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (!this.state.hasError) return this.props.children

    const { error } = this.state

    if (this.props.fallback && error) {
      return this.props.fallback(error, this.reset)
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-border-primary bg-bg-secondary min-h-[120px]">
        <div className="flex items-center gap-2 text-text-secondary">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <p className="text-sm">
            {this.props.section
              ? `Could not load ${this.props.section}`
              : 'An error occurred in this section'}
          </p>
        </div>

        <button
          onClick={this.reset}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Try again
        </button>
      </div>
    )
  }
}
```

---

## FILE 14: src/app/(employee)/loading.tsx (EMPLOYEE CHAT LOADING STATE)

```typescript
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Next.js loading.tsx for the employee portal root route (/).
 * Shown while the chat page component mounts.
 * Must match the three-panel layout structure of the chat interface.
 */
export default function ChatLoading() {
  return (
    <div className="flex h-screen bg-bg-secondary">
      {/* Sessions sidebar skeleton */}
      <div className="w-[180px] border-r border-border-primary bg-bg-tertiary p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-5 rounded-md" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-1.5 p-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        ))}
      </div>

      {/* Main chat area skeleton */}
      <div className="flex-1 flex flex-col bg-bg-card">
        <Skeleton className="h-[52px] w-full rounded-none border-b border-border-primary" />
        <div className="flex-1 p-5 space-y-4">
          <div className="flex justify-end">
            <Skeleton className="h-16 w-2/3 rounded-xl rounded-tr-sm" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-32 w-4/5 rounded-xl rounded-tl-sm" />
            <Skeleton className="h-5 w-48 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-[64px] w-full rounded-none border-t border-border-primary" />
      </div>

      {/* Source panel skeleton */}
      <div className="w-[210px] border-l border-border-primary bg-bg-tertiary p-4 space-y-4">
        <Skeleton className="h-3 w-16" />
        <div className="rounded-xl border border-border-primary p-3 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-2.5 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

## COMPONENT USAGE REFERENCE

Quick reference for the agent — which component to use in which situation:

| Situation | Component | Props to set |
|---|---|---|
| Primary action button | `<Button variant="default">` | — |
| Dangerous action | `<Button variant="destructive">` | Always pair with `<ConfirmDialog>` |
| Secondary action | `<Button variant="outline">` | — |
| Icon-only button | `<Button variant="ghost" size="icon">` | Add `aria-label` |
| Loading button | `<Button loading>` | — |
| High confidence label | `<Badge variant="success" dot>` | — |
| Moderate confidence | `<Badge variant="warning" dot>` | — |
| Insufficient | `<Badge variant="danger" dot>` | — |
| Document active | `<Badge variant="active">` | — |
| Document deprecated | `<Badge variant="deprecated">` | — |
| Content container | `<Card>` | — |
| Floating modal content | `<Card variant="elevated">` | — |
| Page section | `<Card variant="ghost">` | Transparent background |
| Inline loading | `<Spinner size="sm">` | Inside buttons, tables |
| Page loading | `<LoadingSpinner label="...">` | Standalone in page |
| Full-screen loading | `<LoadingScreen>` | Auth transition only |
| WS connection status | `<StatusDot status="online" showLabel>` | — |
| Service grid tile status | `<StatusDot status="healthy/error">` | — |
| Destructive confirmation | `<ConfirmDialog variant="destructive">` | — |
| Recover from section error | `<ErrorBoundary section="chart name">` | Wrap individual panels |
| Theme toggle | `<ThemeToggle>` | Both topbars |

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Spinner renders
# → Create a test page or add to an existing one:
# <Spinner size="lg" color="accent" />
# → Should see spinning cyan ring

# Step 2: StatusDot renders
# <StatusDot status="online" showLabel />
# → Should see green pulsing dot with "Connected" label

# Step 3: ThemeToggle works
# <ThemeToggle />
# → Should see sun/moon icon, click should toggle dark mode

# Step 4: ConfirmDialog works
# <ConfirmDialog
#   trigger={<button>Delete</button>}
#   title="Delete?" description="This cannot be undone."
#   variant="destructive" onConfirm={() => console.log('confirmed')}
# />
# → Modal should appear, confirm should call onConfirm

# Step 5: OfflineBanner works
# → Open DevTools → Application → Service Workers → Offline checkbox
# → Banner should appear at top of page
# → Uncheck offline → "Connection restored" should flash

# Step 6: useKeyboardShortcuts works
# → Add test: useKeyboardShortcuts([{ key: 'k', meta: true, handler: () => alert('⌘K') }])
# → Press ⌘K (Mac) or Ctrl+K (Windows) outside an input
# → Alert should fire

# Step 7: TypeScript
npx tsc --noEmit
# Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F03: Core components — Spinner, StatusDot, ThemeToggle, ConfirmDialog, error boundary, hooks"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F03*
