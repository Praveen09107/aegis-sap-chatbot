# FRONTEND_02: ARCHITECTURE
## Project Configuration, Middleware, Library Files, and Component Rules
## Session F02 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session F02: Complete project architecture and core library files.

Attach: FRONTEND_MASTER_REFERENCE.md, FRONTEND_01_DESIGN_SYSTEM.md, and this document.

**Prerequisites:** Session F01 complete. npm install from FRONTEND_04_DEPENDENCIES.md must have run first. Run FRONTEND_04 before this session.

**What this session creates:**
- `frontend/next.config.js` — Complete Next.js configuration
- `frontend/tsconfig.json` — TypeScript configuration with path aliases
- `frontend/.env.local` — All environment variables
- `frontend/middleware.ts` — Edge auth middleware (replaces IMPL_21 version)
- `frontend/src/lib/constants.ts` — All application constants
- `frontend/src/lib/auth.ts` — Authentication utilities (replaces IMPL_21 version)
- `frontend/src/lib/api.ts` — Type-safe API client (NEW)
- `frontend/src/lib/queryKeys.ts` — TanStack Query key factory
- `frontend/src/lib/sapEntityDetector.ts` — SAP entity detection (NEW)
- `frontend/src/lib/sessionExport.ts` — PDF export utility (NEW)
- `frontend/src/app/error.tsx` — Global error boundary UI
- `frontend/src/app/not-found.tsx` — 404 page
- `frontend/src/app/(auth)/login/page.tsx` — Login page

---

## FILE 1: frontend/next.config.js (COMPLETE)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker multi-stage build (see IMPL_22 frontend Dockerfile)
  output: 'standalone',

  reactStrictMode: true,
  poweredByHeader: false,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [1280, 1440, 1920],
    // No remote patterns needed — all images are internal
  },

  // Security headers applied to all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/admin/dashboard',
        permanent: false,
      },
    ]
  },

  // Webpack customizations
  webpack: (config, { isServer }) => {
    // @react-pdf/renderer requires canvas fallback
    if (!isServer) {
      config.resolve.alias.canvas = false
    }
    return config
  },

  // Optimise heavy packages by tree-shaking at build time
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
    ],
  },
}

module.exports = nextConfig
```

---

## FILE 2: frontend/tsconfig.json (COMPLETE)

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    },
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "exactOptionalPropertyTypes": false
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

---

## FILE 3: frontend/.env.local (COMPLETE — ALL VARIABLES)

```bash
# ─────────────────────────────────────────────────────────────
# AEGIS Frontend — Environment Variables
# For Docker deployment: set these in docker-compose.yml env section
# For local development: these defaults work with docker-compose services
# ─────────────────────────────────────────────────────────────

# ── Backend API (NEXT_PUBLIC = exposed to browser) ──
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# ── Keycloak (server-side ONLY — never NEXT_PUBLIC) ──
# These are read by /api/auth/* routes, never sent to browser
KEYCLOAK_INTERNAL_URL=http://localhost:8080
KEYCLOAK_CLIENT_ID=aegis-chat
KEYCLOAK_CLIENT_SECRET=aegis_chat_client_secret_dev
KEYCLOAK_REALM=aegis-realm

# ── Backend (server-side ONLY) ──
# Used by Next.js API routes (/api/proxy/*, /api/sessions/*)
BACKEND_INTERNAL_URL=http://localhost:8000

# ── Feature flags (NEXT_PUBLIC = used in client code) ──
NEXT_PUBLIC_DARK_MODE_ENABLED=true
NEXT_PUBLIC_ONBOARDING_ENABLED=true
NEXT_PUBLIC_PDF_EXPORT_ENABLED=true
NEXT_PUBLIC_COMMAND_PALETTE_ENABLED=true

# ── App identity ──
NEXT_PUBLIC_APP_NAME=AEGIS
NEXT_PUBLIC_ORG_NAME=Sona Comstar

# ── Development tools ──
# Set to true to show TanStack Query devtools in browser
NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS=false
```

**Docker override (in docker-compose.yml for aegis-frontend service):**
```yaml
environment:
  KEYCLOAK_INTERNAL_URL: http://aegis-keycloak:8080
  BACKEND_INTERNAL_URL: http://aegis-fastapi:8000
  NEXT_PUBLIC_API_URL: https://localhost
  NEXT_PUBLIC_WS_URL: wss://localhost
  KEYCLOAK_CLIENT_ID: aegis-chat
  KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET:-aegis_chat_client_secret_dev}
  KEYCLOAK_REALM: aegis-realm
```

---

## FILE 4: frontend/middleware.ts (COMPLETE — REPLACES IMPL_21 VERSION)

```typescript
import { NextRequest, NextResponse } from 'next/server'

/**
 * AEGIS Edge Middleware
 *
 * Routing rules:
 * /login             → Public. If authenticated, redirect to /
 * /onboarding        → Employee only (role: employee)
 * /history           → Employee only
 * /                  → Employee only (chat interface)
 * /admin/*           → IT admin only (role: it-admin)
 * /api/auth/*        → Public (auth routes handle their own validation)
 * /api/*             → Protected (handled by route handlers)
 *
 * Tokens are stored as HttpOnly cookies (set by /api/auth/set-token).
 * Middleware reads user_role cookie (non-HttpOnly) for routing decisions.
 * The access_token cookie (HttpOnly) is verified by each API route handler.
 */

const PUBLIC_PATHS = ['/login', '/api/auth']
const EMPLOYEE_PATHS = ['/', '/history', '/onboarding']
const ADMIN_PATH_PREFIX = '/admin'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/logo') ||
    pathname.startsWith('/icons')
  ) {
    return NextResponse.next()
  }

  // Read auth state from cookies
  const accessToken = request.cookies.get('access_token')?.value
  const userRole = request.cookies.get('user_role')?.value as
    | 'employee'
    | 'it-admin'
    | undefined

  // Not authenticated → redirect to login
  if (!accessToken || !userRole) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes → require it-admin role
  if (pathname.startsWith(ADMIN_PATH_PREFIX)) {
    if (userRole !== 'it-admin') {
      // Employee trying to access admin → redirect to chat
      return NextResponse.redirect(new URL('/', request.url))
    }

    const response = NextResponse.next()
    // Signal admin layout to apply dark theme
    response.headers.set('X-Portal', 'admin')
    response.headers.set('X-User-Role', userRole)
    return response
  }

  // Employee routes
  if (EMPLOYEE_PATHS.some((p) => pathname === p) || pathname.startsWith('/history')) {
    const response = NextResponse.next()
    response.headers.set('X-Portal', 'employee')
    response.headers.set('X-User-Role', userRole)
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|icons).*)',
  ],
}
```

---

## FILE 5: frontend/src/lib/constants.ts (COMPLETE)

```typescript
/**
 * AEGIS Frontend Constants
 * Single source of truth for all numeric/string constants.
 * Never hardcode these values in component files.
 */

// ── Layout dimensions ──
export const LAYOUT = {
  EMPLOYEE_TOPBAR_HEIGHT: 52,           // px — top navigation bar
  EMPLOYEE_SIDEBAR_WIDTH: 180,          // px — sessions sidebar (open)
  EMPLOYEE_SOURCE_PANEL_WIDTH: 210,     // px — attribution panel (open)
  EMPLOYEE_SOURCE_PANEL_ICON_WIDTH: 48, // px — attribution panel (collapsed)
  EMPLOYEE_COMPOSE_HEIGHT: 64,          // px — message compose bar
  ADMIN_TOPBAR_HEIGHT: 52,              // px — admin top bar
  ADMIN_SIDEBAR_WIDTH: 220,             // px — admin navigation sidebar
  ADMIN_NAV_ITEM_HEIGHT: 40,            // px — each navigation item
  ADMIN_METRIC_CARD_HEIGHT: 100,        // px — dashboard KPI cards
  MIN_VIEWPORT_WIDTH: 1280,             // px — minimum supported desktop width
  OPTIMAL_VIEWPORT_WIDTH: 1440,         // px — optimal design width
} as const

// ── Timing and polling ──
export const TIMING = {
  ADMIN_POLL_INTERVAL_MS: 30_000,       // 30s — admin dashboard metrics polling
  WS_RECONNECT_DELAY_MS: 3_000,         // 3s — WebSocket reconnect delay
  WS_PING_INTERVAL_MS: 30_000,          // 30s — WebSocket keepalive ping
  WS_PONG_TIMEOUT_MS: 10_000,           // 10s — consider disconnected if no pong
  SEARCH_DEBOUNCE_MS: 300,              // 300ms — session search debounce
  CONFIG_SAVE_DEBOUNCE_MS: 500,         // 500ms — inline config edit debounce
  TOAST_DURATION_MS: 4_000,            // 4s — auto-dismiss toast
  TOKEN_REFRESH_MS: 720_000,            // 12min — JWT silent refresh
  ANIMATION_FAST_MS: 100,              // fast micro-interactions
  ANIMATION_NORMAL_MS: 150,            // standard UI transitions
  ANIMATION_SLOW_MS: 250,              // page/panel transitions
  ANIMATION_SLOWER_MS: 400,            // counter animations, complex transitions
  ONBOARDING_STEP_TRANSITION_MS: 300,  // onboarding step change animation
} as const

// ── Data limits ──
export const LIMITS = {
  MAX_SESSION_SIDEBAR_RECENT: 30,      // sessions shown in sidebar before "Load more"
  MAX_SESSION_SEARCH_RESULTS: 50,      // max search results returned
  MAX_ADMIN_TABLE_PAGE_SIZE: 50,       // rows per admin table page
  MAX_SCREENSHOT_BYTES: 10 * 1024 * 1024,  // 10MB screenshot upload
  MAX_DOCUMENT_BYTES: 50 * 1024 * 1024,    // 50MB document upload
  MAX_SCREENSHOT_DIMENSION: 4096,      // max pixel dimension for screenshots
  ONBOARDING_TOTAL_STEPS: 5,           // total onboarding steps
  MAX_COMMAND_PALETTE_RESULTS: 8,      // max items per command palette section
  MAX_RECENT_COMMANDS: 5,              // recent commands remembered
  MAX_SESSION_EXPORT_MESSAGES: 500,    // max messages in PDF export
  ENTITY_CHIP_TOOLTIP_DELAY_MS: 500,   // hover delay before entity tooltip shows
} as const

// ── localStorage keys ──
// All keys prefixed with "aegis:" to avoid collision with other apps
export const STORAGE_KEYS = {
  DARK_MODE: 'aegis:dark-mode',
  PANEL_COLLAPSED: 'aegis:panel-collapsed',
  ONBOARDING_COMPLETE: 'aegis:onboarding-complete',
  ONBOARDING_STEP: 'aegis:onboarding-step',
  PINNED_SESSIONS: 'aegis:pinned-sessions',
  COMMAND_PALETTE_HISTORY: 'aegis:cmd-history',
  SESSION_SEARCH_HISTORY: 'aegis:search-history',
  ADMIN_TABLE_COLUMN_PREFS: 'aegis:table-columns',
} as const

// ── Backend URLs (client-side access via NEXT_PUBLIC env vars) ──
export const BACKEND = {
  API_BASE: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  WS_BASE: process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000',
  WS_CHAT_PATH: '/ws/chat',
} as const

// ── Feature flags ──
export const FEATURES = {
  DARK_MODE: process.env.NEXT_PUBLIC_DARK_MODE_ENABLED !== 'false',
  ONBOARDING: process.env.NEXT_PUBLIC_ONBOARDING_ENABLED !== 'false',
  PDF_EXPORT: process.env.NEXT_PUBLIC_PDF_EXPORT_ENABLED !== 'false',
  COMMAND_PALETTE: process.env.NEXT_PUBLIC_COMMAND_PALETTE_ENABLED !== 'false',
} as const

// ── Confidence thresholds (mirror backend IMPL_17 values) ──
export const CONFIDENCE = {
  GREEN_THRESHOLD: 0.85,
  AMBER_THRESHOLD: 0.70,
  FRESHNESS_WARN_DAYS: 35,   // staleness warning in config snapshot
  FRESHNESS_CRIT_DAYS: 70,   // critical staleness in config snapshot
} as const

// ── Keyboard shortcuts ──
// Format: modifier+key (e.g., 'meta+k', 'ctrl+/', 'escape')
export const SHORTCUTS = {
  COMMAND_PALETTE: 'meta+k',
  NEW_CHAT: 'meta+n',
  SEARCH_SESSIONS: 'meta+f',
  SHORTCUTS_OVERLAY: 'meta+/',
  CLOSE_PANEL: 'escape',
  SEND_MESSAGE: 'enter',
  NEWLINE: 'shift+enter',
  // Admin shortcuts
  REVIEW_NEXT: 'j',
  REVIEW_PREV: 'k',
  REVIEW_APPROVE: 'a',
  REVIEW_SKIP: 'x',
} as const

// ── Admin analytics date ranges ──
export const ANALYTICS_RANGES = [
  { label: '7 days', value: '7d', days: 7 },
  { label: '30 days', value: '30d', days: 30 },
  { label: '90 days', value: '90d', days: 90 },
  { label: 'All time', value: 'all', days: null },
] as const

// ── Admin navigation items ──
export const ADMIN_NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: 'LayoutDashboard' },
  { label: 'Documents', href: '/admin/documents', icon: 'FileText' },
  { label: 'Registry', href: '/admin/registry', icon: 'Link' },
  { label: 'Config snapshot', href: '/admin/config-snapshot', icon: 'Settings' },
  { label: 'Knowledge gaps', href: '/admin/knowledge-gaps', icon: 'Search' },
  { label: 'Audit trail', href: '/admin/audit-trail', icon: 'ClipboardList' },
  { label: 'Review queue', href: '/admin/review-queue', icon: 'CheckSquare' },
  { label: 'Tickets', href: '/admin/tickets', icon: 'Ticket' },
  { label: 'System health', href: '/admin/system-health', icon: 'Activity' },
  { label: 'Analytics', href: '/admin/analytics', icon: 'BarChart2' },
] as const

// ── Docker service names (for system health page) ──
export const DOCKER_SERVICES = [
  'aegis-nginx',
  'aegis-keycloak',
  'aegis-vault',
  'aegis-fastapi',
  'aegis-arq',
  'aegis-ollama-main',
  'aegis-ollama-judge',
  'aegis-ollama-vision',
  'aegis-bge',
  'aegis-deberta',
  'aegis-qdrant',
  'aegis-opensearch',
  'aegis-postgres-primary',
  'aegis-postgres-replica',
  'aegis-pgbouncer',
  'aegis-redis-session',
  'aegis-redis-queue',
  'aegis-prometheus',
  'aegis-grafana',
] as const

// ── SAP module labels ──
export const SAP_MODULES = {
  FI: 'Financial Accounting',
  MM: 'Materials Management',
  SD: 'Sales & Distribution',
  HR: 'Human Resources',
  PP: 'Production Planning',
  CO: 'Controlling',
  BASIS: 'SAP Basis',
} as const
```

---

## FILE 6: frontend/src/lib/auth.ts (COMPLETE — REPLACES IMPL_21 VERSION)

```typescript
'use client'

/**
 * AEGIS Authentication Utilities
 *
 * Tokens are stored as HttpOnly cookies by /api/auth/set-token.
 * Browser JS cannot read HttpOnly cookies — this is intentional (XSS protection).
 *
 * Client-readable auth state:
 * - user_role cookie (non-HttpOnly): 'employee' | 'it-admin'
 * - isAuthenticated(): checks user_role cookie presence
 *
 * Server-readable auth state:
 * - access_token cookie (HttpOnly): read by API routes and middleware
 * - refresh_token cookie (HttpOnly): read by /api/auth/refresh route
 */

export interface AuthUser {
  role: 'employee' | 'it-admin'
  isAuthenticated: true
}

export interface UnauthenticatedState {
  isAuthenticated: false
  role: null
}

export type AuthState = AuthUser | UnauthenticatedState

/**
 * Login with Keycloak ROPC flow.
 * Fetches tokens from Keycloak, then stores them as HttpOnly cookies
 * via the /api/auth/set-token server-side route.
 */
export async function loginWithCredentials(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: Get tokens from Keycloak via ROPC
    // This goes to Keycloak directly (server-proxied in production)
    const keycloakUrl = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}`
    // Actually use the proxy route for Keycloak to avoid CORS
    const resp = await fetch('/api/auth/keycloak-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      return {
        success: false,
        error: data.error ?? 'Invalid username or password.',
      }
    }

    const { access_token, refresh_token, expires_in } = await resp.json()

    // Step 2: Set HttpOnly cookies via server-side route
    const cookieResp = await fetch('/api/auth/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, refresh_token, expires_in }),
    })

    if (!cookieResp.ok) {
      return { success: false, error: 'Failed to establish session.' }
    }

    return { success: true }
  } catch (err) {
    console.error('Login error:', err)
    return { success: false, error: 'Connection error. Please try again.' }
  }
}

/**
 * Silently refresh the access token using the HttpOnly refresh_token cookie.
 * Called every 12 minutes by the token refresh timer.
 */
export async function refreshAccessToken(): Promise<boolean> {
  try {
    const resp = await fetch('/api/auth/refresh', { method: 'POST' })
    return resp.ok
  } catch {
    return false
  }
}

/**
 * Log out: clear all auth cookies and redirect to login.
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/set-token', { method: 'DELETE' })
  } catch {
    // Proceed with redirect even if cookie clear fails
  }
  window.location.href = '/login'
}

/**
 * Check if the user is authenticated (browser-safe).
 * Reads the non-HttpOnly user_role cookie.
 */
export function isAuthenticated(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes('user_role=')
}

/**
 * Get the user's role (browser-safe).
 * Returns null if not authenticated.
 */
export function getUserRole(): 'employee' | 'it-admin' | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/user_role=([^;]+)/)
  if (!match) return null
  const role = match[1]
  if (role === 'employee' || role === 'it-admin') return role
  return null
}

/**
 * Get current auth state.
 */
export function getAuthState(): AuthState {
  const role = getUserRole()
  if (!role) return { isAuthenticated: false, role: null }
  return { isAuthenticated: true, role }
}

/**
 * IMPORTANT: getAccessToken() always returns null in client-side code.
 * Tokens are HttpOnly cookies — invisible to JavaScript.
 * All API calls must go through /api/proxy/ which reads the cookie server-side.
 *
 * Do NOT use Authorization headers in fetch calls.
 * Use: fetch('/api/proxy/admin/documents')
 * NOT: fetch('/admin/documents', { headers: { Authorization: `Bearer ${getAccessToken()}` } })
 */
export function getAccessToken(): null {
  // HttpOnly cookie — cannot be read from JS
  // Use /api/proxy/* for all API calls
  return null
}
```

---

## FILE 7: frontend/src/app/api/auth/keycloak-token/route.ts (COMPLETE)

```typescript
/**
 * Server-side Keycloak ROPC proxy.
 * Prevents CORS issues by calling Keycloak from the server.
 */
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  const keycloakUrl = process.env.KEYCLOAK_INTERNAL_URL ?? 'http://localhost:8080'
  const realm = process.env.KEYCLOAK_REALM ?? 'aegis-realm'
  const clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'aegis-chat'
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET ?? ''

  const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password,
    scope: 'openid profile',
  })

  try {
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!resp.ok) {
      const error = await resp.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.error_description ?? 'Invalid credentials' },
        { status: 401 }
      )
    }

    const data = await resp.json()
    return NextResponse.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    })
  } catch (err) {
    console.error('Keycloak token error:', err)
    return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 503 })
  }
}
```

---

## FILE 8: frontend/src/lib/api.ts (COMPLETE — NEW FILE)

```typescript
/**
 * AEGIS Type-Safe API Client
 *
 * All calls route through /api/proxy/[...path] which:
 * 1. Reads the HttpOnly access_token cookie
 * 2. Forwards the request to FastAPI with Authorization header
 * 3. Returns the response
 *
 * Usage:
 *   const docs = await api.get<DocumentRecord[]>('admin/documents')
 *   const result = await api.post('admin/registry/abc/approve')
 *   await api.upload<IngestResult>('api/upload/document', formData)
 */

import { toast } from 'sonner'

export class APIError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly body?: unknown
  ) {
    super(detail)
    this.name = 'APIError'
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /**
   * Suppress automatic toast notifications on error.
   * Use when you want to handle errors manually in the component.
   */
  silent?: boolean
}

interface UploadOptions {
  silent?: boolean
  onProgress?: (percent: number) => void
}

async function request<T>(
  path: string,
  options: RequestOptions & { body?: unknown } = {}
): Promise<T> {
  const { silent = false, body, headers: customHeaders, ...restOptions } = options

  // All API calls go through the Next.js proxy route
  const url = `/api/proxy/${path.replace(/^\//, '')}`

  const headers: HeadersInit = {
    ...customHeaders,
  }

  // Only set Content-Type for JSON bodies
  if (body !== undefined && !(body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...restOptions,
      headers,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (networkError) {
    if (!silent) {
      toast.error('Network error — check your connection and try again.')
    }
    throw new APIError(0, 'Network error', networkError)
  }

  // Handle successful empty responses
  if (response.status === 204) {
    return undefined as T
  }

  // Parse response body
  const contentType = response.headers.get('content-type') ?? ''
  let responseBody: unknown
  if (contentType.includes('application/json')) {
    responseBody = await response.json().catch(() => null)
  } else {
    responseBody = await response.text().catch(() => null)
  }

  if (!response.ok) {
    const detail =
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'detail' in responseBody
        ? String((responseBody as { detail: unknown }).detail)
        : `Request failed with status ${response.status}`

    if (!silent) {
      switch (response.status) {
        case 401:
          toast.error('Session expired. Redirecting to login...')
          setTimeout(() => {
            window.location.href = '/login'
          }, 1500)
          break
        case 403:
          toast.error('You do not have permission to perform this action.')
          break
        case 404:
          toast.error('The requested resource was not found.')
          break
        case 422:
          toast.error(`Validation error: ${detail}`)
          break
        case 429:
          toast.error('Too many requests. Please wait a moment.')
          break
        default:
          if (response.status >= 500) {
            toast.error('Server error. Please try again or contact IT support.')
          } else {
            toast.error(detail)
          }
      }
    }

    throw new APIError(response.status, detail, responseBody)
  }

  return responseBody as T
}

// ── Typed API methods ──

export const api = {
  /** HTTP GET */
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' })
  },

  /** HTTP POST with JSON body */
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', body })
  },

  /** HTTP PUT with JSON body */
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'PUT', body })
  },

  /** HTTP PATCH with JSON body */
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'PATCH', body })
  },

  /** HTTP DELETE */
  delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' })
  },

  /**
   * Multipart file upload.
   * Does NOT set Content-Type — browser sets it with boundary automatically.
   */
  upload<T>(
    path: string,
    formData: FormData,
    options?: UploadOptions
  ): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: formData,
      silent: options?.silent,
    })
  },
}
```

---

## FILE 9: frontend/src/lib/queryKeys.ts (COMPLETE)

```typescript
/**
 * TanStack Query key factory for AEGIS.
 *
 * Consistent cache keys prevent stale data and enable precise invalidation.
 * Usage: queryClient.invalidateQueries({ queryKey: queryKeys.admin.documents() })
 */

import type { SessionFilters, DocFilters, AuditFilters } from '@/types'

export const queryKeys = {
  // ── Session history (employee) ──
  sessions: {
    all: () => ['sessions'] as const,
    list: (filters?: SessionFilters) =>
      ['sessions', 'list', filters ?? {}] as const,
    detail: (id: string) => ['sessions', 'detail', id] as const,
    search: (query: string) => ['sessions', 'search', query] as const,
  },

  // ── Admin ──
  admin: {
    // Live metrics (30s polling)
    metrics: () => ['admin', 'metrics'] as const,

    // Documents
    documents: (filters?: DocFilters) =>
      ['admin', 'documents', filters ?? {}] as const,

    // Registry
    registry: (status?: string) =>
      ['admin', 'registry', status ?? 'all'] as const,

    // Config snapshot
    config: () => ['admin', 'config'] as const,

    // Knowledge gaps
    gaps: (days: number) => ['admin', 'gaps', days] as const,

    // Audit trail
    auditTrail: (filters?: AuditFilters) =>
      ['admin', 'audit', filters ?? {}] as const,

    // Review queue
    reviewQueue: (status: string) =>
      ['admin', 'review', status] as const,

    // Tickets
    tickets: (status?: string) =>
      ['admin', 'tickets', status ?? 'all'] as const,

    // System health
    systemHealth: () => ['admin', 'health'] as const,

    // Analytics
    analytics: (range: string) =>
      ['admin', 'analytics', range] as const,
  },

  // ── User preferences ──
  preferences: {
    all: () => ['preferences'] as const,
  },
} as const
```

---

## FILE 10: frontend/src/lib/sapEntityDetector.ts (COMPLETE)

```typescript
/**
 * AEGIS SAP Entity Detector
 *
 * Detects SAP-specific identifiers in text and returns their positions.
 * Used by SAPEntityHighlighter to render colored EntityChip components.
 *
 * Entity types:
 * - error_code: VL150, F5201, BA114, ME001 (1-2 letters + 3-4 digits)
 * - tcode: VL01N, MM02, MMBE, VA31, FB50 (transaction codes)
 * - doc_number: 4500012345 (10-12 digit document numbers)
 */

import type { SAPEntity, SAPEntityType } from '@/types'

// ── Detection patterns ──

// Error codes: 1-2 uppercase letters followed by 3-4 digits, optional trailing letter
const ERROR_CODE_REGEX = /\b([A-Z]{1,2}\d{3,4}[A-Z]?)\b/g

// Transaction codes: 2-6 uppercase letters optionally followed by digits/letters
// Also handles codes like F-03 (with hyphen) and ME21N (letter suffix)
const TCODE_REGEX = /\b([A-Z]{2,6}(?:\d{0,4}[A-Z]?|[-]\d{2}))\b/g

// SAP document numbers: exactly 10 digits (purchase orders, sales orders, etc.)
const DOC_NUMBER_REGEX = /\b(\d{10})\b/g

// ── Exclusion sets (common English words that match patterns) ──

const TCODE_EXCLUSIONS = new Set([
  // Common English words that look like T-codes
  'AND', 'THE', 'FOR', 'ARE', 'WAS', 'CAN', 'NOT', 'BUT', 'ALL', 'ANY',
  'YOU', 'HAS', 'HAD', 'ITS', 'OUR', 'OUT', 'YES', 'FROM', 'ALSO', 'THEN',
  'THEM', 'THEY', 'THIS', 'WITH', 'THAT', 'INTO', 'WHEN', 'BEEN', 'HAVE',
  // Tech acronyms
  'API', 'URL', 'PDF', 'XML', 'CSV', 'SQL', 'JIT', 'KPI', 'ERR', 'MSG',
  // SAP itself
  'SAP', 'ERP', 'RFC',
  // Short words
  'IT', 'AT', 'IN', 'IS', 'AS', 'BE', 'BY', 'DO', 'GO', 'IF', 'ME',
  'MY', 'NO', 'OF', 'ON', 'OR', 'SO', 'TO', 'UP', 'US',
])

// Known SAP module prefixes for error codes (increases precision)
const ERROR_PREFIXES = [
  'VL', 'VA', 'VF', 'VK', 'ME', 'MB', 'MM', 'MR', 'ML',
  'FI', 'FB', 'FF', 'FT', 'CO', 'CJ', 'KS', 'KA', 'KE',
  'BA', 'CA', 'PA', 'PY', 'HR', 'PT', 'PP', 'CA', 'QM',
  'F',  // Single-letter FI codes: F5201
  'M',  // Single-letter MM codes: M0001
]

// Known SAP transaction code prefixes (increases precision)
const TCODE_PREFIXES = [
  'VL', 'VA', 'VF', 'VK', 'VD', 'VN', // SD
  'ME', 'MB', 'MM', 'MR', 'ML', 'MN',  // MM
  'FB', 'FF', 'FT', 'FV', 'FK', 'FD',  // FI
  'KB', 'KE', 'KP', 'KS', 'KA', 'CO',  // CO
  'PA', 'PY', 'HR', 'PE', 'PT',         // HR
  'CA', 'CS', 'PP', 'PI',               // PP
  'MMBE', 'XK', 'XD', 'FK', 'FD',      // Common cross-module
]

/**
 * Detect all SAP entities in a text string.
 * Returns entities sorted by position (start index).
 */
export function detectSAPEntities(text: string): SAPEntity[] {
  const entities: SAPEntity[] = []

  // Track covered ranges to prevent overlapping entities
  const covered = new Set<number>()

  function isCovered(start: number, end: number): boolean {
    for (let i = start; i < end; i++) {
      if (covered.has(i)) return true
    }
    return false
  }

  function markCovered(start: number, end: number): void {
    for (let i = start; i < end; i++) covered.add(i)
  }

  // 1. Detect document numbers (most specific — pure digits)
  DOC_NUMBER_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = DOC_NUMBER_REGEX.exec(text)) !== null) {
    const [full, value] = match
    const start = match.index
    const end = start + full.length
    if (!isCovered(start, end)) {
      entities.push({ type: 'doc_number', value, start, end })
      markCovered(start, end)
    }
  }

  // 2. Detect error codes (medium specificity)
  ERROR_CODE_REGEX.lastIndex = 0
  while ((match = ERROR_CODE_REGEX.exec(text)) !== null) {
    const [full, value] = match
    const start = match.index
    const end = start + full.length
    if (!isCovered(start, end) && isLikelyErrorCode(value)) {
      entities.push({ type: 'error_code', value, start, end })
      markCovered(start, end)
    }
  }

  // 3. Detect T-codes (broadest pattern — applied last)
  TCODE_REGEX.lastIndex = 0
  while ((match = TCODE_REGEX.exec(text)) !== null) {
    const [full, value] = match
    const start = match.index
    const end = start + full.length
    if (!isCovered(start, end) && isLikelyTCode(value)) {
      entities.push({ type: 'tcode', value, start, end })
      markCovered(start, end)
    }
  }

  return entities.sort((a, b) => a.start - b.start)
}

function isLikelyErrorCode(value: string): boolean {
  if (value.length < 4 || value.length > 7) return false
  return ERROR_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function isLikelyTCode(value: string): boolean {
  if (TCODE_EXCLUSIONS.has(value)) return false
  if (value.length < 3 || value.length > 8) return false
  return TCODE_PREFIXES.some((prefix) => value.startsWith(prefix))
}

/**
 * Split text into segments for rendering by SAPEntityHighlighter.
 */
export interface TextSegment {
  type: 'text' | 'entity'
  content: string
  entity?: SAPEntity
}

export function splitTextByEntities(
  text: string,
  entities: SAPEntity[]
): TextSegment[] {
  if (entities.length === 0) {
    return [{ type: 'text', content: text }]
  }

  const segments: TextSegment[] = []
  let cursor = 0

  for (const entity of entities) {
    if (cursor < entity.start) {
      segments.push({ type: 'text', content: text.slice(cursor, entity.start) })
    }
    segments.push({ type: 'entity', content: entity.value, entity })
    cursor = entity.end
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', content: text.slice(cursor) })
  }

  return segments
}
```

---

## FILE 11: frontend/src/lib/sessionExport.ts (COMPLETE — PDF EXPORT)

```typescript
/**
 * AEGIS Session PDF Export
 *
 * Exports a chat session as a formatted PDF document.
 * Uses @react-pdf/renderer — runs client-side.
 *
 * PDF structure:
 * - Cover: AEGIS logo, session topic, date, export timestamp
 * - Each message: user/AI bubble, timestamp
 * - AI messages include: confidence badge, document reference
 * - Footer: "Generated by AEGIS — Sona Comstar SAP Intelligence"
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer'
import { createElement } from 'react'
import type { ChatMessage, ConfidenceBadge } from '@/types'

const COLORS = {
  navy: '#060B14',
  cyan: '#06B6D4',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  gray50: '#F8FAFC',
  gray200: '#E2E8F0',
  gray500: '#64748B',
  gray900: '#0F172A',
  white: '#FFFFFF',
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    backgroundColor: COLORS.white,
  },
  cover: {
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  coverTitle: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    marginBottom: 8,
  },
  coverSub: {
    fontSize: 11,
    color: COLORS.gray500,
    marginBottom: 4,
  },
  message: {
    marginBottom: 16,
  },
  userBubble: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: '10 14',
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  aiBubble: {
    backgroundColor: COLORS.gray50,
    borderRadius: 8,
    padding: '10 14',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.green,
    maxWidth: '90%',
  },
  aiBubbleAmber: {
    borderLeftColor: COLORS.amber,
  },
  aiBubbleNone: {
    borderLeftColor: COLORS.gray200,
  },
  messageText: {
    fontSize: 10,
    color: COLORS.gray900,
    lineHeight: 1.5,
  },
  userText: {
    color: '#1D4ED8',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  confidencePill: {
    backgroundColor: '#D1FAE5',
    borderRadius: 100,
    padding: '2 8',
    fontSize: 8,
    color: '#065F46',
  },
  attributionText: {
    fontSize: 8,
    color: COLORS.gray500,
  },
  roleLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.gray500,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: COLORS.gray500,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: 8,
  },
})

function getBadgeColor(badge: ConfidenceBadge): string {
  switch (badge) {
    case 'green': return COLORS.green
    case 'amber': return COLORS.amber
    default: return COLORS.gray500
  }
}

function BadgeText({ badge }: { badge: ConfidenceBadge }): JSX.Element {
  const labels: Record<string, string> = {
    green: 'High confidence',
    amber: 'Moderate confidence',
    none: 'Insufficient',
  }
  return createElement(
    Text,
    { style: styles.confidencePill },
    badge ? labels[badge] : ''
  )
}

function SessionDocument({
  messages,
  topic,
  exportedAt,
}: {
  messages: ChatMessage[]
  topic: string
  exportedAt: Date
}): JSX.Element {
  return createElement(
    Document,
    null,
    createElement(
      Page,
      { size: 'A4', style: styles.page },
      // Cover
      createElement(
        View,
        { style: styles.cover },
        createElement(Text, { style: styles.coverTitle }, 'AEGIS — Session Export'),
        createElement(Text, { style: styles.coverSub }, `Topic: ${topic}`),
        createElement(
          Text,
          { style: styles.coverSub },
          `Exported: ${exportedAt.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        )
      ),
      // Messages
      ...messages.slice(0, 500).map((msg) =>
        createElement(
          View,
          { key: msg.id, style: styles.message },
          createElement(
            Text,
            { style: styles.roleLabel },
            msg.role === 'user' ? 'Employee' : 'AEGIS'
          ),
          createElement(
            View,
            {
              style:
                msg.role === 'user'
                  ? styles.userBubble
                  : {
                      ...styles.aiBubble,
                      ...(msg.confidenceBadge === 'amber' ? styles.aiBubbleAmber : {}),
                      ...(msg.confidenceBadge === 'none' ? styles.aiBubbleNone : {}),
                    },
            },
            createElement(
              Text,
              { style: [styles.messageText, msg.role === 'user' ? styles.userText : {}] },
              msg.content
            ),
            msg.role === 'assistant' && msg.confidenceBadge &&
              createElement(
                View,
                { style: styles.metaRow },
                createElement(BadgeText, { badge: msg.confidenceBadge }),
                msg.attributionPanel &&
                  createElement(
                    Text,
                    { style: styles.attributionText },
                    `${msg.attributionPanel.primary_document_id} · ${msg.attributionPanel.verified_date} · ${msg.attributionPanel.verified_by}`
                  )
              )
          )
        )
      ),
      // Footer
      createElement(
        Text,
        { style: styles.footer, fixed: true },
        'Generated by AEGIS — Sona Comstar SAP Intelligence | Confidential'
      )
    )
  )
}

/**
 * Generate and download a PDF export of a session.
 */
export async function exportSessionAsPDF(
  messages: ChatMessage[],
  topic: string
): Promise<void> {
  const exportedAt = new Date()
  const document = createElement(SessionDocument, { messages, topic, exportedAt })
  const blob = await pdf(document).toBlob()

  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `AEGIS-session-${exportedAt.toISOString().slice(0, 10)}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
```

---

## FILE 12: frontend/src/app/error.tsx (GLOBAL ERROR BOUNDARY)

```typescript
'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Global error boundary caught:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary">
      <div className="max-w-md w-full mx-4">
        <div className="bg-bg-card border border-border-primary rounded-xl p-8 text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-danger-bg border border-danger-border flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-danger" />
          </div>

          <h1 className="text-xl font-semibold text-text-primary mb-2">
            Something went wrong
          </h1>

          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            An unexpected error occurred. If this continues, please contact IT support.
          </p>

          {process.env.NODE_ENV === 'development' && (
            <div className="bg-bg-sunken border border-border-primary rounded-lg p-3 mb-6 text-left">
              <p className="text-xs font-mono text-danger truncate">{error.message}</p>
              {error.digest && (
                <p className="text-xs text-text-tertiary mt-1">ID: {error.digest}</p>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>

            <a
              href="/"
              className="px-4 py-2 border border-border-primary text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-secondary transition-colors"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## FILE 13: frontend/src/app/not-found.tsx (404 PAGE)

```typescript
import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary">
      <div className="max-w-md w-full mx-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent-subtle border border-border-primary flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="w-8 h-8 text-accent" />
        </div>

        <h1 className="text-2xl font-bold text-text-primary mb-2">Page not found</h1>
        <p className="text-text-secondary mb-8 text-sm leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          Back to AEGIS
        </Link>
      </div>
    </div>
  )
}
```

---

## FILE 14: frontend/src/app/(auth)/login/page.tsx (COMPLETE LOGIN PAGE)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { loginWithCredentials, isAuthenticated, getUserRole } from '@/lib/auth'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      const role = getUserRole()
      router.replace(role === 'it-admin' ? '/admin/dashboard' : '/')
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return

    setError(null)
    setIsLoading(true)

    const result = await loginWithCredentials(username.trim(), password)
    setIsLoading(false)

    if (result.success) {
      const role = getUserRole()
      router.push(role === 'it-admin' ? '/admin/dashboard' : '/')
    } else {
      setError(result.error ?? 'Login failed. Please check your credentials.')
      setPassword('')
    }
  }

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-bg-card border border-border-primary rounded-2xl p-8 shadow-lg">
          {/* Logo + branding */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4 shadow-md">
              <Image
                src="/logo.svg"
                alt="Sona Comstar"
                width={32}
                height={32}
                className="object-contain brightness-0 invert"
                onError={(e) => {
                  // Fallback if logo not yet provided
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <span className="hidden text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">AEGIS</h1>
            <p className="text-sm text-text-tertiary mt-1">SAP Intelligence · Sona Comstar</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-text-secondary"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your SAP username"
                autoComplete="username"
                autoFocus
                required
                disabled={isLoading}
                className={cn(
                  'w-full h-10 px-3 rounded-lg text-sm',
                  'bg-bg-secondary border border-border-primary',
                  'text-text-primary placeholder:text-text-tertiary',
                  'transition-colors duration-150',
                  'focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-secondary"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                  className={cn(
                    'w-full h-10 px-3 pr-10 rounded-lg text-sm',
                    'bg-bg-secondary border border-border-primary',
                    'text-text-primary placeholder:text-text-tertiary',
                    'transition-colors duration-150',
                    'focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error state */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 bg-danger-bg border border-danger-border rounded-lg"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 flex-shrink-0" />
                <p className="text-sm text-danger-text leading-relaxed">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password.trim()}
              className={cn(
                'w-full h-10 rounded-lg text-sm font-medium',
                'bg-accent text-white',
                'transition-all duration-150',
                'hover:bg-accent-hover',
                'active:scale-[0.98]',
                'focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
                'flex items-center justify-center gap-2'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-text-tertiary mt-6">
          Internal tool — authorised users only
        </p>
      </div>
    </div>
  )
}
```

---

## SERVER VS CLIENT COMPONENT DECISION GUIDE

In AEGIS, follow these rules for every new file:

### Always Server Component (no `'use client'`)
```
app/layout.tsx               → Root layout (font vars, providers)
app/(auth)/login/layout.tsx  → Simple wrapper
app/not-found.tsx            → Static 404 page
Any component that only renders static HTML with no interactivity
```

### Always Client Component (`'use client'` required)
```
Every chat component        → Uses WebSocket, useEffect, useState
Every admin page            → Uses TanStack Query polling, filters, selection
Login page                  → Form submission, useState
Session sidebar             → Interactive session list, search
Command palette             → Keyboard listeners, open/close state
Theme toggle                → next-themes useTheme hook
Any component using:        → useState, useEffect, useRef, event handlers
                              Zustand stores, TanStack Query hooks
                              next/navigation useRouter/usePathname
                              Window/document/browser APIs
```

### Rule of thumb for AEGIS
**Default to `'use client'`** — nearly every component in this application involves real-time data, polling, or user interaction. The only Server Components are layout wrappers and the not-found/error pages. If in doubt, add `'use client'`.

---

## VERIFICATION STEPS

```bash
cd frontend

# Step 1: TypeScript compilation
npx tsc --noEmit
# Expected: 0 errors

# Step 2: Next.js configuration test
npm run build 2>&1 | head -30
# Expected: Build starts without configuration errors

# Step 3: Environment variables present
node -e "require('dotenv').config({path:'.env.local'}); console.log('API:', process.env.NEXT_PUBLIC_API_URL)"
# Expected: API: http://localhost:8000

# Step 4: Import resolution test
node -e "
const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig.json')
console.log('Paths:', JSON.stringify(compilerOptions.paths))
"
# Expected: Shows @/* path mapping

# Step 5: Dev server starts
npm run dev &
sleep 5
curl -s http://localhost:3000/login | grep -c 'AEGIS'
# Expected: 1 (login page renders)

# Step 6: Auth redirect test
curl -sI http://localhost:3000/ | grep Location
# Expected: Redirects to /login (no auth cookie)

# Step 7: Admin redirect test
curl -sI http://localhost:3000/admin | grep Location
# Expected: Redirects to /login
```

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "F02: Architecture — next.config, tsconfig, env, middleware, lib files, login page"
```

---

*Document version: 1.0 | AEGIS Frontend Specification Set | Session F02*
