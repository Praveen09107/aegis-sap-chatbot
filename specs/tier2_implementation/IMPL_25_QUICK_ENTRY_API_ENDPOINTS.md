# IMPL_25 — QUICK ENTRY: API ENDPOINTS
## AEGIS SAP Helpdesk AI — All API Endpoints for Quick Entry Feature
## Depends on: IMPL_23, IMPL_24

---

## 1. OVERVIEW

This document specifies all 14 API endpoints for the Quick Entry feature.
For each endpoint: route, method, authentication requirement, request schema,
response schema, every error response, validation logic, DB operations, and
external service calls.

All endpoints are mounted under the FastAPI application at:
- `/api/admin/knowledge-entries/*` — entry management (11 endpoints)
- `/api/admin/knowledge-screenshots/*` — screenshot management (3 endpoints)

All endpoints require: `Authorization: Bearer <access_token>` with `role = it-admin`.
Employee-role tokens receive 403 Forbidden on all Quick Entry endpoints.

The router file is: `app/routers/knowledge_entries.py`
Rate limiting middleware applies to `POST /api/admin/knowledge-entries` only
(creation endpoint). All other endpoints are not rate limited.

---

## 2. RATE LIMITING IMPLEMENTATION

**Applies to:** `POST /api/admin/knowledge-entries` only.

**Mechanism:** Redis sliding window counter.

```
Key format:   qe_rate:{user_id}
             (user_id is the UUID of the authenticated admin)
Window:       900 seconds (15 minutes)
Max requests: 5 per window (QUICK_ENTRY_RATE_LIMIT_MAX constant)
Algorithm:    sorted set of timestamps; prune entries older than NOW - 900s;
              count remaining; if count >= 5, reject

Redis commands sequence:
  1. ZREMRANGEBYSCORE qe_rate:{user_id} 0 (NOW - 900)
  2. ZCARD qe_rate:{user_id}
  3. If ZCARD >= 5: return 429
  4. ZADD qe_rate:{user_id} NOW NOW
  5. EXPIRE qe_rate:{user_id} 900

On 429:
  Response: 429 Too Many Requests
  Header:   Retry-After: {seconds_until_window_resets}
  Body:     { "detail": "Submission limit reached. Maximum 5 entries per 15 minutes. Retry after {HH:MM IST}." }
```

Rate limiting middleware is implemented as a FastAPI dependency injected only
on the POST endpoint — not as global middleware.

---

## 3. ENDPOINT 1 — CREATE ENTRY

```
POST /api/admin/knowledge-entries

Authentication: required (it-admin role)
Rate limiting:  YES — 5 per 15 minutes per user
```

**Request body:**
```json
{
  "content_type":     "error_guide | procedure | config",
  "module":           "FI | MM | SD | HR | PP | CO | BASIS",
  "transactions":     ["string", ...],
  "verified_by_name": "string (min 2 chars)",
  "verified_date":    "YYYY-MM-DD (not future, IST timezone)",
  "review_frequency": "monthly | quarterly | semi_annual | annual | as_needed",
                      // Required only when content_type = 'config', null otherwise
  "form_data":        { ... },
                      // Schema per content_type — see IMPL_24 Section 3
  "gap_id":           "UUID | null",
                      // Link to gap_events record if created from Knowledge Gaps page
  "publish":          "boolean",
                      // true = submit for immediate processing
                      // false = save as draft only
  "change_summary":   "string | null"
                      // Optional note about this version
}
```

**Validation sequence (all must pass before DB write):**

1. Rate limit check (Redis) — 429 if exceeded
2. `content_type` is valid enum value — 422 if not
3. `module` is valid enum value — 422 if not
4. `transactions` is non-empty array — 422 if empty
5. `verified_date` is not a future date (checked in IST) — 422 if future
6. `review_frequency` present and valid if `content_type = 'config'` — 422 if missing
7. `form_data` passes schema validation for the given `content_type` — 422 with per-field errors if fails
8. `document_id` uniqueness (from form_data implicitly OR if document_id is passed separately) — see note below
9. If `gap_id` is provided, it must exist in `gap_events` table — 422 if not found

**Document ID note:** The frontend sends `document_id` as part of the top-level
request body (not inside `form_data`). The API receives `document_id` separately,
validates uniqueness, then stores it in `knowledge_form_entries.document_id`.

```json
{
  "document_id": "string",
  // ... other fields above
}
```

**DB operations:**
1. Insert row into `knowledge_form_entries` with status = 'draft' (publish=false)
   or status = 'processing' (publish=true)
2. Insert row into `knowledge_form_entry_versions` (version 1 snapshot)
3. If `gap_id` provided: validate existence (no update to gap_events yet —
   write-back happens when entry becomes 'active')

**External calls (only if publish=true):**
1. Enqueue `process_form_entry(entry_id)` ARQ task

**Response (201 Created):**
```json
{
  "id":          "UUID",
  "document_id": "string",
  "status":      "draft | processing",
  "version":     1,
  "message":     "Entry saved as draft." | "Entry submitted for processing."
}
```

**Error responses:**
```
400 Bad Request:     Malformed JSON body
422 Unprocessable:   Validation failed — body contains field_errors object
                     { "detail": [...field-level errors...] }
409 Conflict:        document_id already exists
                     { "detail": "Document ID {id} already exists." }
429 Too Many Req.:   Rate limit exceeded
503 Service Unavail: Redis unavailable for rate limiting
                     (fail open: allow submission but log Redis failure)
```

---

## 4. ENDPOINT 2 — LIST ENTRIES

```
GET /api/admin/knowledge-entries

Authentication: required (it-admin role)
Rate limiting:  none
```

**Query parameters:**
```
module:           string (optional) — filter by module
content_type:     string (optional) — filter by content_type
status:           string (optional) — filter by status
page:             integer (optional, default 1, min 1)
page_size:        integer (optional, default 20, min 1, max 100)
search:           string (optional) — searches document_id by trigram match
include_archived: boolean (optional, default false) — include archived entries
```

**DB query logic:**
```sql
SELECT kfe.*,
       (SELECT COUNT(*) FROM knowledge_form_entry_chunks
        WHERE entry_id = kfe.id AND is_current = TRUE) AS chunk_count,
       (SELECT COUNT(*) FROM knowledge_form_screenshots
        WHERE entry_id = kfe.id) AS screenshot_count,
       (SELECT COUNT(*) FROM knowledge_form_screenshots
        WHERE entry_id = kfe.id AND vision_status = 'failed') > 0 AS has_failed_screenshots
FROM knowledge_form_entries kfe
WHERE (kfe.module = :module OR :module IS NULL)
  AND (kfe.content_type = :content_type OR :content_type IS NULL)
  AND (kfe.status = :status OR :status IS NULL)
  AND (kfe.status != 'archived' OR :include_archived = TRUE)
  AND (:search IS NULL OR kfe.document_id ILIKE '%' || :search || '%'
       OR form_data->>'issue_description' ILIKE '%' || :search || '%'
       OR form_data->>'procedure_name' ILIKE '%' || :search || '%'
       OR form_data->>'configuration_name' ILIKE '%' || :search || '%')
ORDER BY kfe.updated_at DESC
LIMIT :page_size OFFSET (:page - 1) * :page_size
```

**Feedback join:** The list endpoint also fetches feedback summaries in a single
batch query (not N+1) by joining against the feedback table where
`source_form_entry_id = kfe.id` and `created_at >= NOW() - INTERVAL '30 days'`.

**Response (200 OK):**
```json
{
  "entries": [
    {
      "id":                   "UUID",
      "document_id":          "string",
      "content_type":         "error_guide | procedure | config",
      "module":               "string",
      "status":               "string",
      "version":              1,
      "verified_by_name":     "string",
      "verified_date":        "YYYY-MM-DD",
      "submitted_by_name":    "string",
      "chunk_count":          6,
      "screenshot_count":     2,
      "has_failed_screenshots": false,
      "next_review_date":     "YYYY-MM-DD | null",
      "gap_id":               "UUID | null",
      "feedback_summary": {
        "positive": 5,
        "negative": 1,
        "net": 4,
        "period_days": 30,
        "last_negative_at": "ISO timestamp | null"
      },
      "issue_title":          "string (derived from form_data first field)",
      "created_at":           "ISO timestamp",
      "updated_at":           "ISO timestamp"
    }
  ],
  "total":      45,
  "page":       1,
  "page_size":  20,
  "total_pages": 3
}
```

**issue_title derivation logic (backend):**
```python
def extract_issue_title(form_data: dict, content_type: str) -> str:
    if content_type == 'error_guide':
        return form_data.get('issue_description', 'Untitled')
    elif content_type == 'procedure':
        return form_data.get('procedure_name', 'Untitled')
    elif content_type == 'config':
        return form_data.get('configuration_name', 'Untitled')
    return 'Untitled'
```

---

## 5. ENDPOINT 3 — GET SINGLE ENTRY

```
GET /api/admin/knowledge-entries/{id}

Authentication: required (it-admin role)
Rate limiting:  none
```

**Path parameter:** `id` — UUID of the entry.

**DB operations:**
1. Fetch `knowledge_form_entries` row by `id`
2. Fetch all `knowledge_form_screenshots` where `entry_id = id`
3. Fetch all `knowledge_form_entry_chunks` where `entry_id = id` (all versions)
4. Inject `step_number` into form_data steps array for procedure entries

**Response (200 OK):** Full `QuickEntryFull` object (see IMPL_23 Section 8 for type).

Includes: `processing_log` (may be null), `screenshots` array (all screenshots
for this entry), `chunks` array (all chunks, all versions).

**Step number injection for procedures:**
```python
if entry.content_type == 'procedure':
    for i, step in enumerate(entry.form_data['steps']):
        step['step_number'] = i + 1
```

**Error responses:**
```
404 Not Found: Entry with given ID does not exist
```

---

## 6. ENDPOINT 4 — UPDATE ENTRY

```
PUT /api/admin/knowledge-entries/{id}

Authentication: required (it-admin role)
Rate limiting:  none (update is less risky than create)
```

**Request body:**
```json
{
  "current_version":  1,
  // REQUIRED — optimistic lock field. Must match current version in DB.
  // If mismatch: 409 Conflict returned with current entry data.

  "document_id":       "string",
  // Can be changed only if no conflict with existing IDs

  "module":            "string",
  "transactions":      ["string", ...],
  "verified_by_name":  "string",
  "verified_date":     "YYYY-MM-DD",
  "review_frequency":  "string | null",
  "form_data":         { ... },
  "change_summary":    "string | null",

  "publish":           "boolean"
  // true = increment version, archive old chunks, queue processing
  // false = update draft without processing (status stays 'draft')
}
```

**Optimistic lock check:**
```python
current_db_version = db.query(
    "SELECT version FROM knowledge_form_entries WHERE id = :id",
    {"id": entry_id}
).scalar()

if current_db_version != request.current_version:
    current_entry = fetch_full_entry(entry_id)
    raise HTTPException(
        status_code=409,
        detail={
            "message": f"Entry was modified by another admin since you opened it. "
                       f"Current version is {current_db_version}.",
            "current_entry": current_entry.dict()
        }
    )
```

**On conflict (409):** Response body includes the complete current entry object
so the frontend can display a diff for the admin to review and manually merge.

**DB operations (when publish=true):**
1. Check optimistic lock (abort with 409 if mismatch)
2. Snapshot current `form_data` and `version` into `knowledge_form_entry_versions`
3. Increment `version` in `knowledge_form_entries`
4. Update `form_data`, `verified_by_name`, `verified_date`, `module`, `transactions`
5. Set `status = 'processing'`
6. Update `updated_at`

**DB operations (when publish=false, draft save):**
1. Check optimistic lock (abort with 409 if mismatch)
2. Update `form_data` and metadata fields
3. Status remains 'draft'
4. No version snapshot (drafts do not create version history)

**External calls (when publish=true):**
1. Enqueue `process_form_entry(entry_id)` ARQ task
   (task handles retiring old chunks before inserting new ones — see IMPL_26)

**Response (200 OK):**
```json
{
  "id":          "UUID",
  "document_id": "string",
  "version":     2,
  "status":      "processing | draft",
  "message":     "Entry updated and submitted for processing." | "Draft updated."
}
```

**Error responses:**
```
404 Not Found: Entry does not exist
409 Conflict:  Version mismatch (optimistic lock) — body includes current_entry
422:           Validation failure on updated form_data
```

---

## 7. ENDPOINT 5 — ARCHIVE ENTRY

```
DELETE /api/admin/knowledge-entries/{id}

Authentication: required (it-admin role)
Rate limiting:  none
```

**Request body (required — confirmation mechanism):**
```json
{
  "confirmed_document_id": "string"
  // Must exactly match the entry's document_id.
  // If mismatch: 422 Unprocessable.
  // This forces the admin to type the ID explicitly (safety measure).
}
```

**Archive operations (in order):**
1. Load entry — verify exists and `confirmed_document_id` matches
2. Load all current chunk records from `knowledge_form_entry_chunks`
   where `entry_id = id` and `is_current = TRUE`
3. For each chunk: call `qdrant.set_payload({"is_current": False}, [point_id])`
4. For each chunk: call `opensearch.update(id=point_id, body={"is_current": False})`
5. Batch update DB: `UPDATE knowledge_form_entry_chunks SET is_current = FALSE WHERE entry_id = :id`
6. Update entry: `status = 'archived'`, `updated_at = NOW()`
7. If entry had a `gap_id`: no change to gap record (gap linkage preserved for history)

**Note on Qdrant and OpenSearch failures:** If any Qdrant or OpenSearch call
fails during archive, the DB status update still proceeds. The chunk is marked
as not current in DB. A cleanup job (IMPL_29) reconciles any Qdrant/OS
inconsistencies. The archive operation is not rolled back on storage layer
failures — the DB is the source of truth for `is_current` status.

**Response (204 No Content)**

**Error responses:**
```
404 Not Found:     Entry does not exist
409 Conflict:      Entry is already archived
422 Unprocessable: confirmed_document_id does not match entry's document_id
                   { "detail": "Document ID confirmation does not match. Entry not archived." }
```

---

## 8. ENDPOINT 6 — PUBLISH DRAFT

```
POST /api/admin/knowledge-entries/{id}/publish

Authentication: required (it-admin role)
Rate limiting:  none
```

Transitions an entry from `status = 'draft'` to `status = 'processing'`
and enqueues the processing task. Only valid for entries currently in 'draft'
status.

**Request body:** empty (no body required)

**DB operations:**
1. Verify entry exists and status = 'draft' — 409 if not draft
2. Run form_data validation (same as create) — 422 if validation fails
3. Update `status = 'processing'`, `updated_at = NOW()`
4. Create version snapshot in `knowledge_form_entry_versions` (version 1)

**External calls:**
1. Enqueue `process_form_entry(entry_id)` ARQ task

**Response (200 OK):**
```json
{ "status": "processing", "message": "Entry submitted for processing." }
```

**Error responses:**
```
404: Entry does not exist
409: Entry is not in draft status
    { "detail": "Only draft entries can be published. Current status: {status}" }
422: Form data validation failed (entry was saved as incomplete draft)
```

---

## 9. ENDPOINT 7 — GET VERSION HISTORY

```
GET /api/admin/knowledge-entries/{id}/versions

Authentication: required (it-admin role)
Rate limiting:  none
```

**DB query:** `SELECT * FROM knowledge_form_entry_versions WHERE entry_id = :id ORDER BY version DESC`

**Response (200 OK):**
```json
{
  "entry_id":   "UUID",
  "versions": [
    {
      "id":             "UUID",
      "version":        3,
      "changed_by_name":"string",
      "changed_at":     "ISO timestamp",
      "change_summary": "string | null",
      "verified_by_name": "string",
      "verified_date":  "YYYY-MM-DD",
      "form_data":      { ... }
    }
  ],
  "current_version": 3
}
```

---

## 10. ENDPOINT 8 — RESTORE VERSION

```
POST /api/admin/knowledge-entries/{id}/restore/{version}

Authentication: required (it-admin role)
Rate limiting:  none
```

Restores a previous version by creating a new version with the old form_data.
Does not delete any existing version — all versions are preserved.

**Path parameters:**
- `id` — UUID of the entry
- `version` — integer version number to restore

**Operations:**
1. Load the target version from `knowledge_form_entry_versions`
   — 404 if version not found for this entry
2. Call the update flow internally as if the admin submitted the old form_data:
   - Snapshot current version → versions table
   - Increment version
   - Set form_data = old version's form_data
   - Status = 'processing'
   - Enqueue ARQ task

**Response (200 OK):**
```json
{
  "entry_id":      "UUID",
  "restored_from_version": 1,
  "new_version":   4,
  "status":        "processing",
  "message":       "Version 1 restored as Version 4. Processing started."
}
```

**Error responses:**
```
404: Entry or version not found
409: Entry is archived (cannot restore archived entries)
```

---

## 11. ENDPOINT 9 — SUGGEST DOCUMENT ID

```
GET /api/admin/knowledge-entries/suggest-doc-id

Authentication: required (it-admin role)
Rate limiting:  none
```

**Query parameters:**
```
module:       string (required) — e.g. "SD"
content_type: string (required) — e.g. "error_guide"
```

**Logic:**
Query `knowledge_form_entries.document_id` for all IDs matching the existing
convention pattern for this module and type. Detect the highest existing number
and increment. The detection uses a heuristic pattern match to accommodate both
conventions (`SD-ERR-001` canonical and `SAP-SD-PRO-IN-21` extended):

```python
def suggest_doc_id(module: str, content_type: str, db) -> str:
    # Fetch all existing IDs containing the module string
    existing_ids = db.query(
        "SELECT document_id FROM knowledge_form_entries "
        "WHERE document_id ILIKE :pattern",
        {"pattern": f"%{module}%"}
    ).scalars().all()

    # Also check documents table for existing document IDs
    existing_doc_ids = db.query(
        "SELECT document_id FROM documents WHERE module = :module",
        {"module": module}
    ).scalars().all()

    all_ids = existing_ids + existing_doc_ids

    # Extract trailing numbers from IDs matching this module
    import re
    numbers = []
    for doc_id in all_ids:
        match = re.search(r'(\d+)$', doc_id)
        if match:
            numbers.append(int(match.group(1)))

    next_number = (max(numbers) + 1) if numbers else 1

    # Detect existing convention from most recent ID
    # If existing IDs start with "SAP-", use that convention
    sap_prefix_count = sum(1 for id in all_ids if id.startswith('SAP-'))
    if sap_prefix_count > len(all_ids) * 0.5 and all_ids:
        # Use extended convention e.g. SAP-SD-PRO-IN-21
        type_code = {'error_guide': 'PRO-IN', 'procedure': 'PRO', 'config': 'CON-IN'}
        return f"SAP-{module}-{type_code.get(content_type, 'PRO')}-{next_number:02d}"
    else:
        # Use canonical convention e.g. SD-ERR-001
        type_code = {'error_guide': 'ERR', 'procedure': 'PROC', 'config': 'CFG'}
        return f"{module}-{type_code.get(content_type, 'DOC')}-{next_number:03d}"
```

**Response (200 OK):**
```json
{ "suggested_id": "SAP-SD-PRO-IN-21" }
```

---

## 12. ENDPOINT 10 — CHECK DUPLICATE

```
POST /api/admin/knowledge-entries/check-duplicate

Authentication: required (it-admin role)
Rate limiting:  none
```

**Request body:**
```json
{
  "module":       "string",
  "content_type": "string",
  "summary_text": "string"
  // The key descriptive text: issue_description, procedure_name, or configuration_name
}
```

**Operations:**
1. Call BGE embedding model on `summary_text`
2. Search Qdrant with similarity threshold `QUICK_ENTRY_PRESUBMIT_DEDUP_THRESHOLD (0.85)`
   in the same module, `is_current = True`, both `source_type` values
3. Return matches with their source type, title, similarity, and preview

**Response (200 OK):**
```json
{
  "has_similar": true,
  "matches": [
    {
      "document_id":    "SAP-SD-PRO-IN-19",
      "title":          "Tax not showing in condition tab",
      "source_type":    "form_entry | document",
      "content_type":   "error_guide",
      "module":         "SD",
      "similarity_score": 0.91,
      "preview":        "Tax not captured in the condition tab of the sale order...",
      "last_verified":  "12/01/2025",
      "status":         "active"
    }
  ]
}
```

---

## 13. ENDPOINT 11 — VALIDATE CROSS-REFERENCE

```
GET /api/admin/knowledge-entries/validate-reference

Authentication: required (it-admin role)
Rate limiting:  none
```

**Query parameters:**
```
doc_id: string (required) — the document ID to validate
```

**Operations:** Query both `knowledge_form_entries` and `documents` tables
for the given `doc_id`. Return existence status and title.

```python
def validate_reference(doc_id: str, db) -> dict:
    # Check Quick Entry entries
    qe_result = db.query(
        "SELECT document_id, content_type, form_data->>'issue_description' AS title "
        "FROM knowledge_form_entries WHERE document_id = :doc_id AND status = 'active'",
        {"doc_id": doc_id}
    ).first()

    if qe_result:
        return {"exists": True, "title": qe_result.title or qe_result.document_id,
                "source_type": "form_entry"}

    # Check documents table
    doc_result = db.query(
        "SELECT document_id, document_name FROM documents "
        "WHERE document_id = :doc_id AND status = 'active'",
        {"doc_id": doc_id}
    ).first()

    if doc_result:
        return {"exists": True, "title": doc_result.document_name,
                "source_type": "document"}

    return {"exists": False, "title": None, "source_type": None}
```

**Response (200 OK):**
```json
{
  "exists":      true,
  "title":       "Tax condition not capturing in Sale Order",
  "source_type": "form_entry | document | null"
}
```

---

## 14. ENDPOINT 12 — GET FEEDBACK SUMMARY

```
GET /api/admin/knowledge-entries/{id}/feedback-summary

Authentication: required (it-admin role)
Rate limiting:  none
```

Queries the existing feedback records for answers sourced from this entry.
Requires that the feedback table stores `source_form_entry_id` when the
answer chunk was a form entry chunk (WebSocket handler writes this — IMPL_28).

**DB query:**
```sql
SELECT
  COUNT(*) FILTER (WHERE rating = 'positive') AS positive,
  COUNT(*) FILTER (WHERE rating = 'negative') AS negative,
  MAX(created_at) FILTER (WHERE rating = 'negative') AS last_negative_at
FROM feedback
WHERE source_form_entry_id = :entry_id
  AND created_at >= NOW() - INTERVAL '30 days'
```

**Response (200 OK):**
```json
{
  "positive": 5,
  "negative": 1,
  "net": 4,
  "period_days": 30,
  "last_negative_at": "ISO timestamp | null"
}
```

---

## 15. ENDPOINT 13 — CONFIRM CONFIG CURRENT

```
POST /api/admin/knowledge-entries/{id}/confirm-current

Authentication: required (it-admin role)
Rate limiting:  none
Applies to:     Config entries in 'review_required' status only
```

Updates staleness state without re-processing. Does not change form_data or
version. Updates Qdrant payload in-place.

**Operations:**
1. Verify entry exists and `content_type = 'config'` — 422 if not config
2. Verify `status = 'review_required'` — 409 if not review_required
3. Calculate new `next_review_date` from `review_frequency` constant:
   ```python
   from datetime import date, timedelta
   days = REVIEW_FREQUENCY_DAYS[entry.review_frequency]
   next_review_date = date.today() + timedelta(days=days) if days else None
   ```
4. Update `knowledge_form_entries`:
   - `verified_date = today()`
   - `next_review_date = calculated above`
   - `status = 'active'`
5. For each current chunk (from `knowledge_form_entry_chunks`):
   - Read `original_quality_score` from DB chunk record
   - Call `qdrant.set_payload({"is_stale": False, "quality_score": original_quality_score}, [point_id])`
   - Update `opensearch` document with `is_stale: False`

**Critical:** The `quality_score` restored to Qdrant is the `original_quality_score`
from the DB record — NOT `(current_quality_score + 0.10)`. The original score was
preserved at insertion time and never modified. This guarantees the correct pre-
staleness score is always restored regardless of how many staleness cycles occurred.

**Response (200 OK):**
```json
{
  "verified_date":      "YYYY-MM-DD",
  "next_review_date":   "YYYY-MM-DD | null",
  "status":             "active",
  "message":            "Configuration values confirmed current. Next review: {date}."
}
```

---

## 16. ENDPOINT 14 — GET PIPELINE HEALTH

```
GET /api/admin/knowledge-entries/pipeline-health

Authentication: required (it-admin role)
Rate limiting:  none
```

Returns aggregated metrics for the Quick Entry Pipeline health section on the
System Health page. Polled every 30 seconds alongside existing service health.

**Operations:** Multiple DB queries (all lightweight):
```sql
-- Queue depths
SELECT COUNT(*) FROM arq_jobs WHERE function = 'process_form_entry' AND status = 'queued';
SELECT COUNT(*) FROM arq_jobs WHERE function = 'enrich_entry_screenshots' AND status = 'queued';

-- Average processing time (last 24h) — from processing_log JSONB
SELECT AVG((processing_log->>'total_duration_ms')::int)
FROM knowledge_form_entries
WHERE updated_at >= NOW() - INTERVAL '24 hours'
  AND processing_log IS NOT NULL;

-- Status distribution
SELECT status, COUNT(*) FROM knowledge_form_entries GROUP BY status;

-- Screenshot status distribution
SELECT vision_status, COUNT(*) FROM knowledge_form_screenshots GROUP BY vision_status;

-- Quality comparison
SELECT AVG((processing_log->'stages'->'quality_scoring'->>'avg_score')::float)
  FILTER (WHERE processing_log IS NOT NULL)
FROM knowledge_form_entries WHERE status = 'active';
-- (plus equivalent for document-sourced chunks from existing documents table)

-- Feedback
SELECT COUNT(DISTINCT source_form_entry_id)
FROM (
  SELECT source_form_entry_id,
         SUM(CASE WHEN rating='positive' THEN 1 ELSE 0 END) AS pos,
         SUM(CASE WHEN rating='negative' THEN 1 ELSE 0 END) AS neg
  FROM feedback
  WHERE source_form_entry_id IS NOT NULL
    AND created_at >= NOW() - INTERVAL '30 days'
  GROUP BY source_form_entry_id
  HAVING SUM(CASE WHEN rating='negative' THEN 1 ELSE 0 END) >
         SUM(CASE WHEN rating='positive' THEN 1 ELSE 0 END)
) sub;

-- MinIO storage
-- (call MinIO stat API to get bucket size)
```

**Response (200 OK):** `QuickEntryPipelineHealth` object (typed in IMPL_23 Section 8).

---

## 17. SCREENSHOT ENDPOINT 1 — UPLOAD SCREENSHOT

```
POST /api/admin/knowledge-screenshots/upload

Authentication: required (it-admin role)
Rate limiting:  none (screenshot uploads are bounded by entry creation rate limit)
Content-Type:   multipart/form-data
```

**Form data fields:**
```
file:               (file upload) — the screenshot image
entry_id:           string (UUID) — which entry this belongs to
associated_section: string — chunk_type this screenshot enriches
                    (must be valid for the entry's content_type)
admin_caption:      string — min 10 characters
```

**Validation:**
1. `entry_id` exists and is in status 'draft' or 'active'
2. `file.content_type` is one of: image/png, image/jpeg, image/webp
3. `file.size` <= 10485760 (10 MB)
4. `admin_caption` length >= 10
5. `associated_section` is valid for the entry's content_type
   (see IMPL_27 for valid chunk_type values per content_type)
6. Screenshot count for this entry's current version does not exceed:
   - 3 per cause section (for error_guide cause_N sections)
   - 2 per step batch section (for procedure proc_steps_N sections)
   - 5 total for overview/overall sections

**SAP Classification (before MinIO write):**
Call vision model with classification prompt:
```
"Is this a screenshot of an SAP system (SAP GUI, SAP Fiori, or SAP transaction screen)?
 Answer with a JSON object: {"is_sap": true/false, "confidence": 0-100, "reason": "brief reason"}"
```

If `confidence < VISION_SAP_CONFIDENCE_THRESHOLD (60)`:
- Do NOT write to MinIO
- Return 422: `{ "detail": "Screenshot rejected: confidence {confidence}% — this may not be an SAP screenshot. {reason}" }`

If `confidence >= 60`:
- Write to MinIO at path `knowledge-screenshots/{entry_id}/{uuid4}-{sanitised_filename}`
- Create `knowledge_form_screenshots` DB record
- Run initial text extraction (vision model with full extraction prompt — see IMPL_28)
- Return response with extraction preview

**Operations sequence:**
1. Validate all fields
2. Call vision classification
3. If rejected: return 422 immediately
4. Upload to MinIO
5. Insert DB record (`vision_status = 'processing'`)
6. Run full vision extraction (synchronous — admin waits for extraction preview)
7. Update DB record: `extracted_text`, `vision_status = 'complete'`, `vision_confidence`, `sap_confirmed = FALSE`
8. Return response with extraction preview

**Response (201 Created):**
```json
{
  "screenshot_id":    "UUID",
  "minio_object_key": "knowledge-screenshots/...",
  "proxy_url":        "/api/screenshots/knowledge-screenshots/...",
  "admin_caption":    "string",
  "vision_confidence": 87.3,
  "extraction_preview": "Screen title: BP - Maintain Business Partner...\nField: Tax Classification: 0 - Exempt\n...",
  "message": "Screenshot uploaded. Review the extracted content above and confirm it looks correct."
}
```

---

## 18. SCREENSHOT ENDPOINT 2 — RETRY VISION

```
POST /api/admin/knowledge-screenshots/{id}/retry-vision

Authentication: required (it-admin role)
Rate limiting:  none
```

Queues a new vision extraction attempt for a screenshot with `vision_status = 'failed'`.

**Operations:**
1. Verify screenshot exists and `vision_status = 'failed'`
2. Update `vision_status = 'pending'`, clear `vision_error`
3. Enqueue `enrich_entry_screenshots(entry_id=screenshot.entry_id, target_screenshot_id=screenshot.id)`

**Response (200 OK):**
```json
{ "screenshot_id": "UUID", "vision_status": "pending", "message": "Vision retry queued." }
```

---

## 19. SCREENSHOT ENDPOINT 3 — DELETE SCREENSHOT

```
DELETE /api/admin/knowledge-screenshots/{id}

Authentication: required (it-admin role)
Rate limiting:  none
Constraint:     Only permitted when entry is in 'draft' status
```

**Operations:**
1. Verify screenshot exists
2. Verify entry's `status = 'draft'` — 409 if not draft
3. Delete from MinIO: `minio.remove_object(SCREENSHOT_MINIO_BUCKET, minio_object_key)`
4. Delete from DB: `DELETE FROM knowledge_form_screenshots WHERE id = :id`

**Response (204 No Content)**

**Error responses:**
```
404: Screenshot not found
409: Entry is not in draft status — screenshot cannot be deleted from published entries
     { "detail": "Screenshots can only be deleted during draft status. Archive the entry and create a new version to replace screenshots." }
```

---

## 20. FORM SCHEMA VALIDATOR MODULE

Path: `app/services/form_validator.py`

This module is called by the create and update endpoints. It validates the
`form_data` JSONB against the expected schema for the given `content_type`.

All validation is also run at the start of the `process_form_entry` ARQ task
as defence-in-depth.

**Validation error format:**
```json
{
  "detail": [
    {
      "field": "causes[0].resolution_steps",
      "message": "Resolution steps must be at least 20 characters."
    },
    {
      "field": "causes[0].resolution_steps",
      "message": "Resolution steps contain no SAP T-codes or field references. Please name the specific T-code and field. If you understand and want to proceed, set specificity_acknowledged to true."
    }
  ]
}
```

The specificity check for resolution_steps and procedure step actions:
```python
def check_specificity(text: str, acknowledged: bool) -> str | None:
    """Returns error message or None if OK."""
    if acknowledged:
        return None  # admin acknowledged the warning — allow
    entities = sap_entity_extractor.extract(text)
    has_entity = (
        entities['t_codes'] or
        entities['error_codes'] or
        any(kw in text.upper() for kw in ['TAB', 'FIELD', 'SCREEN', 'TRANSACTION', 'T-CODE'])
    )
    if not has_entity and len(text) < 80:
        return (
            "This step may lack specificity. Name the T-code, field, and value. "
            "If you understand, set specificity_acknowledged to true."
        )
    return None
```

---

*IMPL_25 — Quick Entry API Endpoints | AEGIS v1.0 | Sona Comstar*
