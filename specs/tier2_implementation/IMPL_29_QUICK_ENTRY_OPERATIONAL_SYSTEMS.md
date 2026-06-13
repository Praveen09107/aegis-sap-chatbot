# IMPL_29 — QUICK ENTRY: OPERATIONAL SYSTEMS
## AEGIS SAP Helpdesk AI — Staleness, Feedback, Gaps Integration, Monitoring
## Depends on: IMPL_23, IMPL_24, IMPL_25, IMPL_26, IMPL_27, IMPL_28

---

## 1. OVERVIEW

This document specifies all operational systems for the Quick Entry feature:
- Config staleness monitoring (daily job + Qdrant payload management)
- Feedback loop (counts on entry cards, notifications at threshold)
- Knowledge Gaps page integration (button, pre-fill, write-back, badge)
- Rate limiting implementation (Redis sliding window)
- Auto-save mechanism (form draft persistence)
- Bulk import from existing documents
- Quick Entry pipeline health metrics
- Required additions to existing admin portal pages

---

## 2. CONFIG STALENESS MONITORING

### 2.1 next_review_date calculation

When a Config entry is created or updated, `next_review_date` is computed
from `review_frequency` using the `REVIEW_FREQUENCY_DAYS` constant:

```python
from datetime import date, timedelta
from app.config import REVIEW_FREQUENCY_DAYS

def compute_next_review_date(verified_date: date, review_frequency: str) -> date | None:
    """
    Returns the date after which the Config entry should be reviewed.
    Returns None for 'as_needed' — no automatic review date.
    """
    days = REVIEW_FREQUENCY_DAYS.get(review_frequency)
    if days is None:
        return None  # as_needed — no automatic date
    return verified_date + timedelta(days=days)

# REVIEW_FREQUENCY_DAYS values:
# monthly: 30, quarterly: 90, semi_annual: 180, annual: 365, as_needed: None
```

Called in:
- `POST /api/admin/knowledge-entries` (create) — when content_type = 'config'
- `PUT /api/admin/knowledge-entries/{id}` (update) — when verified_date changes
- `POST /api/admin/knowledge-entries/{id}/confirm-current` — always

### 2.2 Daily staleness job

**Job name:** `check_config_staleness`
**Schedule:** `30 0 * * *` (cron) — 00:30 IST (19:00 UTC previous day)
**Registered in:** APScheduler in the FastAPI application startup

```python
async def check_config_staleness():
    """
    Runs nightly at 00:30 IST.
    Finds all Config entries where next_review_date has passed.
    Updates entry status to 'review_required'.
    Reduces quality_score in Qdrant by QUICK_ENTRY_STALENESS_SCORE_DEDUCTION (0.10),
    with floor at QUICK_ENTRY_QUALITY_FLOOR (0.40).
    Sets is_stale = True in Qdrant payload.
    Preserves original_quality_score — never modifies it.
    """
    db     = get_db_session()
    qdrant = get_qdrant_client()

    today = date.today()  # IST date (server runs in IST timezone)

    # Find newly stale entries
    newly_stale = await db.fetch(
        """SELECT kfe.id, kfe.document_id
           FROM knowledge_form_entries kfe
           WHERE kfe.content_type = 'config'
             AND kfe.status = 'active'
             AND kfe.next_review_date IS NOT NULL
             AND kfe.next_review_date <= $1""",
        today
    )

    for entry_row in newly_stale:
        entry_id = entry_row['id']

        # Load current chunks
        chunks = await db.fetch(
            """SELECT qdrant_point_id, quality_score, original_quality_score
               FROM knowledge_form_entry_chunks
               WHERE entry_id = $1 AND is_current = TRUE""",
            entry_id
        )

        # Update each chunk in Qdrant
        for chunk_row in chunks:
            point_id = str(chunk_row['qdrant_point_id'])
            current_score = chunk_row['quality_score']
            original_score = chunk_row['original_quality_score']

            # Reduce score (floor at QUICK_ENTRY_QUALITY_FLOOR)
            # NOTE: original_quality_score is NEVER modified — only quality_score
            reduced_score = max(
                current_score - QUICK_ENTRY_STALENESS_SCORE_DEDUCTION,
                QUICK_ENTRY_QUALITY_FLOOR
            )

            try:
                await qdrant.set_payload(
                    collection_name="aegis_knowledge",
                    payload={
                        "is_stale": True,
                        "quality_score": reduced_score
                        # original_quality_score: NOT included — preserved as-is
                    },
                    points=[point_id]
                )
            except Exception as e:
                logger.error(f"Staleness update failed for point {point_id}: {e}")
                continue

            # Update quality_score in DB chunk record
            # original_quality_score column is NOT updated
            await db.execute(
                """UPDATE knowledge_form_entry_chunks
                   SET quality_score = $1
                   WHERE qdrant_point_id = $2""",
                reduced_score, chunk_row['qdrant_point_id']
            )

        # Update entry status
        await db.execute(
            """UPDATE knowledge_form_entries
               SET status = 'review_required', updated_at = NOW()
               WHERE id = $1""",
            entry_id
        )

        logger.info(
            f"check_config_staleness: marked {entry_row['document_id']} "
            f"(id={entry_id}) as review_required"
        )

    logger.info(
        f"check_config_staleness: completed. "
        f"entries_marked_stale={len(newly_stale)}"
    )
    return {"entries_marked_stale": len(newly_stale)}
```

### 2.3 Confirm-current flow (detailed)

Called by `POST /api/admin/knowledge-entries/{id}/confirm-current` (IMPL_25):

```python
async def confirm_entry_current(entry_id: str, db, qdrant, opensearch):
    entry = await db.fetch_one("SELECT * FROM knowledge_form_entries WHERE id=$1", entry_id)

    if entry['content_type'] != 'config':
        raise HTTPException(422, "confirm-current only applies to config entries")
    if entry['status'] != 'review_required':
        raise HTTPException(409, f"Entry status is '{entry['status']}', not 'review_required'")

    today = date.today()
    new_next_review = compute_next_review_date(today, entry['review_frequency'])

    # Load current chunks with their original_quality_score
    chunks = await db.fetch(
        """SELECT qdrant_point_id, original_quality_score, quality_score
           FROM knowledge_form_entry_chunks
           WHERE entry_id = $1 AND is_current = TRUE""",
        entry_id
    )

    for chunk_row in chunks:
        point_id = str(chunk_row['qdrant_point_id'])
        # RESTORE: use original_quality_score (pre-staleness value)
        restore_score = chunk_row['original_quality_score']

        await qdrant.set_payload(
            collection_name="aegis_knowledge",
            payload={
                "is_stale": False,
                "quality_score": restore_score
                # original_quality_score: still NOT modified
            },
            points=[point_id]
        )

        # Restore quality_score in DB chunk record
        await db.execute(
            """UPDATE knowledge_form_entry_chunks
               SET quality_score = $1
               WHERE qdrant_point_id = $2""",
            restore_score, chunk_row['qdrant_point_id']
        )

        # OpenSearch update
        try:
            await opensearch.update(
                index="aegis_knowledge",
                id=point_id,
                body={"doc": {"is_stale": False, "quality_score": restore_score}}
            )
        except Exception as e:
            logger.warning(f"OpenSearch staleness restore failed for {point_id}: {e}")

    await db.execute(
        """UPDATE knowledge_form_entries
           SET status = 'active',
               verified_date = $1,
               next_review_date = $2,
               updated_at = NOW()
           WHERE id = $3""",
        today, new_next_review, entry_id
    )
```

---

## 3. FEEDBACK LOOP SYSTEM

### 3.1 Feedback count API

Endpoint: `GET /api/admin/knowledge-entries/{id}/feedback-summary`

This is documented in IMPL_25 Endpoint 12. The feedback table requires
`source_form_entry_id UUID NULL` column added via migration (IMPL_28 Section 5.3).

### 3.2 Negative feedback notification

When an entry accumulates `FEEDBACK_NEGATIVE_ALERT_THRESHOLD (3)` negative
ratings within `FEEDBACK_NEGATIVE_ALERT_WINDOW_DAYS (7)` days, an in-portal
notification is sent to the entry's submitter (and optionally any admin viewing
the Quick Entry list page).

**Trigger:** This check runs after each feedback submission. If the threshold
is crossed:

```python
async def check_and_send_feedback_notification(
    form_entry_id: str, db
):
    """Called after each feedback INSERT when source_form_entry_id is set."""

    # Count recent negatives
    negative_count = await db.fetchval(
        """SELECT COUNT(*) FROM feedback
           WHERE source_form_entry_id = $1
             AND rating = 'negative'
             AND created_at >= NOW() - INTERVAL '7 days'""",
        form_entry_id
    )

    if negative_count < FEEDBACK_NEGATIVE_ALERT_THRESHOLD:
        return  # threshold not yet crossed

    # Check cooldown: was a notification sent in the last 7 days?
    entry = await db.fetch_one(
        "SELECT last_notified_at, submitted_by, document_id FROM knowledge_form_entries WHERE id=$1",
        form_entry_id
    )

    if (entry['last_notified_at'] and
        (datetime.now(timezone.utc) - entry['last_notified_at']).days
        < FEEDBACK_NOTIFICATION_COOLDOWN_DAYS):
        return  # cooldown active — don't send again

    # Create in-portal notification record
    await db.execute(
        """INSERT INTO admin_notifications
           (recipient_user_id, notification_type, title, body, related_entity_id)
           VALUES ($1, 'quick_entry_negative_feedback',
                   $2, $3, $4)""",
        entry['submitted_by'],
        f"Review recommended: {entry['document_id']}",
        (
            f"{entry['document_id']} received {negative_count} negative feedback ratings "
            f"in the last 7 days. Consider reviewing and improving this entry."
        ),
        form_entry_id
    )

    # Update cooldown timestamp on entry
    await db.execute(
        "UPDATE knowledge_form_entries SET last_notified_at=NOW() WHERE id=$1",
        form_entry_id
    )
```

**`admin_notifications` table:** If this table does not exist in the current
AEGIS schema, create it:
```sql
CREATE TABLE IF NOT EXISTS admin_notifications (
  id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   UUID  NOT NULL,
  notification_type   TEXT  NOT NULL,
  title               TEXT  NOT NULL,
  body                TEXT  NOT NULL,
  related_entity_id   UUID  NULL,
  is_read             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_notif_recipient
  ON admin_notifications (recipient_user_id, is_read, created_at DESC);
```

### 3.3 Notification delivery

The admin portal admin topbar already polls for unread notifications (if
not, add to the existing `usePolling` implementation for the admin review
queue count). The notification bell shows a count badge. Clicking the
notification navigates to the entry's edit page.

---

## 4. KNOWLEDGE GAPS PAGE INTEGRATION

### 4.1 Backend: write-back when entry goes active

In `process_form_entry` Stage A13 (IMPL_26), when `entry['gap_id']` is not null:

```python
if entry['gap_id']:
    await db.execute(
        """UPDATE gap_events
           SET addressed_by_entry_id = $1, addressed_at = NOW()
           WHERE id = $2 AND addressed_by_entry_id IS NULL""",
           # Only update if not already addressed (idempotent)
        entry_id, entry['gap_id']
    )
```

**Migration required:** Add columns to `gap_events` table:
```sql
ALTER TABLE gap_events ADD COLUMN IF NOT EXISTS addressed_by_entry_id UUID NULL;
ALTER TABLE gap_events ADD COLUMN IF NOT EXISTS addressed_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_gap_events_addressed
  ON gap_events (addressed_by_entry_id) WHERE addressed_by_entry_id IS NOT NULL;
```

### 4.2 Knowledge Gaps API extension

The existing gap events endpoint must return the new fields:

```python
# In the gaps endpoint response, add per-gap item:
{
    "id": "UUID",
    "query_pattern": "string",
    "module": "string",
    # ... existing fields ...
    "addressed_by_entry_id": "UUID | null",
    "addressed_at": "ISO timestamp | null",
    "addressed_entry_title": "string | null"
    # Joined from knowledge_form_entries if addressed_by_entry_id is set
}
```

### 4.3 Frontend: Knowledge Gaps page addition

In `FRONTEND_20_ADMIN_GAPS_AUDIT.md` (GapCard component), add:

```
ADDITION TO GapCard.tsx:

For each gap card, add a secondary action button in the card footer:

If gap.addressed_by_entry_id is NOT null:
  Show green badge: "✓ Addressed by {gap.addressed_entry_title}"
  Hovering shows tooltip: "Created {addressed_at relative time}"

If gap.addressed_by_entry_id IS null:
  Show secondary button: "Create Quick Entry for this gap"
  On click: navigate to /admin/quick-entry/new with query params:
    ?gap_id={gap.id}
    &issue_description={encodeURIComponent(gap.query_pattern)}
    &module={gap.module}
    &transactions={encodeURIComponent(detected_transactions.join(','))}

detected_transactions is extracted from the gap's query_pattern
using the existing SAP entity detector (same as form entity detection).
```

---

## 5. RATE LIMITING IMPLEMENTATION

Full Redis sliding window implementation for the submission endpoint.
This is implemented as a FastAPI dependency function:

```python
# app/dependencies/rate_limiting.py

from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request

async def quick_entry_rate_limit(
    request: Request,
    current_user = Depends(get_current_admin)
):
    """
    Rate limit: QUICK_ENTRY_RATE_LIMIT_MAX (5) submissions per
    QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS (900) seconds per admin user.

    Algorithm: Redis sorted set as sliding window.
    Key: qe_rate:{user_id}
    Value members: timestamps (both score and member are the same float timestamp)

    On each call:
    1. Remove timestamps older than (now - window)
    2. Count remaining
    3. If count >= max: reject with 429
    4. Add current timestamp
    5. Set expiry on key to window size
    """
    redis = request.app.state.redis
    user_id = str(current_user.id)
    redis_key = f"{QUICK_ENTRY_RATE_LIMIT_REDIS_PREFIX}{user_id}"  # qe_rate:{user_id}

    now = datetime.now(timezone.utc).timestamp()
    window_start = now - QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS

    try:
        pipe = redis.pipeline()
        # Remove old entries
        pipe.zremrangebyscore(redis_key, 0, window_start)
        # Count current window
        pipe.zcard(redis_key)
        results = await pipe.execute()

        current_count = results[1]

        if current_count >= QUICK_ENTRY_RATE_LIMIT_MAX:
            # Calculate retry-after
            oldest_in_window = await redis.zrange(redis_key, 0, 0, withscores=True)
            if oldest_in_window:
                oldest_ts = oldest_in_window[0][1]
                retry_after = int(QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS
                                  - (now - oldest_ts))
            else:
                retry_after = QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS

            # Format retry time in IST
            from datetime import timezone, timedelta
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            retry_time = datetime.fromtimestamp(now + retry_after, tz=ist_tz)
            retry_time_str = retry_time.strftime("%I:%M %p IST")

            raise HTTPException(
                status_code=429,
                detail=(
                    f"Submission limit reached. "
                    f"Maximum {QUICK_ENTRY_RATE_LIMIT_MAX} entries per 15 minutes. "
                    f"Retry after {retry_time_str}."
                ),
                headers={"Retry-After": str(retry_after)}
            )

        # Add current timestamp to sorted set
        pipe2 = redis.pipeline()
        pipe2.zadd(redis_key, {str(now): now})
        pipe2.expire(redis_key, QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS)
        await pipe2.execute()

    except HTTPException:
        raise
    except Exception as e:
        # Redis failure: fail open (allow request, log error)
        # Rate limiting failure should not block legitimate submissions
        logger.error(f"Rate limiting Redis error: {e}. Failing open.")

# Usage in router:
@router.post("/", dependencies=[Depends(quick_entry_rate_limit)])
async def create_knowledge_entry(...):
    ...
```

---

## 6. AUTO-SAVE MECHANISM

Auto-save is implemented entirely on the frontend (FRONTEND_37). The backend
stores the draft as a normal `draft` status entry in `knowledge_form_entries`.

**Backend behaviour:**
- `POST /api/admin/knowledge-entries` with `publish: false` — creates draft
- `PUT /api/admin/knowledge-entries/{id}` with `publish: false` — updates draft without processing
- Draft updates do NOT create version history records
- Draft updates do NOT enqueue ARQ tasks
- Draft form_data is validated for format (valid JSON structure) but NOT for
  required field completeness — drafts may be incomplete

**Orphaned draft cleanup:**
When admin selects "Update existing" from the duplicate check modal and confirms:
- Frontend sends `DELETE /api/admin/knowledge-entries/{orphan_draft_id}`
  with `confirmed_document_id` matching the orphan
- This permanently deletes the draft

When admin closes browser without submitting:
- Draft persists indefinitely in the database with `status = 'draft'`
- Admin sees it in the list with "Continue Draft" button
- Manual deletion via [Delete] button on draft list card

---

## 7. BULK IMPORT FROM EXISTING DOCUMENTS

**File:** `app/services/form_import_parser.py`

### 7.1 Endpoint

`POST /api/admin/knowledge-entries/import-document` (IMPL_25 not numbered separately)
receives a `.docx` or `.pdf` file and returns pre-populated form fields.

### 7.2 Parser implementation

```python
async def parse_document_for_form_prefill(file_bytes: bytes, filename: str) -> dict:
    """
    Extracts text from the uploaded file using Stage 2 text extraction,
    then maps extracted sections to form fields using known template header labels.
    Returns parsed fields with confidence and unparsed section list.
    """
    from app.services.text_extractor import extract_text  # Stage 2 extractor

    # Extract text
    extracted_text = await extract_text(file_bytes, filename)

    # Detect content type from header labels
    content_type = detect_content_type(extracted_text)

    if content_type == 'error_guide':
        parsed = parse_error_guide(extracted_text)
    elif content_type == 'procedure':
        parsed = parse_procedure(extracted_text)
    elif content_type == 'config':
        parsed = parse_config(extracted_text)
    else:
        content_type = 'error_guide'
        parsed = {}

    return {
        "content_type_detected": content_type,
        "parsed_fields": parsed,
        "unparsed_sections": identify_unparsed(extracted_text, parsed),
        "extraction_accuracy_note": (
            "Fields extracted with high accuracy from Word documents with clean table structure. "
            "Image-heavy PDFs may have lower accuracy. "
            "Review all pre-filled fields before submitting."
        )
    }


def detect_content_type(text: str) -> str | None:
    """Detect template type from header keywords."""
    text_upper = text.upper()
    if 'CAUSE DESCRIPTION' in text_upper and 'HOW TO IDENTIFY' in text_upper:
        return 'error_guide'
    elif 'PROCEDURE STEPS' in text_upper or 'PROCEDURE NAME' in text_upper:
        return 'procedure'
    elif 'CURRENT VALUES' in text_upper and 'WHAT THIS CONTROLS' in text_upper:
        return 'config'
    return None


def parse_error_guide(text: str) -> dict:
    """
    Extract Error Guide fields from document text using known header labels.
    Handles both canonical template format and the extended format your IT team uses.
    """
    import re

    def extract_between(text: str, start_label: str, end_labels: list[str]) -> str | None:
        """Extract text between start_label and the first matching end_label."""
        pattern = re.compile(
            re.escape(start_label) + r'\s*\|?\s*(.*?)(?=' +
            '|'.join(re.escape(e) for e in end_labels) + r')',
            re.IGNORECASE | re.DOTALL
        )
        match = pattern.search(text)
        return match.group(1).strip() if match else None

    parsed = {
        "issue_description": extract_between(text, "ISSUE DESCRIPTION", [
            "DOCUMENT ID", "MODULE", "TRANSACTIONS"
        ]),
        "error_code": extract_between(text, "ERROR CODE", ["ERROR MESSAGE", "DESCRIPTION"]),
        "error_message": extract_between(text, "ERROR MESSAGE", ["DESCRIPTION", "WHEN THIS"]),
        "description": extract_between(text, "DESCRIPTION", ["WHEN THIS OCCURS", "CAUSES", "ROOT"]),
        "when_this_occurs": extract_between(text, "WHEN THIS OCCURS", ["CAUSE 1", "ROOT CAUSES"]),
        "success_indicator": extract_between(text, "SUCCESS INDICATOR", ["ESCALATION"]),
        "escalation_criteria": extract_between(text, "ESCALATION CRITERIA", ["ADMIN STEPS", "SCREENSHOTS"]),
        "admin_steps": extract_between(text, "ADMIN STEPS", ["SCREENSHOTS", "NOTES", "CHANGE"]),
        "notes": extract_between(text, "NOTES", ["CHANGE HISTORY", "---"]),
    }

    # Extract cause blocks (variable number)
    causes = extract_cause_blocks(text)
    if causes:
        parsed["causes"] = causes

    # Clean up None values and empty strings
    cleaned = {}
    for key, value in parsed.items():
        if value and value.strip():
            cleaned[key] = value.strip()
        elif key == 'causes':
            cleaned[key] = value

    return cleaned


def extract_cause_blocks(text: str) -> list[dict]:
    """Extract all CAUSE N blocks from error guide text."""
    import re
    causes = []
    # Pattern: CAUSE N (followed by cause content until next CAUSE or RESOLUTION)
    cause_pattern = re.compile(
        r'CAUSE\s+(\d+).*?CAUSE DESCRIPTION[:\s|]+(.+?)HOW TO IDENTIFY[:\s|]+(.+?)RESOLUTION STEPS[:\s|]+(.+?)(?=CAUSE \d+|SUCCESS INDICATOR|RESOLUTION AND)',
        re.IGNORECASE | re.DOTALL
    )
    for match in cause_pattern.finditer(text):
        causes.append({
            "cause_number": int(match.group(1)),
            "priority": "common",
            "cause_description": match.group(2).strip(),
            "how_to_identify": match.group(3).strip(),
            "resolution_steps": match.group(4).strip(),
            "resolution_requires_admin": False,
            "cause_obsolete": False,
            "obsolete_reason": "",
            "screenshot_ids": []
        })
    return causes
```

**Parser accuracy expectation:**
The parser works well on `.docx` files where the template table structure is
preserved in text extraction. For image-heavy PDFs where text extraction is
unreliable (the same problem that motivated Quick Entry), parse accuracy is
lower. The parser always returns partial results — the admin reviews and
fills in any highlighted empty fields.

---

## 8. MONITORING DASHBOARD — SYSTEM HEALTH PAGE ADDITION

### 8.1 Quick Entry Pipeline health section

This section is added to the existing System Health page (IMPL_20, FRONTEND_22).

**Data source:** `GET /api/admin/knowledge-entries/pipeline-health`
**Polling:** Every 30 seconds (same as existing service health polling)

**Frontend section layout:**
```
Quick Entry Pipeline
─────────────────────────────────────────────────────────────────

ARQ Queues:
  Form Entry Queue:      {N} pending tasks     [● Green | ▲ Amber if >10]
  Screenshot Queue:      {N} pending tasks     [● Green | ▲ Amber if >5]
  Avg Processing Time:   {X.X} seconds (last 24h)

Entry Status:
  Active:          {N}     Drafts:         {N}
  Processing:      {N}     Failed:         {N}   [Red if > 0]
  Partial Index:   {N}     Review Req.:    {N}   [Amber if > 0]

Screenshot Processing:
  Complete:    {N}    Processing:   {N}    Pending: {N}
  Failed:      {N}    [Red if > 0]  Not SAP: {N}

Knowledge Quality:
  Quick Entry avg score:  {X.XX}
  Document avg score:     {X.XX}

Feedback (last 30 days):
  Entries with net negative feedback: {N}   [Amber if > 0]

Storage:
  Screenshot storage: {X.X} MB
  Eligible for cleanup: {N} files
```

**Status logic for section header badge:**
- All healthy → Green "Quick Entry Pipeline Healthy"
- Any failed entries > 0 OR any failed screenshots > 0 → Amber "Attention needed"
- Failed entries > 5 OR partial_index > 5 → Red "Action required"

### 8.2 Analytics page addition

**Section:** "Knowledge Quality" subsection added to the Analytics page.

Metrics:
- Quick Entry feedback ratings over time (line chart, 7d/30d/90d)
- Vision processing success rate over time (% complete vs failed)
- Entries by content type distribution (pie chart)
- Top modules by Quick Entry count (bar chart)

---

## 9. EXISTING DOCUMENT ADDITIONS

### 9.1 Addition to FRONTEND_20_ADMIN_GAPS_AUDIT.md

Paste at the end of the GapCard component specification:

```
---
## QUICK ENTRY INTEGRATION (Added in IMPL_29)

GapCard receives two new props:
  addressed_by_entry_id: string | null
  addressed_entry_title: string | null

Rendering:
  If addressed_by_entry_id is null:
    Show [Create Quick Entry] secondary button in card footer
    On click: navigate to /admin/quick-entry/new with query params:
      ?gap_id={gap.id}
      &issue_description={encodeURIComponent(gap.query_pattern)}
      &module={gap.module}
    The Quick Entry form reads these params and pre-populates fields.

  If addressed_by_entry_id is not null:
    Show green "✓ Addressed by {addressed_entry_title}" badge
    No Create Quick Entry button shown

The gaps list endpoint must include addressed_by_entry_id and
addressed_entry_title in its response (requires backend join).
```

### 9.2 Addition to FRONTEND_22_ADMIN_HEALTH_ANALYTICS.md

Paste at the end of the System Health page specification:

```
---
## QUICK ENTRY PIPELINE SECTION (Added in IMPL_29)

The System Health page gains a new section below the existing service tiles.
Section title: "Quick Entry Pipeline"

Data source: GET /api/admin/knowledge-entries/pipeline-health
Polling: 30 seconds (same interval as service health)

Renders: QuickEntryPipelineHealth component (IMPL_29 Section 8.1)
Section header badge logic:
  Green:  all counts nominal
  Amber:  any failed entries > 0 OR failed screenshots > 0
  Red:    failed entries > 5 OR partial_index entries > 5
```

### 9.3 Addition to FRONTEND_MASTER_REFERENCE.md

In the "Admin Portal Pages" list, add after the existing Documents entry:

```
- Quick Entry (/admin/quick-entry) — Structured form-based knowledge
  contribution without requiring document creation. Supports Error Guide,
  Procedure, and Configuration Reference templates with multimodal
  screenshot attachment and automatic vision enrichment.
  Documents: FRONTEND_36, FRONTEND_37, FRONTEND_38, FRONTEND_39
```

---

## 10. COVERAGE SEARCH — BACKEND ENDPOINT

The coverage search on the Quick Entry list page sends a Qdrant semantic
search query to find existing knowledge before an admin starts a new entry.

**Endpoint:** `POST /api/admin/knowledge-entries/coverage-search`
```json
Request: { "query": "string (freeform search text)", "module": "string | null" }
```

**Operations:**
1. Embed `query` via BGE
2. Search Qdrant with `is_current = True`, module filter if provided, limit 5
3. Return results with source type badge

```json
Response:
{
  "results": [
    {
      "document_id": "SAP-SD-PRO-IN-20",
      "title": "Tax condition not capturing in Sale Order",
      "source_type": "form_entry | document",
      "content_type": "error_guide",
      "module": "SD",
      "similarity_score": 0.88,
      "preview": "Tax not captured in the condition tab...",
      "status": "active",
      "last_verified": "28/03/2025"
    }
  ],
  "total_searched": 1247
}
```

---

*IMPL_29 — Quick Entry Operational Systems | AEGIS v1.0 | Sona Comstar*
