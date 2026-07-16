"""
AEGIS Feedback Diagnosis Task
Classifies thumbs-down feedback as retrieval failure or generation failure.

Algorithm:
1. Re-run retrieval for the failed query
2. Evaluate each claim against retrieved chunks using DeBERTa NLI
3. If avg max entailment < 0.65 -> retrieval failure -> knowledge_gap_events
4. If avg max entailment >= 0.65 -> generation failure -> human_review_queue
"""
import json
import logging
from typing import Dict

from app.config import FEEDBACK_RETRIEVAL_FAIL_THRESHOLD

logger = logging.getLogger(__name__)


async def run_feedback_diagnosis(ctx: Dict, feedback_data: Dict):
    """
    ARQ feedback diagnosis task.
    Retry: 2 times, 60s delay.
    """
    feedback_event_id = feedback_data["feedback_event_id"]
    query_text = feedback_data["query_text"]
    answer_text = feedback_data["answer_text"]

    logger.info(f"Feedback diagnosis started for feedback_event_id={feedback_event_id}")

    try:
        import re
        import httpx
        import asyncpg
        from app.config import (
            DEBERTA_SERVICE_URL, BGE_SERVICE_URL,
            QDRANT_HOST, QDRANT_PORT,
            POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
        )

        async with httpx.AsyncClient(timeout=60) as client:
            embed_resp = await client.post(
                f"{BGE_SERVICE_URL}/embed-single",
                json={"text": query_text}
            )
            query_vector = embed_resp.json()["embedding"]

            from qdrant_client import QdrantClient
            from qdrant_client.models import SearchParams, NamedVector
            qclient = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
            search_results = qclient.search(
                collection_name="meridian_errors",
                query_vector=NamedVector(name="content", vector=query_vector),
                limit=5,
                search_params=SearchParams(hnsw_ef=64),
                with_payload=True,
            )
            chunks = [r.payload.get("chunk_text", "") for r in search_results]

            claims = [s.strip() for s in re.split(r'[.!?]+', answer_text) if len(s.strip()) > 20]

            if not claims or not chunks:
                logger.warning(f"No claims or chunks for diagnosis of {feedback_event_id}")
                return

            all_max_entailments = []
            for claim in claims[:5]:
                max_ent = 0.0
                for chunk in chunks[:3]:
                    chunk_words = chunk.split()
                    chunk_truncated = " ".join(chunk_words[:280])

                    nli_resp = await client.post(
                        f"{DEBERTA_SERVICE_URL}/nli",
                        json={"hypothesis": claim, "premises": [chunk_truncated]}
                    )
                    nli_result = nli_resp.json()
                    max_ent = max(max_ent, nli_result.get("max_entailment", 0.0))

                all_max_entailments.append(max_ent)

            avg_entailment = sum(all_max_entailments) / len(all_max_entailments) if all_max_entailments else 0.0

        conn = await asyncpg.connect(
            host=POSTGRES_HOST, port=POSTGRES_PORT,
            database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD
        )
        try:
            if avg_entailment < FEEDBACK_RETRIEVAL_FAIL_THRESHOLD:
                diagnosis_type = "retrieval_failure"
                await conn.execute(
                    """
                    INSERT INTO knowledge_gap_events (session_id, query_text, extracted_entities, gap_description)
                    VALUES ($1, $2, $3, $4)
                    """,
                    feedback_data.get("session_id", "unknown"),
                    query_text,
                    json.dumps([]),
                    f"Feedback diagnosis: avg entailment {avg_entailment:.2f} < threshold.",
                )
                logger.info(f"Feedback {feedback_event_id}: RETRIEVAL FAILURE (avg_ent={avg_entailment:.2f})")
            else:
                diagnosis_type = "generation_failure"
                await conn.execute(
                    """
                    INSERT INTO human_review_queue (source_feedback_id, query_text, answer_text, unsupported_claims)
                    VALUES ($1, $2, $3, $4)
                    """,
                    feedback_event_id,
                    query_text,
                    answer_text,
                    [],
                )
                logger.info(f"Feedback {feedback_event_id}: GENERATION FAILURE (avg_ent={avg_entailment:.2f})")

            await conn.execute(
                """
                UPDATE feedback_events
                SET diagnosis_result = $1, diagnosis_completed_at = NOW()
                WHERE id = $2
                """,
                json.dumps({"type": diagnosis_type, "avg_entailment": avg_entailment}),
                feedback_event_id,
            )
        finally:
            await conn.close()

    except Exception as e:
        logger.error(f"Feedback diagnosis failed for {feedback_event_id}: {e}")
        raise
