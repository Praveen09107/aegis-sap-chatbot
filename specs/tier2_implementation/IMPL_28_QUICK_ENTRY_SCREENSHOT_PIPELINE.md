# IMPL_28 — QUICK ENTRY: SCREENSHOT PIPELINE
## AEGIS SAP Helpdesk AI — Multimodal Screenshot Ingestion and Retrieval
## Depends on: IMPL_23, IMPL_24, IMPL_25, IMPL_26, IMPL_27

---

## 1. OVERVIEW

This document specifies the complete screenshot pipeline for the Quick Entry
feature. It covers:
- Screenshot upload with SAP classification validation
- Ingestion-time vision extraction by `aegis-ollama-vision`
- Chunk text enrichment after vision extraction
- Screenshot surfacing in employee answers via the attribution panel
- The MinIO proxy route for authenticated screenshot serving
- Screenshot lifecycle management (cleanup)

The vision model (`aegis-ollama-vision`, LLaVA 13B) already exists in the
AEGIS Docker stack and is defined in IMPL_13. This document specifies the
NEW usage pattern: calling the vision model at ingestion time from the ARQ
worker, not at query time.

---

## 2. VISION CLIENT MODULE

**File:** `app/clients/ollama_vision.py`

This client is separate from the existing `ollama_main` and `ollama_judge`
clients. It connects to the `aegis-ollama-vision` service.

```python
import httpx
import base64
from app.config import settings

VISION_SERVICE_URL = "http://aegis-ollama-vision:11434"
VISION_MODEL = "llava:13b"

class OllamaVisionClient:

    async def classify_sap(self, image_bytes: bytes) -> dict:
        """
        Determine whether an image is a SAP screenshot.
        Returns: {"is_sap": bool, "confidence": float (0-100), "reason": str}
        """
        b64_image = base64.b64encode(image_bytes).decode('utf-8')

        prompt = (
            'Is this a screenshot of an SAP system? '
            'SAP systems include SAP GUI (classic interface), SAP Fiori (tile-based), '
            'SAP transaction screens, SPRO configuration, or any SAP dialog/popup. '
            'Respond ONLY with valid JSON in this exact format: '
            '{"is_sap": true, "confidence": 85, "reason": "Shows SAP GUI title bar and T-code"} '
            'or {"is_sap": false, "confidence": 95, "reason": "This appears to be a photograph"}'
        )

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{VISION_SERVICE_URL}/api/generate",
                json={
                    "model": VISION_MODEL,
                    "prompt": prompt,
                    "images": [b64_image],
                    "stream": False,
                    "format": "json"
                }
            )
            response.raise_for_status()
            raw = response.json()["response"]
            import json
            return json.loads(raw)

    async def extract_sap_content(
        self,
        image_bytes: bytes,
        context: dict
    ) -> str:
        """
        Extract all relevant SAP content from a screenshot.
        context = {issue_description, module, transactions}
        Returns: extracted text string
        """
        b64_image = base64.b64encode(image_bytes).decode('utf-8')

        prompt = (
            f"This is a screenshot from a SAP entry titled '{context['issue_description']}', "
            f"module {context['module']}, transactions {', '.join(context['transactions'])}.\n\n"
            "Extract all visible information from this SAP screen. "
            "Focus on content related to the entry title above. Include:\n"
            "1. SCREEN TITLE: The exact title or name of the SAP screen or dialog\n"
            "2. TRANSACTION CODE: Any T-code visible in the command field or title bar\n"
            "3. ALL TEXT: Every visible text label, field name, and field value — copy exactly as shown\n"
            "4. ERROR MESSAGES: Any error dialogs, warning messages, or status bar messages — verbatim\n"
            "5. FIELD VALUES: All form fields and their current values as 'Field Name: Value'\n"
            "6. HIGHLIGHTED ITEMS: Any selected, highlighted, or flagged items\n\n"
            "Do not summarise or interpret. Copy text exactly as it appears on screen."
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{VISION_SERVICE_URL}/api/generate",
                json={
                    "model": VISION_MODEL,
                    "prompt": prompt,
                    "images": [b64_image],
                    "stream": False
                }
            )
            response.raise_for_status()
            return response.json()["response"]
```

---

## 3. SCREENSHOT UPLOAD FLOW (detailed)

This section expands on Endpoint 17 from IMPL_25 with the complete step-by-step
sequence.

### 3.1 Upload endpoint sequence

```
1. Receive multipart form data:
   file, entry_id, associated_section, admin_caption

2. Validate:
   a. entry_id exists → 404 if not found
   b. entry.status in ('draft', 'active') → 422 if archived/failed/low_quality
   c. file.content_type in SCREENSHOT_ACCEPTED_MIME_TYPES → 422 if not image
   d. file.size <= SCREENSHOT_MAX_SIZE_BYTES (10 MB) → 422 if too large
   e. admin_caption length >= 10 → 422 if too short
   f. associated_section is valid for entry's content_type:
      - error_guide: 'error_overview' or 'cause_1'..'cause_10'
      - procedure: 'proc_overview' or 'proc_steps_1'..'proc_steps_N'
      - config: 'cfg_overview' or 'cfg_values'
   g. Screenshot count check (not exceeding per-section limits)

3. Read file bytes into memory

4. CALL classify_sap(image_bytes):
   a. If response.confidence < VISION_SAP_CONFIDENCE_THRESHOLD (60):
      → Return 422 with reason:
        "Screenshot rejected: {confidence}% confidence this is a SAP screenshot. Reason: {reason}"
      → Do NOT write to MinIO
      → Stop here

5. Sanitise filename:
   safe_name = re.sub(r'[^a-z0-9_.-]', '', file.filename.lower().replace(' ', '_'))[:50]
   If safe_name is empty: safe_name = 'screenshot'

6. Generate object key:
   object_key = f"knowledge-screenshots/{entry_id}/{uuid4()}-{safe_name}"

7. Upload to MinIO:
   minio_client.put_object(
       bucket_name=SCREENSHOT_MINIO_BUCKET,
       object_name=object_key,
       data=file_bytes_io,
       length=file.size,
       content_type=file.content_type
   )

8. Insert DB record:
   INSERT INTO knowledge_form_screenshots
   (entry_id, version, associated_section, minio_object_key, admin_caption,
    vision_status, vision_confidence, sap_confirmed, file_size_bytes, mime_type)
   VALUES (...) — vision_status = 'processing'

9. CALL extract_sap_content(image_bytes, context):
   context = {
       issue_description: form_data.get('issue_description') or
                          form_data.get('procedure_name') or
                          form_data.get('configuration_name'),
       module: entry.module,
       transactions: entry.transactions
   }
   timeout = VISION_EXTRACTION_TIMEOUT_SECONDS (30)
   On timeout: vision_status = 'failed', vision_error = 'Timeout after 30s'
   On exception: vision_status = 'failed', vision_error = str(e)
   On success: extracted_text = response, vision_status = 'complete'

10. Update DB record:
    UPDATE knowledge_form_screenshots
    SET extracted_text = :extracted_text,
        vision_status = :status,
        vision_confidence = :confidence,
        vision_error = :error_if_any
    WHERE id = :screenshot_id

11. Return response:
    {
      screenshot_id: UUID,
      minio_object_key: string,
      proxy_url: "/api/screenshots/{object_key}",
      admin_caption: string,
      vision_confidence: float,
      extraction_preview: string (extracted_text or error message),
      message: "Screenshot uploaded. Review the extracted content above and confirm it looks correct."
    }
```

**Note on `sap_confirmed`:** The field starts as `FALSE`. The frontend shows
the extraction preview to the admin and has a "This looks correct" / "Remove
screenshot" option. If the admin confirms, a separate call sets `sap_confirmed = TRUE`.
If the admin removes it, `DELETE /api/admin/knowledge-screenshots/{id}` is called.
The `sap_confirmed` field does not block chunk enrichment — even unconfirmed
screenshots are processed (the admin may have already navigated away). It is
a quality tracking field only.

---

## 4. ARQ TASK: enrich_entry_screenshots

**File:** `app/tasks/enrich_entry_screenshots.py`
**Trigger:** Enqueued by `process_form_entry` Stage A13 after entry goes active.
             Also triggered by retry-vision endpoint.
**Signature:**
```python
async def enrich_entry_screenshots(
    ctx: dict,
    entry_id: str,
    version: int,
    target_screenshot_id: str | None = None  # None = process all pending
) -> dict
```

```python
async def enrich_entry_screenshots(
    ctx: dict,
    entry_id: str,
    version: int,
    target_screenshot_id: str | None = None
) -> dict:

    db         = ctx['db']
    qdrant     = ctx['qdrant']
    opensearch = ctx['opensearch']
    bge_client = ctx['bge_client']
    minio      = ctx['minio_client']
    vision     = ctx['vision_client']  # OllamaVisionClient instance

    # Load entry for context
    entry = await db.fetch_one("SELECT * FROM knowledge_form_entries WHERE id = $1", entry_id)
    if not entry:
        return {"status": "entry_not_found"}

    vision_context = {
        "issue_description": (
            entry['form_data'].get('issue_description') or
            entry['form_data'].get('procedure_name') or
            entry['form_data'].get('configuration_name') or 'Unknown'
        ),
        "module": entry['module'],
        "transactions": entry['transactions']
    }

    # Load target screenshots
    if target_screenshot_id:
        # Retry mode: single screenshot
        screenshots = await db.fetch(
            "SELECT * FROM knowledge_form_screenshots WHERE id = $1 AND entry_id = $2",
            target_screenshot_id, entry_id
        )
    else:
        # Bulk mode: all pending screenshots for this version
        screenshots = await db.fetch(
            """SELECT * FROM knowledge_form_screenshots
               WHERE entry_id = $1 AND version = $2
               AND vision_status = 'pending'""",
            entry_id, version
        )

    results = {"processed": 0, "failed": 0, "details": []}

    for screenshot in screenshots:
        screenshot_id = screenshot['id']
        section = screenshot['associated_section']

        # Mark as processing
        await db.execute(
            "UPDATE knowledge_form_screenshots SET vision_status='processing' WHERE id=$1",
            screenshot_id
        )

        try:
            # Download from MinIO
            response = minio.get_object(
                bucket_name=SCREENSHOT_MINIO_BUCKET,
                object_name=screenshot['minio_object_key']
            )
            image_bytes = response.read()
            response.close()
            response.release_conn()

        except Exception as e:
            await db.execute(
                """UPDATE knowledge_form_screenshots
                   SET vision_status='failed', vision_error=$1 WHERE id=$2""",
                f"MinIO download failed: {str(e)}", screenshot_id
            )
            results['failed'] += 1
            results['details'].append({"screenshot_id": str(screenshot_id),
                                       "status": "failed", "stage": "download"})
            continue

        try:
            # Run vision extraction with context
            extracted_text = await asyncio.wait_for(
                vision.extract_sap_content(image_bytes, vision_context),
                timeout=VISION_EXTRACTION_TIMEOUT_SECONDS
            )

            # Update screenshot record
            await db.execute(
                """UPDATE knowledge_form_screenshots
                   SET extracted_text=$1, vision_status='complete' WHERE id=$2""",
                extracted_text, screenshot_id
            )

        except asyncio.TimeoutError:
            await db.execute(
                """UPDATE knowledge_form_screenshots
                   SET vision_status='failed',
                       vision_error='Vision extraction timeout after 30s'
                   WHERE id=$1""",
                screenshot_id
            )
            results['failed'] += 1
            continue

        except Exception as e:
            await db.execute(
                """UPDATE knowledge_form_screenshots
                   SET vision_status='failed', vision_error=$1 WHERE id=$2""",
                str(e), screenshot_id
            )
            results['failed'] += 1
            continue

        # Find the corresponding Qdrant chunk for this section
        chunk_rows = await db.fetch(
            """SELECT * FROM knowledge_form_entry_chunks
               WHERE entry_id = $1 AND version = $2
               AND chunk_type = $3 AND is_current = TRUE""",
            entry_id, version, section
        )

        if not chunk_rows:
            logger.warning(
                f"enrich_entry_screenshots: no current chunk found for "
                f"entry {entry_id} section {section}. Screenshot stored but not enriched."
            )
            results['processed'] += 1
            continue

        for chunk_row in chunk_rows:
            # Append extracted text to chunk
            enriched_text = (
                chunk_row['chunk_text']
                + f"\n\n[SCREENSHOT: {screenshot['admin_caption']}]\n"
                + extracted_text
            )

            # Re-embed enriched text
            try:
                new_vector = await bge_client.encode(enriched_text)
            except Exception as e:
                logger.error(f"Re-embedding failed for chunk {chunk_row['qdrant_point_id']}: {e}")
                continue

            # Update Qdrant (upsert preserves all other payload fields)
            try:
                await qdrant.upsert(
                    collection_name="aegis_knowledge",
                    points=[PointStruct(
                        id=str(chunk_row['qdrant_point_id']),
                        vector=new_vector,
                        payload={"text": enriched_text}
                        # All other payload fields preserved by Qdrant upsert
                    )]
                )
            except Exception as e:
                logger.error(f"Qdrant update failed during enrichment: {e}")
                continue

            # Update OpenSearch
            try:
                await opensearch.update(
                    index="aegis_knowledge",
                    id=str(chunk_row['qdrant_point_id']),
                    body={"doc": {"text": enriched_text}}
                )
            except Exception as e:
                logger.warning(f"OpenSearch update failed during enrichment: {e}")

            # Update DB chunk text
            await db.execute(
                "UPDATE knowledge_form_entry_chunks SET chunk_text=$1 WHERE id=$2",
                enriched_text, chunk_row['id']
            )

        results['processed'] += 1

    return results
```

---

## 5. SCREENSHOT RETRIEVAL IN CRAG PIPELINE

### 5.1 When screenshots surface

During the CRAG pipeline execution (IMPL_14, IMPL_15), after hybrid search
returns the top-N chunks, the pipeline checks each chunk's payload for
`has_screenshots: true`. For any chunk with screenshots, the pipeline performs
a single batch DB query to fetch screenshot metadata.

**Insertion point in CRAG pipeline:**
After the reranking step (IMPL_15) has produced the final top-K chunks, and
before building the LLM context:

```python
# In CRAG pipeline: after final chunk selection

# Collect all screenshot IDs from retrieved chunks
all_screenshot_ids = []
for chunk in final_chunks:
    screenshot_ids = chunk.payload.get('screenshot_ids', [])
    all_screenshot_ids.extend(screenshot_ids)

# Batch fetch screenshot metadata (single query)
screenshots_by_id = {}
if all_screenshot_ids:
    screenshot_rows = await db.fetch(
        """SELECT id, associated_section, minio_object_key, admin_caption
           FROM knowledge_form_screenshots
           WHERE id = ANY($1::uuid[])
           AND vision_status IN ('complete', 'pending')
           ORDER BY created_at ASC""",
        all_screenshot_ids
    )
    for row in screenshot_rows:
        screenshots_by_id[str(row['id'])] = {
            "url": f"/api/screenshots/{row['minio_object_key']}",
            "caption": row['admin_caption'],
            "section": row['associated_section']
        }

# Build screenshot list for attribution panel
attribution_screenshots = []
seen_urls = set()
for chunk in final_chunks:
    for screenshot_id in chunk.payload.get('screenshot_ids', []):
        screenshot_meta = screenshots_by_id.get(str(screenshot_id))
        if screenshot_meta and screenshot_meta['url'] not in seen_urls:
            attribution_screenshots.append(screenshot_meta)
            seen_urls.add(screenshot_meta['url'])

# Store form_entry_id for feedback tracking
form_entry_id = None
for chunk in final_chunks:
    if chunk.payload.get('source_type') == 'form_entry':
        form_entry_id = chunk.payload.get('form_entry_id')
        break
```

### 5.2 WebSocket validation_result message extension

The `validation_result` WebSocket message (existing format in IMPL_11) is
extended with two new fields inside the existing `attribution_panel` object:

```json
{
  "type": "validation_result",
  "validation_score": 0.84,
  "confidence_badge": "green",
  "attribution_panel": {
    // ... all existing fields unchanged ...
    "form_entry_id": "uuid-string-or-null",
    "screenshots": [
      {
        "url": "/api/screenshots/knowledge-screenshots/{entry_id}/{uuid}-filename.png",
        "caption": "BP transaction — Billing tab showing Tax Classification set to Exempt",
        "section": "cause_1"
      }
    ]
  }
}
```

- `form_entry_id` is `null` when the source chunk is a document-based chunk.
- `screenshots` is an empty array `[]` when no screenshot is associated.
- Maximum screenshots in one answer response: 5 (deduped by URL).

### 5.3 Feedback recording with form_entry_id

When the employee submits feedback (thumbs up/down), the feedback record
must include `source_form_entry_id` if the answer was from a form entry:

```python
# In the feedback submission handler (existing endpoint):
# Add form_entry_id to the INSERT when present
await db.execute(
    """INSERT INTO feedback
       (session_id, message_id, rating, source_document_id, source_form_entry_id)
       VALUES ($1, $2, $3, $4, $5)""",
    session_id, message_id, rating, source_document_id, form_entry_id
)
```

This requires adding `source_form_entry_id UUID NULL` to the existing `feedback`
table via a separate migration. This migration is safe — it adds a nullable
column to an existing table.

```sql
-- Append to migration file:
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source_form_entry_id UUID NULL;
CREATE INDEX idx_feedback_form_entry ON feedback (source_form_entry_id)
  WHERE source_form_entry_id IS NOT NULL;
```

---

## 6. SCREENSHOT SERVING — NEXT.JS PROXY ROUTE

**File:** `src/app/api/screenshots/[...path]/route.ts`

```typescript
/**
 * Authenticated proxy route for serving Quick Entry screenshots.
 * Screenshots are stored in MinIO (private bucket) and must never be
 * served directly. This proxy:
 * 1. Validates authentication via HttpOnly cookie
 * 2. Fetches image from MinIO via BACKEND_INTERNAL_URL
 * 3. Returns image with appropriate cache headers
 *
 * URL pattern: /api/screenshots/knowledge-screenshots/{entry_id}/{filename}
 * Cache: private, 24 hours (safe because screenshots on active entries never change)
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {

  // Authentication check
  const cookieStore = cookies()
  const accessToken = cookieStore.get('access_token')?.value

  if (!accessToken) {
    return new NextResponse('Unauthorised', { status: 401 })
  }

  // Build backend screenshot fetch URL
  const objectPath = params.path.join('/')
  const backendUrl = `${process.env.BACKEND_INTERNAL_URL}/api/screenshots/${objectPath}`

  try {
    const response = await fetch(backendUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    })

    if (!response.ok) {
      return new NextResponse('Screenshot not found', { status: 404 })
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'image/png',
        'Cache-Control': `private, max-age=${SCREENSHOT_PROXY_CACHE_SECONDS}`,
        // 24 hours — safe because screenshots on active entries are immutable
        // Screenshots can only be deleted during draft status (no active cache exists then)
      },
    })

  } catch (error) {
    return new NextResponse('Failed to fetch screenshot', { status: 502 })
  }
}

export const dynamic = 'force-dynamic'
```

**Backend screenshot endpoint (FastAPI):**
```python
@router.get("/api/screenshots/{object_key:path}")
async def serve_screenshot(
    object_key: str,
    current_user: User = Depends(get_current_admin_or_employee)
):
    """
    Internal endpoint — called by Next.js proxy only.
    Fetches screenshot from MinIO and streams it to the caller.
    """
    try:
        response = minio_client.get_object(
            bucket_name=SCREENSHOT_MINIO_BUCKET,
            object_name=object_key
        )
        content = response.read()
        content_type = response.headers.get('content-type', 'image/png')
        response.close()
        response.release_conn()

        return Response(
            content=content,
            media_type=content_type
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Screenshot not found")
```

**Why screenshots are served through the proxy and not directly from MinIO:**
- The MinIO bucket is private — no public access
- Screenshots may contain sensitive SAP configuration data, field values,
  or financial information
- Authentication ensures only logged-in AEGIS users can access them
- The 24h cache is safe because screenshots on active entries are never
  modified (the object key includes a UUID preventing collision)

---

## 7. SCREENSHOT LIFECYCLE MANAGEMENT

### 7.1 Eligibility criteria

A screenshot becomes eligible for MinIO deletion when BOTH conditions are true:
1. The screenshot's version is at least 2 versions older than the entry's
   current version (i.e., `entry.version - screenshot.version >= 2`)
2. The entry has been in 'archived' status for at least 90 days

Condition 1 ensures screenshots from replaced versions are cleaned up.
Condition 2 ensures screenshots are retained for potential rollbacks within
the 90-day window.

### 7.2 Nightly cleanup job

**Job name:** `cleanup_eligible_screenshots`
**Schedule:** `0 1 * * *` — 01:00 IST (19:30 UTC previous day)
**Registered in:** APScheduler alongside `check_config_staleness`

```python
async def cleanup_eligible_screenshots():
    """
    Nightly job that identifies and removes screenshot files from MinIO
    that are no longer needed. Runs at 01:00 IST.
    """
    db    = get_db_session()
    minio = get_minio_client()

    # Find eligible screenshots
    eligible = await db.fetch(
        """SELECT kfs.id, kfs.minio_object_key, kfs.entry_id
           FROM knowledge_form_screenshots kfs
           JOIN knowledge_form_entries kfe ON kfe.id = kfs.entry_id
           WHERE kfs.eligible_for_cleanup = FALSE
             AND (kfe.version - kfs.version) >= 2
             AND (
                  kfe.status = 'archived'
                  AND (NOW() - kfe.updated_at) > INTERVAL '90 days'
                  OR
                  kfe.version - kfs.version >= 5  -- old versions on active entries
             )
        """
    )

    deleted_count = 0
    failed_count = 0

    for row in eligible:
        try:
            minio.remove_object(
                bucket_name=SCREENSHOT_MINIO_BUCKET,
                object_name=row['minio_object_key']
            )
            await db.execute(
                "UPDATE knowledge_form_screenshots SET eligible_for_cleanup=TRUE WHERE id=$1",
                row['id']
            )
            deleted_count += 1
            logger.info(f"cleanup_eligible_screenshots: deleted {row['minio_object_key']}")

        except Exception as e:
            failed_count += 1
            logger.error(f"cleanup_eligible_screenshots: failed to delete {row['minio_object_key']}: {e}")

    logger.info(
        f"cleanup_eligible_screenshots: completed. "
        f"deleted={deleted_count}, failed={failed_count}"
    )
    return {"deleted": deleted_count, "failed": failed_count}
```

### 7.3 Storage metrics

The pipeline health endpoint (IMPL_25 Endpoint 14) includes:

```python
# MinIO storage metrics
total_screenshot_bytes = sum(
    stat.size
    for stat in minio.list_objects(SCREENSHOT_MINIO_BUCKET, recursive=True)
)

eligible_for_cleanup = await db.fetchval(
    "SELECT COUNT(*) FROM knowledge_form_screenshots WHERE eligible_for_cleanup = TRUE"
)
```

---

## 8. ADDITION TO IMPL_13_VISION_SERVICE.MD

Append to IMPL_13:

```
---
## QUICK ENTRY INGESTION-TIME VISION USAGE

The `aegis-ollama-vision` service is used in two patterns:

PATTERN 1 (existing): Employee query-time vision
  Employee attaches a screenshot to a query.
  The CRAG pipeline calls the vision model to analyse the screenshot
  in context of the employee's question.
  This was the original use case for aegis-ollama-vision.

PATTERN 2 (new — Quick Entry): Admin ingestion-time vision
  IT admin uploads a screenshot alongside a Quick Entry form submission.
  The vision model runs at ingestion time (not query time) to extract
  all visible SAP content from the screenshot.
  The extracted text is appended to the relevant knowledge chunk in Qdrant.
  At employee query time: zero vision processing — only stored text retrieval.

PATTERN 2 DETAILS:
  Service: aegis-ollama-vision (same Docker container)
  Model:   llava:13b (same model)
  Client:  app/clients/ollama_vision.py (new — specific to Quick Entry)
  Calls:   Two prompts per screenshot:
           1. SAP classification (classify_sap) — 15s timeout
           2. Content extraction (extract_sap_content) — 30s timeout
  Called from: ARQ task enrich_entry_screenshots (IMPL_28)
  Impact on existing usage: none — separate client, separate call path

RESOURCE CONSIDERATION:
  Both pattern 1 and pattern 2 use the same LLaVA 13B model on the same
  GPU. If screenshot enrichment is running concurrently with employee
  queries that include screenshots, GPU memory contention is possible.
  Mitigation: The ARQ screenshot task is lower priority than the employee
  query path (ARQ runs asynchronously). Employee queries are synchronous
  and use a separate HTTP connection to the vision service.
  Monitoring: If vision service response times exceed 20s during peak
  employee usage, consider scheduling screenshot enrichment tasks during
  off-peak hours (e.g., outside 8am-6pm IST).
```

---

*IMPL_28 — Quick Entry Screenshot Pipeline | AEGIS v1.0 | Sona Comstar*
