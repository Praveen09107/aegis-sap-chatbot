# FRONTEND_29–33: BACKEND API CONTRACTS
## FastAPI Endpoint Specifications the Frontend Depends On
## Reference for Backend Team + Frontend Integration

---

> **These five documents are combined** into one reference to avoid repetition.
> Each section covers one API surface area (Sessions, Metrics, Analytics, Health, Preferences).
> The frontend's TanStack Query hooks (FRONTEND_11) call these endpoints via the
> Next.js catch-all proxy at `/api/proxy/[...path]/route.ts`.

---

## PROXY ARCHITECTURE

All frontend API calls go through a single Next.js route handler:

```typescript
// src/app/api/proxy/[...path]/route.ts (created in FRONTEND_02)
// Forwards every request to the FastAPI backend, injecting the auth cookie.

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const backendPath = params.path.join('/')
  const searchParams = request.nextUrl.searchParams.toString()
  const url = `${process.env.BACKEND_INTERNAL_URL}/api/${backendPath}${searchParams ? `?${searchParams}` : ''}`

  const cookie = request.cookies.get('access_token')?.value
  const response = await fetch(url, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${cookie}`,
      'Content-Type': 'application/json',
    },
    body: request.method !== 'GET' ? await request.text() : undefined,
  })

  return new NextResponse(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
// POST, PUT, PATCH, DELETE handlers follow the same pattern.
```

---

# FRONTEND_29: SESSION API

## Endpoints Required by Frontend

### GET /api/sessions

Fetches the authenticated user's session history. Supports filtering for the history page.

**Query parameters:**
```
search          string    Full-text search across topic_summary and message content
module          string    Filter by SAP module tag (e.g. "SD", "FI")
confidence_badge string   Filter: "green" | "amber" | "none"
date_from       string    ISO date (YYYY-MM-DD) — sessions updated after this date
date_to         string    ISO date — sessions updated before this date
is_unresolved   boolean   If true, return only sessions without a resolved response
is_pinned       boolean   If true, return only pinned sessions
```

**Response:**
```typescript
{
  sessions: Session[]
  total: number
  page: number
}

interface Session {
  id: string                       // UUID
  topic_summary: string            // AI-generated topic label
  turn_count: number               // Number of message pairs
  avg_confidence_score: number | null  // Average validation score (0–1)
  confidence_badge: 'green' | 'amber' | 'none' | null
  module_tags: string[]            // e.g. ["SD", "FI"]
  is_pinned: boolean
  is_unresolved: boolean
  created_at: string               // ISO timestamp
  updated_at: string               // ISO timestamp (last activity)
}
```

---

### GET /api/sessions/:id

Returns a single session with full message history.

**Response:**
```typescript
{
  session: Session                 // Full Session object (same as above)
  messages: SessionMessage[]
}

interface SessionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  confidence_badge: 'green' | 'amber' | 'none' | null
  validation_score: number | null  // 0–1
  attribution_doc_id: string | null
}
```

---

### PUT /api/sessions/:id

Updates session metadata. Used for rename and pin operations.

**Request body (partial — only include fields to change):**
```typescript
{
  topic_summary?: string    // Rename
  is_pinned?: boolean       // Pin/unpin
}
```

**Response:** Updated `Session` object.

---

### DELETE /api/sessions/:id

Permanently deletes a session and all its messages.

**Response:** `204 No Content`

---

# FRONTEND_30: ADMIN METRICS API

### GET /api/admin/metrics

Primary data source for the admin dashboard. Polled every 30 seconds.
Returns KPI metrics AND embedded 7-day trend data to avoid multiple requests.

**Response:**
```typescript
interface MetricsData {
  // KPI cards
  total_queries_today: number
  avg_validation_score: number        // 0–1
  green_badge_rate: number            // 0–1 fraction
  amber_badge_rate: number
  none_badge_rate: number
  open_tickets: number
  cache_hit_rate: number              // 0–1
  crag_insufficient_rate: number      // 0–1
  mode_a_rate: number                 // CRAG-corrected fraction
  mode_b_rate: number                 // Standard retrieval fraction
  mode_c_rate: number                 // Insufficient fraction
  last_updated_at: string             // ISO timestamp

  // 7-day trend arrays (embedded to avoid N+1 requests)
  validation_score_7d: Array<{ date: string; score: number }>
  // date format: 3-letter day abbreviation "Mon", "Tue", etc.

  confidence_dist_7d: Array<{
    date: string
    green: number     // percentage (0–100, not fraction)
    amber: number
    none: number
  }>

  // Top gap events for dashboard panel
  gap_events: Array<{
    query_pattern: string
    module: string
    doc_category: string
    count_this_week: number
    severity: 'high' | 'medium' | 'low'
  }>
}
```

---

### GET /api/admin/review-queue/count

Used by AdminNav badge. Polled every 30 seconds.

**Response:**
```typescript
{ count: number }    // Number of pending review items
```

---

# FRONTEND_31: ANALYTICS API

### GET /api/admin/analytics

Full analytics time-series data for the analytics page.
Cached aggressively (5 min staleTime) — more expensive computation than /metrics.

**Query parameters:**
```
range    string    "7d" | "30d" | "90d" | "all"
```

**Response:**
```typescript
interface AnalyticsResponse {
  validation_score_trend: Array<{ date: string; score: number }>
  // date: "YYYY-MM-DD" for 30d/90d/all; "Mon" abbreviation for 7d

  confidence_distribution: Array<{
    date: string
    green: number     // percentage 0–100
    amber: number
    none: number
  }>

  cache_performance: Array<{
    date: string
    hit_rate: number        // fraction 0–1
    total_queries: number
  }>

  retrieval_mode_usage: Array<{
    date: string
    mode_a: number    // fraction 0–1
    mode_b: number
    mode_c: number
  }>

  query_volume: Array<{
    date: string
    value: number     // integer query count
  }>

  top_modules: Array<{
    module: string            // "SD", "FI", etc.
    query_count: number
    avg_score: number         // 0–1
  }>
}
```

---

# FRONTEND_32: SYSTEM HEALTH API

### GET /api/admin/system-health

Returns live health status of all 19 Docker services.
Polled every 30 seconds. Each check calls Docker's `/health` endpoint per service.

**Response:**
```typescript
interface SystemHealthData {
  overall_status: 'healthy' | 'degraded' | 'critical'
  total_healthy: number
  total_unhealthy: number
  checked_at: string            // ISO timestamp of last health check
  services: ServiceHealth[]
}

interface ServiceHealth {
  name: string                  // Full Docker name, e.g. "aegis-nginx"
  container_name: string        // Docker container name
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown'
  response_time_ms: number | null   // null if service is down
  last_checked_at: string
  error_message: string | null      // Error detail if status ≠ healthy
}
```

**Service names (exactly 19):**
```
aegis-nginx, aegis-keycloak, aegis-vault,
aegis-fastapi, aegis-arq,
aegis-ollama-main, aegis-ollama-judge, aegis-ollama-vision,
aegis-bge, aegis-deberta,
aegis-qdrant, aegis-opensearch,
aegis-postgres-primary, aegis-postgres-replica, aegis-pgbouncer,
aegis-redis-session, aegis-redis-queue,
aegis-prometheus, aegis-grafana
```

---

# FRONTEND_33: PREFERENCES & WEBSOCKET EXTENSIONS

### GET /api/preferences

Returns the authenticated user's stored preferences.
Called once on login; staleTime: Infinity (manually invalidated on update).

**Response:**
```typescript
interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  panel_collapsed: boolean        // Attribution panel collapse state
  onboarding_complete: boolean    // Whether user has seen onboarding
  pinned_session_ids: string[]    // UUIDs of pinned sessions
  notification_prefs: {
    email_on_ticket_resolved: boolean
  }
}
```

---

### PUT /api/preferences

Update one or more preference fields. Partial update (PATCH semantics).

**Request body:**
```typescript
Partial<UserPreferences>
```

**Response:** Updated `UserPreferences` object.

---

### WebSocket: Extended validation_result message

The frontend (FRONTEND_13) expects `related_questions` in the `validation_result`
WebSocket message for high-confidence responses. Backend should include this field:

```typescript
// Extended validation_result WebSocket message:
{
  type: "validation_result",
  validation_score: number,               // 0–1
  confidence_badge: "green" | "amber" | "none",
  attribution_panel: AttributionPanel | null,

  // NEW FIELD — optional, only include when confidence_badge === "green":
  related_questions: string[] | null      // 2–3 follow-up question suggestions
}

interface AttributionPanel {
  primary_document_id: string
  primary_document_name: string
  verified_by: string
  verified_date: string
  secondary_sources: Array<{
    document_id: string
    document_name: string
    relevance_score: number
  }>
  confidence_badge: "green" | "amber" | "none"
  score_breakdown: {
    retrieval_score: number
    validation_score: number
    freshness_score: number
  } | null
}
```

### WebSocket: retrieval_progress stages

The `stage` field values the frontend handles in `useWebSocket.ts`:

```typescript
// All valid stage values in retrieval_progress messages:
type RetrievalStage =
  | "retrieving"    // Fetching from vector store
  | "crag"          // CRAG correction in progress
  | "generating"    // LLM generating response
  | "validating"    // Running ValidationScore
```

---

## ADMIN DATA ENDPOINTS — QUICK REFERENCE

The following endpoints are called by the admin TanStack Query hooks (FRONTEND_11).
Full specs not repeated here — shapes match the TypeScript interfaces in `adminData.ts`.

```
GET  /api/admin/documents               → DocumentRecord[]       (DocFilters params)
PATCH /api/admin/documents/:id          → DocumentRecord         (partial update)
POST /api/admin/documents/bulk-deprecate → { deprecated: string[] }

GET  /api/admin/registry                → RegistryEntry[]        (?status= filter)
POST /api/admin/registry/:id/approve   → RegistryEntry
POST /api/admin/registry/:id/reject    → RegistryEntry

GET  /api/admin/config-snapshot         → ConfigEntry[]
PUT  /api/admin/config-snapshot/:cat/:key → ConfigEntry

GET  /api/admin/knowledge-gaps          → GapEntry[]             (?days=)
GET  /api/admin/audit-trail             → AuditEntry[]           (filter params)
GET  /api/admin/review-queue            → ReviewItem[]           (?status=)
POST /api/admin/review-queue/:id/resolve → ReviewItem
GET  /api/admin/tickets                 → TicketEntry[]          (?status=)
PATCH /api/admin/tickets/:id            → TicketEntry

POST /api/feedback                      → { success: boolean }
POST /api/upload/document               → { document_id: string; status: string }
POST /api/upload/screenshot             → { screenshot_url: string }
```

---

*Documents FRONTEND_29–33 version 1.0 | AEGIS Frontend Specification Set*
