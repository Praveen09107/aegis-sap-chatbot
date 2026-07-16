# FRONTEND_26: ERROR HANDLING
## Complete Error Resilience — Boundaries, API Errors, WS Reconnection, Offline Recovery
## Session F17 Implementation Guide (Part 3)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F17 Part 3: Error handling system.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**What this session creates/updates:**
```
src/app/
├── error.tsx                         ← Global error page (update from FRONTEND_02)
├── (employee)/error.tsx              ← Employee portal error boundary page
└── (admin)/error.tsx                 ← Admin portal error boundary page

src/components/shared/
├── ErrorBoundary.tsx                 ← Update: add section variant + retry support
└── OfflineBanner.tsx                 ← Update: add reconnection countdown

src/lib/
├── api.ts                            ← Update: add error classification + interceptors
└── errorCodes.ts                     ← New: error code → user message mapping
```

---

## ERROR CLASSIFICATION SYSTEM

Every error in AEGIS falls into one of five classes. The class determines the
recovery strategy and the user-facing message.

```
Class A — Network offline
  Trigger: navigator.onLine = false, fetch throws NetworkError
  Recovery: automatic — resume when online
  UX: OfflineBanner appears, queries pause, WebSocket stops reconnecting

Class B — Authentication expired
  Trigger: API returns 401
  Recovery: redirect to /login, preserve intended URL
  UX: silent redirect, no error toast (avoids confusing "error" message)

Class C — Server error (transient)
  Trigger: API returns 500, 502, 503, 504
  Recovery: TanStack Query retries 2x, then shows section error state
  UX: toast "Service temporarily unavailable — retrying..." on first occurrence

Class D — Client error (permanent)
  Trigger: API returns 400, 403, 404, 409, 422
  Recovery: no retry — show specific message based on status
  UX: toast with specific message, no retry button

Class E — Component crash
  Trigger: JavaScript TypeError, render error, missing prop
  Recovery: ErrorBoundary catches, shows retry button
  UX: section error state with "Try again" or full page error

WebSocket errors are Class A or C depending on cause.
File upload errors are Class D (validation) or Class C (server).
```

---

## FILE 1: src/lib/errorCodes.ts (COMPLETE)

```typescript
/**
 * Maps HTTP status codes and error scenarios to user-friendly messages.
 * Import from here instead of writing inline error strings.
 */

export const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'The request could not be processed — please check your input.',
  401: 'Your session has expired. Redirecting to login...',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'A conflict occurred — this item may have been modified.',
  413: 'The file is too large to upload.',
  422: 'The submitted data is invalid — please review and try again.',
  429: 'Too many requests — please wait a moment before trying again.',
  500: 'A server error occurred. Our team has been notified.',
  502: 'The service is temporarily unreachable. Retrying...',
  503: 'The service is temporarily unavailable. Retrying...',
  504: 'The server took too long to respond. Please try again.',
}

export const WEBSOCKET_ERROR_MESSAGES: Record<number, string> = {
  1006: 'Connection lost unexpectedly. Reconnecting...',
  4000: 'Invalid authentication. Please refresh the page.',
  4001: 'Connection timed out. Reconnecting...',
  4003: 'Session expired. Please start a new chat.',
  4004: 'Session not found. Starting a new chat...',
}

export const UPLOAD_ERROR_MESSAGES = {
  TYPE_INVALID:  'Only PDF files are supported.',
  SIZE_EXCEEDED: 'File exceeds the 50MB size limit.',
  NETWORK:       'Upload failed — check your connection and try again.',
  SERVER:        'Upload failed on the server. Please try again.',
} as const

export const QUERY_ERROR_MESSAGES = {
  DOCUMENTS:    'Failed to load documents',
  REGISTRY:     'Failed to load registry entries',
  CONFIG:       'Failed to load configuration',
  METRICS:      'Failed to load metrics',
  SESSIONS:     'Failed to load sessions',
  ANALYTICS:    'Failed to load analytics data',
  AUDIT_TRAIL:  'Failed to load audit entries',
  HEALTH:       'Failed to fetch service health',
} as const

/**
 * Returns a user-friendly message for an HTTP status code.
 * Falls back to a generic message for unknown status codes.
 */
export function getHttpErrorMessage(status: number): string {
  return HTTP_ERROR_MESSAGES[status]
    ?? (status >= 500
      ? 'A server error occurred. Please try again.'
      : 'An unexpected error occurred.')
}
```

---

## FILE 2: src/lib/api.ts — Error Handling Update

Add the following error classification logic to the existing `api.ts` file
(created in FRONTEND_02). This update adds interceptor-style error handling
before the response is returned.

```typescript
// UPDATE: Replace the existing api.get / api.post core fetch logic with this.
// The rest of api.ts (url building, auth headers, upload) stays unchanged.

import { getHttpErrorMessage } from '@/lib/errorCodes'
import { toastError } from '@/lib/toast'

/**
 * Core request function with error classification.
 * Called by api.get(), api.post(), api.put(), api.patch(), api.delete().
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { silent?: boolean } = {}
): Promise<T> {
  const url = `/api/proxy/${path}`

  let response: Response

  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      credentials: 'include',
    })
  } catch (err) {
    // Class A: Network error (offline, DNS failure, etc.)
    if (!navigator.onLine) {
      // Do not toast — OfflineBanner handles this
      throw new NetworkError('You are offline')
    }
    // Unexpected fetch failure
    if (!options.silent) {
      toastError('Connection error', 'Could not reach the server.')
    }
    throw new NetworkError('Fetch failed')
  }

  // Class B: Authentication expired
  if (response.status === 401) {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.href = `/login?return=${returnTo}`
    throw new AuthError('Session expired')
  }

  // Class C: Server errors — let TanStack Query retry
  if (response.status >= 500) {
    const message = getHttpErrorMessage(response.status)
    if (!options.silent) toastError(message)
    throw new ServerError(message, response.status)
  }

  // Class D: Client errors — no retry
  if (!response.ok) {
    let detail = getHttpErrorMessage(response.status)
    // Try to parse backend error detail
    try {
      const body = await response.json()
      if (body.detail) detail = body.detail
    } catch {}

    if (!options.silent) toastError(detail)
    throw new ClientError(detail, response.status)
  }

  // Success — parse and return
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

// ── Custom error classes ─────────────────────────────────────

export class NetworkError extends Error {
  readonly type = 'network' as const
  constructor(message: string) { super(message) }
}

export class AuthError extends Error {
  readonly type = 'auth' as const
  constructor(message: string) { super(message) }
}

export class ServerError extends Error {
  readonly type = 'server' as const
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export class ClientError extends Error {
  readonly type = 'client' as const
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export type ApiError = NetworkError | AuthError | ServerError | ClientError

/**
 * Type guard to check if an error is a specific HTTP status.
 * Used in mutation onError handlers.
 *
 * @example
 * onError: (err) => {
 *   if (isApiStatus(err, 409)) {
 *     toastError('This entry already exists')
 *   }
 * }
 */
export function isApiStatus(err: unknown, status: number): boolean {
  return (
    (err instanceof ServerError || err instanceof ClientError) &&
    err.status === status
  )
}
```

---

## FILE 3: src/components/shared/ErrorBoundary.tsx — Complete Update

```typescript
'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Short description of what this boundary wraps — shown in error UI */
  section?: string
  /** 'section' = inline within a page; 'page' = full-page error */
  variant?: 'section' | 'page'
  /** Custom fallback override */
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Class-based React error boundary.
 * Catches render-time JavaScript errors in the component tree.
 *
 * IMPORTANT: Error boundaries do NOT catch:
 * - Event handler errors (use try/catch in handlers)
 * - Async errors (useEffect, promises)
 * - Server component errors (Next.js error.tsx handles those)
 * - Errors in the ErrorBoundary itself
 *
 * Usage:
 * <ErrorBoundary section="documents table">
 *   <DataTable ... />
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

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development; in production this would go to Sentry / Grafana
    console.error('[ErrorBoundary]', this.props.section ?? 'unknown section', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    const isPage = this.props.variant === 'page'

    return (
      <ErrorFallback
        section={this.props.section}
        error={this.state.error}
        onReset={this.handleReset}
        variant={isPage ? 'page' : 'section'}
      />
    )
  }
}

// ── Error fallback UI ─────────────────────────────────────────

interface ErrorFallbackProps {
  section?: string
  error: Error | null
  onReset: () => void
  variant: 'section' | 'page'
}

function ErrorFallback({ section, error, onReset, variant }: ErrorFallbackProps) {
  const isPage = variant === 'page'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        isPage ? 'min-h-[400px] gap-5' : 'py-8 px-4 gap-3',
        'bg-danger-bg/30 rounded-xl border border-danger-border/40',
      )}
      role="alert"
    >
      <div className="w-10 h-10 rounded-full bg-danger-bg border border-danger-border flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-danger" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        <p className={cn('font-semibold text-text-primary', isPage ? 'text-base' : 'text-sm')}>
          {section ? `Failed to load ${section}` : 'Something went wrong'}
        </p>
        <p className={cn('text-text-secondary', isPage ? 'text-sm' : 'text-xs')}>
          {process.env.NODE_ENV === 'development' && error?.message
            ? error.message
            : 'An unexpected error occurred in this section.'}
        </p>
      </div>

      <Button
        variant="outline"
        size={isPage ? 'default' : 'sm'}
        onClick={onReset}
        className="gap-2 border-danger-border/50"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Try again
      </Button>
    </div>
  )
}
```

---

## FILE 4: src/app/(employee)/error.tsx (COMPLETE)

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Employee portal error page.
 * Shown when an unhandled error propagates to the route level.
 * Provides a reset (re-render attempt) and a "Go to chat" escape hatch.
 */
export default function EmployeeErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[Employee portal error]', error)
  }, [error])

  const router = useRouter()

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-danger-bg border border-danger-border flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-danger" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="text-lg font-bold text-text-primary">
          Something went wrong
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          An unexpected error occurred. Your chat history is safe —
          try refreshing or start a new session.
        </p>
        {process.env.NODE_ENV === 'development' && error.message && (
          <pre className="text-left text-xs text-danger font-mono bg-danger-bg border border-danger-border rounded-lg p-3 mt-3 overflow-x-auto">
            {error.message}
          </pre>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Button onClick={() => router.push('/')} className="gap-2">
          <Home className="w-4 h-4" />
          Go to chat
        </Button>
      </div>
    </div>
  )
}
```

---

## FILE 5: src/app/(admin)/error.tsx (COMPLETE)

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AdminErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Admin portal error]', error)
  }, [error])

  const router = useRouter()

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-danger-bg border border-danger-border flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-danger" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="text-lg font-bold text-text-primary">Admin portal error</h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          An unexpected error occurred in the admin panel. Navigation and other
          sections should still be accessible.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <pre className="text-left text-xs text-danger font-mono bg-danger-bg/50 border border-danger-border rounded-lg p-3 mt-3 overflow-x-auto whitespace-pre-wrap">
            {error.message}{'\n'}{error.stack?.split('\n').slice(1, 5).join('\n')}
          </pre>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Button onClick={() => router.push('/admin/dashboard')} className="gap-2">
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </Button>
      </div>
    </div>
  )
}
```

---

## FILE 6: OfflineBanner.tsx — Complete Update with Reconnection Countdown

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { WifiOff, Wifi } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { EXPAND_DOWN } from '@/lib/animations'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

/**
 * Offline detection banner.
 * Appears when browser goes offline. Disappears when reconnected.
 *
 * Behaviour:
 * - Offline: shows persistent red banner with "No internet connection"
 * - Reconnecting: shows countdown if reconnect check is pending
 * - Reconnected: briefly shows green "Connection restored" before hiding
 */
export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true)
  const [justReconnected, setJustReconnected] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const handleOnline = useCallback(() => {
    setIsOnline(true)
    setJustReconnected(true)
    // Hide the "restored" message after 3 seconds
    setTimeout(() => setJustReconnected(false), 3000)
  }, [])

  const handleOffline = useCallback(() => {
    setIsOnline(false)
    setJustReconnected(false)
  }, [])

  useEffect(() => {
    setIsOnline(navigator.onLine)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  const show = !isOnline || justReconnected

  const BannerContent = reducedMotion ? 'div' : motion.div

  return (
    <AnimatePresence>
      {show && (
        <BannerContent
          {...(!reducedMotion ? {
            variants: EXPAND_DOWN,
            initial: 'hidden',
            animate: 'visible',
            exit: 'exit',
          } : {})}
          className={
            justReconnected
              ? 'bg-success-bg border-b border-success-border'
              : 'bg-danger-bg border-b border-danger-border'
          }
          role="status"
          aria-live="assertive"
        >
          <div className="flex items-center justify-center gap-2 px-4 py-2">
            {justReconnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
                <span className="text-xs font-medium text-success-text">
                  Connection restored
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-danger shrink-0" aria-hidden="true" />
                <span className="text-xs font-medium text-danger-text">
                  No internet connection — changes will not be saved
                </span>
              </>
            )}
          </div>
        </BannerContent>
      )}
    </AnimatePresence>
  )
}
```

---

## WEBSOCKET RECONNECTION STRATEGY

The `useWebSocket` hook (FRONTEND_12) manages reconnection. The complete
reconnection logic is:

```typescript
// Add to useWebSocket.ts — reconnection state and backoff logic:

const reconnectAttemptsRef = useRef(0)
const MAX_RECONNECT = 3
const BACKOFF_MS = [1000, 2000, 4000]  // 1s, 2s, 4s

// In ws.onclose handler:
ws.onclose = (event) => {
  stopPingInterval()
  setWebSocket(null)

  const isCleanClose = event.code === 1000 || event.code === 1001
  const isAuthFailure = event.code === 4000 || event.code === 4003

  // Clean close or auth failure — do NOT reconnect
  if (isCleanClose || isAuthFailure) {
    if (isAuthFailure) {
      setStreamingState('error')
      toastError(WEBSOCKET_ERROR_MESSAGES[event.code] ?? 'Connection failed')
    }
    reconnectAttemptsRef.current = 0
    return
  }

  // Unexpected close during streaming — attempt reconnect
  if (reconnectAttemptsRef.current < MAX_RECONNECT) {
    const delay = BACKOFF_MS[reconnectAttemptsRef.current] ?? 4000
    reconnectAttemptsRef.current++

    setTimeout(async () => {
      if (!navigator.onLine) {
        // User is offline — don't attempt, wait for 'online' event
        setStreamingState('error')
        return
      }
      try {
        await connect(useChatStore.getState().currentSessionId)
      } catch {
        // Reconnect failed — will trigger onclose again for next attempt
      }
    }, delay)
  } else {
    // Exhausted retries
    setStreamingState('error')
    toastError(
      'Connection failed',
      'Could not reconnect after multiple attempts. Please try again.'
    )
    reconnectAttemptsRef.current = 0
  }
}

// Pause reconnection while offline, resume on online event:
useEffect(() => {
  function handleOnline() {
    if (!useChatStore.getState().websocket && streamingState === 'error') {
      // Offer to retry after reconnect
      // (Don't auto-retry — user should confirm to resend message)
    }
  }
  window.addEventListener('online', handleOnline)
  return () => window.removeEventListener('online', handleOnline)
}, [streamingState])
```

---

## TANSTACK QUERY ERROR CONFIGURATION

From FRONTEND_11 — the QueryClient is already configured with these retry settings.
This section documents the intent for each setting.

```typescript
// In QueryProvider (FRONTEND_01):
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Class B (auth): never retry
        if (error instanceof AuthError) return false
        // Class D (client errors): never retry
        if (error instanceof ClientError) return false
        // Class A (network) or C (server): retry up to 2 times
        return failureCount < 2
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      // 30s stale — reasonable for admin data
      staleTime: 30_000,
    },
    mutations: {
      // Mutations are user-initiated — never auto-retry
      retry: false,
    },
  },
})
```

---

## ERROR HANDLING CHECKLIST — PER COMPONENT TYPE

### API mutations (useXxx hooks)

```typescript
// Every mutation must have onError:
return useMutation({
  mutationFn: ...,
  onSuccess: () => { TOAST.specificSuccess() },
  onError: (err) => {
    if (isApiStatus(err, 409)) {
      toastError('This item already exists')
    } else {
      toastError('Action failed — please try again')
    }
  },
})
```

### File uploads

```typescript
try {
  await api.upload(url, formData)
} catch (err) {
  if (err instanceof ClientError && err.status === 413) {
    toastError(UPLOAD_ERROR_MESSAGES.SIZE_EXCEEDED)
  } else if (err instanceof NetworkError) {
    toastError(UPLOAD_ERROR_MESSAGES.NETWORK)
  } else {
    toastError(UPLOAD_ERROR_MESSAGES.SERVER)
  }
}
```

### DataTable sections

```typescript
// Wrap DataTable in ErrorBoundary — also handle query error:
const { data, isLoading, isError, error, refetch } = useAdminDocuments()

if (isError) {
  return (
    <ErrorFallbackInline
      message={QUERY_ERROR_MESSAGES.DOCUMENTS}
      onRetry={refetch}
    />
  )
}
```

### Forms (react-hook-form + zod)

```typescript
// Zod validation errors are shown inline by react-hook-form.
// Server-side validation errors (422) map to field-level errors:

onError: (err) => {
  if (isApiStatus(err, 422) && err instanceof ClientError) {
    // Try to parse field errors from the response body
    // (Requires storing the response body in the error — see api.ts)
    form.setError('root', { message: 'Please check your input and try again.' })
  }
}
```

---

## VERIFICATION STEPS

```bash
cd frontend && npm run dev

# Step 1: Offline banner
# → DevTools → Network tab → Offline
# → Red banner expands from top: "No internet connection"
# → Network → Online again → green "Connection restored" for 3s, then hides

# Step 2: API 401 handling
# → Delete the access_token cookie in DevTools
# → Trigger any API call (navigate to /history)
# → Should redirect to /login?return=%2Fhistory

# Step 3: API 500 handling
# → Temporarily point API_BASE to a dead endpoint
# → Any TanStack Query that fetches should retry 2x then show error state
# → Toast: "A server error occurred"

# Step 4: ErrorBoundary section catches
# → In development: add a throw to a child component
# → ErrorBoundary should catch it and show the error fallback with "Try again"
# → Clicking "Try again" should reset the boundary and re-render

# Step 5: WebSocket reconnection
# → Send a message, then kill the WebSocket server
# → Should see 3 reconnect attempts (1s, 2s, 4s delays)
# → After 3 failures: "Connection failed" toast, streaming state = error

# Step 6: Upload error
# → Try to upload a file > 50MB → toastError with size message
# → Try to upload a non-PDF → toastError with type message

# Step 7: Route-level error page
# → Throw an error in a page.tsx
# → (employee)/error.tsx should render with "Try again" + "Go to chat"
# → (admin)/error.tsx should render with "Try again" + "Dashboard"

npx tsc --noEmit  # Expected: 0 errors
```

---

## COMMIT

```bash
git add -A
git commit -m "F17: Error handling — ErrorBoundary update, error classification, API interceptors, WS reconnection, OfflineBanner, error pages"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F17 (Part 3)*
