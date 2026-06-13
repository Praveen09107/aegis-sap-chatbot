# IMPL_06: DATA LAYER — QDRANT
## Creating All Four Vector Collections With Complete Configuration
## Session 06 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 06: Create all four Qdrant vector collections.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-05 must be complete. Qdrant must be running and healthy (`docker exec aegis-qdrant curl -sf http://localhost:6333/healthz`).

**Critical dimension requirement from AEGIS_MASTER_REFERENCE.md:** Every vector in every collection is **768-dimensional**. BGE-base-en-v1.5 produces 768-dim vectors. This is non-negotiable. If any collection is created with size != 768, every vector insert will fail with a dimension mismatch error.

---

## FILE 1: scripts/init_qdrant.py

Create this complete script. It creates all four collections and verifies each.

```python
#!/usr/bin/env python3
"""
AEGIS Qdrant Initialization Script
Creates all four Qdrant vector collections with correct configuration.

Collections:
  meridian_errors     - Error guide document chunks
  meridian_procedures - Procedure document chunks
  meridian_configs    - Configuration document chunks
  cache_queries       - Semantic cache for frequent queries

All dense vectors are 768-dimensional (BGE-base-en-v1.5 output).
Usage: python scripts/init_qdrant.py
"""
import sys
import time

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    HnswConfigDiff,
    ScalarQuantizationConfig,
    ScalarQuantization,
    QuantizationType,
    OptimizersConfigDiff,
    PayloadSchemaType,
    TextIndexParams,
    TextIndexType,
    TokenizerType,
)

# Configuration from AEGIS_CONFIGURATION_CONSTANTS.md
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333  # Direct connection for setup (not through app layer)

EMBEDDING_DIMENSION = 768  # BGE-base-en-v1.5 — DO NOT CHANGE

# Collection names from AEGIS_CONFIGURATION_CONSTANTS.md
COLLECTIONS = {
    "meridian_errors": {
        "description": "Error guide document chunks",
        "type": "content",  # Has content + identity named vectors
        "hnsw_m": 32,
        "hnsw_ef_construct": 200,
    },
    "meridian_procedures": {
        "description": "Procedure document chunks",
        "type": "content",
        "hnsw_m": 32,
        "hnsw_ef_construct": 200,
    },
    "meridian_configs": {
        "description": "Configuration document chunks",
        "type": "content",
        "hnsw_m": 32,
        "hnsw_ef_construct": 200,
    },
    "cache_queries": {
        "description": "Semantic cache for frequent queries",
        "type": "cache",  # Has single unnamed vector
        "hnsw_m": 16,
        "hnsw_ef_construct": 100,
    },
}

# Payload field schema for text search on chunk_text
CONTENT_PAYLOAD_SCHEMA = {
    "document_id": PayloadSchemaType.KEYWORD,
    "content_type": PayloadSchemaType.KEYWORD,
    "module": PayloadSchemaType.KEYWORD,
    "chunk_type": PayloadSchemaType.KEYWORD,
    "embedding_model_version": PayloadSchemaType.KEYWORD,
}


def wait_for_qdrant(client: QdrantClient) -> bool:
    """Wait for Qdrant to be ready."""
    print("Waiting for Qdrant to be ready...")
    for i in range(30):
        try:
            client.get_collections()
            print("  ✓ Qdrant is ready")
            return True
        except Exception:
            time.sleep(2)
            print(f"  Waiting... ({i+1}/30)")
    return False


def create_content_collection(
    client: QdrantClient,
    name: str,
    description: str,
    hnsw_m: int,
    hnsw_ef_construct: int,
) -> bool:
    """
    Create a content collection (error_guide, procedure, config).
    These collections have TWO named vectors per point:
    - 'content': embedding of the chunk text
    - 'identity': embedding of the document identity string
    """
    print(f"\nCreating collection: {name}")
    print(f"  Description: {description}")
    print(f"  Vector dimension: {EMBEDDING_DIMENSION} (MUST be 768)")
    print(f"  Named vectors: content + identity")
    print(f"  HNSW m={hnsw_m}, ef_construct={hnsw_ef_construct}")
    print(f"  Scalar quantization: INT8 (4x memory reduction)")

    try:
        # Check if collection already exists
        existing = [c.name for c in client.get_collections().collections]
        if name in existing:
            print(f"  Collection already exists — verifying dimension...")
            info = client.get_collection(name)
            # Check content vector dimension
            vectors_config = info.config.params.vectors
            if isinstance(vectors_config, dict):
                content_dim = vectors_config.get("content")
                if content_dim and content_dim.size == EMBEDDING_DIMENSION:
                    print(f"  ✓ Existing collection has correct dimension ({EMBEDDING_DIMENSION})")
                    return True
                else:
                    print(f"  ✗ Existing collection has wrong dimension! Recreating...")
                    client.delete_collection(name)
            else:
                print(f"  Unexpected vector config format, recreating...")
                client.delete_collection(name)

        client.create_collection(
            collection_name=name,
            vectors_config={
                "content": VectorParams(
                    size=EMBEDDING_DIMENSION,
                    distance=Distance.COSINE,
                    hnsw_config=HnswConfigDiff(
                        m=hnsw_m,
                        ef_construct=hnsw_ef_construct,
                        full_scan_threshold=10000,
                    ),
                ),
                "identity": VectorParams(
                    size=EMBEDDING_DIMENSION,
                    distance=Distance.COSINE,
                    hnsw_config=HnswConfigDiff(
                        m=hnsw_m,
                        ef_construct=hnsw_ef_construct,
                        full_scan_threshold=10000,
                    ),
                ),
            },
            quantization_config=ScalarQuantizationConfig(
                scalar=ScalarQuantization(
                    type=QuantizationType.INT8,
                    quantile=0.99,
                    always_ram=True,  # Keep quantized vectors in RAM
                )
            ),
            optimizers_config=OptimizersConfigDiff(
                indexing_threshold=10000,  # Start indexing after 10k vectors
                memmap_threshold=50000,    # Use memmap for large collections
            ),
            on_disk_payload=False,  # Keep payload in RAM for fast retrieval
        )

        # Create payload indexes for filtered search
        for field_name, field_type in CONTENT_PAYLOAD_SCHEMA.items():
            client.create_payload_index(
                collection_name=name,
                field_name=field_name,
                field_schema=field_type,
            )

        print(f"  ✓ Collection '{name}' created successfully")
        return True

    except Exception as e:
        print(f"  ✗ Failed to create '{name}': {e}")
        return False


def create_cache_collection(
    client: QdrantClient,
    name: str,
    description: str,
    hnsw_m: int,
    hnsw_ef_construct: int,
) -> bool:
    """
    Create the cache_queries collection.
    This collection has a SINGLE unnamed vector (no content/identity split).
    Lower HNSW settings since cache lookup uses threshold-based matching,
    not precision-critical top-k ranking.
    """
    print(f"\nCreating collection: {name}")
    print(f"  Description: {description}")
    print(f"  Vector dimension: {EMBEDDING_DIMENSION}")
    print(f"  Single vector (no named vectors)")
    print(f"  HNSW m={hnsw_m}, ef_construct={hnsw_ef_construct} (lower — cache doesn't need max precision)")

    try:
        existing = [c.name for c in client.get_collections().collections]
        if name in existing:
            info = client.get_collection(name)
            vectors_config = info.config.params.vectors
            if hasattr(vectors_config, 'size') and vectors_config.size == EMBEDDING_DIMENSION:
                print(f"  ✓ Existing collection has correct dimension")
                return True
            else:
                print(f"  Recreating with correct configuration...")
                client.delete_collection(name)

        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(
                size=EMBEDDING_DIMENSION,
                distance=Distance.COSINE,
                hnsw_config=HnswConfigDiff(
                    m=hnsw_m,
                    ef_construct=hnsw_ef_construct,
                ),
            ),
            # No quantization for cache — it's small and needs full precision
            optimizers_config=OptimizersConfigDiff(
                indexing_threshold=1000,
            ),
        )

        # Create payload index for created_at (used by nightly cleanup)
        client.create_payload_index(
            collection_name=name,
            field_name="created_at",
            field_schema=PayloadSchemaType.DATETIME,
        )
        client.create_payload_index(
            collection_name=name,
            field_name="validation_score",
            field_schema=PayloadSchemaType.FLOAT,
        )

        print(f"  ✓ Collection '{name}' created successfully")
        return True

    except Exception as e:
        print(f"  ✗ Failed to create '{name}': {e}")
        return False


def verify_collection(client: QdrantClient, name: str, expected_type: str) -> bool:
    """Verify a collection exists with correct configuration."""
    print(f"\nVerifying: {name}")

    try:
        info = client.get_collection(name)
        params = info.config.params

        if expected_type == "content":
            # Should have named vectors 'content' and 'identity'
            if not isinstance(params.vectors, dict):
                print(f"  ✗ Expected named vectors dict, got {type(params.vectors)}")
                return False

            content_vec = params.vectors.get("content")
            identity_vec = params.vectors.get("identity")

            if not content_vec or not identity_vec:
                print(f"  ✗ Missing 'content' or 'identity' named vectors")
                return False

            if content_vec.size != EMBEDDING_DIMENSION:
                print(f"  ✗ content vector dimension is {content_vec.size}, expected {EMBEDDING_DIMENSION}")
                return False

            if identity_vec.size != EMBEDDING_DIMENSION:
                print(f"  ✗ identity vector dimension is {identity_vec.size}, expected {EMBEDDING_DIMENSION}")
                return False

            print(f"  ✓ content vector: {content_vec.size}-dim ({content_vec.distance})")
            print(f"  ✓ identity vector: {identity_vec.size}-dim ({identity_vec.distance})")

        elif expected_type == "cache":
            if isinstance(params.vectors, dict):
                print(f"  ✗ cache_queries should have single vector, not named vectors")
                return False

            if params.vectors.size != EMBEDDING_DIMENSION:
                print(f"  ✗ vector dimension is {params.vectors.size}, expected {EMBEDDING_DIMENSION}")
                return False

            print(f"  ✓ single vector: {params.vectors.size}-dim ({params.vectors.distance})")

        # Check quantization
        if expected_type == "content" and info.config.quantization_config:
            print(f"  ✓ quantization: enabled")
        elif expected_type == "content":
            print(f"  ⚠ quantization: not configured (may affect memory usage)")

        print(f"  ✓ Collection '{name}' verified")
        return True

    except Exception as e:
        print(f"  ✗ Failed to verify '{name}': {e}")
        return False


def test_insert_and_search(client: QdrantClient) -> bool:
    """
    Test that we can insert a point and search for it.
    This confirms the 768-dim requirement is working end-to-end.
    """
    print("\nRunning insert/search test on meridian_errors...")
    import uuid

    test_id = str(uuid.uuid4())
    test_vector = [0.1] * 768  # Dummy 768-dim vector

    try:
        # Insert a test point
        from qdrant_client.models import PointStruct

        client.upsert(
            collection_name="meridian_errors",
            points=[
                PointStruct(
                    id=test_id,
                    vector={
                        "content": test_vector,
                        "identity": test_vector,
                    },
                    payload={
                        "chunk_id": "TEST-001:chunk:0",
                        "document_id": "TEST-001",
                        "content_type": "error_guide",
                        "module": "SD",
                        "chunk_type": "header",
                        "chunk_text": "Test chunk for verification",
                        "embedding_model_version": "bge-base-en-v1.5",
                    }
                )
            ]
        )
        print("  ✓ Test point inserted successfully")

        # Search for it
        from qdrant_client.models import SearchParams

        results = client.search(
            collection_name="meridian_errors",
            query_vector=("content", test_vector),
            limit=1,
            search_params=SearchParams(hnsw_ef=128),
        )

        if results and len(results) > 0:
            print(f"  ✓ Search returned {len(results)} result(s)")
            print(f"  ✓ Score: {results[0].score:.4f}")
        else:
            print(f"  ✗ Search returned no results")
            return False

        # Clean up test point
        client.delete(
            collection_name="meridian_errors",
            points_selector=[test_id],
        )
        print("  ✓ Test point cleaned up")
        return True

    except Exception as e:
        print(f"  ✗ Insert/search test failed: {e}")
        # Try to clean up
        try:
            client.delete(collection_name="meridian_errors", points_selector=[test_id])
        except Exception:
            pass
        return False


def main():
    print("=" * 60)
    print("AEGIS Qdrant Collection Initialization")
    print("=" * 60)
    print(f"Target: {QDRANT_HOST}:{QDRANT_PORT}")
    print(f"Vector dimension: {EMBEDDING_DIMENSION} (768 for BGE-base-en-v1.5)")

    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # Step 1: Wait for Qdrant
    if not wait_for_qdrant(client):
        print("ERROR: Qdrant not ready")
        sys.exit(1)

    # Step 2: Create all collections
    print("\n[STEP 2] Creating collections...")
    results = {}

    for name, config in COLLECTIONS.items():
        if config["type"] == "content":
            success = create_content_collection(
                client, name, config["description"],
                config["hnsw_m"], config["hnsw_ef_construct"]
            )
        else:  # cache
            success = create_cache_collection(
                client, name, config["description"],
                config["hnsw_m"], config["hnsw_ef_construct"]
            )
        results[name] = success

    if not all(results.values()):
        print("\nERROR: Some collections failed to create")
        sys.exit(1)

    # Step 3: Verify all collections
    print("\n[STEP 3] Verifying collections...")
    verify_results = {}
    for name, config in COLLECTIONS.items():
        verify_results[name] = verify_collection(client, name, config["type"])

    if not all(verify_results.values()):
        print("\nERROR: Collection verification failed")
        sys.exit(1)

    # Step 4: Test insert and search
    print("\n[STEP 4] Testing insert and search...")
    if not test_insert_and_search(client):
        print("\nERROR: Insert/search test failed")
        sys.exit(1)

    # Summary
    print("\n" + "=" * 60)
    print("VERIFICATION SUMMARY")
    print("=" * 60)
    for name in COLLECTIONS:
        print(f"  ✓ {name}")
    print(f"\n  Dimension: {EMBEDDING_DIMENSION} (768) — CONFIRMED on all collections")
    print("=" * 60)
    print("✓ ALL QDRANT COLLECTIONS CREATED AND VERIFIED")
    sys.exit(0)


if __name__ == "__main__":
    main()
```

---

## FILE 2: backend/app/infrastructure/qdrant_client.py

This file provides the application-level Qdrant client used by the Retrieval Engine. Create it at `backend/app/infrastructure/qdrant_client.py`.

```python
"""
AEGIS Qdrant Client
Wrapper around the qdrant-client library for AEGIS retrieval operations.
All search calls specify hnsw_ef=128 for content collections and hnsw_ef=64
for the cache collection, as specified in AEGIS_CONFIGURATION_CONSTANTS.md.
"""
from typing import List, Optional, Dict, Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue,
    SearchParams, NamedVector,
    PointStruct, PointIdsList
)

from app.config import (
    QDRANT_HOST, QDRANT_PORT,
    QDRANT_COLLECTION_ERRORS, QDRANT_COLLECTION_PROCEDURES,
    QDRANT_COLLECTION_CONFIGS, QDRANT_COLLECTION_CACHE,
    QDRANT_VECTOR_CONTENT, QDRANT_VECTOR_IDENTITY,
    QDRANT_SEARCH_LIMIT, QDRANT_HNSW_EF, QDRANT_CACHE_HNSW_EF,
    SEMANTIC_CACHE_THRESHOLD,
)

# Map content_type to collection name
CONTENT_TYPE_TO_COLLECTION = {
    "error_guide": QDRANT_COLLECTION_ERRORS,
    "procedure": QDRANT_COLLECTION_PROCEDURES,
    "config": QDRANT_COLLECTION_CONFIGS,
}


class AegisQdrantClient:
    """Application-level Qdrant client for AEGIS operations."""

    def __init__(self):
        self._client: Optional[AsyncQdrantClient] = None

    async def connect(self):
        """Initialize async connection to Qdrant."""
        self._client = AsyncQdrantClient(
            host=QDRANT_HOST,
            port=QDRANT_PORT,
            timeout=30,
        )

    async def close(self):
        if self._client:
            await self._client.close()

    @property
    def client(self) -> AsyncQdrantClient:
        if not self._client:
            raise RuntimeError("Qdrant client not connected. Call connect() first.")
        return self._client

    # ============================================================
    # Content Collection Operations (meridian_errors/procedures/configs)
    # ============================================================

    async def search_content(
        self,
        collection_name: str,
        query_vector: List[float],
        vector_name: str = QDRANT_VECTOR_CONTENT,
        limit: int = QDRANT_SEARCH_LIMIT,
        filter_conditions: Optional[Dict[str, Any]] = None,
    ) -> List[Dict]:
        """
        Search a content collection using a named vector.
        Returns list of dicts with id, score, and payload.
        """
        search_filter = None
        if filter_conditions:
            conditions = []
            for field, value in filter_conditions.items():
                conditions.append(FieldCondition(key=field, match=MatchValue(value=value)))
            search_filter = Filter(must=conditions)

        results = await self.client.search(
            collection_name=collection_name,
            query_vector=NamedVector(name=vector_name, vector=query_vector),
            limit=limit,
            query_filter=search_filter,
            search_params=SearchParams(hnsw_ef=QDRANT_HNSW_EF),
            with_payload=True,
        )

        return [
            {
                "id": str(r.id),
                "score": r.score,
                "payload": r.payload,
            }
            for r in results
        ]

    async def search_by_document_id(
        self,
        collection_name: str,
        document_id: str,
        query_vector: List[float],
        chunk_types: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Mode A retrieval: Search filtered to a specific document_id.
        Optionally filter by chunk_type list.
        """
        conditions = [FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        if chunk_types:
            # MatchAny for multiple chunk types
            from qdrant_client.models import MatchAny
            conditions.append(FieldCondition(key="chunk_type", match=MatchAny(any=chunk_types)))

        results = await self.client.search(
            collection_name=collection_name,
            query_vector=NamedVector(name=QDRANT_VECTOR_CONTENT, vector=query_vector),
            limit=20,  # Get all chunks for a single document
            query_filter=Filter(must=conditions),
            search_params=SearchParams(hnsw_ef=QDRANT_HNSW_EF),
            with_payload=True,
        )

        return [{"id": str(r.id), "score": r.score, "payload": r.payload} for r in results]

    async def upsert_point(
        self,
        collection_name: str,
        point_id: str,
        content_vector: List[float],
        identity_vector: List[float],
        payload: Dict,
    ) -> bool:
        """Insert or update a document chunk point."""
        await self.client.upsert(
            collection_name=collection_name,
            points=[
                PointStruct(
                    id=point_id,
                    vector={
                        QDRANT_VECTOR_CONTENT: content_vector,
                        QDRANT_VECTOR_IDENTITY: identity_vector,
                    },
                    payload=payload,
                )
            ],
        )
        return True

    async def delete_by_document_id(self, collection_name: str, document_id: str) -> bool:
        """Delete all points belonging to a specific document_id (for update flow)."""
        from qdrant_client.models import FilterSelector
        await self.client.delete(
            collection_name=collection_name,
            points_selector=FilterSelector(
                filter=Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))])
            ),
        )
        return True

    # ============================================================
    # Cache Collection Operations (cache_queries)
    # ============================================================

    async def search_cache(self, query_vector: List[float]) -> Optional[Dict]:
        """
        Search the semantic cache. Returns the best match if score >= SEMANTIC_CACHE_THRESHOLD.
        The nightly cleanup job removes entries older than 24 hours.
        """
        results = await self.client.search(
            collection_name=QDRANT_COLLECTION_CACHE,
            query_vector=query_vector,
            limit=1,
            search_params=SearchParams(hnsw_ef=QDRANT_CACHE_HNSW_EF),
            with_payload=True,
        )

        if results and results[0].score >= SEMANTIC_CACHE_THRESHOLD:
            return {"score": results[0].score, "payload": results[0].payload}
        return None

    async def upsert_cache_entry(
        self,
        point_id: str,
        query_vector: List[float],
        payload: Dict,
    ) -> bool:
        """Store a new cache entry."""
        await self.client.upsert(
            collection_name=QDRANT_COLLECTION_CACHE,
            points=[PointStruct(id=point_id, vector=query_vector, payload=payload)],
        )
        return True

    async def cleanup_stale_cache(self, cutoff_datetime_str: str) -> int:
        """
        Delete cache entries older than cutoff_datetime_str.
        Called by the ARQ nightly_cleanup task.
        Returns number of deleted points.
        """
        from qdrant_client.models import DatetimeRange, FilterSelector

        # Scroll to find stale points, then delete
        stale_ids = []
        offset = None

        while True:
            results, offset = await self.client.scroll(
                collection_name=QDRANT_COLLECTION_CACHE,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="created_at",
                            range=DatetimeRange(lt=cutoff_datetime_str),
                        )
                    ]
                ),
                limit=100,
                offset=offset,
                with_payload=False,
            )

            for point in results:
                stale_ids.append(point.id)

            if offset is None:
                break

        if stale_ids:
            await self.client.delete(
                collection_name=QDRANT_COLLECTION_CACHE,
                points_selector=PointIdsList(points=stale_ids),
            )

        return len(stale_ids)

    # ============================================================
    # Health Check
    # ============================================================

    async def health_check(self) -> Dict:
        """Check all collections exist and have correct configuration."""
        try:
            collections = await self.client.get_collections()
            collection_names = [c.name for c in collections.collections]

            required = [
                QDRANT_COLLECTION_ERRORS,
                QDRANT_COLLECTION_PROCEDURES,
                QDRANT_COLLECTION_CONFIGS,
                QDRANT_COLLECTION_CACHE,
            ]

            missing = [c for c in required if c not in collection_names]
            return {
                "status": "healthy" if not missing else "unhealthy",
                "collections": collection_names,
                "missing": missing,
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


# Singleton instance (initialised in FastAPI startup)
qdrant_client = AegisQdrantClient()
```

---

## RUNNING THE INITIALIZATION

```bash
# From project root (with backend venv activated)
cd backend && source venv/bin/activate && cd ..
python scripts/init_qdrant.py
```

Expected final output: `✓ ALL QDRANT COLLECTIONS CREATED AND VERIFIED`

---

## VERIFICATION STEPS

### Step 1: Run the initialization script
```bash
python scripts/init_qdrant.py
```

### Step 2: Verify via Qdrant HTTP API directly
```bash
# List all collections
curl -sf http://localhost:6333/collections | python3 -m json.tool

# Check meridian_errors has correct dimensions
curl -sf http://localhost:6333/collections/meridian_errors | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
vectors = data['result']['config']['params']['vectors']
for name, cfg in vectors.items():
    print(f'{name}: {cfg[\"size\"]}-dim (must be 768)')
"
```
Expected: All vectors show `768-dim`

### Step 3: Verify payload indexes exist
```bash
curl -sf "http://localhost:6333/collections/meridian_errors/index" | python3 -m json.tool
```
Expected: Shows indexes on document_id, content_type, module, chunk_type, embedding_model_version

---

## WHEN VERIFICATION PASSES

```bash
git add -A
git commit -m "IMPL-06: Qdrant data layer - all four collections created (768-dim confirmed)"
```

Update DECISIONS_LOG.md with:
- All four collections created and verified
- 768-dim confirmed for all vectors
- Payload indexes created
- Insert/search test passed

---
## QUICK ENTRY PAYLOAD FIELDS (Added in IMPL_24)

Quick Entry chunks in the aegis_knowledge collection carry 7 additional
optional payload fields. These fields are absent on document-based chunks.
No existing retrieval queries filter on these fields.

New fields (present ONLY on Quick Entry chunks, absent on document chunks):
  source_type:             "form_entry" (string) — document chunks have "document"
  form_entry_id:           UUID string — PK from knowledge_form_entries
  version:                 integer — matches entry version
  chunk_type:              string — see IMPL_27 for all valid values
  has_screenshots:         boolean
  screenshot_ids:          string[] — UUIDs from knowledge_form_screenshots table
  is_stale:                boolean — true when Config entry overdue for review
  original_quality_score:  float — preserved pre-staleness quality score, NEVER modified

Qdrant operations used by Quick Entry:
  upsert        — chunk insertion (A10) and screenshot enrichment updates (V8)
  set_payload   — retiring old chunks (A3), staleness updates (daily job)

No existing collection, index, or query is modified.


---

*Document version: 1.0 | AEGIS Specification Set*
