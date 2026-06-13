# IMPL_26 — QUICK ENTRY: PROCESSING PIPELINE
## AEGIS SAP Helpdesk AI — ARQ Task Implementation for Quick Entry
## Depends on: IMPL_23, IMPL_24, IMPL_25, IMPL_27

---

## 1. OVERVIEW

This document specifies the complete ARQ background processing pipeline for
Quick Entry submissions. It covers three ARQ tasks:

1. `process_form_entry` — main processing task (Stages A1–A13)
2. `retry_partial_indexing` — retries failed Qdrant/OpenSearch insertions
3. Interaction with `enrich_entry_screenshots` (defined in IMPL_28)

The pipeline is registered in the existing ARQ worker configuration file.
No existing tasks are modified. The new tasks use the same Redis queue as
all other ARQ tasks.

---

## 2. ARQ TASK REGISTRATION

In the existing ARQ worker configuration file (`app/worker.py` or equivalent):

```python
# ADD to the functions list in WorkerSettings:
from app.tasks.process_form_entry import process_form_entry
from app.tasks.retry_partial_indexing import retry_partial_indexing
from app.tasks.enrich_entry_screenshots import enrich_entry_screenshots

class WorkerSettings:
    functions = [
        # ... existing tasks unchanged ...
        process_form_entry,
        retry_partial_indexing,
        enrich_entry_screenshots,
    ]
    queue_name = 'aegis-worker'  # same queue as existing tasks
    max_jobs = 10                # existing setting unchanged
```

---

## 3. TASK: process_form_entry

**File:** `app/tasks/process_form_entry.py`
**Trigger:** Enqueued by POST /api/admin/knowledge-entries (publish=true) and
             PUT /api/admin/knowledge-entries/{id} (publish=true) and
             POST /api/admin/knowledge-entries/{id}/publish

**Signature:** `async def process_form_entry(ctx: dict, entry_id: str) -> dict`

**Context object `ctx` contains:**
- `ctx['db']` — async database session
- `ctx['qdrant']` — Qdrant async client
- `ctx['opensearch']` — OpenSearch async client
- `ctx['bge_client']` — BGE embedding client (same as used by document pipeline)
- `ctx['entity_extractor']` — SAP entity extraction service
- `ctx['quality_scorer']` — quality scoring service
- `ctx['arq']` — ARQ pool for enqueueing follow-up tasks

---

### STAGE A1 — LOAD ENTRY

```python
entry = await db.fetch_one(
    "SELECT * FROM knowledge_form_entries WHERE id = $1",
    entry_id
)

if not entry:
    # Entry was deleted between enqueueing and execution (race condition)
    # Log and exit silently
    logger.warning(f"process_form_entry: entry {entry_id} not found. Skipping.")
    return {"status": "skipped", "reason": "entry_not_found"}

if entry['status'] not in ('processing',):
    # Entry moved to a terminal state (e.g. archived) since task was queued
    logger.info(f"process_form_entry: entry {entry_id} status is {entry['status']}. Skipping.")
    return {"status": "skipped", "reason": f"unexpected_status: {entry['status']}"}

run_id = str(uuid4())
started_at = datetime.now(timezone.utc)
log = ProcessingLogBuilder(run_id, started_at, entry_id, entry['version'])
```

The `ProcessingLogBuilder` is a helper class that accumulates stage results
and produces the final `processing_log` JSONB object. It does not write to DB
incrementally — it writes once at task completion.

---

### STAGE A2 — DEFENCE-IN-DEPTH SCHEMA VALIDATION

```python
t0 = time.time()
validation_errors = validate_form_schema(
    content_type=entry['content_type'],
    form_data=entry['form_data']
)
duration_ms = int((time.time() - t0) * 1000)

if validation_errors:
    log.record_stage('validation', status='failed', duration_ms=duration_ms,
                     errors=validation_errors)
    await db.execute(
        "UPDATE knowledge_form_entries SET status='failed', processing_log=$1 WHERE id=$2",
        log.build(overall_status='failed', failure_stage='validation',
                  failure_reason=str(validation_errors)),
        entry_id
    )
    logger.error(f"process_form_entry: validation failed for {entry_id}: {validation_errors}")
    return {"status": "failed", "stage": "validation"}

log.record_stage('validation', status='success', duration_ms=duration_ms, errors=[])
```

---

### STAGE A3 — RETIRE OLD CHUNKS (UPDATE ONLY)

Only executes when `entry['version'] > 1`. For new entries (version 1) this
stage is skipped.

```python
if entry['version'] > 1:
    # Load all current chunks for previous versions
    old_chunks = await db.fetch(
        """SELECT qdrant_point_id FROM knowledge_form_entry_chunks
           WHERE entry_id = $1 AND is_current = TRUE""",
        entry_id
    )

    # Retire in Qdrant (set is_current=false in payload)
    for chunk_row in old_chunks:
        point_id = chunk_row['qdrant_point_id']
        try:
            await qdrant.set_payload(
                collection_name="aegis_knowledge",
                payload={"is_current": False},
                points=[str(point_id)]
            )
        except Exception as e:
            # Log but continue — Qdrant consistency reconciled by cleanup job
            logger.warning(f"Qdrant retire failed for point {point_id}: {e}")

    # Retire in OpenSearch
    for chunk_row in old_chunks:
        point_id = str(chunk_row['qdrant_point_id'])
        try:
            await opensearch.update(
                index="aegis_knowledge",
                id=point_id,
                body={"doc": {"is_current": False}}
            )
        except Exception as e:
            logger.warning(f"OpenSearch retire failed for point {point_id}: {e}")

    # Mark as not current in DB (authoritative source)
    await db.execute(
        """UPDATE knowledge_form_entry_chunks
           SET is_current = FALSE
           WHERE entry_id = $1 AND version < $2""",
        entry_id, entry['version']
    )
```

---

### STAGE A4 — STRUCTURE-AWARE CHUNK ASSEMBLY

```python
t0 = time.time()
from app.services.form_chunker import assemble_chunks

# assemble_chunks is documented completely in IMPL_27
raw_chunks = assemble_chunks(
    entry_id=entry['id'],
    document_id=entry['document_id'],
    content_type=entry['content_type'],
    module=entry['module'],
    transactions=entry['transactions'],
    verified_by_name=entry['verified_by_name'],
    verified_date=entry['verified_date'],
    form_data=entry['form_data'],
    version=entry['version']
)
# raw_chunks is a list of dicts:
# {chunk_type: str, text: str, associated_section: str}

duration_ms = int((time.time() - t0) * 1000)
log.record_stage('chunk_assembly', status='success', duration_ms=duration_ms,
                 chunks_assembled=len(raw_chunks),
                 chunk_types=[c['chunk_type'] for c in raw_chunks])
```

If `assemble_chunks` raises an exception, catch it and fail the task:
```python
except Exception as e:
    log.record_stage('chunk_assembly', status='failed', duration_ms=duration_ms)
    await fail_entry(db, entry_id, log, 'chunk_assembly', str(e))
    return {"status": "failed", "stage": "chunk_assembly"}
```

---

### STAGE A5 — SAP ENTITY EXTRACTION

```python
t0 = time.time()
all_entities = {'t_codes': set(), 'error_codes': set()}

for chunk in raw_chunks:
    entities = await entity_extractor.extract(chunk['text'])
    chunk['extracted_t_codes'] = entities['t_codes']
    chunk['extracted_error_codes'] = entities['error_codes']
    all_entities['t_codes'].update(entities['t_codes'])
    all_entities['error_codes'].update(entities['error_codes'])

duration_ms = int((time.time() - t0) * 1000)
log.record_stage('entity_extraction', status='success', duration_ms=duration_ms,
                 t_codes_found=list(all_entities['t_codes']),
                 error_codes_found=list(all_entities['error_codes']))
```

---

### STAGE A6 — SCREENSHOT PRESENCE DETECTION

This stage determines which chunks have associated screenshots so the
`has_screenshots` and `screenshot_ids` fields are correctly set in Qdrant.

```python
screenshots = await db.fetch(
    """SELECT id, associated_section FROM knowledge_form_screenshots
       WHERE entry_id = $1 AND version = $2""",
    entry_id, entry['version']
)

# Build section → screenshot_id mapping
section_screenshots: dict[str, list[str]] = {}
for screenshot_row in screenshots:
    section = screenshot_row['associated_section']
    if section not in section_screenshots:
        section_screenshots[section] = []
    section_screenshots[section].append(str(screenshot_row['id']))

# Annotate each chunk
for chunk in raw_chunks:
    section_ids = section_screenshots.get(chunk['associated_section'], [])
    chunk['has_screenshots'] = len(section_ids) > 0
    chunk['screenshot_ids'] = section_ids
```

---

### STAGE A7 — BGE EMBEDDING

```python
t0 = time.time()
chunk_texts = [c['text'] for c in raw_chunks]

try:
    vectors = await bge_client.encode_batch(chunk_texts)
    # vectors is a list of list[float], one per chunk
except Exception as e:
    log.record_stage('embedding', status='failed', duration_ms=int((time.time()-t0)*1000))
    await fail_entry(db, entry_id, log, 'embedding', str(e))
    # Retry: ARQ will retry this task up to 3 times with exponential backoff
    raise  # re-raise to trigger ARQ retry

for i, chunk in enumerate(raw_chunks):
    chunk['vector'] = vectors[i]

duration_ms = int((time.time() - t0) * 1000)
log.record_stage('embedding', status='success', duration_ms=duration_ms,
                 chunks_embedded=len(raw_chunks),
                 model_used=bge_client.model_name)
```

**Retry behaviour:** If BGE fails, re-raising the exception causes ARQ to
retry the task. ARQ is configured with exponential backoff: 30s, 90s, 270s.
After 3 failed attempts, the task is marked failed and the entry status is
set to 'failed' by the dead-letter handler (registered in ARQ worker config).

---

### STAGE A8 — QUALITY SCORING

```python
t0 = time.time()
quality_scores = []
per_chunk_scores = {}

for chunk in raw_chunks:
    score = await quality_scorer.score(
        text=chunk['text'],
        content_type=entry['content_type']
    )
    chunk['quality_score'] = score
    chunk['original_quality_score'] = score  # preserved permanently
    quality_scores.append(score)
    per_chunk_scores[chunk['chunk_type']] = score

avg_quality = sum(quality_scores) / len(quality_scores)
duration_ms = int((time.time() - t0) * 1000)

if avg_quality < QUICK_ENTRY_QUALITY_THRESHOLD:
    log.record_stage('quality_scoring', status='below_threshold',
                     duration_ms=duration_ms, avg_score=avg_quality,
                     threshold_used=QUICK_ENTRY_QUALITY_THRESHOLD,
                     per_chunk_scores=per_chunk_scores)
    await db.execute(
        "UPDATE knowledge_form_entries SET status='low_quality', processing_log=$1 WHERE id=$2",
        log.build(overall_status='low_quality', failure_stage='quality_scoring',
                  failure_reason=f"Average quality score {avg_quality:.3f} below threshold {QUICK_ENTRY_QUALITY_THRESHOLD}"),
        entry_id
    )
    logger.warning(f"process_form_entry: quality below threshold for {entry_id}: {avg_quality:.3f}")
    return {"status": "low_quality", "avg_quality": avg_quality}

log.record_stage('quality_scoring', status='success', duration_ms=duration_ms,
                 avg_score=avg_quality, threshold_used=QUICK_ENTRY_QUALITY_THRESHOLD,
                 per_chunk_scores=per_chunk_scores)
```

---

### STAGE A9 — SEMANTIC DEDUPLICATION SCAN

Informational only — does not block processing. Used to populate the
`deduplication` stage in processing_log and to surface similar entries
to the admin in the processing results.

```python
t0 = time.time()
similar_entries = []
overview_chunk = next((c for c in raw_chunks if 'overview' in c['chunk_type']), raw_chunks[0])

try:
    results = await qdrant.search(
        collection_name="aegis_knowledge",
        query_vector=overview_chunk['vector'],
        limit=3,
        score_threshold=QUICK_ENTRY_DEDUP_THRESHOLD,  # 0.92
        query_filter={
            "must": [
                {"key": "module", "match": {"value": entry['module']}},
                {"key": "is_current", "match": {"value": True}},
                {"key": "document_id",
                 "match": {"except": [entry['document_id']]}}
                # Exclude this entry's own document_id (for updates)
            ]
        }
    )
    similar_entries = [
        {"document_id": r.payload['document_id'], "similarity_score": r.score}
        for r in results
    ]
except Exception as e:
    logger.warning(f"Deduplication scan failed (non-blocking): {e}")

duration_ms = int((time.time() - t0) * 1000)
log.record_stage('deduplication', status='success', duration_ms=duration_ms,
                 similar_entries=similar_entries)
```

---

### STAGE A10 — QDRANT INSERTION

Each chunk is inserted individually. Failures are tracked per-chunk and per-store.
The overall task does NOT abort on individual chunk insertion failure.

```python
t0 = time.time()
qdrant_point_ids = {}
qdrant_failed_types = []
qdrant_succeeded = 0

for chunk in raw_chunks:
    point_id = str(uuid4())
    chunk['point_id'] = point_id  # stored for OpenSearch step

    payload = {
        # Standard fields (same as document chunks)
        "text":             chunk['text'],
        "document_id":      entry['document_id'],
        "content_type":     entry['content_type'],
        "module":           entry['module'],
        "transactions":     entry['transactions'],
        "is_current":       True,
        "quality_score":    chunk['quality_score'],
        "verified_by":      entry['verified_by_name'],
        "verified_date":    str(entry['verified_date']),
        # Quick Entry-specific fields
        "source_type":          "form_entry",
        "form_entry_id":        entry_id,
        "version":              entry['version'],
        "chunk_type":           chunk['chunk_type'],
        "has_screenshots":      chunk['has_screenshots'],
        "screenshot_ids":       chunk['screenshot_ids'],
        "is_stale":             False,
        "original_quality_score": chunk['original_quality_score'],
        # Entity fields
        "sap_t_codes":      chunk.get('extracted_t_codes', []),
        "sap_error_codes":  chunk.get('extracted_error_codes', []),
    }

    qdrant_status = 'success'
    try:
        await qdrant.upsert(
            collection_name="aegis_knowledge",
            points=[PointStruct(id=point_id, vector=chunk['vector'], payload=payload)]
        )
        qdrant_succeeded += 1
        qdrant_point_ids[chunk['chunk_type']] = point_id
    except Exception as e:
        logger.error(f"Qdrant upsert failed for chunk {chunk['chunk_type']} in {entry_id}: {e}")
        qdrant_status = 'failed'
        qdrant_failed_types.append(chunk['chunk_type'])

    # Write chunk record to DB regardless of Qdrant success/failure
    await db.execute(
        """INSERT INTO knowledge_form_entry_chunks
           (entry_id, version, chunk_type, qdrant_point_id, chunk_text,
            qdrant_status, opensearch_status, quality_score, original_quality_score, is_current)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)""",
        entry_id, entry['version'], chunk['chunk_type'], point_id, chunk['text'],
        qdrant_status, 'pending', chunk['quality_score'], chunk['original_quality_score']
    )
    chunk['db_qdrant_status'] = qdrant_status

duration_ms = int((time.time() - t0) * 1000)
qdrant_overall = 'success' if not qdrant_failed_types else (
    'partial' if qdrant_succeeded > 0 else 'failed'
)
log.record_stage('qdrant_insertion',
                 status=qdrant_overall,
                 duration_ms=duration_ms,
                 chunks_attempted=len(raw_chunks),
                 chunks_succeeded=qdrant_succeeded,
                 chunks_failed=len(qdrant_failed_types),
                 point_ids=qdrant_point_ids,
                 failed_chunk_types=qdrant_failed_types)
```

---

### STAGE A11 — OPENSEARCH INDEXING

```python
t0 = time.time()
os_failed_types = []
os_succeeded = 0

for chunk in raw_chunks:
    point_id = chunk['point_id']
    os_status = 'success'

    try:
        await opensearch.index(
            index="aegis_knowledge",
            id=point_id,
            body={
                "text":                  chunk['text'],
                "document_id":           entry['document_id'],
                "content_type":          entry['content_type'],
                "module":                entry['module'],
                "is_current":            True,
                "quality_score":         chunk['quality_score'],
                "source_type":           "form_entry",
                "form_entry_id":         entry_id,
                "version":               entry['version'],
                "chunk_type":            chunk['chunk_type'],
                "has_screenshots":       chunk['has_screenshots'],
                "is_stale":              False,
                "original_quality_score": chunk['original_quality_score'],
            }
        )
        os_succeeded += 1
    except Exception as e:
        logger.error(f"OpenSearch index failed for chunk {chunk['chunk_type']} in {entry_id}: {e}")
        os_status = 'failed'
        os_failed_types.append(chunk['chunk_type'])

    # Update DB chunk record with OpenSearch status
    await db.execute(
        """UPDATE knowledge_form_entry_chunks
           SET opensearch_status = $1
           WHERE entry_id = $2 AND version = $3 AND chunk_type = $4""",
        os_status, entry_id, entry['version'], chunk['chunk_type']
    )

duration_ms = int((time.time() - t0) * 1000)
os_overall = 'success' if not os_failed_types else (
    'partial' if os_succeeded > 0 else 'failed'
)
log.record_stage('opensearch_indexing',
                 status=os_overall,
                 duration_ms=duration_ms,
                 docs_attempted=len(raw_chunks),
                 docs_succeeded=os_succeeded,
                 docs_failed=len(os_failed_types),
                 failed_chunk_types=os_failed_types)
```

---

### STAGE A12 — DETERMINE FINAL STATUS

```python
qdrant_fully_ok = not qdrant_failed_types
os_fully_ok = not os_failed_types

if qdrant_fully_ok and os_fully_ok:
    final_status = 'active'
else:
    final_status = 'partial_index'
    # Queue retry task for failed chunks
    await arq.enqueue_job(
        'retry_partial_indexing',
        entry_id,
        _defer_by=timedelta(seconds=300)  # retry in 5 minutes
    )
```

---

### STAGE A13 — SCREENSHOT ENRICHMENT AND FINAL WRITES

```python
# Queue screenshot enrichment if screenshots exist
screenshots_queued = False
screenshot_task_id = None

if screenshots:  # from Stage A6
    job = await arq.enqueue_job('enrich_entry_screenshots', entry_id, entry['version'])
    screenshots_queued = True
    screenshot_task_id = job.job_id

log.record_stage('screenshot_enrichment',
                 queued=screenshots_queued,
                 screenshot_count=len(screenshots),
                 task_id=screenshot_task_id)

# Update gap_events if this entry was created from a gap
if entry['gap_id']:
    await db.execute(
        """UPDATE gap_events
           SET addressed_by_entry_id = $1, addressed_at = NOW()
           WHERE id = $2""",
        entry_id, entry['gap_id']
    )

# Write final processing log and status
final_log = log.build(
    overall_status=final_status,
    failure_stage=None,
    failure_reason=None
)
await db.execute(
    "UPDATE knowledge_form_entries SET status=$1, processing_log=$2 WHERE id=$3",
    final_status, final_log, entry_id
)

completed_at = datetime.now(timezone.utc)
total_ms = int((completed_at - started_at).total_seconds() * 1000)

logger.info(
    f"process_form_entry: completed {entry_id} "
    f"status={final_status} chunks={len(raw_chunks)} "
    f"duration={total_ms}ms"
)

return {
    "status": final_status,
    "chunks_created": len(raw_chunks),
    "avg_quality": avg_quality,
    "similar_entries_flagged": [s['document_id'] for s in similar_entries],
    "screenshots_queued": screenshots_queued,
}
```

---

## 4. HELPER: ProcessingLogBuilder

```python
class ProcessingLogBuilder:
    def __init__(self, run_id: str, started_at: datetime, entry_id: str, version: int):
        self.run_id = run_id
        self.started_at = started_at
        self.entry_id = entry_id
        self.version = version
        self.stages = {}
        self.retry_count = 0

    def record_stage(self, name: str, **kwargs):
        self.stages[name] = kwargs

    def build(self, overall_status: str, failure_stage: str | None,
              failure_reason: str | None, completed_at: datetime | None = None) -> dict:
        now = completed_at or datetime.now(timezone.utc)
        duration = int((now - self.started_at).total_seconds() * 1000)
        return {
            "run_id": self.run_id,
            "started_at": self.started_at.isoformat(),
            "completed_at": now.isoformat(),
            "total_duration_ms": duration,
            "entry_id": self.entry_id,
            "entry_version": self.version,
            "stages": self.stages,
            "overall_status": overall_status,
            "failure_stage": failure_stage,
            "failure_reason": failure_reason,
            "retry_count": self.retry_count,
            "previous_run_ids": []
        }
```

---

## 5. HELPER: fail_entry

```python
async def fail_entry(db, entry_id: str, log: ProcessingLogBuilder,
                     failure_stage: str, failure_reason: str):
    """Update entry status to failed and write processing log."""
    final_log = log.build(
        overall_status='failed',
        failure_stage=failure_stage,
        failure_reason=failure_reason
    )
    await db.execute(
        "UPDATE knowledge_form_entries SET status='failed', processing_log=$1 WHERE id=$2",
        final_log, entry_id
    )
    logger.error(
        f"process_form_entry: FAILED entry {entry_id} "
        f"at stage '{failure_stage}': {failure_reason}"
    )
```

---

## 6. TASK: retry_partial_indexing

**File:** `app/tasks/retry_partial_indexing.py`
**Trigger:** Enqueued by `process_form_entry` when `final_status = 'partial_index'`
**Signature:** `async def retry_partial_indexing(ctx: dict, entry_id: str) -> dict`
**Max retries:** 3 attempts before marking entry as 'failed'

```python
async def retry_partial_indexing(ctx: dict, entry_id: str) -> dict:
    db        = ctx['db']
    qdrant    = ctx['qdrant']
    opensearch = ctx['opensearch']
    bge_client = ctx['bge_client']

    # Load entry
    entry = await db.fetch_one("SELECT * FROM knowledge_form_entries WHERE id = $1", entry_id)
    if not entry or entry['status'] not in ('partial_index', 'active'):
        return {"status": "skipped"}

    # Load failed chunks
    failed_qdrant = await db.fetch(
        """SELECT * FROM knowledge_form_entry_chunks
           WHERE entry_id = $1 AND version = $2 AND qdrant_status = 'failed'""",
        entry_id, entry['version']
    )
    failed_os = await db.fetch(
        """SELECT * FROM knowledge_form_entry_chunks
           WHERE entry_id = $1 AND version = $2 AND opensearch_status = 'failed'""",
        entry_id, entry['version']
    )

    qdrant_fixed = 0
    os_fixed = 0
    still_failing = []

    # Retry Qdrant failures
    for chunk_row in failed_qdrant:
        try:
            # Re-embed chunk text
            vector = await bge_client.encode(chunk_row['chunk_text'])
            # Re-build payload (pull from DB chunk record + entry fields)
            payload = rebuild_qdrant_payload(entry, chunk_row)
            await qdrant.upsert(
                collection_name="aegis_knowledge",
                points=[PointStruct(
                    id=str(chunk_row['qdrant_point_id']),
                    vector=vector,
                    payload=payload
                )]
            )
            await db.execute(
                "UPDATE knowledge_form_entry_chunks SET qdrant_status='success' WHERE id=$1",
                chunk_row['id']
            )
            qdrant_fixed += 1
        except Exception as e:
            logger.error(f"retry_partial_indexing: Qdrant still failing for {chunk_row['id']}: {e}")
            still_failing.append(chunk_row['chunk_type'])

    # Retry OpenSearch failures
    for chunk_row in failed_os:
        try:
            os_doc = rebuild_opensearch_doc(entry, chunk_row)
            await opensearch.index(
                index="aegis_knowledge",
                id=str(chunk_row['qdrant_point_id']),
                body=os_doc
            )
            await db.execute(
                "UPDATE knowledge_form_entry_chunks SET opensearch_status='success' WHERE id=$1",
                chunk_row['id']
            )
            os_fixed += 1
        except Exception as e:
            logger.error(f"retry_partial_indexing: OpenSearch still failing for {chunk_row['id']}: {e}")
            if chunk_row['chunk_type'] not in still_failing:
                still_failing.append(chunk_row['chunk_type'])

    # Determine new status
    if not still_failing:
        new_status = 'active'
    else:
        # Read retry count from processing_log
        processing_log = entry['processing_log'] or {}
        retry_count = processing_log.get('retry_count', 0) + 1

        if retry_count >= 3:
            new_status = 'failed'
            logger.error(
                f"retry_partial_indexing: entry {entry_id} failed after "
                f"3 retry attempts. Chunks still failing: {still_failing}"
            )
        else:
            new_status = 'partial_index'
            # Schedule another retry
            await ctx['arq'].enqueue_job(
                'retry_partial_indexing',
                entry_id,
                _defer_by=timedelta(seconds=300 * retry_count)
                # Backoff: 5min, 10min, 15min
            )

        # Update retry_count in processing_log
        if entry['processing_log']:
            updated_log = {**entry['processing_log'], 'retry_count': retry_count}
            await db.execute(
                "UPDATE knowledge_form_entries SET processing_log=$1 WHERE id=$2",
                updated_log, entry_id
            )

    await db.execute(
        "UPDATE knowledge_form_entries SET status=$1 WHERE id=$2",
        new_status, entry_id
    )

    return {
        "status": new_status,
        "qdrant_fixed": qdrant_fixed,
        "os_fixed": os_fixed,
        "still_failing": still_failing
    }
```

---

## 7. ADDITION TO IMPL_18_INGESTION_PIPELINE.MD

Append the following section to IMPL_18:

```
---
## QUICK ENTRY PARALLEL INGESTION PATH

The Quick Entry feature (IMPL_23–IMPL_29) adds a parallel knowledge ingestion
path that runs alongside the 11-stage document pipeline without modifying it.

The Quick Entry path:
1. Bypasses Stages 1–3 (file upload, text extraction, type classification)
   because form data is already structured text with a known type.
2. Replaces Stage 6 (generic chunking) with structure-aware form chunking
   (see IMPL_27).
3. Uses the same underlying services for Stages 5, 7–11 (entity extraction,
   embedding, quality scoring, deduplication, Qdrant, OpenSearch).

Both paths deposit chunks into the same Qdrant collection and OpenSearch index.
The retrieval system (IMPL_14, IMPL_15) treats both sources identically.

See IMPL_23 for the complete architectural picture and IMPL_26 for the
ARQ task specification.
```

---

*IMPL_26 — Quick Entry Processing Pipeline | AEGIS v1.0 | Sona Comstar*
