"""
AEGIS Admin Handler — All /admin/* API endpoints for the 7 admin portal screens.
All routes require it-admin role.
"""
import logging
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Request, HTTPException, Depends, Response
from app.config import POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, MINIO_BUCKET_DOCUMENTS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


def require_it_admin(request: Request):
    role = getattr(request.state, "role", "employee")
    if role not in {"it-admin", "consultant"}:
        raise HTTPException(status_code=403, detail="IT admin role required")
    return role


async def _db():
    import asyncpg
    return await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )


@router.get("/documents")
async def list_documents(request: Request, content_type: Optional[str] = None,
                          module: Optional[str] = None, status: Optional[str] = None,
                          page: int = 1, page_size: int = 50,
                          _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        conditions, params, i = [], [], 1
        if content_type:
            conditions.append(f"content_type=${i}"); params.append(content_type); i += 1
        if module:
            conditions.append(f"module=${i}"); params.append(module); i += 1
        if status:
            conditions.append(f"status=${i}"); params.append(status); i += 1
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        rows = await conn.fetch(
            f"SELECT document_id, content_type, module, status, chunk_count, last_verified_date::text, ingested_at::text FROM documents_registry {where} ORDER BY ingested_at DESC LIMIT {page_size} OFFSET {(page-1)*page_size}",
            *params)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM documents_registry {where}", *params)
        return {"documents": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size}
    finally:
        await conn.close()


@router.get("/registry")
async def list_registry(request: Request, status: Optional[str] = None, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        q = "SELECT id::text, pattern_string, pattern_type, linked_document_id, linked_chunk_type, registry_notes, status, approved_by, created_at::text FROM known_patterns_registry"
        rows = await conn.fetch(q + (" WHERE status=$1 ORDER BY created_at DESC" if status else " ORDER BY created_at DESC"), *([status] if status else []))
        return {"entries": [dict(r) for r in rows]}
    finally:
        await conn.close()


@router.patch("/registry/{entry_id}/approve")
async def approve_registry_entry(entry_id: str, request: Request, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        await conn.execute(
            "UPDATE known_patterns_registry SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2::uuid",
            getattr(request.state, "user_id_hash", "unknown"), entry_id)
        from app.infrastructure.redis_client import redis_session
        await redis_session.redis.publish("aegis:synonym_reload", "reload")
        return {"status": "approved", "id": entry_id}
    finally:
        await conn.close()


@router.get("/config-snapshot")
async def get_config_snapshot(request: Request, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        rows = await conn.fetch(
            "SELECT config_category, config_key, config_value, last_updated_at::text, updated_by, notes FROM config_snapshot ORDER BY config_category, config_key")
        today = datetime.utcnow().date()
        entries = []
        for row in rows:
            e = dict(row)
            try:
                age = (today - datetime.fromisoformat(row["last_updated_at"]).date()).days
                e["staleness"] = "critical" if age > 70 else ("warning" if age > 35 else "fresh")
                e["age_days"] = age
            except Exception:
                e["staleness"] = "unknown"; e["age_days"] = 0
            entries.append(e)
        return {"entries": entries}
    finally:
        await conn.close()


@router.put("/config-snapshot/{category}/{key}")
async def update_config_value(category: str, key: str, request: Request, _: str = Depends(require_it_admin)):
    body = await request.json()
    conn = await _db()
    try:
        await conn.execute(
            "INSERT INTO config_snapshot (config_category, config_key, config_value, updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT (config_category, config_key) DO UPDATE SET config_value=EXCLUDED.config_value, updated_by=EXCLUDED.updated_by, last_updated_at=NOW()",
            category, key, body["config_value"], getattr(request.state, "user_id_hash", "unknown"))
        return {"status": "updated"}
    finally:
        await conn.close()


@router.get("/knowledge-gaps")
async def get_knowledge_gaps(request: Request, days: int = 7, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        cutoff_7d = datetime.utcnow() - timedelta(days=7)
        cutoff_30d = datetime.utcnow() - timedelta(days=30)
        # IMPL_29 Section 4.2 assumes a per-gap-event response shape
        # (one addressed_by_entry_id per list item). The real endpoint
        # (pre-existing) is clustered by gap_description, aggregating
        # potentially many individual gap_events into one row — there's no
        # single natural "id" to attach write-back status to. Resolved by
        # picking the most recently occurred event in the cluster as the
        # representative gap_id (used for the "Create Quick Entry" link's
        # ?gap_id= param), and separately surfacing whether ANY event in
        # the cluster has been addressed, with that event's own details.
        rows = await conn.fetch(
            """WITH clustered AS (
                 SELECT gap_description,
                        COUNT(*) FILTER (WHERE occurred_at >= $1) as count_7d,
                        COUNT(*) FILTER (WHERE occurred_at >= $2) as count_30d,
                        array_agg(DISTINCT query_text) as example_queries,
                        (array_agg(id ORDER BY occurred_at DESC))[1] as representative_gap_id,
                        bool_or(addressed_by_entry_id IS NOT NULL) as any_addressed,
                        (array_agg(addressed_by_entry_id ORDER BY addressed_at DESC NULLS LAST))[1] as latest_addressed_entry_id,
                        (array_agg(addressed_at ORDER BY addressed_at DESC NULLS LAST))[1] as latest_addressed_at
                 FROM knowledge_gap_events WHERE occurred_at >= $2
                 GROUP BY gap_description HAVING COUNT(*) FILTER (WHERE occurred_at >= $1) > 0
               )
               SELECT c.*, kfe.document_id as addressed_document_id, kfe.form_data as addressed_form_data,
                      kfe.content_type as addressed_content_type
               FROM clustered c
               LEFT JOIN knowledge_form_entries kfe ON kfe.id = c.latest_addressed_entry_id
               ORDER BY c.count_7d DESC LIMIT 20""",
            cutoff_7d, cutoff_30d)

        import json
        from app.handlers.knowledge_entries_handler import _extract_issue_title

        clusters = []
        for r in rows:
            addressed_title = None
            if r["any_addressed"] and r["addressed_form_data"]:
                form_data = json.loads(r["addressed_form_data"]) if isinstance(r["addressed_form_data"], str) else r["addressed_form_data"]
                addressed_title = _extract_issue_title(form_data, r["addressed_content_type"])
            clusters.append({
                "entity_combination": r["gap_description"][:80], "gap_description": r["gap_description"],
                "count_7d": r["count_7d"], "count_30d": r["count_30d"],
                "example_queries": list(r["example_queries"])[:3],
                "gap_id": str(r["representative_gap_id"]),
                "addressed_by_entry_id": str(r["latest_addressed_entry_id"]) if r["any_addressed"] else None,
                "addressed_at": r["latest_addressed_at"].isoformat() if r["latest_addressed_at"] else None,
                "addressed_entry_title": addressed_title,
            })
        return {"clusters": clusters}
    finally:
        await conn.close()


@router.get("/audit-trail")
async def get_audit_trail(request: Request, days: int = 7, confidence_badge: Optional[str] = None,
                           page: int = 1, page_size: int = 100, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        conditions, params, i = ["occurred_at >= $1"], [cutoff], 2
        if confidence_badge:
            conditions.append(f"confidence_badge=${i}"); params.append(confidence_badge); i += 1
        where = "WHERE " + " AND ".join(conditions)
        rows = await conn.fetch(
            f"SELECT id::text, occurred_at::text, user_id_hash, session_id, request_type, confidence_badge, validation_score, model_tier, feedback_signal FROM audit_log {where} ORDER BY occurred_at DESC LIMIT {page_size} OFFSET {(page-1)*page_size}",
            *params)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM audit_log {where}", *params)
        return {"entries": [dict(r) for r in rows], "total": total}
    finally:
        await conn.close()


@router.get("/review-queue")
async def get_review_queue(request: Request, status: str = "pending", _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        rows = await conn.fetch(
            "SELECT id::text, query_text, answer_text, unsupported_claims, status, created_at::text FROM human_review_queue WHERE status=$1 ORDER BY created_at DESC LIMIT 50",
            status)
        return {"items": [dict(r) for r in rows]}
    finally:
        await conn.close()


@router.post("/review-queue/{item_id}/resolve")
async def resolve_review_item(item_id: str, request: Request, _: str = Depends(require_it_admin)):
    body = await request.json()
    answer = body.get("admin_correct_answer", "")
    if not answer.strip():
        raise HTTPException(status_code=400, detail="admin_correct_answer is required")
    conn = await _db()
    try:
        await conn.execute(
            "UPDATE human_review_queue SET status='resolved', admin_correct_answer=$1, resolved_at=NOW() WHERE id=$2::uuid",
            answer, item_id)
        return {"status": "resolved"}
    finally:
        await conn.close()


@router.get("/tickets")
async def get_tickets(request: Request, status: Optional[str] = None, page: int = 1,
                       page_size: int = 50, _: str = Depends(require_it_admin)):
    conn = await _db()
    try:
        cond = "WHERE status=$1 " if status else ""
        rows = await conn.fetch(
            f"SELECT ticket_id, created_at::text, user_id_hash, query_text, reason, status, resolution_notes FROM mock_tickets {cond}ORDER BY created_at DESC LIMIT {page_size} OFFSET {(page-1)*page_size}",
            *([status] if status else []))
        return {"tickets": [dict(r) for r in rows]}
    finally:
        await conn.close()


@router.patch("/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, request: Request, _: str = Depends(require_it_admin)):
    body = await request.json()
    if body.get("status") not in {"open", "in_progress", "resolved"}:
        raise HTTPException(status_code=400, detail="Invalid status value")
    conn = await _db()
    try:
        await conn.execute(
            "UPDATE mock_tickets SET status=$1, resolution_notes=$2, updated_at=NOW() WHERE ticket_id=$3",
            body["status"], body.get("resolution_notes"), ticket_id)
        return {"status": body["status"]}
    finally:
        await conn.close()


@router.get("/documents/{document_id}/download")
async def download_document(document_id: str, _: str = Depends(require_it_admin)):
    from app.infrastructure.minio_client import minio_client

    conn = await _db()
    try:
        record = await conn.fetchrow(
            "SELECT minio_object_key FROM documents_registry WHERE document_id = $1",
            document_id,
        )
    finally:
        await conn.close()

    if not record or not record["minio_object_key"]:
        raise HTTPException(status_code=404, detail="Document not found")

    object_key = record["minio_object_key"]
    # object_key format is "{document_id}/{original_filename}" (see
    # migration 005) — there is no separate original_filename column.
    original_filename = object_key.split("/", 1)[1] if "/" in object_key else object_key

    try:
        data, content_type = await minio_client.get_object(
            bucket=MINIO_BUCKET_DOCUMENTS,
            object_key=object_key,
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Stored file not found in object storage")

    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{original_filename}"'},
    )


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, _: str = Depends(require_it_admin)):
    from app.infrastructure.minio_client import minio_client

    conn = await _db()
    try:
        result = await conn.execute(
            "DELETE FROM documents_registry WHERE document_id = $1", document_id
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Document not found")
    finally:
        await conn.close()

    await minio_client.delete_prefix(bucket=MINIO_BUCKET_DOCUMENTS, prefix=f"{document_id}/")

    return {"status": "deleted", "document_id": document_id}
