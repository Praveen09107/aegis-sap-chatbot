"""
AEGIS Quick Entry Screenshot Enrichment Task
Per IMPL_28_QUICK_ENTRY_SCREENSHOT_PIPELINE.md Section 4, adapted to the real
reused vision client and to how screenshot extraction actually happens in
this codebase (see module-level note below).

Reuses the existing, already Cerebras/Groq-routed vision client
(app/clients/ollama_vision.py) per AMENDMENT_INFERENCE_ARCHITECTURE.md
FILE 8 — no separate vision client, no self-hosted-model constant
hardcoded here.

Bulk-mode vs. IMPL_28's spec: IMPL_28 Section 3 has the upload endpoint run
vision extraction SYNCHRONOUSLY at upload time (screenshots reach
vision_status='complete' immediately, before any chunk exists — chunks are
only created at publish time). Section 4's bulk-mode query
(WHERE vision_status='pending') would therefore find nothing in the normal
case. This task's real job, once that's accounted for, is to MERGE each
screenshot's already-extracted text into the chunk that now exists for its
section (post Stage A4) — not to re-run vision. Retry mode (a specific
target_screenshot_id, from the retry-vision endpoint) is the one case that
genuinely re-runs vision, since that's for a screenshot whose extraction
previously failed.
"""
import base64
import logging
from typing import Dict, Optional

import asyncpg
import httpx

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    BGE_SERVICE_URL, MINIO_BUCKET_SCREENSHOTS,
    QDRANT_COLLECTION_ERRORS, QDRANT_COLLECTION_PROCEDURES, QDRANT_COLLECTION_CONFIGS,
    QDRANT_VECTOR_CONTENT,
)
from app.clients.ollama_vision import classify_sap, extract_sap_content, ExtractedSAPData
from app.infrastructure.minio_client import minio_client
from app.infrastructure.qdrant_client import qdrant_client
from app.infrastructure.opensearch_client import opensearch_client

logger = logging.getLogger(__name__)

CONTENT_TYPE_TO_COLLECTION = {
    "error_guide": QDRANT_COLLECTION_ERRORS,
    "procedure": QDRANT_COLLECTION_PROCEDURES,
    "config": QDRANT_COLLECTION_CONFIGS,
}


def format_extracted_text(screen_type, extracted: ExtractedSAPData) -> str:
    """Renders the structured ExtractedSAPData into readable text for chunk enrichment and preview."""
    lines = [f"SCREEN TYPE: {screen_type.value}"]
    if extracted.screen_title:
        lines.append(f"SCREEN TITLE: {extracted.screen_title}")
    if extracted.t_codes:
        lines.append(f"TRANSACTION CODE(S): {', '.join(extracted.t_codes)}")
    if extracted.error_codes:
        lines.append(f"ERROR CODE(S): {', '.join(extracted.error_codes)}")
    if extracted.message_text:
        lines.append(f"MESSAGE: {extracted.message_text}")
    if extracted.field_values:
        lines.append("FIELD VALUES:")
        for name, value in extracted.field_values.items():
            lines.append(f"  {name}: {value}")
    elif extracted.field_names:
        lines.append(f"FIELDS VISIBLE: {', '.join(extracted.field_names)}")
    return "\n".join(lines)


def is_extraction_empty(extracted: ExtractedSAPData) -> bool:
    """True when the vision model found nothing SAP-related to extract."""
    return not (
        extracted.error_codes or extracted.t_codes or extracted.field_names
        or extracted.field_values or extracted.screen_title or extracted.message_text
    )


async def enrich_entry_screenshots(
    ctx: Dict, *, entry_id: str, version: int, target_screenshot_id: Optional[str] = None
) -> dict:
    conn = await asyncpg.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        statement_cache_size=0,
    )
    try:
        return await _enrich(conn, entry_id, version, target_screenshot_id)
    finally:
        await conn.close()


async def _enrich(conn, entry_id: str, version: int, target_screenshot_id: Optional[str]) -> dict:
    entry = await conn.fetchrow("SELECT * FROM knowledge_form_entries WHERE id = $1::uuid", entry_id)
    if not entry:
        return {"status": "entry_not_found"}

    collection = CONTENT_TYPE_TO_COLLECTION[entry["content_type"]]

    if target_screenshot_id:
        screenshots = await conn.fetch(
            "SELECT * FROM knowledge_form_screenshots WHERE id = $1::uuid AND entry_id = $2::uuid",
            target_screenshot_id, entry_id,
        )
    else:
        screenshots = await conn.fetch(
            """SELECT * FROM knowledge_form_screenshots
               WHERE entry_id = $1::uuid AND version = $2 AND vision_status = 'complete'""",
            entry_id, version,
        )

    results = {"processed": 0, "failed": 0, "not_sap": 0, "no_current_chunk": 0}

    for screenshot in screenshots:
        screenshot_id = screenshot["id"]
        section = screenshot["associated_section"]

        if target_screenshot_id:
            extracted_text = await _retry_vision(conn, screenshot, screenshot_id)
            if extracted_text is None:
                results["failed"] += 1
                continue
        else:
            extracted_text = screenshot["extracted_text"]
            if not extracted_text:
                continue

        chunk_rows = await conn.fetch(
            """SELECT * FROM knowledge_form_entry_chunks
               WHERE entry_id = $1::uuid AND version = $2 AND chunk_type = $3 AND is_current = TRUE""",
            entry_id, version, section,
        )
        if not chunk_rows:
            logger.warning(f"enrich_entry_screenshots: no current chunk for entry {entry_id} section {section}. Screenshot stored but not enriched.")
            results["no_current_chunk"] += 1
            continue

        for chunk_row in chunk_rows:
            enriched_text = (
                chunk_row["chunk_text"]
                + f"\n\n[SCREENSHOT: {screenshot['admin_caption']}]\n"
                + extracted_text
            )

            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(f"{BGE_SERVICE_URL}/embed", json={"texts": [enriched_text[:1000]]})
                    resp.raise_for_status()
                    content_vector = resp.json()["embeddings"][0]
            except Exception as e:
                logger.error(f"Re-embedding failed for chunk {chunk_row['qdrant_point_id']}: {e}")
                continue

            point_id = str(chunk_row["qdrant_point_id"])
            try:
                await qdrant_client.update_vectors(collection, point_id, {QDRANT_VECTOR_CONTENT: content_vector})
                await qdrant_client.set_payload(collection, point_id, {"text": enriched_text, "chunk_text": enriched_text})
            except Exception as e:
                logger.error(f"Qdrant update failed during enrichment: {e}")
                continue

            try:
                await opensearch_client.update_document(point_id, {"text": enriched_text, "chunk_text": enriched_text})
            except Exception as e:
                logger.warning(f"OpenSearch update failed during enrichment: {e}")

            await conn.execute(
                "UPDATE knowledge_form_entry_chunks SET chunk_text = $1 WHERE id = $2",
                enriched_text, chunk_row["id"],
            )

        results["processed"] += 1

    return results


async def _retry_vision(conn, screenshot, screenshot_id) -> Optional[str]:
    """Re-downloads the image and re-runs vision extraction. Returns extracted text, or None on failure/rejection."""
    try:
        image_bytes, _ = await minio_client.get_object(MINIO_BUCKET_SCREENSHOTS, screenshot["minio_object_key"])
    except Exception as e:
        await conn.execute(
            "UPDATE knowledge_form_screenshots SET vision_status='failed', vision_error=$1 WHERE id=$2",
            f"MinIO download failed: {e}", screenshot_id,
        )
        return None

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    screen_type = await classify_sap(image_b64)
    extracted = await extract_sap_content(image_b64, screen_type)

    if is_extraction_empty(extracted):
        await conn.execute(
            "UPDATE knowledge_form_screenshots SET vision_status='not_sap', vision_error='No SAP content detected on retry' WHERE id=$1",
            screenshot_id,
        )
        return None

    extracted_text = format_extracted_text(screen_type, extracted)
    await conn.execute(
        "UPDATE knowledge_form_screenshots SET extracted_text=$1, vision_status='complete', vision_error=NULL WHERE id=$2",
        extracted_text, screenshot_id,
    )
    return extracted_text
