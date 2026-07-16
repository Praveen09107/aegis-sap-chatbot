# FRONTEND_SUPPLEMENT_02: PROXY ROUTE, PDF COMPONENTS & TABLE ENHANCEMENTS
## Fixes for: Missing proxy FILE, PDF directory, DataTable ⌘A, URL state persistence
## Apply during Session F03 (proxy), F06 (PDF), F11 (table)

---

## PART 1 — CATCH-ALL PROXY ROUTE (Missing FILE from FRONTEND_02)

This is the **most critical missing file** in the entire spec set. Every API call from the
frontend routes through this handler. FRONTEND_02 documented 14 files — this is FILE 15.

### FILE 15: src/app/api/proxy/[...path]/route.ts (COMPLETE)

```typescript
/**
 * AEGIS API Catch-All Proxy Route
 *
 * Routes all frontend API calls to the FastAPI backend, injecting the
 * HttpOnly access_token cookie as a Bearer token.
 *
 * URL pattern: /api/proxy/<backend-path>?<query-params>
 * Forwards to:  http://<backend>:8000/api/<backend-path>?<query-params>
 *
 * Handles: GET, POST, PUT, PATCH, DELETE
 * Does NOT handle: WebSocket (separate /api/auth/ws-token + direct WS connection)
 * Does NOT handle: File uploads via this proxy — multipart/form-data
 *                  goes through /api/upload/* routes directly
 *
 * Security:
 * - Access token is read server-side from HttpOnly cookie (not accessible to JS)
 * - 401 from backend is forwarded as-is (frontend api.ts handles redirect)
 * - Request timeout of 30s prevents connection hang
 * - No sensitive headers (cookie, host) are forwarded to backend
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:8000'
const REQUEST_TIMEOUT_MS = 30_000

// Headers that must NOT be forwarded to the backend
const BLOCKED_REQUEST_HEADERS = new Set([
  'host',
  'cookie',
  'connection',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
])

// Headers that must NOT be forwarded to the client
const BLOCKED_RESPONSE_HEADERS = new Set([
  'set-cookie',    // Backend should not set cookies — only Next.js does
  'transfer-encoding',
])

/**
 * Core proxy handler — used by all HTTP method exports below.
 */
async function proxyRequest(
  request: NextRequest,
  context: { params: { path: string[] } }
): Promise<NextResponse> {
  // ── Auth check ─────────────────────────────────────────
  const cookieStore = cookies()
  const accessToken = cookieStore.get('access_token')?.value

  if (!accessToken) {
    return NextResponse.json(
      { detail: 'Not authenticated' },
      { status: 401 }
    )
  }

  // ── Build upstream URL ──────────────────────────────────
  const backendPath = context.params.path.join('/')
  const searchParams = request.nextUrl.searchParams.toString()
  const upstreamUrl = `${BACKEND_URL}/api/${backendPath}${
    searchParams ? `?${searchParams}` : ''
  }`

  // ── Build forwarded headers ─────────────────────────────
  const forwardHeaders = new Headers()
  forwardHeaders.set('Authorization', `Bearer ${accessToken}`)
  forwardHeaders.set('Accept', 'application/json')

  // Forward safe request headers
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase()
    if (!BLOCKED_REQUEST_HEADERS.has(lowerKey)) {
      forwardHeaders.set(key, value)
    }
  })

  // Add real IP for audit logging on backend
  const realIp =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  forwardHeaders.set('X-Real-IP', realIp)

  // ── Body ────────────────────────────────────────────────
  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  let body: ArrayBuffer | undefined
  if (hasBody) {
    try {
      body = await request.arrayBuffer()
    } catch {
      return NextResponse.json({ detail: 'Failed to read request body' }, { status: 400 })
    }
  }

  // ── Request with timeout ────────────────────────────────
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // ── Build response ────────────────────────────────────
    const responseHeaders = new Headers()
    upstreamResponse.headers.forEach((value, key) => {
      if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value)
      }
    })

    // Ensure content type is always set
    if (!responseHeaders.has('Content-Type')) {
      responseHeaders.set('Content-Type', 'application/json')
    }

    // Stream the response body to avoid buffering large responses
    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })

  } catch (err) {
    clearTimeout(timeoutId)

    const error = err as Error
    if (error.name === 'AbortError') {
      console.error(`[proxy] Timeout: ${request.method} ${upstreamUrl}`)
      return NextResponse.json(
        { detail: 'The backend took too long to respond. Please try again.' },
        { status: 504 }
      )
    }

    console.error(`[proxy] Backend unreachable: ${request.method} ${upstreamUrl}`, error.message)
    return NextResponse.json(
      { detail: 'The service is temporarily unavailable.' },
      { status: 502 }
    )
  }
}

// ── HTTP method exports ─────────────────────────────────────

export const GET = (
  req: NextRequest,
  ctx: { params: { path: string[] } }
) => proxyRequest(req, ctx)

export const POST = (
  req: NextRequest,
  ctx: { params: { path: string[] } }
) => proxyRequest(req, ctx)

export const PUT = (
  req: NextRequest,
  ctx: { params: { path: string[] } }
) => proxyRequest(req, ctx)

export const PATCH = (
  req: NextRequest,
  ctx: { params: { path: string[] } }
) => proxyRequest(req, ctx)

export const DELETE = (
  req: NextRequest,
  ctx: { params: { path: string[] } }
) => proxyRequest(req, ctx)

// ── Route config ─────────────────────────────────────────────

/**
 * Force dynamic rendering — this route reads cookies which is request-specific.
 * Without this, Next.js may attempt to statically optimise it.
 */
export const dynamic = 'force-dynamic'
```

### File upload proxy routes (separate from catch-all)

The multipart upload routes need special handling because `arrayBuffer()` is insufficient
for streaming large files. Create separate routes:

```typescript
// src/app/api/upload/document/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:8000'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieStore = cookies()
  const accessToken = cookieStore.get('access_token')?.value

  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 })
  }

  // Stream the multipart form data directly to backend without buffering
  const response = await fetch(`${BACKEND_URL}/api/upload/document`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Forward content-type with boundary — DO NOT set manually
      'Content-Type': request.headers.get('Content-Type') ?? '',
    },
    body: request.body,
    // duplex: 'half' required for streaming request body in Node.js 22
    // @ts-expect-error — duplex not in TypeScript types yet
    duplex: 'half',
  })

  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
}

export const dynamic = 'force-dynamic'
```

```typescript
// src/app/api/upload/screenshot/route.ts — identical pattern
// Change endpoint to /api/upload/screenshot
// Max upload size: 10MB (enforced by backend; Next.js default is 4MB)
// Add to next.config.js:
//   api: { bodyParser: { sizeLimit: '11mb' } }
```

---

## PART 2 — PDF COMPONENTS DIRECTORY (Missing from all specs)

`src/lib/sessionExport.ts` (FRONTEND_02) dynamically imports `@/components/pdf/SessionDocument`
but this directory and component were never specified. Here is the complete specification.

### FILE: src/components/pdf/SessionDocument.tsx (COMPLETE)

```typescript
/**
 * AEGIS Session PDF Export Document
 * Built with @react-pdf/renderer
 *
 * This component is ONLY ever used via dynamic import inside sessionExport.ts.
 * It is never rendered in the browser DOM.
 *
 * PDF structure:
 * ┌─────────────────────────────────────────┐
 * │  AEGIS — Sona Comstar               [date]│
 * │  Session: Topic summary text              │
 * │  Exported: DD MMM YYYY, HH:MM IST        │
 * ├─────────────────────────────────────────┤
 * │  [USER]  Question text here              │
 * │  ─────────────────────────────────────  │
 * │  [AEGIS] Response text here              │
 * │          🟢 91% High confidence          │
 * │          Source: SD-ERR-001              │
 * │  ─────────────────────────────────────  │
 * │  [USER]  Second question...              │
 * └─────────────────────────────────────────┘
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { ChatMessage } from '@/types'

// ── PDF styles ────────────────────────────────────────────────

const COLORS = {
  navy:    '#060B14',
  cyan:    '#06B6D4',
  white:   '#FFFFFF',
  gray100: '#F1F5F9',
  gray300: '#CBD5E1',
  gray600: '#475569',
  gray800: '#1E293B',
  green:   '#059669',
  amber:   '#D97706',
  danger:  '#DC2626',
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 48,
    paddingVertical: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.gray800,
    lineHeight: 1.5,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray300,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 20, height: 20,
    backgroundColor: COLORS.cyan,
    borderRadius: 4,
  },
  brandText: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: COLORS.navy },
  headerDate: { fontSize: 9, color: COLORS.gray600 },
  // Session meta
  sessionMeta: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: COLORS.gray100,
    borderRadius: 6,
  },
  sessionTopic: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: COLORS.navy, marginBottom: 4 },
  sessionExported: { fontSize: 9, color: COLORS.gray600 },
  // Messages
  message: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.gray300,
  },
  messageRole: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.gray600,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  messageContent: { fontSize: 10, color: COLORS.gray800, lineHeight: 1.6 },
  // Badge row
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  badge: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeGreen: { backgroundColor: '#D1FAE5', color: COLORS.green },
  badgeAmber: { backgroundColor: '#FEF3C7', color: COLORS.amber },
  badgeNone:  { backgroundColor: '#FEE2E2', color: COLORS.danger },
  sourceText: { fontSize: 8, color: COLORS.gray600 },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLORS.gray600,
  },
})

// ── Helper ────────────────────────────────────────────────────

function formatISTDate(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

function getBadgeStyle(badge: string | null | undefined) {
  if (badge === 'green') return [styles.badge, styles.badgeGreen]
  if (badge === 'amber') return [styles.badge, styles.badgeAmber]
  return [styles.badge, styles.badgeNone]
}

function getBadgeLabel(badge: string | null | undefined, score?: number | null): string {
  const pct = score != null ? ` ${Math.round(score * 100)}%` : ''
  if (badge === 'green') return `✓${pct} High confidence`
  if (badge === 'amber') return `~${pct} Moderate confidence`
  return `✗ Insufficient`
}

// ── Component ─────────────────────────────────────────────────

interface SessionDocumentProps {
  messages: ChatMessage[]
  topic: string
  exportedAt: Date
}

export function SessionDocument({ messages, topic, exportedAt }: SessionDocumentProps) {
  const now = formatISTDate(exportedAt)

  return (
    <Document
      title={`AEGIS Session — ${topic}`}
      author="Sona Comstar AEGIS"
      creator="AEGIS SAP Intelligence"
    >
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark} />
            <Text style={styles.brandText}>AEGIS</Text>
          </View>
          <Text style={styles.headerDate}>{now}</Text>
        </View>

        {/* Session metadata */}
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionTopic}>{topic}</Text>
          <Text style={styles.sessionExported}>Exported: {now}</Text>
        </View>

        {/* Messages */}
        {messages.map((msg, i) => (
          <View key={i} style={styles.message}>
            <Text style={styles.messageRole}>
              {msg.role === 'user' ? 'Employee' : 'AEGIS'}
            </Text>
            <Text style={styles.messageContent}>{msg.content}</Text>

            {/* Confidence badge for AI messages */}
            {msg.role === 'assistant' && (
              <View style={styles.badgeRow}>
                <Text style={getBadgeStyle(msg.confidenceBadge)}>
                  {getBadgeLabel(msg.confidenceBadge, msg.validationScore)}
                </Text>
                {msg.attributionPanel?.primary_document_id && (
                  <Text style={styles.sourceText}>
                    Source: {msg.attributionPanel.primary_document_id}
                  </Text>
                )}
              </View>
            )}
          </View>
        ))}

        {/* Page footer */}
        <View style={styles.footer} fixed>
          <Text>AEGIS SAP Intelligence — Sona Comstar</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
```

---

## PART 3 — DataTable ⌘A SELECT ALL (FRONTEND_06 / admin/DataTable.tsx)

The accessibility spec (FRONTEND_27) lists ⌘A to select all rows, but it was never implemented.

```typescript
// ADD to DataTable.tsx — inside the component, after existing state:

// ⌘A keyboard shortcut to select/deselect all rows
useKeyboardShortcuts([
  {
    key: 'a',
    meta: true,
    handler: () => {
      if (!selectable || !onSelectionChange) return
      if (selectedKeys && selectedKeys.size === data.length) {
        // All selected → deselect all
        onSelectionChange(new Set())
      } else {
        // Select all by key field
        const allKeys = new Set(data.map((row) => String(row[keyField as keyof T])))
        onSelectionChange(allKeys)
      }
    },
    preventDefault: true,
  },
])

// ADD ⌘A to keyboard shortcuts overlay (FRONTEND_07):
// In KeyboardShortcutsOverlay.tsx ADMIN_SHORTCUTS array:
{ keys: ['⌘A'], label: 'Select all rows', context: 'Admin tables' },
```

---

## PART 4 — ADMIN TABLE URL STATE PERSISTENCE

Admin table sort and filter state is lost on refresh. Add URL param persistence for
the most critical admin pages (Documents, Audit Trail).

```typescript
// Pattern: use Next.js searchParams for filter state in server components,
// or use nuqs (lightweight URL state library, already not in deps — use router.push pattern)

// For Documents page — add to page.tsx:
'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

// Replace local useState for filters with URL-backed state:
const searchParams = useSearchParams()
const router = useRouter()
const pathname = usePathname()

// Read filters from URL:
const documentFilters: DocFilters = {
  module:       searchParams.get('module')       ?? undefined,
  status:       searchParams.get('status')       ?? undefined,
  content_type: searchParams.get('content_type') ?? undefined,
}

// Write filters to URL:
const setDocumentFilter = useCallback((key: keyof DocFilters, value: string | undefined) => {
  const params = new URLSearchParams(searchParams.toString())
  if (value) {
    params.set(key, value)
  } else {
    params.delete(key)
  }
  router.replace(`${pathname}?${params.toString()}`, { scroll: false })
}, [searchParams, router, pathname])

// Reset all:
const resetFilters = useCallback(() => {
  router.replace(pathname, { scroll: false })
}, [router, pathname])
```

**Apply this pattern to:** Documents, Audit Trail, Knowledge Gaps (range), Analytics (range).
**Do NOT apply to:** Review Queue (J/K position should not be URL-backed), Tickets (kanban status is the URL-visible state).

---

## PART 5 — CommandPalette History localStorage PERSISTENCE

`useCommandHistory` stores recent commands in a `useRef` (in-memory, lost on refresh).
Add lightweight localStorage persistence for last 5 commands.

```typescript
// UPDATE useCommandHistory in CommandPalette.tsx (or separate hook file):

import { useLocalStorage } from '@/hooks/useLocalStorage'
import { STORAGE_KEYS } from '@/lib/constants'

// ADD to STORAGE_KEYS in constants.ts:
COMMAND_HISTORY: 'aegis:cmd-history',

// UPDATE useCommandHistory:
export function useCommandHistory() {
  const [history, setHistory] = useLocalStorage<string[]>(
    STORAGE_KEYS.COMMAND_HISTORY,
    []
  )

  const addToHistory = useCallback((commandValue: string) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h !== commandValue)
      return [commandValue, ...filtered].slice(0, 5)  // Keep last 5
    })
  }, [setHistory])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [setHistory])

  return { history, addToHistory, clearHistory }
}
```

---

## VERIFICATION

```bash
# Test proxy route:
npm run dev
curl http://localhost:3000/api/proxy/health -H "Cookie: access_token=<token>"
# Expected: FastAPI /api/health response

# Test timeout:
curl -m 31 http://localhost:3000/api/proxy/simulate-slow-endpoint
# Expected: 504 Gateway timeout JSON after 30s

# Test no-auth:
curl http://localhost:3000/api/proxy/sessions
# Expected: 401 { "detail": "Not authenticated" }

# Test PDF export:
# → Click Export PDF on any session in history page
# → Should download aegis-<topic>.pdf
# → PDF should contain all messages with confidence badges

# Test ⌘A DataTable:
# → /admin/documents → press ⌘A → all rows selected
# → BulkActionBar appears → press ⌘A again → all rows deselected

# Test URL filter persistence:
# → /admin/documents → filter by SD → check URL: ?module=SD
# → Refresh page → SD filter still active
# → Navigate away → come back → filter cleared (intentional)

npx tsc --noEmit  # Expected: 0 errors
```

---

*FRONTEND_SUPPLEMENT_02 | Gap Resolution Document | AEGIS Frontend Specification Set*
