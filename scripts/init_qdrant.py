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
            quantization_config=ScalarQuantization(
                scalar=ScalarQuantizationConfig(
                    type="int8",
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
    This collection has a SINGLE named vector "content" (no identity vector).
    Lower HNSW settings since cache lookup uses threshold-based matching,
    not precision-critical top-k ranking.
    """
    print(f"\nCreating collection: {name}")
    print(f"  Description: {description}")
    print(f"  Vector dimension: {EMBEDDING_DIMENSION}")
    print(f"  Named vector: content only (no identity)")
    print(f"  HNSW m={hnsw_m}, ef_construct={hnsw_ef_construct} (lower — cache doesn't need max precision)")

    try:
        existing = [c.name for c in client.get_collections().collections]
        if name in existing:
            info = client.get_collection(name)
            vectors_config = info.config.params.vectors
            if isinstance(vectors_config, dict) and "content" in vectors_config:
                content_dim = vectors_config["content"]
                if content_dim.size == EMBEDDING_DIMENSION:
                    print(f"  ✓ Existing collection has correct dimension")
                    return True
            print(f"  Recreating with correct configuration...")
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
                    ),
                ),
            },
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
            if not isinstance(params.vectors, dict):
                print(f"  ✗ Expected named vectors dict for cache, got {type(params.vectors)}")
                return False

            content_vec = params.vectors.get("content")
            if not content_vec:
                print(f"  ✗ Missing 'content' named vector in cache collection")
                return False

            if "identity" in params.vectors:
                print(f"  ✗ cache_queries should NOT have identity vector")
                return False

            if content_vec.size != EMBEDDING_DIMENSION:
                print(f"  ✗ content vector dimension is {content_vec.size}, expected {EMBEDDING_DIMENSION}")
                return False

            print(f"  ✓ content vector: {content_vec.size}-dim ({content_vec.distance})")
            print(f"  ✓ no identity vector (correct for cache)")

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
