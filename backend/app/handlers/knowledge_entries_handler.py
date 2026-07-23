"""
AEGIS Quick Entry — Knowledge Entries Handler
Phase 1.4 (core: create, list, get, update, archive), Phase 1.5 (utility:
suggest-doc-id, check-duplicate, validate-reference), Phase 1.8 (version
history, restore) and Phase 1.10 (feedback summary) of
IMPL_25_QUICK_ENTRY_API_ENDPOINTS.md, per IMPL_23 Section 10's real
dependency order.

NOT built in this session (later phases, per IMPL_23 Section 10):
  - confirm-current (relates to the staleness job, Phase 1.9)
  - pipeline-health (Phase 3.3)
  - all 3 screenshot endpoints (Phase 2, depends on IMPL_28's vision pipeline)
  - negative-feedback notifications / admin_notifications table (IMPL_29
    Section 3.2) — Phase 1.10 per IMPL_23 Section 10 is sourced from both
    IMPL_25 and IMPL_29, but Section 3.2 is a separate, larger feature
    (new table, alerting logic) that belongs with the rest of IMPL_29's
    Phase 3.x content, not this session's endpoint work. Only the read
    endpoint IMPL_29 Section 3.1 itself points back to (IMPL_25 Endpoint 12)
    is built here.

Real-schema corrections applied (same class of gap as Sessions 23/24):
  - Router lives here, in app/handlers/, matching admin_handler.py's
    established convention — IMPL_25 names app/routers/knowledge_entries.py,
    a directory that doesn't exist in this codebase.
  - IMPL_25's spec SQL references a `documents` table and a `gap_events`
    table — the real tables are `documents_registry` and
    `knowledge_gap_events`.
  - Qdrant/BGE calls use this codebase's real client methods
    (qdrant_client.search_content, /embed-single), not the ORM-flavored
    pseudocode in IMPL_25's text.
  - IMPL_25/29's feedback-summary endpoint assumes a `feedback` table with
    `rating`/`source_form_entry_id` columns. The real table is
    `feedback_events`, with a `feedback_signal` column (not `rating`) and,
    until migration 010 (this session), no `source_form_entry_id` at all —
    IMPL_29 Section 3.1 itself notes that column depends on a migration
    from IMPL_28 (not yet built). Added it now so this endpoint is
    queryable; it correctly reports zero counts until IMPL_28's WebSocket
    handler starts populating it.
"""
import logging
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from math import ceil
from typing import Optional

import asyncpg
from fastapi import APIRouter, Request, HTTPException, Depends, Query, UploadFile, File

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    QUICK_ENTRY_RATE_LIMIT_MAX, QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS,
    QUICK_ENTRY_PRESUBMIT_DEDUP_THRESHOLD, REVIEW_FREQUENCY_DAYS,
)
from app.services.form_validator import validate_form_data

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/knowledge-entries", tags=["quick-entry"])

IST_OFFSET = timezone(timedelta(hours=5, minutes=30))

CONTENT_TYPES = {"error_guide", "procedure", "config"}
MODULES = {"FI", "MM", "SD", "HR", "PP", "CO", "BASIS"}


def compute_next_review_date(verified_date: date, review_frequency: Optional[str]) -> Optional[date]:
    """Per IMPL_29 Section 2.1. Returns None for 'as_needed' — no automatic review date."""
    days = REVIEW_FREQUENCY_DAYS.get(review_frequency) if review_frequency else None
    return verified_date + timedelta(days=days) if days is not None else None
REVIEW_FREQUENCIES = {"monthly", "quarterly", "semi_annual", "annual", "as_needed"}


def require_it_admin(request: Request):
    role = getattr(request.state, "role", "employee")
    if role != "it-admin":
        raise HTTPException(status_code=403, detail="IT admin role required")
    return role


async def _db():
    return await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )


async def check_qe_rate_limit(request: Request):
    """
    FastAPI dependency, applied only to POST / (create). Redis sliding
    window: qe_rate:{user_id}, 5 requests per 900s. Matches
    RateLimitingMiddleware's existing "fail open" philosophy for the
    global limiter — Redis being down should not block a legitimate
    admin submission.
    """
    from app.infrastructure.redis_client import redis_session

    user_id = getattr(request.state, "user_id", None) or "unknown"
    key = f"qe_rate:{user_id}"
    now = time.time()
    window_start = now - QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS

    try:
        await redis_session.redis.zremrangebyscore(key, 0, window_start)
        current_count = await redis_session.redis.zcard(key)
        if current_count >= QUICK_ENTRY_RATE_LIMIT_MAX:
            oldest = await redis_session.redis.zrange(key, 0, 0, withscores=True)
            retry_after_seconds = int(QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS - (now - oldest[0][1])) if oldest else QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS
            reset_at_ist = datetime.now(IST_OFFSET) + timedelta(seconds=max(retry_after_seconds, 0))
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Submission limit reached. Maximum {QUICK_ENTRY_RATE_LIMIT_MAX} entries "
                    f"per {QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS // 60} minutes. "
                    f"Retry after {reset_at_ist.strftime('%H:%M')} IST."
                ),
                headers={"Retry-After": str(max(retry_after_seconds, 0))},
            )
        await redis_session.redis.zadd(key, {str(uuid.uuid4()): now})
        await redis_session.redis.expire(key, QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quick Entry rate limit check failed (Redis unavailable, failing open): {e}")


def _extract_issue_title(form_data: dict, content_type: str) -> str:
    if content_type == "error_guide":
        return form_data.get("issue_description", "Untitled")
    elif content_type == "procedure":
        return form_data.get("procedure_name", "Untitled")
    elif content_type == "config":
        return form_data.get("configuration_name", "Untitled")
    return "Untitled"


def _inject_step_numbers(form_data: dict, content_type: str) -> dict:
    if content_type == "procedure" and isinstance(form_data.get("steps"), list):
        for i, step in enumerate(form_data["steps"]):
            step["step_number"] = i + 1
    return form_data


# ============================================================
# ENDPOINT 1: CREATE ENTRY
# ============================================================

@router.post("", status_code=201)
async def create_entry(
    request: Request,
    _admin: str = Depends(require_it_admin),
    _rate: None = Depends(check_qe_rate_limit),
):
    body = await request.json()

    document_id = body.get("document_id", "").strip()
    content_type = body.get("content_type")
    module = body.get("module")
    transactions = body.get("transactions", [])
    verified_by_name = body.get("verified_by_name", "").strip()
    verified_date_str = body.get("verified_date", "")
    review_frequency = body.get("review_frequency")
    form_data = body.get("form_data", {})
    gap_id = body.get("gap_id")
    publish = bool(body.get("publish", False))

    errors = []
    if not document_id:
        errors.append({"field": "document_id", "message": "document_id is required."})
    if content_type not in CONTENT_TYPES:
        errors.append({"field": "content_type", "message": f"content_type must be one of: {', '.join(sorted(CONTENT_TYPES))}."})
    if module not in MODULES:
        errors.append({"field": "module", "message": f"module must be one of: {', '.join(sorted(MODULES))}."})
    if not transactions:
        errors.append({"field": "transactions", "message": "At least 1 transaction code is required."})
    if len(verified_by_name) < 2:
        errors.append({"field": "verified_by_name", "message": "verified_by_name must be at least 2 characters."})

    try:
        verified_date = date.fromisoformat(verified_date_str)
        if verified_date > datetime.now(IST_OFFSET).date():
            errors.append({"field": "verified_date", "message": "verified_date cannot be in the future."})
    except (ValueError, TypeError):
        errors.append({"field": "verified_date", "message": "verified_date must be a valid YYYY-MM-DD date."})
        verified_date = None

    if content_type == "config" and review_frequency not in REVIEW_FREQUENCIES:
        errors.append({"field": "review_frequency", "message": "review_frequency is required for config entries."})

    if content_type in CONTENT_TYPES:
        errors.extend(validate_form_data(content_type, form_data))

    if errors:
        raise HTTPException(status_code=422, detail=errors)

    conn = await _db()
    try:
        if gap_id:
            gap_exists = await conn.fetchval("SELECT 1 FROM knowledge_gap_events WHERE id = $1::uuid", gap_id)
            if not gap_exists:
                raise HTTPException(status_code=422, detail=[{"field": "gap_id", "message": "gap_id does not reference an existing knowledge gap."}])

        submitted_by = getattr(request.state, "user_id", None) or "unknown"
        status = "processing" if publish else "draft"
        next_review_date = compute_next_review_date(verified_date, review_frequency) if content_type == "config" else None

        try:
            row = await conn.fetchrow(
                """INSERT INTO knowledge_form_entries
                   (document_id, content_type, module, transactions, status, form_data,
                    verified_by_name, verified_date, review_frequency, next_review_date, gap_id, submitted_by)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, $12::uuid)
                   RETURNING id, version""",
                document_id, content_type, module, transactions, status,
                _dumps(form_data), verified_by_name, verified_date, review_frequency,
                next_review_date, gap_id, submitted_by,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(status_code=409, detail=f"Document ID {document_id} already exists.")

        await conn.execute(
            """INSERT INTO knowledge_form_entry_versions
               (entry_id, version, form_data, verified_by_name, verified_date, changed_by, change_summary)
               VALUES ($1, 1, $2, $3, $4, $5, $6)""",
            row["id"], _dumps(form_data), verified_by_name, verified_date, submitted_by,
            body.get("change_summary"),
        )

        if publish:
            from app.infrastructure.redis_client import arq_client
            await arq_client.enqueue_process_form_entry(entry_id=str(row["id"]))

        return {
            "id": str(row["id"]), "document_id": document_id, "status": status,
            "version": row["version"],
            "message": "Entry submitted for processing." if publish else "Entry saved as draft.",
        }
    finally:
        await conn.close()


def _dumps(data: dict) -> str:
    import json
    return json.dumps(data)


def _serialize_entry_row(row: asyncpg.Record) -> dict:
    """JSON-safe dict from a raw knowledge_form_entries row (UUID/date/JSONB -> str/dict)."""
    import json
    out = dict(row)
    for key, value in out.items():
        if isinstance(value, uuid.UUID):
            out[key] = str(value)
        elif isinstance(value, (date, datetime)):
            out[key] = value.isoformat()
        elif key == "form_data" and isinstance(value, str):
            out[key] = json.loads(value)
        elif key == "processing_log" and isinstance(value, str):
            out[key] = json.loads(value)
    return out


# ============================================================
# ENDPOINT 2: LIST ENTRIES
# ============================================================

@router.get("")
async def list_entries(
    request: Request,
    module: Optional[str] = None,
    content_type: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    include_archived: bool = False,
    _admin: str = Depends(require_it_admin),
):
    conn = await _db()
    try:
        conditions, params, i = [], [], 1
        if module:
            conditions.append(f"kfe.module = ${i}"); params.append(module); i += 1
        if content_type:
            conditions.append(f"kfe.content_type = ${i}"); params.append(content_type); i += 1
        if status:
            conditions.append(f"kfe.status = ${i}"); params.append(status); i += 1
        elif not include_archived:
            conditions.append("kfe.status != 'archived'")
        if search:
            conditions.append(
                f"(kfe.document_id ILIKE ${i} OR kfe.form_data->>'issue_description' ILIKE ${i} "
                f"OR kfe.form_data->>'procedure_name' ILIKE ${i} OR kfe.form_data->>'configuration_name' ILIKE ${i})"
            )
            params.append(f"%{search}%"); i += 1
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = await conn.fetch(
            f"""SELECT kfe.id, kfe.document_id, kfe.content_type, kfe.module, kfe.status,
                       kfe.version, kfe.verified_by_name, kfe.verified_date::text,
                       kfe.submitted_by, kfe.form_data, kfe.next_review_date::text,
                       kfe.gap_id, kfe.created_at::text, kfe.updated_at::text,
                       (SELECT COUNT(*) FROM knowledge_form_entry_chunks
                        WHERE entry_id = kfe.id AND is_current = TRUE) AS chunk_count,
                       (SELECT COUNT(*) FROM knowledge_form_screenshots
                        WHERE entry_id = kfe.id) AS screenshot_count,
                       (SELECT COUNT(*) FROM knowledge_form_screenshots
                        WHERE entry_id = kfe.id AND vision_status = 'failed') > 0 AS has_failed_screenshots
                FROM knowledge_form_entries kfe
                {where}
                ORDER BY kfe.updated_at DESC
                LIMIT ${i} OFFSET ${i + 1}""",
            *params, page_size, (page - 1) * page_size,
        )
        total = await conn.fetchval(f"SELECT COUNT(*) FROM knowledge_form_entries kfe {where}", *params)

        # Feedback join: single batch query (not N+1), per IMPL_25 Section 4.
        entry_ids = [r["id"] for r in rows]
        feedback_by_entry = {}
        if entry_ids:
            fb_rows = await conn.fetch(
                """SELECT source_form_entry_id,
                          COUNT(*) FILTER (WHERE feedback_signal = 'positive') AS positive,
                          COUNT(*) FILTER (WHERE feedback_signal = 'negative') AS negative,
                          MAX(created_at) FILTER (WHERE feedback_signal = 'negative') AS last_negative_at
                   FROM feedback_events
                   WHERE source_form_entry_id = ANY($1::uuid[])
                     AND created_at >= NOW() - INTERVAL '30 days'
                   GROUP BY source_form_entry_id""",
                entry_ids,
            )
            for fb in fb_rows:
                feedback_by_entry[fb["source_form_entry_id"]] = {
                    "positive": fb["positive"], "negative": fb["negative"],
                    "net": fb["positive"] - fb["negative"], "period_days": 30,
                    "last_negative_at": fb["last_negative_at"].isoformat() if fb["last_negative_at"] else None,
                }

        import json
        entries = []
        for r in rows:
            form_data = json.loads(r["form_data"]) if isinstance(r["form_data"], str) else r["form_data"]
            entries.append({
                "id": str(r["id"]), "document_id": r["document_id"], "content_type": r["content_type"],
                "module": r["module"], "status": r["status"], "version": r["version"],
                "verified_by_name": r["verified_by_name"], "verified_date": r["verified_date"],
                "submitted_by_name": r["submitted_by"],
                "chunk_count": r["chunk_count"], "screenshot_count": r["screenshot_count"],
                "has_failed_screenshots": r["has_failed_screenshots"],
                "next_review_date": r["next_review_date"], "gap_id": str(r["gap_id"]) if r["gap_id"] else None,
                "feedback_summary": feedback_by_entry.get(
                    r["id"], {"positive": 0, "negative": 0, "net": 0, "period_days": 30, "last_negative_at": None}
                ),
                "issue_title": _extract_issue_title(form_data, r["content_type"]),
                "created_at": r["created_at"], "updated_at": r["updated_at"],
            })

        return {
            "entries": entries, "total": total, "page": page, "page_size": page_size,
            "total_pages": ceil(total / page_size) if total else 0,
        }
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 9: SUGGEST DOCUMENT ID  (registered before /{id})
# ============================================================

@router.get("/suggest-doc-id")
async def suggest_doc_id(
    module: str = Query(...), content_type: str = Query(...),
    _admin: str = Depends(require_it_admin),
):
    import re
    conn = await _db()
    try:
        qe_ids = [r["document_id"] for r in await conn.fetch(
            "SELECT document_id FROM knowledge_form_entries WHERE document_id ILIKE $1", f"%{module}%"
        )]
        # Real table is documents_registry, not "documents" (IMPL_25's spec text).
        doc_ids = [r["document_id"] for r in await conn.fetch(
            "SELECT document_id FROM documents_registry WHERE module = $1", module
        )]
        all_ids = qe_ids + doc_ids

        numbers = []
        for doc_id in all_ids:
            m = re.search(r"(\d+)$", doc_id)
            if m:
                numbers.append(int(m.group(1)))
        next_number = (max(numbers) + 1) if numbers else 1

        sap_prefix_count = sum(1 for i in all_ids if i.startswith("SAP-"))
        if all_ids and sap_prefix_count > len(all_ids) * 0.5:
            type_code = {"error_guide": "PRO-IN", "procedure": "PRO", "config": "CON-IN"}
            suggested = f"SAP-{module}-{type_code.get(content_type, 'PRO')}-{next_number:02d}"
        else:
            type_code = {"error_guide": "ERR", "procedure": "PROC", "config": "CFG"}
            suggested = f"{module}-{type_code.get(content_type, 'DOC')}-{next_number:03d}"

        return {"suggested_id": suggested}
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 10: CHECK DUPLICATE  (registered before /{id})
# ============================================================

@router.post("/check-duplicate")
async def check_duplicate(request: Request, _admin: str = Depends(require_it_admin)):
    import httpx
    from app.config import BGE_SERVICE_URL
    from app.infrastructure.qdrant_client import qdrant_client, CONTENT_TYPE_TO_COLLECTION

    body = await request.json()
    module = body.get("module")
    content_type = body.get("content_type")
    summary_text = body.get("summary_text", "")

    if content_type not in CONTENT_TYPE_TO_COLLECTION:
        raise HTTPException(status_code=422, detail=[{"field": "content_type", "message": "content_type must be one of: error_guide, procedure, config."}])
    if not summary_text or not summary_text.strip():
        raise HTTPException(status_code=422, detail=[{"field": "summary_text", "message": "summary_text is required."}])

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{BGE_SERVICE_URL}/embed-single", json={"text": summary_text})
        resp.raise_for_status()
        query_vector = resp.json()["embedding"]

    collection = CONTENT_TYPE_TO_COLLECTION[content_type]
    # Real payloads don't carry "is_current" on document chunks at all (only
    # Quick Entry chunks do, once IMPL_26 exists) — filtering on it here
    # would silently exclude every current document chunk. Filter by module
    # only; nothing currently in Qdrant has a false is_current to worry about.
    filter_conditions = {"module": module} if module else None
    results = await qdrant_client.search_content(
        collection_name=collection, query_vector=query_vector,
        limit=5, filter_conditions=filter_conditions,
    )

    matches = []
    for r in results:
        if r["score"] < QUICK_ENTRY_PRESUBMIT_DEDUP_THRESHOLD:
            continue
        payload = r["payload"] or {}
        matches.append({
            "document_id": payload.get("document_id", ""),
            "title": payload.get("error_code") or payload.get("configuration_name") or payload.get("procedure_name") or payload.get("document_id", ""),
            "source_type": payload.get("source_type", "document"),
            "content_type": payload.get("content_type", content_type),
            "module": payload.get("module", module),
            "similarity_score": r["score"],
            "preview": (payload.get("chunk_text") or "")[:200],
            "last_verified": payload.get("last_verified_date", ""),
            "status": "active",
        })

    return {"has_similar": len(matches) > 0, "matches": matches}


# ============================================================
# ENDPOINT 11: VALIDATE CROSS-REFERENCE  (registered before /{id})
# ============================================================

@router.get("/validate-reference")
async def validate_reference(doc_id: str = Query(...), _admin: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        qe_row = await conn.fetchrow(
            "SELECT document_id, form_data->>'issue_description' AS title "
            "FROM knowledge_form_entries WHERE document_id = $1 AND status = 'active'",
            doc_id,
        )
        if qe_row:
            return {"exists": True, "title": qe_row["title"] or qe_row["document_id"], "source_type": "form_entry"}

        # Real table is documents_registry; it has no document_name column —
        # document_id is the only human-readable identifier available.
        doc_row = await conn.fetchrow(
            "SELECT document_id FROM documents_registry WHERE document_id = $1 AND status = 'active'",
            doc_id,
        )
        if doc_row:
            return {"exists": True, "title": doc_row["document_id"], "source_type": "document"}

        return {"exists": False, "title": None, "source_type": None}
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 14: PIPELINE HEALTH  (registered before /{id})
# ============================================================

@router.get("/pipeline-health")
async def get_pipeline_health(_admin: str = Depends(require_it_admin)):
    # ARQ stores queue state in Redis, not a queryable-by-function-name SQL
    # table (IMPL_25's spec SQL assumes a nonexistent "arq_jobs" Postgres
    # table — no such table exists; ARQ jobs share one Redis queue with no
    # per-function breakdown without inspecting every queued job). Uses a
    # DB-derived proxy instead: entries actively in 'processing' status, and
    # screenshots in 'pending'/'processing' vision_status — arguably more
    # useful for this specific admin view anyway, since it's scoped to
    # Quick Entry rather than the whole shared ARQ queue.
    conn = await _db()
    try:
        form_entry_queue = await conn.fetchval("SELECT COUNT(*) FROM knowledge_form_entries WHERE status = 'processing'")
        screenshot_queue = await conn.fetchval("SELECT COUNT(*) FROM knowledge_form_screenshots WHERE vision_status IN ('pending', 'processing')")
        avg_processing_ms = await conn.fetchval(
            """SELECT AVG((processing_log->>'total_duration_ms')::float) FROM knowledge_form_entries
               WHERE updated_at >= NOW() - INTERVAL '24 hours' AND processing_log IS NOT NULL"""
        )
        status_rows = await conn.fetch("SELECT status, COUNT(*) as count FROM knowledge_form_entries GROUP BY status")
        screenshot_rows = await conn.fetch("SELECT vision_status, COUNT(*) as count FROM knowledge_form_screenshots GROUP BY vision_status")
        qe_avg_quality = await conn.fetchval(
            """SELECT AVG((processing_log->'stages'->'quality_scoring'->>'avg_score')::float)
               FROM knowledge_form_entries WHERE status = 'active' AND processing_log IS NOT NULL"""
        )
        feedback_negative_entries = await conn.fetchval(
            """SELECT COUNT(DISTINCT source_form_entry_id) FROM (
                 SELECT source_form_entry_id,
                        SUM(CASE WHEN feedback_signal='positive' THEN 1 ELSE 0 END) as pos,
                        SUM(CASE WHEN feedback_signal='negative' THEN 1 ELSE 0 END) as neg
                 FROM feedback_events
                 WHERE source_form_entry_id IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'
                 GROUP BY source_form_entry_id
                 HAVING SUM(CASE WHEN feedback_signal='negative' THEN 1 ELSE 0 END) >
                        SUM(CASE WHEN feedback_signal='positive' THEN 1 ELSE 0 END)
               ) sub"""
        )
        storage_bytes = await conn.fetchval("SELECT COALESCE(SUM(file_size_bytes), 0) FROM knowledge_form_screenshots")
        eligible_cleanup = await conn.fetchval("SELECT COUNT(*) FROM knowledge_form_screenshots WHERE eligible_for_cleanup = TRUE")

        status_counts = {r["status"]: r["count"] for r in status_rows}
        screenshot_counts = {r["vision_status"]: r["count"] for r in screenshot_rows}
        failed_entries = status_counts.get("failed", 0)
        partial_index = status_counts.get("partial_index", 0)
        failed_screenshots = screenshot_counts.get("failed", 0)

        if failed_entries > 5 or partial_index > 5:
            badge = "red"
        elif failed_entries > 0 or failed_screenshots > 0:
            badge = "amber"
        else:
            badge = "green"

        return {
            "badge": badge,
            "arq_queues": {
                "form_entry_queue_pending": form_entry_queue,
                "screenshot_queue_pending": screenshot_queue,
                "avg_processing_seconds": round(avg_processing_ms / 1000, 2) if avg_processing_ms is not None else None,
            },
            "entry_status": {
                "active": status_counts.get("active", 0), "draft": status_counts.get("draft", 0),
                "processing": status_counts.get("processing", 0), "failed": failed_entries,
                "partial_index": partial_index, "review_required": status_counts.get("review_required", 0),
            },
            "screenshot_status": {
                "complete": screenshot_counts.get("complete", 0), "processing": screenshot_counts.get("processing", 0),
                "pending": screenshot_counts.get("pending", 0), "failed": failed_screenshots,
                "not_sap": screenshot_counts.get("not_sap", 0),
            },
            "knowledge_quality": {"quick_entry_avg_score": round(qe_avg_quality, 4) if qe_avg_quality is not None else None},
            "feedback": {"entries_with_net_negative_feedback_30d": feedback_negative_entries},
            "storage": {"screenshot_storage_bytes": storage_bytes, "eligible_for_cleanup": eligible_cleanup},
        }
    finally:
        await conn.close()


# ============================================================
# BULK IMPORT: PRE-FILL FROM EXISTING DOCUMENT  (registered before /{id})
# ============================================================

@router.post("/import-document")
async def import_document(file: UploadFile = File(...), _admin: str = Depends(require_it_admin)):
    from app.services.form_import_parser import parse_document_for_form_prefill

    if not (file.filename or "").lower().endswith((".docx", ".pdf")):
        raise HTTPException(status_code=422, detail=[{"field": "file", "message": "file must be .docx or .pdf."}])

    file_bytes = await file.read()
    return await parse_document_for_form_prefill(file_bytes, file.filename)


# ============================================================
# ENDPOINT 3: GET SINGLE ENTRY
# ============================================================

@router.get("/{id}")
async def get_entry(id: str, _admin: str = Depends(require_it_admin)):
    import json
    conn = await _db()
    try:
        row = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1::uuid", id)
        if not row:
            raise HTTPException(status_code=404, detail="Entry not found.")

        screenshots = await conn.fetch("SELECT * FROM knowledge_form_screenshots WHERE entry_id = $1::uuid", id)
        chunks = await conn.fetch("SELECT * FROM knowledge_form_entry_chunks WHERE entry_id = $1::uuid ORDER BY version DESC", id)

        form_data = json.loads(row["form_data"]) if isinstance(row["form_data"], str) else row["form_data"]
        form_data = _inject_step_numbers(form_data, row["content_type"])
        processing_log = row["processing_log"]
        if isinstance(processing_log, str):
            processing_log = json.loads(processing_log)

        return {
            "id": str(row["id"]), "document_id": row["document_id"], "content_type": row["content_type"],
            "module": row["module"], "transactions": row["transactions"], "status": row["status"],
            "version": row["version"], "form_data": form_data,
            "verified_by_name": row["verified_by_name"], "verified_date": row["verified_date"].isoformat(),
            "review_frequency": row["review_frequency"], "next_review_date": row["next_review_date"].isoformat() if row["next_review_date"] else None,
            "gap_id": str(row["gap_id"]) if row["gap_id"] else None,
            "processing_log": processing_log,
            "submitted_by": row["submitted_by"],
            "created_at": row["created_at"].isoformat(), "updated_at": row["updated_at"].isoformat(),
            "screenshots": [dict(s) for s in screenshots],
            "chunks": [
                {"id": str(c["id"]), "version": c["version"], "chunk_type": c["chunk_type"],
                 "qdrant_status": c["qdrant_status"], "opensearch_status": c["opensearch_status"],
                 "is_current": c["is_current"], "created_at": c["created_at"].isoformat()}
                for c in chunks
            ],
        }
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 4: UPDATE ENTRY
# ============================================================

@router.put("/{id}")
async def update_entry(id: str, request: Request, _admin: str = Depends(require_it_admin)):
    body = await request.json()
    current_version = body.get("current_version")
    if current_version is None:
        raise HTTPException(status_code=422, detail=[{"field": "current_version", "message": "current_version is required for optimistic locking."}])

    conn = await _db()
    try:
        existing = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1::uuid", id)
        if not existing:
            raise HTTPException(status_code=404, detail="Entry not found.")

        if existing["version"] != current_version:
            raise HTTPException(status_code=409, detail={
                "message": f"Entry was modified by another admin since you opened it. Current version is {existing['version']}.",
                "current_entry": _serialize_entry_row(existing),
            })

        content_type = body.get("content_type", existing["content_type"])
        form_data = body.get("form_data", {})
        errors = validate_form_data(content_type, form_data)
        if errors:
            raise HTTPException(status_code=422, detail=errors)

        publish = bool(body.get("publish", False))
        changed_by = getattr(request.state, "user_id", None) or "unknown"
        verified_date = date.fromisoformat(body["verified_date"]) if body.get("verified_date") else existing["verified_date"]

        if publish:
            new_version = existing["version"] + 1
            new_status = "processing"
            verified_by_name = body.get("verified_by_name", existing["verified_by_name"])
            # Snapshot the version being created now, eagerly — matching
            # create_entry()'s pattern for version 1. NOT a snapshot of the
            # OLD version: that row already exists (either from create_entry()
            # for version 1, or from this same eager insert at the previous
            # update/restore) — re-inserting it collides with
            # uq_kfev_entry_version (confirmed live: UniqueViolationError on
            # the very first publish-update of any entry, since create_entry()
            # already wrote version 1's row).
            try:
                await conn.execute(
                    """INSERT INTO knowledge_form_entry_versions
                       (entry_id, version, form_data, verified_by_name, verified_date, changed_by, change_summary)
                       VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                    id, new_version, _dumps(form_data),
                    verified_by_name, verified_date, changed_by, body.get("change_summary"),
                )
            except asyncpg.UniqueViolationError:
                # The optimistic-lock check above has a genuine TOCTOU window:
                # two concurrent publish-updates can both read the same
                # existing["version"] before either commits. Confirmed live
                # (Session 29 Hardening Check #2) — this constraint is what
                # actually prevents the second write from silently
                # overwriting the first (no data loss occurs), but it must
                # surface as the same 409 contract as the pre-check, not an
                # unhandled 500.
                current_entry = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1::uuid", id)
                raise HTTPException(status_code=409, detail={
                    "message": f"Entry was modified by another admin since you opened it. Current version is {current_entry['version']}.",
                    "current_entry": _serialize_entry_row(current_entry),
                })
        else:
            new_version = existing["version"]
            new_status = "draft"
            # current_version alone cannot detect concurrent draft edits —
            # drafts never increment version (IMPL_25's own "drafts do not
            # create version history"), so two concurrent draft saves would
            # both pass the version check and silently last-write-wins.
            # Confirmed live (Session 29 Hardening Check #2). updated_at
            # changes on every save (kfe_updated_at_trigger), so it's used
            # as the lock field for drafts instead — required, not optional,
            # since no real client depends on the old draft-save contract yet.
            expected_updated_at_str = body.get("expected_updated_at")
            if not expected_updated_at_str:
                raise HTTPException(status_code=422, detail=[{"field": "expected_updated_at", "message": "expected_updated_at is required for draft saves (optimistic lock — version does not change for drafts)."}])
            try:
                expected_updated_at = datetime.fromisoformat(expected_updated_at_str)
            except ValueError:
                raise HTTPException(status_code=422, detail=[{"field": "expected_updated_at", "message": "expected_updated_at must be a valid ISO timestamp."}])

        new_review_frequency = body.get("review_frequency", existing["review_frequency"])
        new_next_review_date = (
            compute_next_review_date(verified_date, new_review_frequency)
            if content_type == "config" else existing["next_review_date"]
        )

        if publish:
            await conn.execute(
                """UPDATE knowledge_form_entries SET
                   document_id = $1, module = $2, transactions = $3, form_data = $4,
                   verified_by_name = $5, verified_date = $6, review_frequency = $7,
                   next_review_date = $8, version = $9, status = $10
                   WHERE id = $11::uuid""",
                body.get("document_id", existing["document_id"]), body.get("module", existing["module"]),
                body.get("transactions", existing["transactions"]), _dumps(form_data),
                body.get("verified_by_name", existing["verified_by_name"]), verified_date,
                new_review_frequency, new_next_review_date,
                new_version, new_status, id,
            )
            # Screenshots are stamped with the entry's CURRENT version at
            # upload time (knowledge_screenshots_handler.py's upload_screenshot),
            # but publishing always bumps the version — without carrying the
            # screenshots forward, process_form_entry.py's chunk-linking query
            # (`WHERE entry_id = $1 AND version = $2`, scoped to the NEW
            # version) can never find them, so every screenshot uploaded
            # during drafting is permanently orphaned the moment its entry is
            # first published. Confirmed live (F19 residual manual check,
            # DEC-063): a real employee query correctly cited the entry but
            # attribution_panel.screenshots came back empty despite two real,
            # vision-complete screenshots existing on it. Only the
            # immediately-superseded version's screenshots are re-stamped —
            # the same physical uploads are still the right ones for the
            # content that just became the new current version.
            await conn.execute(
                """UPDATE knowledge_form_screenshots SET version = $1
                   WHERE entry_id = $2::uuid AND version = $3""",
                new_version, id, existing["version"],
            )
        else:
            # Atomic check-and-update: the WHERE clause itself enforces the
            # lock, closing the TOCTOU window between the SELECT above and
            # this UPDATE (the same race the publish path closes via
            # uq_kfev_entry_version — drafts have no such unique constraint
            # to lean on, so the row-affected check does the same job).
            result = await conn.execute(
                """UPDATE knowledge_form_entries SET
                   document_id = $1, module = $2, transactions = $3, form_data = $4,
                   verified_by_name = $5, verified_date = $6, review_frequency = $7,
                   next_review_date = $8, version = $9, status = $10
                   WHERE id = $11::uuid AND updated_at = $12""",
                body.get("document_id", existing["document_id"]), body.get("module", existing["module"]),
                body.get("transactions", existing["transactions"]), _dumps(form_data),
                body.get("verified_by_name", existing["verified_by_name"]), verified_date,
                new_review_frequency, new_next_review_date,
                new_version, new_status, id, expected_updated_at,
            )
            if result == "UPDATE 0":
                current_entry = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1::uuid", id)
                raise HTTPException(status_code=409, detail={
                    "message": "Draft was modified by another admin since you opened it.",
                    "current_entry": _serialize_entry_row(current_entry),
                })

        if publish:
            from app.infrastructure.redis_client import arq_client
            await arq_client.enqueue_process_form_entry(entry_id=id)

        return {
            "id": id, "document_id": body.get("document_id", existing["document_id"]),
            "version": new_version, "status": new_status,
            "message": "Entry updated and submitted for processing." if publish else "Draft updated.",
        }
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 5: ARCHIVE ENTRY
# ============================================================

@router.delete("/{id}", status_code=204)
async def archive_entry(id: str, request: Request, _admin: str = Depends(require_it_admin)):
    body = await request.json()
    confirmed_document_id = body.get("confirmed_document_id", "")

    conn = await _db()
    try:
        entry = await conn.fetchrow("SELECT document_id, status FROM knowledge_form_entries WHERE id = $1::uuid", id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found.")
        if entry["status"] == "archived":
            raise HTTPException(status_code=409, detail="Entry is already archived.")
        if confirmed_document_id != entry["document_id"]:
            raise HTTPException(status_code=422, detail="Document ID confirmation does not match. Entry not archived.")

        chunks = await conn.fetch(
            "SELECT qdrant_point_id, chunk_type FROM knowledge_form_entry_chunks WHERE entry_id = $1::uuid AND is_current = TRUE",
            id,
        )

        if chunks:
            from app.infrastructure.qdrant_client import qdrant_client, CONTENT_TYPE_TO_COLLECTION
            from app.infrastructure.opensearch_client import opensearch_client
            from app.config import OPENSEARCH_INDEX_NAME

            content_type_row = await conn.fetchval("SELECT content_type FROM knowledge_form_entries WHERE id = $1::uuid", id)
            collection = CONTENT_TYPE_TO_COLLECTION.get(content_type_row)
            for chunk in chunks:
                try:
                    if collection:
                        await qdrant_client.client.set_payload(
                            collection_name=collection, payload={"is_current": False},
                            points=[str(chunk["qdrant_point_id"])],
                        )
                except Exception as e:
                    logger.warning(f"Qdrant set_payload failed for archive, DB remains source of truth: {e}")
                try:
                    await opensearch_client.client.update(
                        index=OPENSEARCH_INDEX_NAME, id=str(chunk["qdrant_point_id"]),
                        body={"doc": {"is_current": False}},
                    )
                except Exception as e:
                    logger.warning(f"OpenSearch update failed for archive, DB remains source of truth: {e}")

        await conn.execute("UPDATE knowledge_form_entry_chunks SET is_current = FALSE WHERE entry_id = $1::uuid", id)
        await conn.execute("UPDATE knowledge_form_entries SET status = 'archived' WHERE id = $1::uuid", id)
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 7: GET VERSION HISTORY
# ============================================================

@router.get("/{id}/versions")
async def get_version_history(id: str, _admin: str = Depends(require_it_admin)):
    import json
    conn = await _db()
    try:
        entry = await conn.fetchrow("SELECT version FROM knowledge_form_entries WHERE id = $1::uuid", id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found.")

        rows = await conn.fetch(
            "SELECT * FROM knowledge_form_entry_versions WHERE entry_id = $1::uuid ORDER BY version DESC", id
        )

        versions = []
        for r in rows:
            form_data = json.loads(r["form_data"]) if isinstance(r["form_data"], str) else r["form_data"]
            versions.append({
                "id": str(r["id"]), "version": r["version"],
                # No users table exists (identity lives in Keycloak) — same
                # convention as list_entries' submitted_by_name: the raw
                # UUID, not a resolved display name.
                "changed_by_name": str(r["changed_by"]),
                "changed_at": r["changed_at"].isoformat(),
                "change_summary": r["change_summary"],
                "verified_by_name": r["verified_by_name"],
                "verified_date": r["verified_date"].isoformat(),
                "form_data": form_data,
            })

        return {"entry_id": id, "versions": versions, "current_version": entry["version"]}
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 8: RESTORE VERSION
# ============================================================

@router.post("/{id}/restore/{version}")
async def restore_version(id: str, version: int, request: Request, _admin: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        entry = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1::uuid", id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found.")
        if entry["status"] == "archived":
            raise HTTPException(status_code=409, detail="Entry is archived. Cannot restore archived entries.")

        target = await conn.fetchrow(
            "SELECT * FROM knowledge_form_entry_versions WHERE entry_id = $1::uuid AND version = $2",
            id, version,
        )
        if not target:
            raise HTTPException(status_code=404, detail=f"Version {version} not found for this entry.")

        changed_by = getattr(request.state, "user_id", None) or "unknown"
        new_version = entry["version"] + 1
        target_form_data = target["form_data"] if isinstance(target["form_data"], str) else _dumps(target["form_data"])

        # Snapshot the version being created now (the restored content),
        # eagerly — same pattern as create_entry()/update_entry(). NOT a
        # snapshot of the pre-restore version: that row already exists,
        # and re-inserting it collides with uq_kfev_entry_version.
        await conn.execute(
            """INSERT INTO knowledge_form_entry_versions
               (entry_id, version, form_data, verified_by_name, verified_date, changed_by, change_summary)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            id, new_version, target_form_data,
            target["verified_by_name"], target["verified_date"], changed_by,
            f"Restored from version {version}.",
        )

        await conn.execute(
            """UPDATE knowledge_form_entries SET
               form_data = $1, verified_by_name = $2, verified_date = $3,
               version = $4, status = 'processing'
               WHERE id = $5::uuid""",
            target_form_data, target["verified_by_name"], target["verified_date"],
            new_version, id,
        )

        # Same carry-forward this session's publish path needed (see
        # update_entry's DEC-063 comment) — restore also bumps the version
        # and re-triggers process_form_entry.py's strict
        # `WHERE version = $2` chunk-linking query, so without this the
        # entry's current screenshots would be orphaned by every restore too.
        await conn.execute(
            """UPDATE knowledge_form_screenshots SET version = $1
               WHERE entry_id = $2::uuid AND version = $3""",
            new_version, id, entry["version"],
        )

        from app.infrastructure.redis_client import arq_client
        await arq_client.enqueue_process_form_entry(entry_id=id)

        return {
            "entry_id": id, "restored_from_version": version, "new_version": new_version,
            "status": "processing",
            "message": f"Version {version} restored as Version {new_version}. Processing started.",
        }
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 12: GET FEEDBACK SUMMARY
# ============================================================

@router.get("/{id}/feedback-summary")
async def get_feedback_summary(id: str, _admin: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        entry_exists = await conn.fetchval("SELECT 1 FROM knowledge_form_entries WHERE id = $1::uuid", id)
        if not entry_exists:
            raise HTTPException(status_code=404, detail="Entry not found.")

        row = await conn.fetchrow(
            """SELECT
                 COUNT(*) FILTER (WHERE feedback_signal = 'positive') AS positive,
                 COUNT(*) FILTER (WHERE feedback_signal = 'negative') AS negative,
                 MAX(created_at) FILTER (WHERE feedback_signal = 'negative') AS last_negative_at
               FROM feedback_events
               WHERE source_form_entry_id = $1::uuid
                 AND created_at >= NOW() - INTERVAL '30 days'""",
            id,
        )

        positive, negative = row["positive"], row["negative"]
        return {
            "positive": positive, "negative": negative, "net": positive - negative,
            "period_days": 30,
            "last_negative_at": row["last_negative_at"].isoformat() if row["last_negative_at"] else None,
        }
    finally:
        await conn.close()


# ============================================================
# ENDPOINT 13: CONFIRM CONFIG CURRENT
# ============================================================

@router.post("/{id}/confirm-current")
async def confirm_current(id: str, _admin: str = Depends(require_it_admin)):
    from app.infrastructure.qdrant_client import qdrant_client, CONTENT_TYPE_TO_COLLECTION
    from app.infrastructure.opensearch_client import opensearch_client

    conn = await _db()
    try:
        entry = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1::uuid", id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found.")
        if entry["content_type"] != "config":
            raise HTTPException(status_code=422, detail="confirm-current only applies to config entries.")
        if entry["status"] != "review_required":
            raise HTTPException(status_code=409, detail=f"Entry status is '{entry['status']}', not 'review_required'.")

        today = datetime.now(IST_OFFSET).date()
        new_next_review = compute_next_review_date(today, entry["review_frequency"])
        collection = CONTENT_TYPE_TO_COLLECTION["config"]

        chunks = await conn.fetch(
            "SELECT qdrant_point_id, original_quality_score FROM knowledge_form_entry_chunks WHERE entry_id = $1::uuid AND is_current = TRUE",
            id,
        )
        for chunk_row in chunks:
            point_id = str(chunk_row["qdrant_point_id"])
            restore_score = chunk_row["original_quality_score"]
            try:
                await qdrant_client.set_payload(collection, point_id, {"is_stale": False, "quality_score": restore_score})
            except Exception as e:
                logger.warning(f"Qdrant staleness restore failed for {point_id}: {e}")
            try:
                await opensearch_client.update_document(point_id, {"is_stale": False, "quality_score": restore_score})
            except Exception as e:
                logger.warning(f"OpenSearch staleness restore failed for {point_id}: {e}")
            await conn.execute(
                "UPDATE knowledge_form_entry_chunks SET quality_score = $1 WHERE qdrant_point_id = $2",
                restore_score, chunk_row["qdrant_point_id"],
            )

        await conn.execute(
            """UPDATE knowledge_form_entries SET
               status = 'active', verified_date = $1, next_review_date = $2, updated_at = NOW()
               WHERE id = $3::uuid""",
            today, new_next_review, id,
        )

        return {
            "verified_date": today.isoformat(),
            "next_review_date": new_next_review.isoformat() if new_next_review else None,
            "status": "active",
            "message": f"Configuration values confirmed current. Next review: {new_next_review.isoformat() if new_next_review else 'not scheduled (as-needed)'}.",
        }
    finally:
        await conn.close()

