"""
AEGIS Quick Entry — Screenshot Handler
Phase 2 (all 5 sub-parts) of IMPL_28_QUICK_ENTRY_SCREENSHOT_PIPELINE.md,
cross-referenced with IMPL_25 Section 17-19 (the 3 screenshot endpoints)
and AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 9.

Vision reuse (AMENDMENT_INFERENCE_ARCHITECTURE.md FILE 8, non-negotiable):
imports classify_sap()/extract_sap_content() from the existing, already
Cerebras/Groq-routed app/clients/ollama_vision.py — no separate vision
client, no self-hosted-model constant hardcoded here.

Real-schema/reality corrections applied (same class of gap as every prior
Quick Entry session):
  - classify_sap() returns a SAPScreenshotType enum (which kind of SAP
    screen), never an is_sap/confidence signal — IMPL_28's "reject below
    VISION_SAP_CONFIDENCE_THRESHOLD" gate cannot be built against the real
    function. Per direct confirmation: SAP-relevance rejection is instead
    derived from extract_sap_content()'s own output — if extraction comes
    back completely empty (no error codes, t-codes, field names/values,
    screen title, or message text), the screenshot is rejected as
    vision_status='not_sap' (a real, already-existing DB enum value that
    was otherwise dead). vision_confidence is left NULL — no real
    confidence number exists to store, and fabricating one isn't done here.
  - MinIO object keys use MINIO_BUCKET_SCREENSHOTS as the bucket with
    {entry_id}/{uuid4()}-{filename} keys (no redundant bucket-name prefix
    inside the key), per AMENDMENT_OBJECT_STORAGE_MINIO.md FILE 9.
  - minio_client's real methods are put_object/get_object/remove_object
    (async wrappers), not IMPL_28's sync minio-SDK-shaped pseudocode.
"""
import base64
import logging
import re
import uuid

import asyncpg
from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile, File, Form, Response

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    MINIO_BUCKET_SCREENSHOTS, MAX_SCREENSHOT_BYTES, SCREENSHOT_ACCEPTED_MIME_TYPES,
    SCREENSHOT_MAX_PER_CAUSE, SCREENSHOT_MAX_PER_STEP_BATCH, SCREENSHOT_MAX_OVERALL,
    SCREENSHOT_PROXY_CACHE_SECONDS,
)
from app.clients.ollama_vision import classify_sap, extract_sap_content
from app.infrastructure.minio_client import minio_client
from app.tasks.enrich_entry_screenshots import format_extracted_text, is_extraction_empty

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/admin/knowledge-screenshots", tags=["quick-entry-screenshots"])
serve_router = APIRouter(prefix="/api/screenshots", tags=["quick-entry-screenshots"])

VALID_ENTRY_STATUSES_FOR_UPLOAD = {"draft", "active"}


def require_it_admin(request: Request):
    role = getattr(request.state, "role", "employee")
    if role != "it-admin":
        raise HTTPException(status_code=403, detail="IT admin role required")
    return role


def require_authenticated(request: Request):
    role = getattr(request.state, "role", None)
    if role is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return role


async def _db():
    return await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )


def _section_limit(section: str) -> int:
    if section.startswith("cause_"):
        return SCREENSHOT_MAX_PER_CAUSE
    if section.startswith("proc_steps_"):
        return SCREENSHOT_MAX_PER_STEP_BATCH
    return SCREENSHOT_MAX_OVERALL


def _valid_sections(content_type: str) -> re.Pattern:
    if content_type == "error_guide":
        return re.compile(r"^(error_overview|cause_([1-9]|10))$")
    if content_type == "procedure":
        return re.compile(r"^(proc_overview|proc_steps_\d+)$")
    if content_type == "config":
        return re.compile(r"^(cfg_overview|cfg_values)$")
    return re.compile(r"^$")


# ============================================================
# SCREENSHOT ENDPOINT 1: UPLOAD
# ============================================================

@admin_router.post("/upload", status_code=201)
async def upload_screenshot(
    file: UploadFile = File(...),
    entry_id: str = Form(...),
    associated_section: str = Form(...),
    admin_caption: str = Form(...),
    _admin: str = Depends(require_it_admin),
):
    if len(admin_caption.strip()) < 10:
        raise HTTPException(status_code=422, detail=[{"field": "admin_caption", "message": "admin_caption must be at least 10 characters."}])
    if file.content_type not in SCREENSHOT_ACCEPTED_MIME_TYPES:
        raise HTTPException(status_code=422, detail=[{"field": "file", "message": f"file must be one of: {', '.join(sorted(SCREENSHOT_ACCEPTED_MIME_TYPES))}."}])

    file_bytes = await file.read()
    if len(file_bytes) > MAX_SCREENSHOT_BYTES:
        raise HTTPException(status_code=422, detail=[{"field": "file", "message": f"file exceeds the {MAX_SCREENSHOT_BYTES} byte limit."}])

    conn = await _db()
    try:
        entry = await conn.fetchrow("SELECT content_type, version, status FROM knowledge_form_entries WHERE id = $1::uuid", entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found.")
        if entry["status"] not in VALID_ENTRY_STATUSES_FOR_UPLOAD:
            raise HTTPException(status_code=422, detail=[{"field": "entry_id", "message": f"Screenshots cannot be added to an entry with status '{entry['status']}'."}])

        section_pattern = _valid_sections(entry["content_type"])
        if not section_pattern.match(associated_section):
            raise HTTPException(status_code=422, detail=[{"field": "associated_section", "message": f"associated_section is not valid for content_type '{entry['content_type']}'."}])

        existing_count = await conn.fetchval(
            """SELECT COUNT(*) FROM knowledge_form_screenshots
               WHERE entry_id = $1::uuid AND version = $2 AND associated_section = $3""",
            entry_id, entry["version"], associated_section,
        )
        limit = _section_limit(associated_section)
        if existing_count >= limit:
            raise HTTPException(status_code=422, detail=[{"field": "associated_section", "message": f"Section '{associated_section}' already has the maximum of {limit} screenshots."}])

        image_b64 = base64.b64encode(file_bytes).decode("utf-8")
        screen_type = await classify_sap(image_b64)
        extracted = await extract_sap_content(image_b64, screen_type)

        if is_extraction_empty(extracted):
            raise HTTPException(status_code=422, detail=[{
                "field": "file",
                "message": "Screenshot rejected: no SAP content detected. This does not appear to be a SAP screenshot.",
            }])

        safe_name = re.sub(r"[^a-z0-9_.-]", "", (file.filename or "screenshot").lower().replace(" ", "_"))[:50] or "screenshot"
        object_key = f"{entry_id}/{uuid.uuid4()}-{safe_name}"

        await minio_client.put_object(MINIO_BUCKET_SCREENSHOTS, object_key, file_bytes, file.content_type)

        extracted_text = format_extracted_text(screen_type, extracted)
        row = await conn.fetchrow(
            """INSERT INTO knowledge_form_screenshots
               (entry_id, version, associated_section, minio_object_key, admin_caption,
                extracted_text, vision_status, sap_confirmed, file_size_bytes, mime_type)
               VALUES ($1::uuid, $2, $3, $4, $5, $6, 'complete', FALSE, $7, $8)
               RETURNING id""",
            entry_id, entry["version"], associated_section, object_key, admin_caption,
            extracted_text, len(file_bytes), file.content_type,
        )

        return {
            "screenshot_id": str(row["id"]),
            "minio_object_key": object_key,
            "proxy_url": f"/api/screenshots/{object_key}",
            "admin_caption": admin_caption,
            "vision_confidence": None,
            "extraction_preview": extracted_text,
            "message": "Screenshot uploaded. Review the extracted content above and confirm it looks correct.",
        }
    finally:
        await conn.close()


# ============================================================
# SCREENSHOT ENDPOINT 2: RETRY VISION
# ============================================================

@admin_router.post("/{id}/retry-vision")
async def retry_vision(id: str, _admin: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        screenshot = await conn.fetchrow("SELECT entry_id, version, vision_status FROM knowledge_form_screenshots WHERE id = $1::uuid", id)
        if not screenshot:
            raise HTTPException(status_code=404, detail="Screenshot not found.")
        if screenshot["vision_status"] != "failed":
            raise HTTPException(status_code=409, detail=f"Only failed screenshots can be retried. Current status: {screenshot['vision_status']}.")

        await conn.execute("UPDATE knowledge_form_screenshots SET vision_status='pending', vision_error=NULL WHERE id=$1::uuid", id)

        from app.infrastructure.redis_client import arq_client
        await arq_client.enqueue_screenshot_enrichment(
            entry_id=str(screenshot["entry_id"]), version=screenshot["version"], target_screenshot_id=id,
        )

        return {"screenshot_id": id, "vision_status": "pending", "message": "Vision retry queued."}
    finally:
        await conn.close()


# ============================================================
# SCREENSHOT ENDPOINT 3: DELETE
# ============================================================

@admin_router.delete("/{id}", status_code=204)
async def delete_screenshot(id: str, _admin: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        row = await conn.fetchrow(
            """SELECT kfs.minio_object_key, kfe.status
               FROM knowledge_form_screenshots kfs
               JOIN knowledge_form_entries kfe ON kfe.id = kfs.entry_id
               WHERE kfs.id = $1::uuid""",
            id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Screenshot not found.")
        if row["status"] != "draft":
            raise HTTPException(status_code=409, detail="Screenshots can only be deleted during draft status. Archive the entry and create a new version to replace screenshots.")

        try:
            await minio_client.remove_object(MINIO_BUCKET_SCREENSHOTS, row["minio_object_key"])
        except Exception as e:
            logger.warning(f"MinIO remove_object failed during screenshot delete (DB delete proceeds): {e}")

        await conn.execute("DELETE FROM knowledge_form_screenshots WHERE id = $1::uuid", id)
    finally:
        await conn.close()


# ============================================================
# INTERNAL SERVING ROUTE — called by the Next.js proxy only,
# never by the browser directly (CLAUDE.md's frontend-never-
# talks-to-MinIO-directly rule).
# ============================================================

@serve_router.get("/{object_key:path}")
async def serve_screenshot(object_key: str, _user: str = Depends(require_authenticated)):
    try:
        content, content_type = await minio_client.get_object(MINIO_BUCKET_SCREENSHOTS, object_key)
    except Exception:
        raise HTTPException(status_code=404, detail="Screenshot not found.")

    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": f"private, max-age={SCREENSHOT_PROXY_CACHE_SECONDS}"},
    )
