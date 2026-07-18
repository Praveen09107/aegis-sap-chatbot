"""
AEGIS Quick Entry Processing Task
Per IMPL_26_QUICK_ENTRY_PROCESSING_PIPELINE.md Section 3 (Stages A1-A13).

Adapted to this codebase's real infrastructure, not IMPL_26's generic
pseudocode: uses direct asyncpg connections (matching every other ARQ task
in app/tasks/, not a shared ctx['db'] session), the real qdrant_client/
opensearch_client singleton wrappers (content routed to meridian_errors/
meridian_procedures/meridian_configs by content_type, not a single
"aegis_knowledge" collection), content+identity named vectors (both
collections require both, per AegisQdrantClient.upsert_point), and
query_intelligence_service.extract_sap_entities() for entity extraction
(the same reusable extractor form_validator.py already uses — IMPL_26's
ctx['entity_extractor'] and ctx['bge_client'] don't correspond to any
service that exists in this codebase).
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Dict
from uuid import uuid4

import asyncpg
import httpx

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    BGE_SERVICE_URL, QUICK_ENTRY_QUALITY_THRESHOLD, QUICK_ENTRY_DEDUP_THRESHOLD,
    QDRANT_COLLECTION_ERRORS, QDRANT_COLLECTION_PROCEDURES, QDRANT_COLLECTION_CONFIGS,
    QDRANT_VECTOR_CONTENT,
)
from app.services.form_validator import validate_form_data
from app.services.form_chunker import assemble_chunks
from app.services.query_intelligence import query_intelligence_service
from app.services.quick_entry_quality import score_chunk_quality
from app.infrastructure.qdrant_client import qdrant_client
from app.infrastructure.opensearch_client import opensearch_client

logger = logging.getLogger(__name__)

CONTENT_TYPE_TO_COLLECTION = {
    "error_guide": QDRANT_COLLECTION_ERRORS,
    "procedure": QDRANT_COLLECTION_PROCEDURES,
    "config": QDRANT_COLLECTION_CONFIGS,
}


class ProcessingLogBuilder:
    def __init__(self, run_id: str, started_at: datetime, entry_id: str, version: int):
        self.run_id = run_id
        self.started_at = started_at
        self.entry_id = entry_id
        self.version = version
        self.stages: Dict[str, dict] = {}
        self.retry_count = 0

    def record_stage(self, name: str, **kwargs):
        self.stages[name] = kwargs

    def build(self, overall_status: str, failure_stage, failure_reason, completed_at=None) -> dict:
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
            "previous_run_ids": [],
        }


async def _fail_entry(conn, entry_id: str, log: ProcessingLogBuilder, failure_stage: str, failure_reason: str):
    final_log = log.build(overall_status="failed", failure_stage=failure_stage, failure_reason=failure_reason)
    await conn.execute(
        "UPDATE knowledge_form_entries SET status='failed', processing_log=$1 WHERE id=$2",
        json.dumps(final_log), entry_id,
    )
    logger.error(f"process_form_entry: FAILED entry {entry_id} at stage '{failure_stage}': {failure_reason}")


async def process_form_entry(ctx: Dict, *, entry_id: str) -> dict:
    """ARQ task: chunk, embed, quality-score, and index a Quick Entry submission."""
    conn = await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )
    try:
        return await _process(conn, entry_id)
    finally:
        await conn.close()


async def _process(conn, entry_id: str) -> dict:
    # STAGE A1 — LOAD ENTRY
    entry = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1", entry_id)
    if not entry:
        logger.warning(f"process_form_entry: entry {entry_id} not found. Skipping.")
        return {"status": "skipped", "reason": "entry_not_found"}

    if entry["status"] != "processing":
        logger.info(f"process_form_entry: entry {entry_id} status is {entry['status']}. Skipping.")
        return {"status": "skipped", "reason": f"unexpected_status: {entry['status']}"}

    run_id = str(uuid4())
    started_at = datetime.now(timezone.utc)
    log = ProcessingLogBuilder(run_id, started_at, entry_id, entry["version"])
    form_data = json.loads(entry["form_data"]) if isinstance(entry["form_data"], str) else entry["form_data"]
    collection = CONTENT_TYPE_TO_COLLECTION[entry["content_type"]]

    # STAGE A2 — DEFENCE-IN-DEPTH SCHEMA VALIDATION
    t0 = time.time()
    validation_errors = validate_form_data(entry["content_type"], form_data)
    duration_ms = int((time.time() - t0) * 1000)

    if validation_errors:
        log.record_stage("validation", status="failed", duration_ms=duration_ms, errors=validation_errors)
        await _fail_entry(conn, entry_id, log, "validation", str(validation_errors))
        return {"status": "failed", "stage": "validation"}
    log.record_stage("validation", status="success", duration_ms=duration_ms, errors=[])

    # STAGE A3 — RETIRE OLD CHUNKS (UPDATE ONLY)
    if entry["version"] > 1:
        old_chunks = await conn.fetch(
            "SELECT qdrant_point_id, chunk_type FROM knowledge_form_entry_chunks WHERE entry_id = $1 AND is_current = TRUE",
            entry_id,
        )
        for chunk_row in old_chunks:
            point_id = str(chunk_row["qdrant_point_id"])
            try:
                await qdrant_client.set_payload(collection, point_id, {"is_current": False})
            except Exception as e:
                logger.warning(f"Qdrant retire failed for point {point_id}: {e}")
            try:
                await opensearch_client.update_document(point_id, {"is_current": False})
            except Exception as e:
                logger.warning(f"OpenSearch retire failed for point {point_id}: {e}")

        await conn.execute(
            "UPDATE knowledge_form_entry_chunks SET is_current = FALSE WHERE entry_id = $1 AND version < $2",
            entry_id, entry["version"],
        )

    # STAGE A4 — STRUCTURE-AWARE CHUNK ASSEMBLY
    t0 = time.time()
    try:
        raw_chunks = assemble_chunks(
            entry_id=str(entry["id"]),
            document_id=entry["document_id"],
            content_type=entry["content_type"],
            module=entry["module"],
            transactions=entry["transactions"],
            verified_by_name=entry["verified_by_name"],
            verified_date=entry["verified_date"],
            form_data=form_data,
            version=entry["version"],
        )
    except Exception as e:
        duration_ms = int((time.time() - t0) * 1000)
        log.record_stage("chunk_assembly", status="failed", duration_ms=duration_ms)
        await _fail_entry(conn, entry_id, log, "chunk_assembly", str(e))
        return {"status": "failed", "stage": "chunk_assembly"}

    duration_ms = int((time.time() - t0) * 1000)
    log.record_stage("chunk_assembly", status="success", duration_ms=duration_ms,
                      chunks_assembled=len(raw_chunks), chunk_types=[c["chunk_type"] for c in raw_chunks])

    # STAGE A5 — SAP ENTITY EXTRACTION
    t0 = time.time()
    all_t_codes, all_error_codes = set(), set()
    for chunk in raw_chunks:
        entities = query_intelligence_service.extract_sap_entities(chunk["text"])
        chunk["extracted_t_codes"] = entities.t_codes
        chunk["extracted_error_codes"] = entities.error_codes
        all_t_codes.update(entities.t_codes)
        all_error_codes.update(entities.error_codes)
    duration_ms = int((time.time() - t0) * 1000)
    log.record_stage("entity_extraction", status="success", duration_ms=duration_ms,
                      t_codes_found=list(all_t_codes), error_codes_found=list(all_error_codes))

    # STAGE A6 — SCREENSHOT PRESENCE DETECTION
    screenshots = await conn.fetch(
        "SELECT id, associated_section FROM knowledge_form_screenshots WHERE entry_id = $1 AND version = $2",
        entry_id, entry["version"],
    )
    section_screenshots: Dict[str, list] = {}
    for row in screenshots:
        section_screenshots.setdefault(row["associated_section"], []).append(str(row["id"]))
    for chunk in raw_chunks:
        ids = section_screenshots.get(chunk["associated_section"], [])
        chunk["has_screenshots"] = len(ids) > 0
        chunk["screenshot_ids"] = ids

    # STAGE A7 — BGE EMBEDDING
    t0 = time.time()
    chunk_texts = [c["text"][:1000] for c in raw_chunks]
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            content_resp = await client.post(f"{BGE_SERVICE_URL}/embed", json={"texts": chunk_texts})
            content_resp.raise_for_status()
            content_vectors = content_resp.json()["embeddings"]

            identity_texts = [_build_identity_string(form_data, entry["content_type"], entry["module"], c) for c in raw_chunks]
            identity_resp = await client.post(f"{BGE_SERVICE_URL}/embed", json={"texts": identity_texts})
            identity_resp.raise_for_status()
            identity_vectors = identity_resp.json()["embeddings"]
    except Exception as e:
        log.record_stage("embedding", status="failed", duration_ms=int((time.time() - t0) * 1000))
        await _fail_entry(conn, entry_id, log, "embedding", str(e))
        raise

    for chunk, content_vec, identity_vec in zip(raw_chunks, content_vectors, identity_vectors):
        chunk["content_vector"] = content_vec
        chunk["identity_vector"] = identity_vec

    duration_ms = int((time.time() - t0) * 1000)
    log.record_stage("embedding", status="success", duration_ms=duration_ms,
                      chunks_embedded=len(raw_chunks), model_used="bge-base-en-v1.5")

    # STAGE A8 — QUALITY SCORING
    t0 = time.time()
    quality_scores, per_chunk_scores = [], {}
    for chunk in raw_chunks:
        score = score_chunk_quality(chunk["text"])
        chunk["quality_score"] = score
        chunk["original_quality_score"] = score
        quality_scores.append(score)
        per_chunk_scores[chunk["chunk_type"]] = score

    avg_quality = sum(quality_scores) / len(quality_scores)
    duration_ms = int((time.time() - t0) * 1000)

    if avg_quality < QUICK_ENTRY_QUALITY_THRESHOLD:
        log.record_stage("quality_scoring", status="below_threshold", duration_ms=duration_ms,
                          avg_score=avg_quality, threshold_used=QUICK_ENTRY_QUALITY_THRESHOLD,
                          per_chunk_scores=per_chunk_scores)
        final_log = log.build(overall_status="low_quality", failure_stage="quality_scoring",
                               failure_reason=f"Average quality score {avg_quality:.3f} below threshold {QUICK_ENTRY_QUALITY_THRESHOLD}")
        await conn.execute(
            "UPDATE knowledge_form_entries SET status='low_quality', processing_log=$1 WHERE id=$2",
            json.dumps(final_log), entry_id,
        )
        logger.warning(f"process_form_entry: quality below threshold for {entry_id}: {avg_quality:.3f}")
        return {"status": "low_quality", "avg_quality": avg_quality}

    log.record_stage("quality_scoring", status="success", duration_ms=duration_ms,
                      avg_score=avg_quality, threshold_used=QUICK_ENTRY_QUALITY_THRESHOLD,
                      per_chunk_scores=per_chunk_scores)

    # STAGE A9 — SEMANTIC DEDUPLICATION SCAN (informational only)
    t0 = time.time()
    similar_entries = []
    overview_chunk = next((c for c in raw_chunks if "overview" in c["chunk_type"]), raw_chunks[0])
    try:
        results = await qdrant_client.search_content(
            collection_name=collection,
            query_vector=overview_chunk["content_vector"],
            vector_name=QDRANT_VECTOR_CONTENT,
            limit=3,
            filter_conditions={"module": entry["module"], "is_current": True},
        )
        similar_entries = [
            {"document_id": r["payload"]["document_id"], "similarity_score": r["score"]}
            for r in results
            if r["score"] >= QUICK_ENTRY_DEDUP_THRESHOLD and r["payload"].get("document_id") != entry["document_id"]
        ]
    except Exception as e:
        logger.warning(f"Deduplication scan failed (non-blocking): {e}")
    duration_ms = int((time.time() - t0) * 1000)
    log.record_stage("deduplication", status="success", duration_ms=duration_ms, similar_entries=similar_entries)

    # STAGE A10 — QDRANT INSERTION
    t0 = time.time()
    qdrant_point_ids, qdrant_failed_types, qdrant_succeeded = {}, [], 0

    for chunk in raw_chunks:
        point_id = str(uuid4())
        chunk["point_id"] = point_id

        payload = {
            # Required for retrieval: _stage5_rrf_fusion (retrieval_engine.py)
            # drops any chunk whose payload has no chunk_id at all — Quick
            # Entry chunks previously had none, meaning no Quick Entry
            # content was ever retrievable by any employee query, confirmed
            # live (empirically checked a real point's payload keys) during
            # Session 25-29 re-verification. point_id is already the shared
            # identifier between Qdrant and OpenSearch for these chunks
            # (OpenSearch's own document already used it as chunk_id), so
            # it's reused here rather than inventing a second ID scheme.
            "chunk_id": point_id,
            "text": chunk["text"],
            "chunk_text": chunk["text"],
            "document_id": entry["document_id"],
            "content_type": entry["content_type"],
            "module": entry["module"],
            "transactions": entry["transactions"],
            "is_current": True,
            "quality_score": chunk["quality_score"],
            "verified_by": entry["verified_by_name"],
            "verified_date": str(entry["verified_date"]),
            "source_type": "form_entry",
            "form_entry_id": entry_id,
            "version": entry["version"],
            "chunk_type": chunk["chunk_type"],
            "has_screenshots": chunk["has_screenshots"],
            "screenshot_ids": chunk["screenshot_ids"],
            "is_stale": False,
            "original_quality_score": chunk["original_quality_score"],
            "sap_t_codes": chunk.get("extracted_t_codes", []),
            "sap_error_codes": chunk.get("extracted_error_codes", []),
        }

        qdrant_status = "success"
        try:
            await qdrant_client.upsert_point(
                collection_name=collection, point_id=point_id,
                content_vector=chunk["content_vector"], identity_vector=chunk["identity_vector"],
                payload=payload,
            )
            qdrant_succeeded += 1
            qdrant_point_ids[chunk["chunk_type"]] = point_id
        except Exception as e:
            logger.error(f"Qdrant upsert failed for chunk {chunk['chunk_type']} in {entry_id}: {e}")
            qdrant_status = "failed"
            qdrant_failed_types.append(chunk["chunk_type"])

        await conn.execute(
            """INSERT INTO knowledge_form_entry_chunks
               (entry_id, version, chunk_type, qdrant_point_id, chunk_text,
                qdrant_status, opensearch_status, quality_score, original_quality_score, is_current)
               VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, TRUE)""",
            entry_id, entry["version"], chunk["chunk_type"], point_id, chunk["text"],
            qdrant_status, chunk["quality_score"], chunk["original_quality_score"],
        )

    duration_ms = int((time.time() - t0) * 1000)
    qdrant_overall = "success" if not qdrant_failed_types else ("partial" if qdrant_succeeded > 0 else "failed")
    log.record_stage("qdrant_insertion", status=qdrant_overall, duration_ms=duration_ms,
                      chunks_attempted=len(raw_chunks), chunks_succeeded=qdrant_succeeded,
                      chunks_failed=len(qdrant_failed_types), point_ids=qdrant_point_ids,
                      failed_chunk_types=qdrant_failed_types)

    # STAGE A11 — OPENSEARCH INDEXING
    t0 = time.time()
    os_failed_types, os_succeeded = [], 0

    for chunk in raw_chunks:
        point_id = chunk["point_id"]
        os_status = "success"
        try:
            await opensearch_client.index_document(point_id, {
                "chunk_id": point_id,
                "text": chunk["text"],
                "chunk_text": chunk["text"],
                "document_id": entry["document_id"],
                "content_type": entry["content_type"],
                "module": entry["module"],
                "is_current": True,
                "quality_score": chunk["quality_score"],
                "source_type": "form_entry",
                "form_entry_id": entry_id,
                "version": entry["version"],
                "chunk_type": chunk["chunk_type"],
                "has_screenshots": chunk["has_screenshots"],
                "screenshot_ids": chunk["screenshot_ids"],
                "is_stale": False,
                "original_quality_score": chunk["original_quality_score"],
            })
            os_succeeded += 1
        except Exception as e:
            logger.error(f"OpenSearch index failed for chunk {chunk['chunk_type']} in {entry_id}: {e}")
            os_status = "failed"
            os_failed_types.append(chunk["chunk_type"])

        await conn.execute(
            "UPDATE knowledge_form_entry_chunks SET opensearch_status = $1 WHERE entry_id = $2 AND version = $3 AND chunk_type = $4",
            os_status, entry_id, entry["version"], chunk["chunk_type"],
        )

    duration_ms = int((time.time() - t0) * 1000)
    os_overall = "success" if not os_failed_types else ("partial" if os_succeeded > 0 else "failed")
    log.record_stage("opensearch_indexing", status=os_overall, duration_ms=duration_ms,
                      docs_attempted=len(raw_chunks), docs_succeeded=os_succeeded,
                      docs_failed=len(os_failed_types), failed_chunk_types=os_failed_types)

    # STAGE A12 — DETERMINE FINAL STATUS
    qdrant_fully_ok = not qdrant_failed_types
    os_fully_ok = not os_failed_types

    if qdrant_fully_ok and os_fully_ok:
        final_status = "active"
    else:
        final_status = "partial_index"
        from app.infrastructure.redis_client import arq_client
        await arq_client.enqueue_retry_partial_indexing(entry_id=entry_id, defer_seconds=300)

    # STAGE A13 — SCREENSHOT ENRICHMENT AND FINAL WRITES
    # IMPL_28 (screenshot vision pipeline) has not been built yet, and no
    # screenshot upload endpoint exists — `screenshots` is always empty
    # right now, so this branch is inert, not a stub.
    screenshots_queued = False
    if screenshots:
        from app.infrastructure.redis_client import arq_client
        await arq_client.enqueue_screenshot_enrichment(entry_id=entry_id, version=entry["version"])
        screenshots_queued = True

    log.record_stage("screenshot_enrichment", queued=screenshots_queued, screenshot_count=len(screenshots))

    if entry["gap_id"]:
        # Idempotent per IMPL_29 Section 4.1 — a later re-processing of this
        # same entry (e.g. a version bump) must not overwrite an earlier,
        # genuine addressed_at with a newer one.
        await conn.execute(
            "UPDATE knowledge_gap_events SET addressed_by_entry_id = $1, addressed_at = NOW() WHERE id = $2 AND addressed_by_entry_id IS NULL",
            entry_id, entry["gap_id"],
        )

    final_log = log.build(overall_status=final_status, failure_stage=None, failure_reason=None)
    await conn.execute(
        "UPDATE knowledge_form_entries SET status=$1, processing_log=$2 WHERE id=$3",
        final_status, json.dumps(final_log), entry_id,
    )

    completed_at = datetime.now(timezone.utc)
    total_ms = int((completed_at - started_at).total_seconds() * 1000)
    logger.info(f"process_form_entry: completed {entry_id} status={final_status} chunks={len(raw_chunks)} duration={total_ms}ms")

    return {
        "status": final_status,
        "chunks_created": len(raw_chunks),
        "avg_quality": avg_quality,
        "similar_entries_flagged": [s["document_id"] for s in similar_entries],
        "screenshots_queued": screenshots_queued,
    }


def _build_identity_string(form_data: dict, content_type: str, module: str, chunk: dict) -> str:
    """Mirrors ingestion_pipeline.py's _build_identity_string for document chunks."""
    if content_type == "error_guide":
        error_code = form_data.get("error_code", "")
        if error_code and error_code.upper() != "NONE":
            return f"{error_code} SAP error {module} module resolution"
    elif content_type == "procedure":
        return f"{form_data.get('procedure_name', '')} SAP procedure {module} module steps"
    elif content_type == "config":
        return f"{form_data.get('configuration_name', '')} SAP configuration {module} current values"
    return chunk["text"][:200]
