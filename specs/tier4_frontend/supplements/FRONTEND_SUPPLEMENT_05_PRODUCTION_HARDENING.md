# FRONTEND_SUPPLEMENT_05: PRODUCTION HARDENING
## Multi-Tab WebSocket · Partial Stream Error · Timezone Display · Import Path Standards
## Apply during sessions F09, F10, F11 as noted

---

## PART 1 — MULTI-TAB WEBSOCKET COORDINATION

**Problem:** Two browser tabs open to `/` both create WebSocket connections and write
to the same `chatStore`. Messages from Tab B would overwrite Tab A's streaming state.

**Solution:** Use the `BroadcastChannel` API to detect and warn about multi-tab usage.
Do NOT attempt to share the WebSocket — each tab has its own independent session.

### Implementation in useWebSocket.ts

```typescript
// ADD to useWebSocket.ts — multi-tab detection:

const TAB_ID = crypto.randomUUID()  // Unique ID for this tab instance (module-level)

let broadcastChannel: BroadcastChannel | null = null

/**
 * Multi-tab coordination using BroadcastChannel.
 * When a new tab activates the chat, other tabs are notified.
 * Each tab has its own independent WebSocket session — there is no sharing.
 * The warning is purely informational so users don't think their session is synced.
 */
function initMultiTabDetection(setMultiTabWarning: (v: boolean) => void) {
  if (typeof window === 'undefined') return
  if (!('BroadcastChannel' in window)) return  // Safari <15.4 fallback — skip gracefully

  try {
    broadcastChannel = new BroadcastChannel('aegis-chat-tabs')

    broadcastChannel.onmessage = (event) => {
      if (event.data.type === 'tab-active' && event.data.tabId !== TAB_ID) {
        // Another tab is also using the chat
        setMultiTabWarning(true)
        // Auto-clear warning after 10 seconds
        setTimeout(() => setMultiTabWarning(false), 10_000)
      }
      if (event.data.type === 'tab-inactive' && event.data.tabId !== TAB_ID) {
        setMultiTabWarning(false)
      }
    }

    // Announce this tab is active
    broadcastChannel.postMessage({ type: 'tab-active', tabId: TAB_ID })

    // Announce inactive when page is closed
    window.addEventListener('beforeunload', () => {
      broadcastChannel?.postMessage({ type: 'tab-inactive', tabId: TAB_ID })
      broadcastChannel?.close()
    })
  } catch {
    // BroadcastChannel can fail in some embedded contexts — silent fallback
  }
}
```

### uiStore extension

```typescript
// ADD to uiStore (FRONTEND_10) state interface and implementation:

interface UIStoreState {
  // ... existing fields ...
  multiTabWarning: boolean          // ← ADD
  setMultiTabWarning: (v: boolean) => void  // ← ADD
}

// In store:
multiTabWarning: false,
setMultiTabWarning: (multiTabWarning) => set({ multiTabWarning }),
```

### MultiTabWarningBanner component

```typescript
// src/components/shared/MultiTabWarningBanner.tsx
'use client'

import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

/**
 * Shown when the user has the AEGIS chat open in multiple tabs.
 * Informational only — both tabs function independently.
 */
export function MultiTabWarningBanner() {
  const { multiTabWarning } = useUIStore()

  if (!multiTabWarning) return null

  return (
    <div
      className={cn(
        'bg-warning-bg border-b border-warning-border',
        'flex items-center justify-center gap-2 px-4 py-1.5',
      )}
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium text-warning-text">
        AEGIS is open in another tab — each tab has its own independent session
      </span>
    </div>
  )
}
```

### Wire into employee layout

```typescript
// In (employee)/layout.tsx — ADD:
import { MultiTabWarningBanner } from '@/components/shared/MultiTabWarningBanner'
import { initMultiTabDetection } from '@/hooks/useWebSocket'  // exported helper

useEffect(() => {
  const { setMultiTabWarning } = useUIStore.getState()
  initMultiTabDetection(setMultiTabWarning)
}, [])

// In JSX, add below OfflineBanner:
<OfflineBanner />
<MultiTabWarningBanner />      {/* ← ADD */}
<EmployeeTopbar />
```

---

## PART 2 — PARTIAL STREAM ERROR HANDLING

**Problem:** If the WebSocket drops mid-stream, the AI bubble shows incomplete text
with no indication it's incomplete.

**Solution:** Mark the last AI message as incomplete and append a visual indicator.

### chatStore extension

```typescript
// ADD to chatStore (FRONTEND_10):

interface ChatMessage {
  // ... existing fields ...
  isIncomplete?: boolean   // ← ADD: true if stream was interrupted before completion
}

// ADD action to chatStore:
markLastMessageIncomplete: () =>
  set((state) => {
    const messages = [...state.messages]
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        messages[i] = { ...messages[i], isIncomplete: true }
        break
      }
    }
    return { messages, streamingState: 'error' }
  }),
```

### AIResponseBubble update

```typescript
// In AIResponseBubble.tsx — ADD incomplete indicator:

{message.isIncomplete && (
  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border-primary">
    <AlertTriangle className="w-3 h-3 text-warning shrink-0" aria-hidden="true" />
    <span className="text-xs text-warning-text">
      Response interrupted — the above may be incomplete.
      <button
        className="ml-1.5 underline hover:no-underline transition-all"
        onClick={() => onRegenerate(message.id)}
      >
        Retry
      </button>
    </span>
  </div>
)}
```

### useWebSocket update

```typescript
// In useWebSocket.ts — UPDATE the unexpected close handler:

ws.onclose = (event) => {
  stopPingInterval()
  setWebSocket(null)

  const isCleanClose = event.code === 1000 || event.code === 1001
  const isAuthFailure = event.code === 4000 || event.code === 4003

  if (isCleanClose || isAuthFailure) {
    if (isAuthFailure) {
      setStreamingState('error')
      toastError(WEBSOCKET_ERROR_MESSAGES[event.code] ?? 'Connection failed')
    }
    reconnectAttemptsRef.current = 0
    return
  }

  // Unexpected close during active streaming
  const { streamingState } = useChatStore.getState()
  const isStreaming = !['idle', 'complete', 'error'].includes(streamingState)

  if (isStreaming) {
    // Mark any partial AI response as incomplete ← NEW
    useChatStore.getState().markLastMessageIncomplete()
    toastError(
      'Connection interrupted',
      'The response was cut short. You can retry the message.'
    )
  }

  // ... (existing reconnect logic unchanged) ...
}
```

---

## PART 3 — TIMEZONE DISPLAY THROUGHOUT THE UI

All timestamp displays must use IST formatting for Sona Comstar Chennai users.
Replace scattered `toLocaleString` calls with the `formatDateIST` utility (SUPPLEMENT_01).

### Audit trail timeline

```typescript
// In AuditTimeline.tsx — UPDATE time display:
import { formatDateIST } from '@/lib/utils'

// BEFORE:
const time = new Date(entry.created_at).toLocaleTimeString('en-IN', {
  hour: '2-digit', minute: '2-digit', hour12: true,
})

// AFTER (explicit IST timezone):
const time = new Date(entry.created_at).toLocaleTimeString('en-IN', {
  hour: '2-digit', minute: '2-digit', hour12: true,
  timeZone: 'Asia/Kolkata',     // ← ADD
})
```

### Session history cards

```typescript
// In HistorySessionCard.tsx — UPDATE date display:
// BEFORE:
const date = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true,
}).format(new Date(session.updated_at))

// AFTER — use formatDateIST:
import { formatDateIST } from '@/lib/utils'
const date = formatDateIST(session.updated_at)   // → "28 Mar 2024, 02:30 PM"
```

### Knowledge gap "last seen"

```typescript
// In GapCard.tsx — UPDATE last seen date:
import { formatDateIST } from '@/lib/utils'

// BEFORE:
{new Date(entry.last_seen_at).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short',
})}

// AFTER:
{new Date(entry.last_seen_at).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short',
  timeZone: 'Asia/Kolkata',     // ← ADD
})}
```

### Registry created_at

```typescript
// In registry/page.tsx PendingEntryCard — UPDATE:
{new Date(entry.created_at).toLocaleDateString('en-IN', {
  timeZone: 'Asia/Kolkata',     // ← ADD
})}
```

### History page "date_from" filter

```typescript
// In history/page.tsx — UPDATE date range calculation to use IST:
import { toISTDateString, startOfTodayIST } from '@/lib/utils'

const dateFrom = useMemo(() => {
  if (localFilters.dateRange === 'all') return undefined

  const days: Record<string, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 }
  const daysBack = days[localFilters.dateRange] ?? 0

  if (localFilters.dateRange === 'today') {
    // "Today" = IST today's start
    return toISTDateString(startOfTodayIST())
  }

  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  return toISTDateString(d)   // ← IST-aware date string
}, [localFilters.dateRange])
```

---

## PART 4 — IMPORT PATH STANDARDISATION

Inconsistent import paths identified during analysis. Use these canonical locations:

### EmptyState component

**Canonical location:** `src/components/admin/EmptyState.tsx`

All admin pages must import from this path:
```typescript
import { EmptyState } from '@/components/admin/EmptyState'
// NOT from '@/components/shared/EmptyState' (does not exist)
// NOT from '@/components/ui/empty-state' (does not exist)
```

The `EmptyState` component accepts:
```typescript
interface EmptyStateProps {
  icon?: LucideIcon          // Lucide icon component (not a string)
  title: string
  description?: string
  action?: React.ReactNode   // Optional CTA button
  variant?: 'section'        // Default: renders inline
           | 'page'          // Renders centered with more vertical space
}
```

### DataTable ColumnDef type

**Rename to avoid conflict with @tanstack/react-table's ColumnDef:**

```typescript
// In src/components/admin/DataTable.tsx — rename the interface:

// BEFORE:
export interface ColumnDef<T> { ... }

// AFTER:
export interface AegisColumnDef<T> { ... }
// ↑ Prevents naming collision with TanStack Table's own ColumnDef type

// UPDATE all admin page imports:
// BEFORE: import { DataTable, type ColumnDef } from '@/components/admin/DataTable'
// AFTER:  import { DataTable, type AegisColumnDef } from '@/components/admin/DataTable'
```

### FilterChips props

```typescript
// FilterChips component (FRONTEND_06) — standardise prop names:
interface FilterChipsProps {
  chips: FilterChip[]                    // import FilterChip from '@/types'
  onRemove: (id: string) => void
  onClearAll?: () => void               // optional — some pages don't show "clear all"
  className?: string
}
```

---

## PART 5 — ENVIRONMENT VARIABLES COMPLETE LIST

Complete `.env.local` addendum — add these missing variables identified during analysis:

```bash
# APPEND to .env.local (FRONTEND_02 already has the base list):

# ── Feature flags ────────────────────────────────────────────────────────────
NEXT_PUBLIC_ONBOARDING_ENABLED=true
NEXT_PUBLIC_PDF_EXPORT_ENABLED=true
NEXT_PUBLIC_DARK_MODE_ENABLED=true
NEXT_PUBLIC_COMMAND_PALETTE_ENABLED=true

# ── Development tools ─────────────────────────────────────────────────────────
NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS=true    # Set to false in production

# ── Upload limits ──────────────────────────────────────────────────────────────
# Must match LIMITS.MAX_DOCUMENT_BYTES in constants.ts:
NEXT_PUBLIC_MAX_DOCUMENT_MB=50
NEXT_PUBLIC_MAX_SCREENSHOT_MB=10

# ── Keycloak (must match backend IMPL_21) ─────────────────────────────────────
KEYCLOAK_INTERNAL_URL=http://localhost:8080
KEYCLOAK_REALM=aegis-realm
KEYCLOAK_CLIENT_ID=aegis-chat
KEYCLOAK_CLIENT_SECRET=your-client-secret-here

# ── Backend (existing, verify correct) ────────────────────────────────────────
BACKEND_INTERNAL_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8000
```

**Production `.env.production` differs:**
```bash
NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS=false
BACKEND_INTERNAL_URL=http://aegis-fastapi:8000    # Docker service name
NEXT_PUBLIC_API_BASE_URL=https://aegis.sona.internal
NEXT_PUBLIC_WS_BASE_URL=wss://aegis.sona.internal
```

---

## PART 6 — NEXT.JS CONFIG: UPLOAD SIZE LIMIT

Add to `next.config.js` (FRONTEND_02) to allow screenshot and document uploads:

```javascript
// In next.config.js — ADD api config:
const nextConfig = {
  // ... existing config ...

  // Allow larger uploads via API routes (needed for document and screenshot uploads)
  // Default Next.js limit is 4MB — we need 50MB for documents, 10MB for screenshots
  experimental: {
    serverActions: {
      bodySizeLimit: '51mb',   // 50MB document + overhead
    },
  },
}
```

---

## PART 7 — DataTable COLUMN ACCESSOR GAP

The `DataTable` spec in FRONTEND_06 uses a `cell: (row: T) => React.ReactNode` function
for rendering. However, when the table needs to be exported to CSV (via `exportToCSV`),
the cell renderer is a React node — not a plain string. The `ColumnDef` needs a separate
`accessor` for CSV export:

```typescript
// UPDATE AegisColumnDef to add optional accessor:
export interface AegisColumnDef<T> {
  id: string
  header: string
  cell: (row: T) => React.ReactNode     // For table rendering
  accessor?: (row: T) => string | number  // ← ADD: For CSV export (plain value)
  sortable?: boolean
  width?: string
  align?: 'left' | 'right' | 'center'
}

// In exportToCSV utility — use accessor if available, fallback to cell (extract text):
function getCellValue<T>(row: T, col: AegisColumnDef<T>): string {
  if (col.accessor) return String(col.accessor(row))
  // Fallback: render cell and extract text (works for simple string cells)
  const rendered = col.cell(row)
  if (typeof rendered === 'string' || typeof rendered === 'number') return String(rendered)
  return ''  // React elements cannot be serialised to CSV
}
```

---

## VERIFICATION CHECKLIST FOR SUPPLEMENTS

```bash
# SUPPLEMENT_01 checks:
npx tsc --noEmit
# → 0 errors: SessionFilters, FilterChip, UserPreferences in types/index.ts
# → 0 errors: useAuth now returns initializing
# → 0 errors: adminStore has advanceReviewQueue

# SUPPLEMENT_02 checks:
curl -X GET http://localhost:3000/api/proxy/health
# → 200 OK with FastAPI response body

curl -X GET http://localhost:3000/api/proxy/sessions (no cookie)
# → 401 {"detail": "Not authenticated"}

# SUPPLEMENT_03 checks:
curl "http://localhost:3000/api/proxy/sessions?page=1&page_size=10"
# → Response includes total, total_pages fields

# Multi-tab check (SUPPLEMENT_05):
# → Open / in Tab 1, then open / in Tab 2
# → Tab 1 should show amber "AEGIS is open in another tab" banner
# → Close Tab 2 → banner in Tab 1 disappears

# Partial stream check:
# → Simulate WS drop during streaming (stop backend mid-response)
# → AI bubble should show: partial text + "Response interrupted — Retry" link

# IST timezone check:
# → Audit trail timeline: timestamps show "02:30 PM" not "02:30"
# → History card dates: "28 Mar 2024, 02:30 PM"
# → date_from param sent to API: "2024-03-28" (YYYY-MM-DD, IST date)

# Column accessor check:
# → DataTable with AegisColumnDef that has accessor defined
# → Click Export CSV → CSV has correct plain-text values, not "[object Object]"
```

---

*FRONTEND_SUPPLEMENT_05 | Production Hardening | AEGIS Frontend Specification Set*
