"""
AEGIS Quick Entry — Knowledge Entries Handler
Phase 1.4 (core: create, list, get, update, archive) and Phase 1.5
(utility: suggest-doc-id, check-duplicate, validate-reference) of
IMPL_25_QUICK_ENTRY_API_ENDPOINTS.md, per IMPL_23 Section 10's real
dependency order.

NOT built in this session (later phases, per IMPL_23 Section 10):
  - publish/versions/restore (Phase 1.8)
  - feedback-summary (Phase 1.10)
  - confirm-current (relates to the staleness job, Phase 1.9)
  - pipeline-health (Phase 3.3)
  - all 3 screenshot endpoints (Phase 2, depends on IMPL_28's vision pipeline)

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
"""
import logging
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from math import ceil
from typing import Optional

import asyncpg
from fastapi import APIRouter, Request, HTTPException, Depends, Query

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    QUICK_ENTRY_RATE_LIMIT_MAX, QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS,
    QUICK_ENTRY_PRESUBMIT_DEDUP_THRESHOLD,
)
from app.services.form_validator import validate_form_data

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/knowledge-entries", tags=["quick-entry"])

IST_OFFSET = timezone(timedelta(hours=5, minutes=30))

CONTENT_TYPES = {"error_guide", "procedure", "config"}
MODULES = {"FI", "MM", "SD", "HR", "PP", "CO", "BASIS"}
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

        try:
            row = await conn.fetchrow(
                """INSERT INTO knowledge_form_entries
                   (document_id, content_type, module, transactions, status, form_data,
                    verified_by_name, verified_date, review_frequency, gap_id, submitted_by)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid, $11::uuid)
                   RETURNING id, version""",
                document_id, content_type, module, transactions, status,
                _dumps(form_data), verified_by_name, verified_date, review_frequency,
                gap_id, submitted_by,
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
                # feedback_summary: Phase 1.10 (deferred to a later session) — feedback_events'
                # real schema/join isn't in scope here; zero-value default, not a broken call.
                "feedback_summary": {"positive": 0, "negative": 0, "net": 0, "period_days": 30, "last_negative_at": None},
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
            await conn.execute(
                """INSERT INTO knowledge_form_entry_versions
                   (entry_id, version, form_data, verified_by_name, verified_date, changed_by, change_summary)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                id, existing["version"],
                existing["form_data"] if isinstance(existing["form_data"], str) else _dumps(existing["form_data"]),
                existing["verified_by_name"], existing["verified_date"], changed_by, body.get("change_summary"),
            )
            new_version = existing["version"] + 1
            new_status = "processing"
        else:
            new_version = existing["version"]
            new_status = "draft"

        await conn.execute(
            """UPDATE knowledge_form_entries SET
               document_id = $1, module = $2, transactions = $3, form_data = $4,
               verified_by_name = $5, verified_date = $6, review_frequency = $7,
               version = $8, status = $9
               WHERE id = $10::uuid""",
            body.get("document_id", existing["document_id"]), body.get("module", existing["module"]),
            body.get("transactions", existing["transactions"]), _dumps(form_data),
            body.get("verified_by_name", existing["verified_by_name"]), verified_date,
            body.get("review_frequency", existing["review_frequency"]),
            new_version, new_status, id,
        )

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
