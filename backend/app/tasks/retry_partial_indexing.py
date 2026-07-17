"""
AEGIS Quick Entry Partial-Indexing Retry Task
Per IMPL_26_QUICK_ENTRY_PROCESSING_PIPELINE.md Section 6.

Enqueued by process_form_entry when a chunk failed Qdrant and/or OpenSearch
insertion (final_status = 'partial_index'). Rebuilds each failed chunk's
payload from the parent entry row + the chunk's own DB record (the same
fields process_form_entry originally wrote), matching the real infra
wrappers rather than IMPL_26's undefined rebuild_qdrant_payload/
rebuild_opensearch_doc pseudocode helpers.
"""
import json
import logging
from typing import Dict

import asyncpg
import httpx

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    BGE_SERVICE_URL, QDRANT_COLLECTION_ERRORS, QDRANT_COLLECTION_PROCEDURES, QDRANT_COLLECTION_CONFIGS,
)
from app.services.query_intelligence import query_intelligence_service
from app.infrastructure.qdrant_client import qdrant_client
from app.infrastructure.opensearch_client import opensearch_client

logger = logging.getLogger(__name__)

CONTENT_TYPE_TO_COLLECTION = {
    "error_guide": QDRANT_COLLECTION_ERRORS,
    "procedure": QDRANT_COLLECTION_PROCEDURES,
    "config": QDRANT_COLLECTION_CONFIGS,
}


async def retry_partial_indexing(ctx: Dict, *, entry_id: str) -> dict:
    conn = await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )
    try:
        return await _retry(conn, entry_id)
    finally:
        await conn.close()


async def _rebuild_payload(entry, chunk_row, section_screenshots: dict) -> dict:
    entities = query_intelligence_service.extract_sap_entities(chunk_row["chunk_text"])
    screenshot_ids = section_screenshots.get(chunk_row["chunk_type"], [])
    return {
        "text": chunk_row["chunk_text"],
        "chunk_text": chunk_row["chunk_text"],
        "document_id": entry["document_id"],
        "content_type": entry["content_type"],
        "module": entry["module"],
        "transactions": entry["transactions"],
        "is_current": chunk_row["is_current"],
        "quality_score": chunk_row["quality_score"],
        "verified_by": entry["verified_by_name"],
        "verified_date": str(entry["verified_date"]),
        "source_type": "form_entry",
        "form_entry_id": str(entry["id"]),
        "version": chunk_row["version"],
        "chunk_type": chunk_row["chunk_type"],
        "has_screenshots": len(screenshot_ids) > 0,
        "screenshot_ids": screenshot_ids,
        "is_stale": False,
        "original_quality_score": chunk_row["original_quality_score"],
        "sap_t_codes": entities.t_codes,
        "sap_error_codes": entities.error_codes,
    }


async def _retry(conn, entry_id: str) -> dict:
    entry = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1", entry_id)
    if not entry or entry["status"] not in ("partial_index", "active"):
        return {"status": "skipped"}

    collection = CONTENT_TYPE_TO_COLLECTION[entry["content_type"]]

    failed_qdrant = await conn.fetch(
        "SELECT * FROM knowledge_form_entry_chunks WHERE entry_id = $1 AND version = $2 AND qdrant_status = 'failed'",
        entry_id, entry["version"],
    )
    failed_os = await conn.fetch(
        "SELECT * FROM knowledge_form_entry_chunks WHERE entry_id = $1 AND version = $2 AND opensearch_status = 'failed'",
        entry_id, entry["version"],
    )

    screenshot_rows = await conn.fetch(
        "SELECT associated_section, id FROM knowledge_form_screenshots WHERE entry_id = $1 AND version = $2",
        entry_id, entry["version"],
    )
    section_screenshots: Dict[str, list] = {}
    for row in screenshot_rows:
        section_screenshots.setdefault(row["associated_section"], []).append(str(row["id"]))

    qdrant_fixed = 0
    os_fixed = 0
    still_failing = []

    async with httpx.AsyncClient(timeout=60) as client:
        for chunk_row in failed_qdrant:
            try:
                resp = await client.post(f"{BGE_SERVICE_URL}/embed", json={"texts": [chunk_row["chunk_text"][:1000]]})
                resp.raise_for_status()
                content_vector = resp.json()["embeddings"][0]

                identity_resp = await client.post(f"{BGE_SERVICE_URL}/embed", json={"texts": [chunk_row["chunk_text"][:200]]})
                identity_resp.raise_for_status()
                identity_vector = identity_resp.json()["embeddings"][0]

                payload = await _rebuild_payload(entry, chunk_row, section_screenshots)
                await qdrant_client.upsert_point(
                    collection_name=collection,
                    point_id=str(chunk_row["qdrant_point_id"]),
                    content_vector=content_vector,
                    identity_vector=identity_vector,
                    payload=payload,
                )
                await conn.execute(
                    "UPDATE knowledge_form_entry_chunks SET qdrant_status='success' WHERE id=$1",
                    chunk_row["id"],
                )
                qdrant_fixed += 1
            except Exception as e:
                logger.error(f"retry_partial_indexing: Qdrant still failing for {chunk_row['id']}: {e}")
                still_failing.append(chunk_row["chunk_type"])

    for chunk_row in failed_os:
        try:
            payload = await _rebuild_payload(entry, chunk_row, section_screenshots)
            await opensearch_client.index_document(str(chunk_row["qdrant_point_id"]), {
                "chunk_id": str(chunk_row["qdrant_point_id"]),
                **payload,
            })
            await conn.execute(
                "UPDATE knowledge_form_entry_chunks SET opensearch_status='success' WHERE id=$1",
                chunk_row["id"],
            )
            os_fixed += 1
        except Exception as e:
            logger.error(f"retry_partial_indexing: OpenSearch still failing for {chunk_row['id']}: {e}")
            if chunk_row["chunk_type"] not in still_failing:
                still_failing.append(chunk_row["chunk_type"])

    processing_log = entry["processing_log"]
    if isinstance(processing_log, str):
        processing_log = json.loads(processing_log) if processing_log else {}
    processing_log = processing_log or {}

    if not still_failing:
        new_status = "active"
    else:
        retry_count = processing_log.get("retry_count", 0) + 1

        if retry_count >= 3:
            new_status = "failed"
            logger.error(f"retry_partial_indexing: entry {entry_id} failed after 3 retry attempts. Still failing: {still_failing}")
        else:
            new_status = "partial_index"
            from app.infrastructure.redis_client import arq_client
            await arq_client.enqueue_retry_partial_indexing(entry_id=entry_id, defer_seconds=300 * retry_count)

        processing_log["retry_count"] = retry_count
        await conn.execute(
            "UPDATE knowledge_form_entries SET processing_log=$1 WHERE id=$2",
            json.dumps(processing_log), entry_id,
        )

    await conn.execute(
        "UPDATE knowledge_form_entries SET status=$1 WHERE id=$2",
        new_status, entry_id,
    )

    return {
        "status": new_status,
        "qdrant_fixed": qdrant_fixed,
        "os_fixed": os_fixed,
        "still_failing": still_failing,
    }
