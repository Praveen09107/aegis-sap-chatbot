# FRONTEND_SUPPLEMENT_03: SESSION API — COMPLETE SPECIFICATION
## Replaces FRONTEND_29_BACKEND_SESSION_API (which was too thin)
## Backend team implementation guide + Frontend contract

---

## OVERVIEW

This document fully specifies the session persistence layer required by the AEGIS frontend.
It covers the PostgreSQL schema, all API endpoint contracts with pagination and timezone
handling, the full-text search strategy, and the server-side PDF export endpoint.

The frontend's `useSessions()` hook (FRONTEND_11) and the history page (FRONTEND_14)
depend entirely on this specification being implemented correctly.

---

## POSTGRESQL SESSION ARCHIVE SCHEMA

```sql
-- ─────────────────────────────────────────────────────────────────
-- sessions table
-- Stores one row per employee chat session.
-- Statistics (avg_confidence_score, module_tags) are denormalised for
-- fast list rendering without JOIN overhead.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_summary          TEXT NOT NULL DEFAULT 'New session',
  -- Denormalised stats (updated after each assistant turn):
  turn_count             INTEGER NOT NULL DEFAULT 0,
  avg_confidence_score   FLOAT,          -- NULL until first scored turn
  confidence_badge       TEXT CHECK (confidence_badge IN ('green','amber','none')),
  module_tags            TEXT[] NOT NULL DEFAULT '{}',   -- e.g. ARRAY['SD','FI']
  is_pinned              BOOLEAN NOT NULL DEFAULT FALSE,
  is_unresolved          BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE when: most recent turn has badge='none' AND no linked resolved ticket
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- For full-text search across topic_summary (updated on each rename)
  topic_search_vector    TSVECTOR
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Full-text search index (GIN for fast @@ operator)
CREATE INDEX idx_sessions_topic_fts
  ON sessions USING GIN (topic_search_vector);

-- Update tsvector when topic_summary changes
CREATE OR REPLACE FUNCTION sessions_update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.topic_search_vector :=
    to_tsvector('english', COALESCE(NEW.topic_summary, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_search_vector_update
  BEFORE INSERT OR UPDATE OF topic_summary ON sessions
  FOR EACH ROW EXECUTE FUNCTION sessions_update_search_vector();

-- Filter/sort indexes
CREATE INDEX idx_sessions_user_updated ON sessions (user_id, updated_at DESC);
CREATE INDEX idx_sessions_user_pinned  ON sessions (user_id, is_pinned, updated_at DESC);
CREATE INDEX idx_sessions_module_tags  ON sessions USING GIN (module_tags);

-- ─────────────────────────────────────────────────────────────────
-- session_messages table
-- Stores each message in a session (user questions + AI responses).
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE session_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content               TEXT NOT NULL,
  confidence_badge      TEXT CHECK (confidence_badge IN ('green','amber','none')),
  validation_score      FLOAT,
  attribution_doc_id    TEXT,   -- References documents.document_id
  sap_module            TEXT,
  request_type          TEXT NOT NULL DEFAULT 'standard'
                          CHECK (request_type IN ('standard','vision','cached')),
  screenshot_url        TEXT,   -- NULL unless request_type='vision'
  screenshot_expires_at TIMESTAMPTZ,  -- Screenshot URL expiry (15 minutes after upload)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON session_messages (session_id, created_at);
-- Full-text search across message content (for session-level search):
CREATE INDEX idx_messages_content_fts
  ON session_messages USING GIN (to_tsvector('english', content));
```

### Denormalisation update procedure

After every assistant turn is stored, the session row is updated:

```sql
-- Called by FastAPI after storing each assistant message:
UPDATE sessions
SET
  turn_count = (
    SELECT COUNT(*) / 2   -- pairs of user + assistant turns
    FROM session_messages
    WHERE session_id = $1 AND role = 'assistant'
  ),
  avg_confidence_score = (
    SELECT AVG(validation_score)
    FROM session_messages
    WHERE session_id = $1 AND role = 'assistant' AND validation_score IS NOT NULL
  ),
  confidence_badge = (
    -- Most recent assistant message badge determines session badge
    SELECT confidence_badge
    FROM session_messages
    WHERE session_id = $1 AND role = 'assistant'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  module_tags = (
    SELECT ARRAY(
      SELECT DISTINCT UNNEST(
        ARRAY_AGG(sap_module) FILTER (WHERE sap_module IS NOT NULL)
      )
      FROM session_messages
      WHERE session_id = $1
    )
  ),
  is_unresolved = (
    -- TRUE if most recent assistant turn has badge='none' AND no resolved ticket
    SELECT
      (SELECT confidence_badge FROM session_messages
       WHERE session_id = $1 AND role = 'assistant'
       ORDER BY created_at DESC LIMIT 1) = 'none'
    AND NOT EXISTS (
      SELECT 1 FROM tickets
      WHERE session_id = $1 AND status = 'resolved'
    )
  )
WHERE id = $1;
```

---

## TIMEZONE HANDLING — AUTHORITATIVE SPECIFICATION

**All timestamps in the database are stored as `TIMESTAMPTZ` (UTC).**
**All date-based filters from the frontend are sent as `YYYY-MM-DD` strings in IST (Asia/Kolkata, UTC+5:30).**

The backend converts IST date strings to UTC ranges for WHERE clauses:

```python
# FastAPI endpoint — converting IST date strings to UTC:
from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo('Asia/Kolkata')
UTC = ZoneInfo('UTC')

def ist_date_to_utc_range(date_str: str) -> tuple[datetime, datetime]:
    """
    Convert an IST date string (YYYY-MM-DD) to UTC start and end datetimes.

    "2024-03-28" in IST:
    → start: 2024-03-27 18:30:00 UTC  (IST midnight = UTC 18:30 prev day)
    → end:   2024-03-28 18:29:59 UTC  (IST end of day)
    """
    local_date = datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=IST)
    start_utc = local_date.astimezone(UTC)
    end_utc = local_date.replace(hour=23, minute=59, second=59).astimezone(UTC)
    return start_utc, end_utc


def today_ist_range() -> tuple[datetime, datetime]:
    """Returns UTC range for 'today' in IST."""
    today_ist = datetime.now(IST).strftime('%Y-%m-%d')
    return ist_date_to_utc_range(today_ist)
```

**The frontend's `toISTDateString()` utility** (SUPPLEMENT_01 utils.ts) generates these IST date strings correctly:

```typescript
// Employee selects "Last 7 days" in history filters:
const sevenDaysAgo = new Date()
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
const dateFrom = toISTDateString(sevenDaysAgo)  // → "2024-03-21"
// Frontend sends: ?date_from=2024-03-21
// Backend converts to UTC range: 2024-03-20T18:30:00Z → 2024-03-21T18:30:00Z
```

---

## SESSION LIST ENDPOINT — COMPLETE SPEC

### GET /api/sessions

**Request query params (all optional):**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `search` | string | — | Full-text search across topic_summary AND message content |
| `module` | string | — | Filter by module tag (exact match) |
| `confidence_badge` | string | — | `green` \| `amber` \| `none` |
| `date_from` | string | — | YYYY-MM-DD (IST) — sessions updated on or after this date |
| `date_to` | string | — | YYYY-MM-DD (IST) — sessions updated before end of this date |
| `is_unresolved` | bool | — | If `true`, only unresolved sessions |
| `is_pinned` | bool | — | If `true`, only pinned sessions |
| `page` | int | 1 | Page number (1-indexed) |
| `page_size` | int | 50 | Items per page (max: 200) |

**Full-text search strategy:**

```sql
-- The search parameter is used in two ways:
-- 1. topic_summary full-text search (fast, indexed tsvector)
-- 2. message content search (slower, uses message FTS index)
-- Results are unioned and deduplicated by session_id

WITH topic_matches AS (
  SELECT id FROM sessions
  WHERE user_id = :user_id
  AND topic_search_vector @@ plainto_tsquery('english', :search)
),
message_matches AS (
  SELECT DISTINCT session_id as id FROM session_messages
  WHERE to_tsvector('english', content) @@ plainto_tsquery('english', :search)
  AND session_id IN (SELECT id FROM sessions WHERE user_id = :user_id)
)
SELECT * FROM sessions
WHERE id IN (SELECT id FROM topic_matches UNION SELECT id FROM message_matches)
-- Apply other filters here...
ORDER BY updated_at DESC
LIMIT :page_size OFFSET (:page - 1) * :page_size
```

**Response:**

```typescript
{
  sessions: Session[]      // Current page of sessions
  total: number            // Total sessions matching all filters (for pagination UI)
  page: number             // Current page number
  page_size: number        // Items per page
  total_pages: number      // Math.ceil(total / page_size)
}
```

**Frontend update required in useSessions():** (FRONTEND_11 / hooks/queries/sessions.ts)

```typescript
// UPDATE useSessions to include pagination params:
export function useSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: queryKeys.sessions.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.search) params.set('search', filters.search)
      if (filters?.module) params.set('module', filters.module)
      if (filters?.confidence_badge) params.set('confidence_badge', filters.confidence_badge)
      if (filters?.date_from) params.set('date_from', filters.date_from)
      if (filters?.date_to) params.set('date_to', filters.date_to)
      if (filters?.is_unresolved !== undefined) params.set('is_unresolved', String(filters.is_unresolved))
      if (filters?.is_pinned !== undefined) params.set('is_pinned', String(filters.is_pinned))
      // ↓ NEW: pagination params
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.page_size) params.set('page_size', String(filters.page_size ?? 50))

      const q = params.toString()
      return api.get<SessionListResponse>(`sessions${q ? `?${q}` : ''}`)
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  })
}
```

**SessionSidebar gets all sessions (no pagination) for the sidebar:**
```typescript
// Sidebar always fetches all sessions (for grouping + search) — no page_size limit
useSessions()   // No filters = returns all sessions (up to backend max: 200)
// If user has >200 sessions: backend returns first 200 sorted by updated_at DESC
// This is acceptable — 200 sessions covers months of usage
```

**History page uses server-side pagination:**
```typescript
// In history page, manage page in URL state (SUPPLEMENT_02 pattern):
const page = parseInt(searchParams.get('page') ?? '1')
const { data } = useSessions({ ...localFilters, page, page_size: 50 })
// The backend returns total_pages → use for Prev/Next UI
```

---

## SESSION DETAIL ENDPOINT

### GET /api/sessions/:id

Returns a single session with its complete message history.
Messages are ordered by `created_at ASC`.

```typescript
// Response:
{
  session: Session             // Full session row
  messages: SessionMessage[]  // All messages in chronological order
}
```

**Authorization:** User can only access sessions belonging to their `user_id`.
Backend returns `403 Forbidden` if session belongs to another user.

---

## SESSION EXPORT ENDPOINT

### GET /api/sessions/:id/export

Returns the session as a PDF file for server-side export.
This is an **alternative** to the client-side `@react-pdf` export.

The frontend's `sessionExport.ts` uses client-side rendering by default.
Use this endpoint only if client-side rendering is too slow for large sessions (>50 turns).

```
GET /api/sessions/:id/export?format=pdf

Response headers:
  Content-Type: application/pdf
  Content-Disposition: attachment; filename="aegis-session-{id}.pdf"

Response body: Binary PDF

HTTP 404: Session not found
HTTP 403: Session belongs to another user
```

**When to use server-side vs client-side export:**
- < 20 turns: client-side (faster, no server round-trip)
- ≥ 20 turns: offer server-side option (avoids browser memory pressure from @react-pdf)
- Vision sessions (screenshots): always server-side (screenshots accessed from server storage)

---

## SCREENSHOT URL LIFETIME SPECIFICATION

When a screenshot is uploaded via `POST /api/upload/screenshot`:

```python
# Backend: Store in MinIO/S3 with a 15-minute signed URL
# After 15 minutes, the URL becomes invalid
# The session_messages row stores:
#   screenshot_url: "https://minio.internal/screenshots/<id>.png?X-Amz-Expires=900"
#   screenshot_expires_at: NOW() + INTERVAL '15 minutes'

# If the AI response takes > 15 minutes (shouldn't happen, but safeguard):
# The vision model would receive a 403 when fetching the URL
# Backend should log this as a vision_timeout error and fall back to text-only response
```

**Frontend handling:** The `screenshot_url` is a one-time-use signed URL. Once the WebSocket
message is sent, the URL is consumed by the backend vision model. The frontend never displays
the screenshot to the user from this URL — it shows the local `screenshotPreviewUrl`
(created with `URL.createObjectURL()`) until the thumbnail is cleared.

---

## SESSION UPDATE ENDPOINTS

### PUT /api/sessions/:id — Rename or pin

```typescript
// Request body (partial update):
{
  topic_summary?: string    // Rename
  is_pinned?: boolean       // Pin/unpin
}
// Response: Updated Session object
// HTTP 404: Session not found
// HTTP 403: Not your session
```

### DELETE /api/sessions/:id — Hard delete

Permanently deletes the session and all its messages (CASCADE).
Does NOT delete linked tickets or audit entries.

```
Response: 204 No Content
```

---

## topic_summary GENERATION

The `topic_summary` field is generated by the FastAPI backend after the session's second turn
(first user question + first AI response). It is generated by calling Ollama with a short
summarisation prompt:

```
System: "You are a session title generator. Generate a short 5-10 word title
         for this SAP support session. Output only the title, no quotes."

User:   "The user asked: {first_user_message[:200]}
         AEGIS responded about: {first_assistant_message[:200]}"
```

If Ollama is unavailable, the topic defaults to the first 60 characters of the user's first message.

**Rename:** When an IT admin or employee renames a session via `PUT /api/sessions/:id`,
the `topic_summary` is overwritten with the user-provided string. The `topic_search_vector`
is automatically updated by the database trigger.

---

## FRONTEND QUERY KEYS UPDATE

Update `queryKeys.ts` (FRONTEND_02) to include pagination in session query keys:

```typescript
// UPDATE sessions.list key factory to include page:
sessions: {
  all: () => ['sessions'] as const,
  list: (filters?: SessionFilters) =>
    [...sessionKeys.all(), 'list', filters] as const,
  //                                  ^^^^^^^
  // filters now includes page and page_size, so different pages
  // have different cache entries (correct pagination behaviour)
  detail: (id: string) => [...sessionKeys.all(), 'detail', id] as const,
},
```

---

*FRONTEND_SUPPLEMENT_03 | Session API Complete Specification | AEGIS Frontend Specification Set*
