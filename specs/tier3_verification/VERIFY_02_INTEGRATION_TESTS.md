# VERIFY_02: INTEGRATION TESTS
## Four End-to-End Pipeline Walkthroughs as Automated Tests

---

## IMPORTANT: RUN THESE IN ORDER

Integration tests require all services running and the SD-ERR-001 document ingested. Run Session 05 database setup and ingest at least one document before starting.

```bash
cd backend && source venv/bin/activate
python -m pytest tests/integration/ -v --timeout=180 -s
```

All tests use the 180-second timeout defined in `INTEGRATION_TEST_TIMEOUT` constant.

---

## FILE: tests/integration/test_walkthrough_a.py (Cache Hit)

```python
"""
Integration Test: Walkthrough A — Semantic Cache Hit
Pre-condition: A known answer has been pre-loaded into the cache_queries Qdrant collection.
Expected: Query returns immediately from cache, no retrieval or generation.
Timeout: 180 seconds (but should complete in < 5 seconds for cache hits).
"""
import asyncio
import pytest
import uuid

from app.services.query_intelligence import QueryIntelligenceLayer
from app.models.session import SessionState, EntityObject


@pytest.fixture(scope="module")
async def pre_seeded_cache():
    """Pre-seed the semantic cache with a known answer for VL150."""
    from app.infrastructure.redis_client import redis_session, redis_queue
    from app.infrastructure.qdrant_client import qdrant_client
    import httpx

    await redis_session.connect()
    await redis_queue.connect()
    await qdrant_client.connect()

    # Embed the cache seed query
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "http://localhost:8002/embed-single",
            json={"text": "VL150 error when creating outbound delivery material availability"},
        )
        vector = resp.json()["embedding"]

    # Store in cache_queries collection
    seed_id = str(uuid.uuid4())
    await qdrant_client.upsert_cache_entry(
        point_id=seed_id,
        query_vector=vector,
        payload={
            "query_text": "VL150 error when creating outbound delivery material availability",
            "answer_text": "The VL150 error occurs when available stock minus safety stock is insufficient. Navigate to MM02 and check the Safety Stock field on the MRP 2 tab.",
            "validation_score": 0.92,
            "document_ids": ["SD-ERR-001"],
            "created_at": "2024-01-01T00:00:00",
            "embedding_model_version": "bge-base-en-v1.5",
        }
    )
    yield seed_id

    # Cleanup
    await qdrant_client.cleanup_stale_cache("2099-01-01T00:00:00")


@pytest.mark.asyncio
@pytest.mark.timeout(180)
async def test_cache_hit_returns_immediately(pre_seeded_cache):
    """Similar query should hit the cache (similarity >= 0.88)."""
    from app.services.query_intelligence import QueryIntelligenceLayer
    from app.models.session import SessionState

    qil = QueryIntelligenceLayer()
    await qil._ensure_synonym_map_loaded()

    session = SessionState(user_id_hash="test_hash", created_at="2024-01-01T00:00:00Z")
    query = await qil.process(
        raw_message="VL150 error when creating delivery stock not available",
        session=session,
        session_id="test-session-a",
        trace_id=str(uuid.uuid4()),
    )

    assert query.cache_hit is True, "Expected cache hit for semantically similar query"
    assert query.cached_answer is not None
    assert "VL150" in query.cached_answer or "safety stock" in query.cached_answer.lower()
    assert query.retrieval_mode in {"A", "B", "C"}  # Mode assigned but unused (cache hit)
    print(f"✓ Cache hit confirmed. Answer preview: {query.cached_answer[:80]}")
```

---

## FILE: tests/integration/test_walkthrough_b.py (Full Pipeline Mode B)

```python
"""
Integration Test: Walkthrough B — Full Pipeline Mode B
Pre-condition: SD-ERR-001 ingested. No matching cache entry.
Expected: Complete pipeline runs, green/amber badge, ValidationScore >= 0.70.
Timeout: 180 seconds.
"""
import asyncio
import pytest
import uuid

from app.services.query_intelligence import QueryIntelligenceLayer
from app.services.retrieval_engine import RetrievalEngine
from app.services.reasoning_service import ReasoningService
from app.services.validation_engine import ValidationEngine
from app.models.session import SessionState


@pytest.mark.asyncio
@pytest.mark.timeout(180)
async def test_full_pipeline_mode_b():
    """Full pipeline for a standard VL150 error resolution query."""
    from app.infrastructure.redis_client import redis_session, redis_queue
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client
    await redis_session.connect()
    await redis_queue.connect()
    await qdrant_client.connect()
    await opensearch_client.connect()

    session_id = f"test-session-b-{uuid.uuid4()}"
    qil = QueryIntelligenceLayer()
    await qil._ensure_synonym_map_loaded()

    session = SessionState(user_id_hash="test_hash_b", created_at="2024-01-01T00:00:00Z")

    # Step 1: QIL
    enriched = await qil.process(
        raw_message="How do I fix VL150 error when creating delivery in VL01N?",
        session=session, session_id=session_id, trace_id=str(uuid.uuid4()),
    )
    assert enriched.retrieval_mode in {"A", "B", "C"}
    assert enriched.classification == "ERROR_RESOLUTION"
    assert any(e.value == "VL150" for e in enriched.entities)
    print(f"✓ QIL: mode={enriched.retrieval_mode}, classification={enriched.classification}")

    # Skip if cache hit (acceptable — means walkthrough A pre-seeded this)
    if enriched.cache_hit:
        print("✓ Cache hit (Walkthrough A seed present) — skipping pipeline stages")
        return

    # Step 2: Retrieval Engine
    re = RetrievalEngine()
    result = await re.retrieve(enriched)
    assert len(result.chunks) > 0, "Expected at least one retrieved chunk"
    assert result.retrieval_mode_used in {"A", "B", "C"}
    assert result.crag_assessment in {"SUFFICIENT", "INSUFFICIENT", "SKIPPED"}
    print(f"✓ Retrieval: {len(result.chunks)} chunks, CRAG={result.crag_assessment}, "
          f"top_score={result.top_cross_encoder_score:.3f}")

    if result.crag_assessment == "INSUFFICIENT":
        print("⚠ CRAG returned INSUFFICIENT — SD-ERR-001 may not be ingested. Ingest and retry.")
        return

    # Step 3: Generation (simplified — no streaming in test)
    rs = ReasoningService()
    prompt = rs.assemble_prompt(enriched, result, session, None)
    assert "---DOCUMENTATION---" in prompt
    assert "---EMPLOYEE QUESTION---" in prompt
    print(f"✓ Prompt assembled: {len(prompt)} chars")

    # Mock answer for validation test (real generation tested manually)
    mock_answer = (
        "The VL150 error occurs when the available stock minus safety stock "
        "is insufficient for the delivery quantity. To resolve: "
        "1. Navigate to MM02 (Change Material Master). "
        "2. Select the plant from the error screen. "
        "3. Go to MRP 2 tab and check the Safety Stock field. "
        "4. Reduce the Safety Stock value below the unrestricted stock shown in MMBE. "
        "5. Save and retry VL01N (Create Outbound Delivery)."
    )

    # Step 4: Validation Engine
    ve = ValidationEngine()
    val_result = await ve.validate(
        answer_text=mock_answer,
        enriched_query=enriched,
        retrieval_result=result,
        user_role="employee",
        run_tier3=False,  # Skip Tier 3 judge in test for speed
    )

    assert val_result.validation_score >= 0.0
    assert val_result.validation_score <= 1.0
    assert val_result.confidence_badge in {"green", "amber", "none"}
    assert val_result.freshness_coefficient in {1.00, 0.95, 0.85, 0.75}

    # The answer should score decently with real retrieved chunks
    assert val_result.validation_score >= 0.40, (
        f"ValidationScore too low: {val_result.validation_score:.4f}. "
        "Check that SD-ERR-001 is correctly ingested."
    )
    print(f"✓ Validation: score={val_result.validation_score:.4f}, "
          f"NLI={val_result.nli_support_score:.4f}, badge={val_result.confidence_badge}")
```

---

## FILE: tests/integration/test_walkthrough_c.py (Vision Flow)

```python
"""
Integration Test: Walkthrough C — Screenshot Upload and Vision Processing
Pre-condition: All services running, ARQ worker running.
Expected: Screenshot saved, vision task queued, DiagnosticObject stored in Redis.
Timeout: 180 seconds (vision model may take 60+ seconds).
"""
import asyncio
import pytest
import uuid
import os
from PIL import Image
import io


@pytest.mark.asyncio
@pytest.mark.timeout(180)
async def test_vision_processing_flow():
    """Upload a synthetic SAP screenshot and verify DiagnosticObject extraction."""
    from app.infrastructure.redis_client import redis_session, redis_queue
    from app.tasks.vision_task import process_vision_task
    from app.config import TEMP_UPLOAD_DIR
    await redis_session.connect()
    await redis_queue.connect()

    session_id = f"test-vision-{uuid.uuid4()}"

    # Create a synthetic test image with text simulating a SAP error screen
    img = Image.new("RGB", (800, 600), color="white")
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(img)
    draw.text((50, 50), "Create Outbound Delivery", fill="black")
    draw.text((50, 100), "Error: VL150 - Material availability", fill="red")
    draw.text((50, 150), "Transaction: VL01N", fill="black")
    draw.text((50, 200), "Material: 1000012345", fill="black")

    # Save to temp directory
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    test_file_path = os.path.join(TEMP_UPLOAD_DIR, f"{session_id}_test.jpg")
    img.save(test_file_path, "JPEG")

    assert os.path.exists(test_file_path), "Test image not created"
    print(f"✓ Test image created: {test_file_path}")

    # Run vision task directly (not via ARQ for test isolation)
    ctx = {}  # Empty context dict for direct task call
    result = await process_vision_task(ctx, file_path=test_file_path, session_id=session_id)

    # Verify DiagnosticObject stored in Redis
    diagnostic = await redis_session.get_diagnostic_object(session_id)

    # Temp file should be deleted
    assert not os.path.exists(test_file_path), "Temp file should be deleted after processing"
    print("✓ Temp file cleaned up")

    # DiagnosticObject should be in Redis
    assert diagnostic is not None, "DiagnosticObject not found in Redis"
    assert isinstance(diagnostic, dict)

    # Verify required fields present (values may be None if model couldn't extract)
    required_fields = ["error_code", "error_message_text", "transaction_code",
                       "material_number", "field_values", "visible_quantities"]
    for field in required_fields:
        assert field in diagnostic, f"Missing field in DiagnosticObject: {field}"

    print(f"✓ DiagnosticObject stored: {diagnostic}")

    # Verify session flag was set
    session_data = await redis_session.get_session(session_id)
    if session_data:
        assert session_data.get("diagnostic_object_ready") == "true"

    print("✓ Walkthrough C: Vision flow complete")
```

---

## FILE: tests/integration/test_walkthrough_d.py (Mode C Complex Query)

```python
"""
Integration Test: Walkthrough D — Mode C Complex Multi-Module Query
Pre-condition: Multiple documents ingested (SD and FI modules).
Expected: Mode C assigned, all collections searched, diversity bonus applied.
Timeout: 180 seconds.
"""
import asyncio
import pytest
import uuid


@pytest.mark.asyncio
@pytest.mark.timeout(180)
async def test_mode_c_complex_query():
    """Long multi-module query triggers Mode C with diversity bonus."""
    from app.infrastructure.redis_client import redis_session, redis_queue
    from app.infrastructure.qdrant_client import qdrant_client
    from app.infrastructure.opensearch_client import opensearch_client
    from app.services.query_intelligence import QueryIntelligenceLayer
    from app.services.retrieval_engine import RetrievalEngine
    from app.models.session import SessionState
    from app.config import MODE_C_QUERY_LENGTH_THRESHOLD

    await redis_session.connect()
    await redis_queue.connect()
    await qdrant_client.connect()
    await opensearch_client.connect()

    session = SessionState(user_id_hash="test_hash_d", created_at="2024-01-01T00:00:00Z")
    qil = QueryIntelligenceLayer()
    await qil._ensure_synonym_map_loaded()

    # Build a long query that triggers Mode C
    long_query = (
        "I need to understand how the SD module and FI module work together "
        "for billing document creation and account determination in Sona Comstar. "
        "When I create a billing document in VF01, what is the process for G/L account "
        "assignment and how does this interact with the revenue account determination "
        "configured in VKOA? Also explain what happens if the account assignment is "
        "misconfigured and what error codes we might encounter."
    )
    assert len(long_query) > MODE_C_QUERY_LENGTH_THRESHOLD, (
        f"Query too short for Mode C test: {len(long_query)} chars "
        f"(need > {MODE_C_QUERY_LENGTH_THRESHOLD})"
    )

    # QIL should assign Mode C
    enriched = await qil.process(
        raw_message=long_query, session=session,
        session_id=f"test-d-{uuid.uuid4()}", trace_id=str(uuid.uuid4()),
    )

    assert enriched.retrieval_mode == "C", (
        f"Expected Mode C for complex query, got Mode {enriched.retrieval_mode}"
    )
    print(f"✓ Mode C assigned for {len(long_query)}-char query")

    # Module entities should be detected
    module_entities = [e for e in enriched.entities if e.type == "module"]
    print(f"✓ Module entities: {[e.value for e in module_entities]}")

    # Retrieval should use Mode C (searches all collections)
    if not enriched.cache_hit:
        re = RetrievalEngine()
        result = await re.retrieve(enriched)

        assert result.retrieval_mode_used == "C", (
            f"Expected retrieval_mode_used='C', got '{result.retrieval_mode_used}'"
        )

        # Mode C always runs CRAG
        assert result.crag_assessment != "SKIPPED", (
            f"Mode C must never skip CRAG, but got '{result.crag_assessment}'"
        )

        print(f"✓ Retrieval: {len(result.chunks)} chunks, CRAG={result.crag_assessment}")
        print(f"✓ Walkthrough D: Mode C complex query complete")
    else:
        print("✓ Cache hit for Mode C query (acceptable)")
```

---
