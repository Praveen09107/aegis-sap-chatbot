# AMENDMENT: OBJECT STORAGE (MINIO)
## Cross-Cutting Addition — Attach Alongside Sessions 13, 18, 21, and 28
## Place in: specs/tier1_amendments/AMENDMENT_OBJECT_STORAGE_MINIO.md
## Governing decision: DECISIONS_LOG.md DEC-024 (rationale, alternatives considered, and full historical account — not repeated here)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

This document is not a standalone session. It is a cross-cutting amendment attached **alongside** the relevant `IMPL_XX` document whenever you build or retrofit one of four affected areas. It adds MinIO (S3-compatible object storage) as a 20th service.

**Attach:** `AEGIS_MASTER_REFERENCE.md`, `AEGIS_DATA_CONTRACTS.md`, `AEGIS_CONFIGURATION_CONSTANTS.md`, this document, **and** whichever of `IMPL_18`, `IMPL_13`, `IMPL_21`, `IMPL_28` you are currently building or retrofitting.

**Read this document completely before creating or modifying any file.**

**How to use this document depending on which session you are running:**
- **Building `IMPL_18` (not yet implemented):** apply FILE 1, FILE 2, FILE 3, FILE 4, and FILE 5 below as part of that build.
- **Retrofitting `IMPL_13` (already implemented):** apply FILE 1 (if not already created by a prior session), FILE 2, FILE 3, and FILE 7 below.
- **Retrofitting `IMPL_21`'s existing output (already implemented):** apply FILE 6, FILE 8, and FILE 9 below.
- **Building `IMPL_28` (not yet implemented):** apply FILE 1 (if not already created), FILE 2, FILE 3, and FILE 10 below.

**Files created or modified by this amendment, in total:**
- `backend/app/infrastructure/minio_client.py` — NEW
- `docker-compose.yml` — adds the `aegis-minio` service
- `.env.example` — adds 7 MinIO environment variables
- `database/migrations/005_minio_object_keys.sql` — NEW (adds `minio_object_key` column)
- `backend/app/services/ingestion_pipeline.py` — Stage 1 addition (part of `IMPL_18`'s own build)
- `backend/app/handlers/admin_handler.py` — adds a document-download endpoint and adds deletion-cleanup to the existing delete handler
- `backend/app/tasks/vision_task.py` — adds a MinIO write inside `process_vision_task()`, before the Ollama vision call
- `backend/app/main.py` — adds `minio` as a 6th key in the `/health` aggregation
- Whatever file `IMPL_28` creates for its screenshot handler — Stage addition (part of `IMPL_28`'s own build)

---

## FILE 1: backend/app/infrastructure/minio_client.py (NEW)

```python
"""
AEGIS MinIO Client
S3-compatible object storage for original documents and screenshots.
Wraps the synchronous minio-py SDK with asyncio.to_thread() for all
blocking calls, since the SDK has no native async support. A direct
call to any SDK method from inside an async def function blocks the
FastAPI event loop for the duration of the network call — every method
below must go through asyncio.to_thread().
"""
import asyncio
import logging
from datetime import timedelta
from io import BytesIO

from minio import Minio
from minio.error import S3Error

from app.config import settings

logger = logging.getLogger(__name__)


class MinioClient:
    def __init__(self):
        self._client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
            region=settings.MINIO_REGION,
        )

    async def ensure_buckets(self) -> None:
        """Idempotent bucket creation. Call once at application startup."""
        for bucket in [settings.MINIO_BUCKET_DOCUMENTS, settings.MINIO_BUCKET_SCREENSHOTS]:
            exists = await asyncio.to_thread(self._client.bucket_exists, bucket)
            if not exists:
                await asyncio.to_thread(self._client.make_bucket, bucket)
                logger.info(f"Created MinIO bucket: {bucket}")

    async def put_object(self, bucket: str, object_key: str, data: bytes, content_type: str) -> str:
        """
        Uploads an object, overwriting silently if the key already exists.
        Overwrite-on-reingest is intentional — mirrors IMPL_06's
        delete_by_document_id + reinsert pattern for Qdrant, not a
        versioned-storage design.
        """
        try:
            await asyncio.to_thread(
                self._client.put_object,
                bucket, object_key, BytesIO(data),
                length=len(data), content_type=content_type,
            )
            return object_key
        except S3Error as e:
            logger.error(f"MinIO put_object failed: bucket={bucket} key={object_key} error={e}")
            raise

    async def get_object(self, bucket: str, object_key: str) -> tuple[bytes, str]:
        """
        Fetches raw object bytes + content-type for streaming through a
        FastAPI response. Used for admin retrieval (FILE 6) — never give
        the frontend a presigned URL, since MINIO_ENDPOINT is an internal
        Docker hostname unreachable from a browser.
        """
        def _fetch():
            response = self._client.get_object(bucket, object_key)
            try:
                data = response.read()
                content_type = response.headers.get("Content-Type", "application/octet-stream")
                return data, content_type
            finally:
                response.close()
                response.release_conn()
        return await asyncio.to_thread(_fetch)

    async def delete_prefix(self, bucket: str, prefix: str) -> int:
        """Deletes all objects under a key prefix. Used for reingestion cleanup and deletion cascades."""
        objects = await asyncio.to_thread(
            lambda: list(self._client.list_objects(bucket, prefix=prefix, recursive=True))
        )
        count = 0
        for obj in objects:
            await asyncio.to_thread(self._client.remove_object, bucket, obj.object_name)
            count += 1
        return count

    async def health_check(self) -> dict:
        try:
            await asyncio.to_thread(self._client.bucket_exists, settings.MINIO_BUCKET_DOCUMENTS)
            return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


minio_client = MinioClient()
```

Add a call to `minio_client.ensure_buckets()` in `main.py`'s existing startup sequence, alongside the other client connections established in `IMPL_21`. If MinIO is unreachable at startup, allow it to raise — startup should fail entirely, consistent with how Postgres/Redis/Qdrant connection failures already behave.

After creating, verify:
```bash
cd backend && source venv/bin/activate
python -c "from app.infrastructure.minio_client import minio_client; print('MinIO client OK')"
```

---

## FILE 2: docker-compose.yml (ADD SERVICE)

Open the existing `docker-compose.yml` and add this service definition. Do not replace the file — add this block alongside the other data-layer services:

```yaml
aegis-minio:
  image: minio/minio:latest
  container_name: aegis-minio
  restart: unless-stopped
  command: server /data --console-address ":9001"
  environment:
    - MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
    - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}
  volumes:
    - minio_data:/data
  networks:
    - nexus-data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 10s
```

Add `minio_data:` to the top-level `volumes:` section. **Network is `nexus-data` only** — do not add `aegis-minio` to `nexus-ai` or `nexus-public`. Do not publish port 9000 or 9001 to the host; the service is reached only via the internal Docker network by `minio_client.py`.

After adding, verify:
```bash
docker compose config --services | grep aegis-minio
docker compose up -d aegis-minio
docker ps --filter "name=aegis-minio" --format "{{.Status}}"
```

---

## FILE 3: .env.example (ADD VARIABLES)

Open the existing `.env.example` and confirm/add these lines (the first six already exist as placeholders from earlier planning; `MINIO_REGION` is new):

```bash
# ADD TO: Object Storage section
MINIO_ENDPOINT=aegis-minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=REPLACE_strong_password
MINIO_BUCKET_DOCUMENTS=aegis-documents
MINIO_BUCKET_SCREENSHOTS=knowledge-screenshots
MINIO_USE_SSL=false
MINIO_REGION=us-east-1
```

`MINIO_REGION` is required for `minio-py` SDK signature compatibility even against a non-AWS endpoint; `us-east-1` is a placeholder with no geographic meaning here.

---

## FILE 4: backend/app/services/ingestion_pipeline.py — Stage 1 Addition (apply when building IMPL_18)

Within Stage 1 (file receipt/validation) of the ingestion pipeline you are building for `IMPL_18`, insert this immediately after MIME-type and size validation (`MAX_DOCUMENT_BYTES`, already defined per `IMPL_21`), **before** Stage 2 (field detection/parsing) begins:

```python
# STAGE 1 ADDITION — persist the original file to MinIO before any parsing.
# A failure here aborts ingestion entirely (fatal) — a document that can't
# be durably stored should not proceed to be chunked and indexed.

from app.infrastructure.minio_client import minio_client

object_key = f"{document_id}/{original_filename}"

await minio_client.delete_prefix(
    bucket=settings.MINIO_BUCKET_DOCUMENTS,
    prefix=f"{document_id}/",
)  # clears any prior object for this document_id on reingestion

try:
    await minio_client.put_object(
        bucket=settings.MINIO_BUCKET_DOCUMENTS,
        object_key=object_key,
        data=file_bytes,
        content_type=detected_mime_type,
    )
except Exception as e:
    logger.error(f"Failed to persist document to MinIO before ingestion: {e}")
    raise IngestionError("Could not durably store the uploaded document; ingestion aborted.")

# Store object_key in the documents_registry row you create in this stage
# (column added by FILE 5): minio_object_key = object_key
```

---

## FILE 5: database/migrations/005_minio_object_keys.sql (NEW)

```sql
-- Migration 005: Add MinIO object key tracking to documents_registry
-- Depends on: 001_operational_schema.sql (documents_registry table)

ALTER TABLE documents_registry
  ADD COLUMN minio_object_key TEXT;

COMMENT ON COLUMN documents_registry.minio_object_key IS
  'Object key in the aegis-documents MinIO bucket, format: {document_id}/{original_filename}';
```

After creating, verify:
```bash
docker exec aegis-pgbouncer psql -h localhost -p 6432 -U aegis_user -d aegis_db -f database/migrations/005_minio_object_keys.sql
docker exec aegis-pgbouncer psql -h localhost -p 6432 -U aegis_user -d aegis_db -c "\d documents_registry" | grep minio_object_key
```

---

## FILE 6: backend/app/handlers/admin_handler.py (ADD ENDPOINTS AND CLEANUP)

Open the existing `admin_handler.py` (created in Session 21 — do not replace it, add the following).

**6a — new download endpoint:**

```python
# ADD THIS ENDPOINT to admin_handler.py

@router.get("/admin/documents/{document_id}/download")
async def download_document(
    document_id: str,
    current_user: dict = Depends(require_admin_role),
):
    record = await postgres_client.fetchrow(
        "SELECT minio_object_key, original_filename FROM documents_registry WHERE document_id = $1",
        document_id,
    )
    if not record:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        data, content_type = await minio_client.get_object(
            bucket=settings.MINIO_BUCKET_DOCUMENTS,
            object_key=record["minio_object_key"],
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Stored file not found in object storage")

    await audit_log.record(action="document_downloaded", actor=current_user["sub"], target=document_id)

    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{record["original_filename"]}"'},
    )
```

**6b — add cleanup to the existing document-delete handler:**

```python
# FIND the existing document-deletion handler's body, immediately after
# the DELETE FROM documents_registry statement, and ADD:

await minio_client.delete_prefix(
    bucket=settings.MINIO_BUCKET_DOCUMENTS,
    prefix=f"{document_id}/",
)
```

After adding, verify:
```bash
grep -n "download_document\|delete_prefix" backend/app/handlers/admin_handler.py
```

---

## FILE 7: backend/app/tasks/vision_task.py (RETROFIT — apply to the existing IMPL_11/IMPL_13 implementation)

**Correction to an earlier draft of this document:** this touchpoint was originally written against `vision_integration.py`. Direct verification against `IMPL_11_ORCHESTRATION_ZONE_B.md`'s actual FILE 4 content shows `vision_integration.py` contains no model-calling code at all — it is purely a `DiagnosticObject` formatting/enrichment service. The real Ollama vision API call lives in `backend/app/tasks/vision_task.py`'s `process_vision_task()` ARQ task handler. This section is corrected accordingly.

Open the existing `vision_task.py` (created in Session 11 — do not replace it).

```python
# FIND Step 2 in the existing process_vision_task() function:
#     with open(file_path, "rb") as f:
#         image_bytes = f.read()
#     image_b64 = base64.b64encode(image_bytes).decode()
#
# INSERT immediately after this block, before Step 3 (the Ollama vision call):

from app.infrastructure.minio_client import minio_client
from uuid import uuid4

screenshot_id = str(uuid4())
object_key = f"{session_id}/{screenshot_id}{ext}"

try:
    await minio_client.put_object(
        bucket=settings.MINIO_BUCKET_SCREENSHOTS,
        object_key=object_key,
        data=image_bytes,
        content_type=mime_type,
    )
except Exception as e:
    # Non-fatal — the employee is waiting for their vision-based answer;
    # persistence failure does not block the Ollama call that follows.
    logger.warning(f"Failed to persist screenshot to MinIO (non-fatal): {e}")

# Existing flow continues unchanged from Step 3 onward — the Ollama vision
# call, DiagnosticObject parsing, Redis storage, and the finally block's
# temp-file cleanup (os.remove(file_path)) are all untouched. Note that
# the MinIO write MUST happen before this function's finally block runs,
# since that block deletes file_path from disk — this insertion point
# (immediately after image_bytes is read) is the only correct place.
```

Everything else in the existing function — the Ollama `/api/chat` call, `_parse_diagnostic_object()`, the Redis `set_diagnostic_object`/`publish_vision_complete` calls, and the `finally` block's temp-file cleanup — is unchanged.

After modifying, verify:
```bash
grep -n "minio_client.put_object" backend/app/tasks/vision_task.py
```

---

## FILE 8: backend/app/main.py (RETROFIT — apply to the existing IMPL_21 implementation)

Open the existing `main.py` (created in Session 3, extended in Session 21 — do not replace it).

```python
# FIND the existing health_check() aggregation function's services dict
# construction, and ADD this line alongside the five that already exist
# (redis_session, redis_queue, qdrant, opensearch, postgres):

services["minio"] = await minio_client.health_check()
```

No other change to the health-check function is required — the existing overall-status logic already iterates the services dict generically.

After modifying, verify:
```bash
curl -s http://localhost:8000/health | python3 -m json.tool
# Expected keys: redis_session, redis_queue, qdrant, opensearch, postgres, minio
```

---

## FILE 9: IMPL_28's Vision Client Module — Two Corrections (apply when building IMPL_28)

`IMPL_28` already specifies its own complete MinIO upload and cleanup system (upload sequence, nightly eligibility-based cleanup job) — no write-on-upload or cleanup logic is added by this amendment. See `DECISIONS_LOG.md` DEC-034 for the full account of what `IMPL_28` already covers and why. Two small corrections keep its self-contained design consistent with the shared bucket configuration in FILE 3 of this document:

**Correction A — bucket variable name.**
```python
# FIND (in IMPL_28's Vision Client Module, near VISION_SERVICE_URL/VISION_MODEL):
SCREENSHOT_MINIO_BUCKET = "knowledge-screenshots"  # or wherever this is referenced

# REPLACE WITH — use the shared config.py constant instead of a redundant local one:
from app.config import MINIO_BUCKET_SCREENSHOTS as SCREENSHOT_MINIO_BUCKET
```

**Correction B — object key redundancy** (`knowledge-screenshots` is already the bucket name, making the prefix inside the key redundant):
```python
# FIND:
object_key = f"knowledge-screenshots/{entry_id}/{uuid4()}-{safe_name}"

# REPLACE WITH:
object_key = f"{entry_id}/{uuid4()}-{safe_name}"
```

This matches the `{identifier}/{filename}` key convention used elsewhere in this amendment (Section 4.2), without changing any of `IMPL_28`'s upload or cleanup logic.

After confirming, verify:
```bash
grep -n "MINIO_BUCKET_SCREENSHOTS\|SCREENSHOT_MINIO_BUCKET" backend/app/services/quick_entry_screenshots.py  # or wherever IMPL_28 lands
# expect the shared config constant, not a redundant local one
```

---

## VERIFICATION STEPS

```bash
# Service and network
docker compose config --services | grep aegis-minio
docker ps --filter "name=aegis-minio" --format "{{.Status}}"
docker port aegis-minio  # expect empty — no published ports
docker exec aegis-ollama curl -sf http://aegis-minio:9000/minio/health/live  # expect failure — no route from nexus-ai

# Buckets
docker exec aegis-minio mc alias set local http://localhost:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
docker exec aegis-minio mc ls local  # expect aegis-documents/ and knowledge-screenshots/

# Client and integration points
python -c "from app.infrastructure.minio_client import minio_client; print('OK')"
grep -n "minio_client.put_object" backend/app/tasks/vision_task.py
grep -n "download_document\|delete_prefix" backend/app/handlers/admin_handler.py

# Schema
docker exec aegis-pgbouncer psql -h localhost -p 6432 -U aegis_user -d aegis_db -c "\d documents_registry" | grep minio_object_key

# Health endpoint
curl -s http://localhost:8000/health | python3 -m json.tool  # expect 6 keys including minio

# End-to-end: upload a document through the real ingestion flow, then
docker exec aegis-minio mc ls local/aegis-documents/<document_id>/  # expect exactly one object

# Reingest the same document_id and confirm overwrite, not duplication
docker exec aegis-minio mc ls local/aegis-documents/<document_id>/  # still exactly one object

# Delete the document via the admin portal and confirm cleanup
docker exec aegis-minio mc ls local/aegis-documents/<deleted_document_id>/  # expect empty/not found

# Admin download endpoint (requires a valid it-admin JWT)
curl -s -H "Authorization: Bearer <admin_token>" http://localhost:8000/admin/documents/<document_id>/download -o /tmp/test_download
file /tmp/test_download
```

---

## WHEN ALL VERIFICATIONS PASS

Add an entry to `DECISIONS_LOG.md`'s cross-reference index confirming which sessions this amendment was applied to and on what date. If this amendment was applied during a fresh `IMPL_18` or `IMPL_28` build, continue with that session's own remaining steps. If applied as a retrofit to already-implemented `IMPL_13` or `IMPL_21` output, run the full existing test suite for those sessions before moving on, to confirm the addition introduced no regression:

```bash
python -m pytest tests/unit/test_vision_task.py tests/unit/test_admin_handler.py -v
```
