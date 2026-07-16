# IMPL_15: RETRIEVAL ENGINE — STAGES 6 TO 8
## CRAG Self-Reflection, Cross-Encoder Reranking, Parent Header Hydration
## Session 15 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 15: Stages 6-8 of the Retrieval Engine — CRAG, reranking, and hydration.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Session 14 complete. `backend/app/services/retrieval_engine.py` exists with stages 1-5.

**What this session does:**
- Adds stages 6-8 methods to the existing `retrieval_engine.py`
- Replaces the temporary `return fused_candidates` in `retrieve()` with the full 8-stage pipeline
- Adds retrieval integration to `chat_handler.py`
- Adds retrieval unit tests

**CRAG Skip Logic (authoritative from AEGIS_MASTER_REFERENCE.md):**
```
Mode A AND top cross-encoder score > 0.82 → SKIP (return "SKIPPED")
Mode B AND top cross-encoder score > 0.80 → SKIP (return "SKIPPED")
Mode C                                     → ALWAYS run CRAG (never skip)
Any mode AND top cross-encoder score <= threshold → run CRAG
```
**Critical:** The CRAG skip decision requires knowing the cross-encoder score. So the order is: rerank FIRST, then decide whether to run CRAG, not the other way around. Stage 7 (reranking) runs before Stage 6 (CRAG decision) in the actual pipeline execution.

---

## UPDATE: backend/app/services/retrieval_engine.py

Add these methods to the existing `RetrievalEngine` class and replace `retrieve()`.

```python
    # ============================================================
    # STAGE 6: CRAG SELF-REFLECTION
    # Must run AFTER Stage 7 (cross-encoder) to know the top score.
    # See pipeline order in retrieve() below.
    # ============================================================

    async def _stage6_crag(
        self,
        enriched_query: EnrichedQuery,
        chunks: List[RetrievedChunk],
        top_cross_encoder_score: float,
    ) -> Tuple[str, Optional[str]]:
        """
        CRAG self-reflection: assess whether retrieved chunks are sufficient.

        Skip conditions (from AEGIS_CONFIGURATION_CONSTANTS.md):
          Mode A AND score > CRAG_SKIP_THRESHOLD_MODE_A (0.82) → SKIP
          Mode B AND score > CRAG_SKIP_THRESHOLD_MODE_B (0.80) → SKIP
          Mode C → ALWAYS run (never skip)

        Returns (assessment, gap_description) where:
          assessment: "SUFFICIENT" | "INSUFFICIENT" | "SKIPPED"
          gap_description: populated if INSUFFICIENT, else None
        """
        from app.config import (
            CRAG_SKIP_THRESHOLD_MODE_A,
            CRAG_SKIP_THRESHOLD_MODE_B,
            OLLAMA_JUDGE_URL, MODEL_JUDGE_CRAG,
            CRAG_MAX_TOKENS, JUDGE_TEMPERATURE,
        )

        mode = enriched_query.retrieval_mode

        # Evaluate skip condition
        if mode == "A" and top_cross_encoder_score > CRAG_SKIP_THRESHOLD_MODE_A:
            logger.debug(
                f"CRAG SKIP: Mode A, score {top_cross_encoder_score:.4f} > {CRAG_SKIP_THRESHOLD_MODE_A}"
            )
            return "SKIPPED", None

        if mode == "B" and top_cross_encoder_score > CRAG_SKIP_THRESHOLD_MODE_B:
            logger.debug(
                f"CRAG SKIP: Mode B, score {top_cross_encoder_score:.4f} > {CRAG_SKIP_THRESHOLD_MODE_B}"
            )
            return "SKIPPED", None

        # Mode C always runs CRAG (never skip)
        if mode == "C":
            logger.debug("CRAG RUNNING: Mode C always runs CRAG")
        else:
            logger.debug(
                f"CRAG RUNNING: Mode {mode}, score {top_cross_encoder_score:.4f} below threshold"
            )

        # Build context from top RETRIEVAL_CRAG_INPUT_CHUNKS chunks
        context_blocks = []
        for i, chunk in enumerate(chunks[:RETRIEVAL_CRAG_INPUT_CHUNKS]):
            context_blocks.append(
                f"[Chunk {i+1} — {chunk.document_id} ({chunk.chunk_type})]\n{chunk.chunk_text[:500]}"
            )
        context_text = "\n\n".join(context_blocks)

        crag_prompt = f"""You are evaluating whether SAP documentation is sufficient to answer an employee question.

Employee Question: {enriched_query.raw_message}

Retrieved SAP Documentation:
{context_text}

Task: Assess whether the documentation above contains enough specific information to give a complete, accurate answer to this exact question.

Respond with EXACTLY one of these two formats:
- If sufficient: SUFFICIENT
- If insufficient: INSUFFICIENT: [one sentence describing what specific information is missing]

Your assessment:"""

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{OLLAMA_JUDGE_URL}/api/generate",
                    json={
                        "model": MODEL_JUDGE_CRAG,
                        "prompt": crag_prompt,
                        "stream": False,
                        "options": {
                            "temperature": JUDGE_TEMPERATURE,
                            "num_predict": CRAG_MAX_TOKENS,
                        },
                    },
                )
                resp.raise_for_status()
                model_response = resp.json().get("response", "").strip()

            # Parse model response
            if model_response.upper().startswith("SUFFICIENT"):
                return "SUFFICIENT", None
            elif model_response.upper().startswith("INSUFFICIENT"):
                # Extract gap description
                parts = model_response.split(":", 1)
                gap_description = parts[1].strip() if len(parts) > 1 else "Knowledge base gap detected"
                logger.info(f"CRAG INSUFFICIENT: {gap_description[:100]}")
                return "INSUFFICIENT", gap_description
            else:
                # Ambiguous response — assume SUFFICIENT to avoid false escalations
                logger.warning(f"CRAG response ambiguous: '{model_response[:50]}' — defaulting to SUFFICIENT")
                return "SUFFICIENT", None

        except Exception as e:
            logger.error(f"CRAG model call failed: {e} — defaulting to SUFFICIENT")
            return "SUFFICIENT", None  # Non-blocking failure: don't escalate on CRAG errors

    # ============================================================
    # STAGE 7: CROSS-ENCODER RERANKING
    # Runs on top RETRIEVAL_CRAG_INPUT_CHUNKS (8) candidates from RRF.
    # Returns top RETRIEVAL_FINAL_CHUNKS (5) chunks sorted by score.
    # ============================================================

    async def _stage7_rerank(
        self,
        enriched_query: EnrichedQuery,
        candidates: List[RetrievedChunk],
    ) -> Tuple[List[RetrievedChunk], float]:
        """
        Cross-encoder reranking using ms-marco-MiniLM-L-12-v2.
        Scores query-chunk pairs and returns top 5 chunks.

        Returns (reranked_chunks, top_score) where top_score is the
        highest cross-encoder score — used for CRAG skip decision.
        """
        from app.config import DEBERTA_SERVICE_URL, RETRIEVAL_FINAL_CHUNKS

        if not candidates:
            return [], 0.0

        # Prepare passages for reranking
        passages = [chunk.chunk_text[:512] for chunk in candidates]  # Truncate to 512 tokens
        query_text = enriched_query.enriched_text[:200]  # Truncate query for reranker

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{DEBERTA_SERVICE_URL}/rerank",
                    json={
                        "query": query_text,
                        "passages": passages,
                    },
                )
                resp.raise_for_status()
                scores = resp.json()["scores"]

        except Exception as e:
            logger.error(f"Stage 7 reranking failed: {e} — returning original RRF order")
            # Fallback: return original order with score 0
            top_chunks = candidates[:RETRIEVAL_FINAL_CHUNKS]
            for chunk in top_chunks:
                chunk.cross_encoder_score = 0.0
            return top_chunks, 0.0

        # Attach scores to chunks
        for chunk, score in zip(candidates, scores):
            chunk.cross_encoder_score = score

        # Sort by cross-encoder score descending
        ranked = sorted(candidates, key=lambda c: c.cross_encoder_score, reverse=True)
        top_chunks = ranked[:RETRIEVAL_FINAL_CHUNKS]
        top_score = top_chunks[0].cross_encoder_score if top_chunks else 0.0

        logger.debug(
            f"Stage 7 reranking: top score={top_score:.4f}, "
            f"kept {len(top_chunks)} of {len(candidates)} chunks"
        )
        return top_chunks, top_score

    # ============================================================
    # STAGE 8: PARENT HEADER HYDRATION
    # ============================================================

    async def _stage8_hydration(
        self,
        chunks: List[RetrievedChunk],
    ):
        """
        Ensure the parent header chunk is available for every retrieved document.
        The parent header contains the document context: error code, procedure name,
        config name, module, T-codes, verification date.

        If NO header chunk is present in the top 5 → fetch header from Qdrant.
        Returns a ParentHeader object, or None if already in top 5.
        """
        from app.models.retrieval import ParentHeader

        if not chunks:
            return None

        HEADER_CHUNK_TYPES = {
            "header", "procedure_header", "config_overview",
            "error_header", "proc_header", "cfg_header",
        }

        # Check if any top chunk is a header
        for chunk in chunks:
            if chunk.chunk_type in HEADER_CHUNK_TYPES:
                logger.debug("Stage 8: header chunk already in top results — no hydration needed")
                return None

        # No header found — fetch from Qdrant for the primary document
        primary_doc_id = chunks[0].document_id if chunks else None
        if not primary_doc_id:
            return None

        try:
            qdrant = await self._get_qdrant()
            collection = await self._find_document_collection(primary_doc_id)
            if not collection:
                return None

            # Fetch all chunks for this document and find the header
            dummy_vector = [0.0] * 768  # We filter by chunk_type so score doesn't matter
            all_doc_chunks = await qdrant.search_by_document_id(
                collection_name=collection,
                document_id=primary_doc_id,
                query_vector=dummy_vector,
                chunk_types=list(HEADER_CHUNK_TYPES),
            )

            if not all_doc_chunks:
                logger.debug(f"Stage 8: no header chunk found for {primary_doc_id}")
                return None

            header_payload = all_doc_chunks[0]["payload"]

            parent = ParentHeader(
                document_id=primary_doc_id,
                content_type=header_payload.get("content_type", ""),
                error_code=header_payload.get("error_code"),
                configuration_name=header_payload.get("configuration_name"),
                procedure_name=header_payload.get("procedure_name"),
                module=header_payload.get("module", ""),
                transactions=header_payload.get("transactions", []),
                last_verified_date=header_payload.get("last_verified_date", ""),
                verified_by=header_payload.get("verified_by", ""),
            )

            logger.debug(f"Stage 8: parent header hydrated for {primary_doc_id}")
            return parent

        except Exception as e:
            logger.error(f"Stage 8 hydration failed: {e}")
            return None

    # ============================================================
    # COMPLETE retrieve() METHOD (replace temporary version from Session 14)
    # ============================================================

    async def retrieve(self, enriched_query: EnrichedQuery):
        """
        Complete 8-stage retrieval pipeline.

        Execution order:
          1. Registry (Mode A)              ← get document directly
          2+3. Qdrant + OpenSearch          ← parallel semantic + keyword
          4. Knowledge Graph               ← expand via relationships
          5. RRF Fusion                    ← merge all sources
          7. Cross-Encoder Reranking       ← score query-chunk pairs
          6. CRAG Self-Reflection          ← assess sufficiency (needs top score from Stage 7)
          8. Parent Header Hydration       ← add document context if missing

        Note: Stage 7 runs before Stage 6 because CRAG skip needs the cross-encoder score.
        """
        from app.models.retrieval import RetrievalResult

        logger.info(
            f"Retrieval pipeline: session={enriched_query.session_id}, "
            f"mode={enriched_query.retrieval_mode}, "
            f"classification={enriched_query.classification}"
        )

        # Stage 1: Registry (Mode A only)
        registry_chunks = []
        if enriched_query.retrieval_mode == "A":
            registry_chunks = await self._stage1_registry(enriched_query)

        # Stages 2 and 3: Parallel Qdrant + OpenSearch
        qdrant_results, opensearch_results = await asyncio.gather(
            self._stage2_qdrant(enriched_query),
            self._stage3_opensearch(enriched_query),
            return_exceptions=True,
        )
        if isinstance(qdrant_results, Exception):
            logger.error(f"Qdrant stage failed: {qdrant_results}")
            qdrant_results = []
        if isinstance(opensearch_results, Exception):
            logger.error(f"OpenSearch stage failed: {opensearch_results}")
            opensearch_results = []

        # Stage 4: Knowledge Graph expansion
        kg_results = await self._stage4_knowledge_graph(enriched_query, qdrant_results)

        # Stage 5: RRF Fusion → 8 candidates
        fused_candidates = self._stage5_rrf_fusion(
            retrieval_mode=enriched_query.retrieval_mode,
            registry_results=registry_chunks,
            qdrant_results=qdrant_results,
            opensearch_results=opensearch_results,
            kg_results=kg_results,
        )

        if not fused_candidates:
            logger.warning("Retrieval pipeline: no candidates after RRF fusion")
            return RetrievalResult(
                chunks=[],
                parent_header=None,
                registry_notes="",
                crag_assessment="INSUFFICIENT",
                crag_gap_description="No documentation found for this query.",
                retrieval_mode_used=enriched_query.retrieval_mode,
                top_cross_encoder_score=0.0,
            )

        # Stage 7: Cross-Encoder Reranking (BEFORE CRAG — provides top score for skip logic)
        reranked_chunks, top_cross_encoder_score = await self._stage7_rerank(
            enriched_query, fused_candidates
        )

        # Stage 6: CRAG Self-Reflection (uses top_cross_encoder_score from Stage 7)
        crag_assessment, crag_gap_description = await self._stage6_crag(
            enriched_query, reranked_chunks, top_cross_encoder_score
        )

        # If INSUFFICIENT, queue knowledge gap task (fire-and-forget)
        if crag_assessment == "INSUFFICIENT":
            from app.infrastructure.redis_client import redis_queue
            import json, uuid
            from datetime import datetime
            gap_payload = json.dumps({
                "task_type": "knowledge_gap",
                "task_id": str(uuid.uuid4()),
                "session_id": enriched_query.session_id,
                "query_text": enriched_query.raw_message,
                "extracted_entities": [
                    {"type": e.type, "value": e.value}
                    for e in enriched_query.entities
                ],
                "gap_description": crag_gap_description or "CRAG assessment: INSUFFICIENT",
                "occurred_at": datetime.utcnow().isoformat(),
            })
            try:
                await redis_queue.redis.rpush("arq:queue:knowledge_gap", gap_payload)
            except Exception as e:
                logger.error(f"Failed to queue knowledge gap task: {e}")

        # Stage 8: Parent Header Hydration
        parent_header = await self._stage8_hydration(reranked_chunks)

        registry_notes = ""
        if enriched_query.registry_result:
            registry_notes = enriched_query.registry_result.registry_notes

        result = RetrievalResult(
            chunks=reranked_chunks,
            parent_header=parent_header,
            registry_notes=registry_notes,
            crag_assessment=crag_assessment,
            crag_gap_description=crag_gap_description,
            retrieval_mode_used=enriched_query.retrieval_mode,
            top_cross_encoder_score=top_cross_encoder_score,
        )

        logger.info(
            f"Retrieval complete: {len(reranked_chunks)} chunks, "
            f"CRAG={crag_assessment}, top_score={top_cross_encoder_score:.4f}"
        )
        return result
```

---

## FILE 2: tests/unit/test_retrieval_stages_6_to_8.py

```python
"""Unit tests for Retrieval Engine stages 6-8."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.retrieval_engine import RetrievalEngine
from app.models.retrieval import EnrichedQuery, RetrievedChunk
from app.models.session import EntityObject
from app.config import CRAG_SKIP_THRESHOLD_MODE_A, CRAG_SKIP_THRESHOLD_MODE_B


@pytest.fixture
def engine():
    return RetrievalEngine()


def make_chunk(chunk_id, doc_id, score=0.0, chunk_type="cause_resolution"):
    return RetrievedChunk(
        chunk_id=chunk_id, document_id=doc_id,
        content_type="error_guide", chunk_type=chunk_type,
        chunk_text=f"SAP documentation for {chunk_id}",
        last_verified_date="2024-03-28", verified_by="Rsuresh1",
        cross_encoder_score=score, rrf_score=0.05,
    )


def make_query(mode="B", classification="ERROR_RESOLUTION"):
    return EnrichedQuery(
        raw_message="VL150 error when creating delivery",
        enriched_text="VL150 error when creating delivery VL150 VL150 VL150",
        entities=[EntityObject(type="error_code", value="VL150")],
        context_entity=None, retrieval_mode=mode,
        classification=classification, registry_result=None,
        session_id="test-session", trace_id="test-trace",
    )


class TestCRAGSkipLogic:
    def test_mode_a_high_score_skips_crag(self, engine):
        """Mode A with score > 0.82 → SKIP"""
        import asyncio
        query = make_query(mode="A")
        chunks = [make_chunk("chunk-A", "SD-ERR-001")]
        high_score = CRAG_SKIP_THRESHOLD_MODE_A + 0.01

        with patch.object(engine, '_stage6_crag', wraps=engine._stage6_crag):
            result = asyncio.run(engine._stage6_crag(query, chunks, high_score))
        assert result[0] == "SKIPPED"
        assert result[1] is None

    def test_mode_b_high_score_skips_crag(self, engine):
        """Mode B with score > 0.80 → SKIP"""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-B", "SD-ERR-001")]
        high_score = CRAG_SKIP_THRESHOLD_MODE_B + 0.01

        result = asyncio.run(engine._stage6_crag(query, chunks, high_score))
        assert result[0] == "SKIPPED"

    def test_mode_b_low_score_runs_crag(self, engine):
        """Mode B with score <= 0.80 → run CRAG (mock model to return SUFFICIENT)"""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-C", "SD-ERR-001")]
        low_score = CRAG_SKIP_THRESHOLD_MODE_B - 0.05

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.json.return_value = {"response": "SUFFICIENT"}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            result = asyncio.run(engine._stage6_crag(query, chunks, low_score))

        # Should have attempted CRAG (not SKIPPED)
        assert result[0] in {"SUFFICIENT", "INSUFFICIENT"}

    def test_mode_c_always_runs_crag(self, engine):
        """Mode C never skips CRAG regardless of score"""
        import asyncio
        query = make_query(mode="C")
        chunks = [make_chunk("chunk-D", "SD-ERR-001")]
        very_high_score = 0.99  # Even very high score → still runs

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.json.return_value = {"response": "SUFFICIENT"}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            result = asyncio.run(engine._stage6_crag(query, chunks, very_high_score))

        # Mode C must NOT skip
        assert result[0] != "SKIPPED"

    def test_crag_insufficient_parsed(self, engine):
        """INSUFFICIENT response correctly parsed with gap description"""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-E", "SD-ERR-001")]
        low_score = 0.50

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.json.return_value = {
                "response": "INSUFFICIENT: The documentation does not cover plant 9000 specifics"
            }
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            assessment, gap_desc = asyncio.run(engine._stage6_crag(query, chunks, low_score))

        assert assessment == "INSUFFICIENT"
        assert "plant 9000" in gap_desc.lower()

    def test_crag_model_failure_defaults_to_sufficient(self, engine):
        """If model call fails, default to SUFFICIENT (don't block employees)"""
        import asyncio
        query = make_query(mode="B")
        chunks = [make_chunk("chunk-F", "SD-ERR-001")]

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(side_effect=Exception("Network error"))

            assessment, gap = asyncio.run(engine._stage6_crag(query, chunks, 0.50))

        assert assessment == "SUFFICIENT"
        assert gap is None


class TestCrossEncoderReranking:
    def test_highest_scoring_chunk_comes_first(self, engine):
        """After reranking, chunk with highest cross-encoder score is first."""
        import asyncio
        query = make_query()
        chunks = [
            make_chunk("chunk-1", "SD-ERR-001"),
            make_chunk("chunk-2", "SD-ERR-002"),
            make_chunk("chunk-3", "SD-ERR-003"),
        ]

        # Mock reranker to return scores [0.3, 0.9, 0.5]
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.json.return_value = {"scores": [0.3, 0.9, 0.5]}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            result_chunks, top_score = asyncio.run(engine._stage7_rerank(query, chunks))

        # chunk-2 should be first (score 0.9)
        assert result_chunks[0].chunk_id == "chunk-2"
        assert abs(top_score - 0.9) < 0.001

    def test_returns_at_most_final_chunks(self, engine):
        """Should return at most RETRIEVAL_FINAL_CHUNKS (5) results."""
        import asyncio
        from app.config import RETRIEVAL_FINAL_CHUNKS
        query = make_query()
        chunks = [make_chunk(f"chunk-{i}", f"doc-{i}") for i in range(8)]
        mock_scores = [float(i) * 0.1 for i in range(8)]

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.json.return_value = {"scores": mock_scores}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(return_value=mock_response)

            result_chunks, _ = asyncio.run(engine._stage7_rerank(query, chunks))

        assert len(result_chunks) <= RETRIEVAL_FINAL_CHUNKS

    def test_rerank_failure_returns_original_order(self, engine):
        """Reranker failure falls back to original RRF order."""
        import asyncio
        query = make_query()
        chunks = [make_chunk(f"chunk-{i}", "SD-ERR-001") for i in range(3)]

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value.post = AsyncMock(side_effect=Exception("Service down"))

            result_chunks, top_score = asyncio.run(engine._stage7_rerank(query, chunks))

        # Should still return chunks, just with score 0
        assert len(result_chunks) > 0
        assert top_score == 0.0


class TestParentHeaderHydration:
    def test_header_already_present_returns_none(self, engine):
        """If header chunk is in top 5, no hydration needed."""
        import asyncio
        chunks = [make_chunk("chunk-1", "SD-ERR-001", chunk_type="header")]

        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None

    def test_no_chunks_returns_none(self, engine):
        import asyncio
        result = asyncio.run(engine._stage8_hydration([]))
        assert result is None

    def test_procedure_header_type_recognized(self, engine):
        """procedure_header chunk type should count as a header."""
        import asyncio
        chunks = [make_chunk("chunk-1", "SD-PROC-001", chunk_type="procedure_header")]

        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None  # Header already present

    def test_config_overview_type_recognized(self, engine):
        """config_overview chunk type should count as a header."""
        import asyncio
        chunks = [make_chunk("chunk-1", "FI-CFG-003", chunk_type="config_overview")]

        result = asyncio.run(engine._stage8_hydration(chunks))
        assert result is None  # Header already present
```

---

## INTEGRATION — Update chat_handler.py

In `backend/app/handlers/chat_handler.py`, update `_handle_client_message` to call the retrieval engine:

```python
# Replace the placeholder pipeline in _handle_client_message:

async def _handle_client_message(websocket, session_id, session, data):
    if data.get("type") == "message":
        from app.services.query_intelligence import query_intelligence
        from app.services.retrieval_engine import retrieval_engine
        from app.models.session import SessionState

        query_text = data.get("message", "").strip()
        if not query_text:
            return

        # Load session
        session_data = await redis_session.get_session(session_id)
        if session_data:
            session = SessionState.from_redis_hash(session_data)

        # Stage A: QIL
        enriched_query = await query_intelligence.process(
            raw_message=query_text, session=session,
            session_id=session_id,
            trace_id=getattr(websocket.state, "trace_id", str(uuid.uuid4())),
        )

        # Check for DiagnosticObject from vision
        from app.infrastructure.redis_client import redis_session as rs
        diag_obj = await rs.get_diagnostic_object(session_id)
        if diag_obj:
            from app.services.vision_integration import vision_integration
            enriched_query.enriched_text = vision_integration.enrich_query_with_diagnostic(
                enriched_query.enriched_text, diag_obj
            )

        # Cache hit: return immediately
        if enriched_query.cache_hit:
            await websocket.send_json({
                "type": "token", "token": enriched_query.cached_answer, "session_id": session_id
            })
            await websocket.send_json({"type": "stream_complete", "session_id": session_id})
            return

        # Stage B: Retrieval Engine (all 8 stages)
        retrieval_result = await retrieval_engine.retrieve(enriched_query)

        # If INSUFFICIENT: send escalation message
        if retrieval_result.crag_assessment == "INSUFFICIENT":
            await websocket.send_json({
                "type": "error",
                "error_code": "INSUFFICIENT",
                "message": (
                    "I could not find sufficient documentation in the AEGIS knowledge base "
                    "to answer your question. A support ticket has been raised for the IT team. "
                    "Ticket reference will appear shortly."
                ),
                "ticket_id": None,
                "session_id": session_id,
            })
            return

        # Stage C: Reasoning + Validation (Sessions 16-17)
        # Placeholder for now — show retrieval summary
        doc_ids = [c.document_id for c in retrieval_result.chunks]
        await websocket.send_json({
            "type": "token",
            "token": (
                f"[Retrieval complete: {len(retrieval_result.chunks)} chunks from "
                f"{list(set(doc_ids))[:3]}, "
                f"CRAG={retrieval_result.crag_assessment}, "
                f"top_score={retrieval_result.top_cross_encoder_score:.2f}. "
                f"Reasoning pipeline (Session 16) will generate the full answer.]"
            ),
            "session_id": session_id,
        })
        await websocket.send_json({"type": "stream_complete", "session_id": session_id})
```

---

## VERIFICATION STEPS

### Step 1: Run all unit tests
```bash
cd backend && source venv/bin/activate
python -m pytest tests/unit/test_retrieval_engine.py tests/unit/test_retrieval_stages_6_to_8.py -v
```
Expected: All tests pass.

### Step 2: Verify CRAG skip thresholds
```bash
python3 -c "
from app.config import CRAG_SKIP_THRESHOLD_MODE_A, CRAG_SKIP_THRESHOLD_MODE_B
print(f'Mode A skip threshold: {CRAG_SKIP_THRESHOLD_MODE_A}  (must be 0.82)')
print(f'Mode B skip threshold: {CRAG_SKIP_THRESHOLD_MODE_B}  (must be 0.80)')
assert CRAG_SKIP_THRESHOLD_MODE_A == 0.82
assert CRAG_SKIP_THRESHOLD_MODE_B == 0.80
print('Thresholds verified')
"
```

### Step 3: Verify stage execution order
```bash
python3 -c "
# Confirm the pipeline runs Stage 7 before Stage 6
# (critical: CRAG needs cross-encoder score to decide skip)
import inspect
from app.services.retrieval_engine import RetrievalEngine

source = inspect.getsource(RetrievalEngine.retrieve)
idx_7 = source.find('_stage7_rerank')
idx_6 = source.find('_stage6_crag')
print(f'Stage 7 position in source: {idx_7}')
print(f'Stage 6 position in source: {idx_6}')
print(f'Stage 7 runs before Stage 6: {idx_7 < idx_6}')
assert idx_7 < idx_6, 'ERROR: Stage 7 must run before Stage 6!'
print('Pipeline order verified')
"
```

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-15: Retrieval stages 6-8 - CRAG, reranking, hydration verified"
```

Update DECISIONS_LOG.md with:
- All CRAG skip logic tests passing
- CRAG model failure graceful fallback confirmed
- Cross-encoder reranking with highest-score-first ordering confirmed
- Header hydration types recognised (header, procedure_header, config_overview)
- Stage 7 confirmed running before Stage 6 in pipeline

---

*Document version: 1.0 | AEGIS Specification Set*
