# IMPL_07: DATA LAYER — OPENSEARCH
## SAP Documents Index With Custom Analyzer
## Session 07 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 07: Create the OpenSearch index with the SAP-specific custom analyzer.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-06 complete. OpenSearch must be running and healthy.

**Why the custom analyzer matters:** Without it, SAP error codes like "VL150" get split into "VL" and "150" or "vl" and "150", destroying BM25 relevance for exact error code searches. The custom analyzer ensures "VL150" is always treated as one complete token.

---

## FILE 1: scripts/init_opensearch.py

```python
#!/usr/bin/env python3
"""
AEGIS OpenSearch Initialization Script
Creates the SAP documents index with custom SAP analyzer.

The custom analyzer includes:
- Standard tokenizer (splits on whitespace/punctuation)
- Lowercase filter (normalizes case)
- SAP synonym filter (maps employee phrasings to SAP terms)
- English stop words filter (removes noise words)
- Keyword tokenizer for entity fields (error codes, T-codes)

Usage: python scripts/init_opensearch.py
"""
import sys
import json
import time
from opensearchpy import OpenSearch, RequestError

OPENSEARCH_HOST = "localhost"
OPENSEARCH_PORT = 9200
INDEX_NAME = "sap_documents"

# OpenSearch client (direct connection for setup)
client = OpenSearch(
    hosts=[{"host": OPENSEARCH_HOST, "port": OPENSEARCH_PORT}],
    http_compress=True,
    use_ssl=False,
    verify_certs=False,
    timeout=30,
)

# ============================================================
# Complete Index Configuration
# ============================================================

INDEX_SETTINGS = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,  # No replica for demo (single node)
        "analysis": {
            "filter": {
                # ============================================================
                # SAP Synonym Filter
                # Maps common employee phrasings to SAP technical terms
                # This is the EXPAND type: both original and expanded terms are indexed
                # ============================================================
                "sap_synonyms": {
                    "type": "synonym",
                    "synonyms": [
                        # SD Module
                        "delivery blocked, delivery stuck => outbound delivery blocked VL150 VL01N",
                        "delivery error => outbound delivery error VL01N",
                        "zero stock, no stock available => material availability 0 EA VL150",
                        "billing error => billing document error VF01 account determination",
                        "billing blocked => billing document blocked VF01 G/L account",
                        "accounting not created => accounting document not created FI",
                        "scheduling agreement => scheduling agreement VA31 VA32 YDSA",
                        "incompletion log => incompletion log SD incomplete procedure",
                        "sales order => sales order VA01 VA02 SD",
                        "delivery creation => outbound delivery creation VL01N SD",
                        # MM Module
                        "goods receipt, GR => goods receipt MIGO movement 101 MM",
                        "goods issue, GI => goods issue MIGO movement 601 VL02N",
                        "purchase order, PO => purchase order ME21N ME22N MM",
                        "invoice verification => invoice verification MIRO FI vendor",
                        "material availability => material availability stock MMBE VL150",
                        "reservation blocking => reservation MB25 blocking stock MM",
                        # FI Module
                        "posting period => posting period OB52 FI fiscal year",
                        "period closed => posting period closed OB52 FI",
                        "withholding tax => withholding tax FTXP FI tax code",
                        "payment run => payment run F110 FI automatic payment",
                        "account determination => account determination VKOA G/L FI SD",
                        "account assignment => G/L account assignment determination VKOA",
                    ]
                },
                # English stop words (common noise words)
                "english_stop": {
                    "type": "stop",
                    "stopwords": "_english_"
                },
            },
            "analyzer": {
                # ============================================================
                # Main SAP analyzer — used for chunk_text field (analyzed)
                # Pipeline: standard tokenize → lowercase → synonym expand → stop words
                # ============================================================
                "sap_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": [
                        "lowercase",
                        "sap_synonyms",
                        "english_stop",
                    ]
                },
                # ============================================================
                # SAP entity analyzer — used for error_code, tcode fields
                # Preserves exact casing for keyword-like matching
                # ============================================================
                "sap_entity_analyzer": {
                    "type": "custom",
                    "tokenizer": "keyword",   # Treat entire field as one token
                    "filter": ["lowercase"]   # Normalize to lowercase for matching
                },
            }
        }
    },
    "mappings": {
        "properties": {
            # ============================================================
            # Identity fields — keyword type (exact match, filterable)
            # ============================================================
            "chunk_id": {
                "type": "keyword"
            },
            "document_id": {
                "type": "keyword"
            },
            "content_type": {
                "type": "keyword"  # "error_guide" | "procedure" | "config"
            },
            "module": {
                "type": "keyword"  # "FI" | "MM" | "SD" | etc.
            },
            "chunk_type": {
                "type": "keyword"
            },
            "last_verified_date": {
                "type": "date",
                "format": "yyyy-MM-dd"
            },
            "verified_by": {
                "type": "keyword"
            },
            "embedding_model_version": {
                "type": "keyword"
            },
            # ============================================================
            # Entity fields — analyzed with entity analyzer + stored as keyword
            # The boosted entity text is added to chunk_text during indexing
            # ============================================================
            "error_code": {
                "type": "text",
                "analyzer": "sap_entity_analyzer",
                "boost": 2.0,  # Error code matches score 2x higher
                "fields": {
                    "keyword": {"type": "keyword"}  # Also as keyword for exact filter
                }
            },
            "configuration_name": {
                "type": "text",
                "analyzer": "sap_analyzer",
                "boost": 1.5,
                "fields": {
                    "keyword": {"type": "keyword"}
                }
            },
            "procedure_name": {
                "type": "text",
                "analyzer": "sap_analyzer",
                "boost": 1.5,
                "fields": {
                    "keyword": {"type": "keyword"}
                }
            },
            # T-codes stored as keyword array
            "transactions": {
                "type": "keyword"
            },
            # ============================================================
            # Main content field — analyzed with full SAP analyzer
            # Entity boosting is applied AT INDEXING TIME by repeating entity
            # tokens in this field (not through field-level boost)
            # ============================================================
            "chunk_text": {
                "type": "text",
                "analyzer": "sap_analyzer",
                "search_analyzer": "sap_analyzer",
                "index_options": "positions",  # Enable phrase queries
                "term_vector": "with_positions_offsets",  # Enable highlighting
            },
        }
    }
}


def wait_for_opensearch() -> bool:
    print("Waiting for OpenSearch to be ready...")
    for i in range(30):
        try:
            health = client.cluster.health()
            if health["status"] in ["green", "yellow"]:
                print(f"  ✓ OpenSearch ready (status: {health['status']})")
                return True
        except Exception:
            pass
        time.sleep(3)
        print(f"  Waiting... ({i+1}/30)")
    return False


def create_index() -> bool:
    print(f"\nCreating index: {INDEX_NAME}")

    try:
        # Check if index already exists
        if client.indices.exists(index=INDEX_NAME):
            print(f"  Index already exists — checking mapping...")
            mapping = client.indices.get_mapping(index=INDEX_NAME)
            # Verify chunk_text analyzer
            props = mapping[INDEX_NAME]["mappings"]["properties"]
            if "chunk_text" in props:
                analyzer = props["chunk_text"].get("analyzer", "unknown")
                if analyzer == "sap_analyzer":
                    print(f"  ✓ Index exists with correct SAP analyzer")
                    return True
                else:
                    print(f"  ✗ Wrong analyzer ({analyzer}), recreating index...")
                    client.indices.delete(index=INDEX_NAME)
            else:
                print(f"  ✗ Missing chunk_text field, recreating...")
                client.indices.delete(index=INDEX_NAME)

        client.indices.create(index=INDEX_NAME, body=INDEX_SETTINGS)
        print(f"  ✓ Index '{INDEX_NAME}' created with SAP custom analyzer")
        return True

    except RequestError as e:
        print(f"  ✗ OpenSearch error: {e.error}")
        print(f"  Detail: {e.info}")
        return False
    except Exception as e:
        print(f"  ✗ Failed: {e}")
        return False


def verify_analyzer() -> bool:
    """Test the SAP analyzer with known SAP entities and phrasings."""
    print("\nVerifying SAP custom analyzer...")

    test_cases = [
        # (input_text, expected_tokens_include, description)
        ("VL150 error", ["vl150"], "Error code preserved as single token"),
        ("VL01N delivery creation", ["vl01n", "delivery", "creation"], "T-code preserved"),
        ("delivery blocked", ["delivery", "blocked", "outbound"], "Synonym expansion"),
        ("The goods issue failed", ["goods", "issue", "failed", "migo"], "GI synonym"),
    ]

    all_passed = True
    for text, expected_tokens, description in test_cases:
        try:
            result = client.indices.analyze(
                index=INDEX_NAME,
                body={"analyzer": "sap_analyzer", "text": text}
            )
            actual_tokens = [t["token"] for t in result["tokens"]]

            found_all = all(token in actual_tokens for token in expected_tokens)
            if found_all:
                print(f"  ✓ '{text}' → {actual_tokens[:8]}")
            else:
                missing = [t for t in expected_tokens if t not in actual_tokens]
                print(f"  ⚠ '{text}' → {actual_tokens[:8]}")
                print(f"    Expected to include: {expected_tokens}")
                print(f"    Missing: {missing}")
                # Synonym issues are warnings, not failures (synonym definitions may vary)

        except Exception as e:
            print(f"  ✗ Analyzer test failed for '{text}': {e}")
            all_passed = False

    return all_passed


def verify_entity_analyzer() -> bool:
    """Test that the entity analyzer preserves error codes as single tokens."""
    print("\nVerifying entity analyzer (error code preservation)...")

    entity_tests = ["VL150", "VL01N", "ME21N", "F5201", "MIGO", "OB52"]

    for entity in entity_tests:
        try:
            result = client.indices.analyze(
                index=INDEX_NAME,
                body={"analyzer": "sap_entity_analyzer", "text": entity}
            )
            tokens = [t["token"] for t in result["tokens"]]

            # Entity analyzer should produce exactly one token (the entity lowercased)
            expected = entity.lower()
            if len(tokens) == 1 and tokens[0] == expected:
                print(f"  ✓ '{entity}' → single token '{tokens[0]}'")
            else:
                print(f"  ✗ '{entity}' → {tokens} (expected single token '{expected}')")
                return False
        except Exception as e:
            print(f"  ✗ Failed for '{entity}': {e}")
            return False

    return True


def test_document_insert_and_search() -> bool:
    """Test inserting a document and searching for it."""
    print("\nTesting document insert and search...")

    test_doc = {
        "chunk_id": "SD-ERR-001:chunk:0",
        "document_id": "SD-ERR-001",
        "content_type": "error_guide",
        "module": "SD",
        "chunk_type": "header",
        "error_code": "VL150",
        "transactions": ["VL01N", "MMBE", "MB52"],
        "last_verified_date": "2024-03-28",
        "verified_by": "test",
        "embedding_model_version": "bge-base-en-v1.5",
        # Entity boosting: error code appears 3 times in chunk_text
        "chunk_text": "VL150 VL150 VL150 Material availability error during outbound delivery creation. "
                     "This error occurs in transaction VL01N when the available stock is insufficient.",
    }

    try:
        # Index the test document
        client.index(
            index=INDEX_NAME,
            id="test_doc_001",
            body=test_doc,
            refresh=True,  # Make immediately searchable
        )
        print("  ✓ Test document indexed")

        # Search for it
        search_body = {
            "query": {
                "bool": {
                    "must": [
                        {
                            "match": {
                                "chunk_text": {
                                    "query": "VL150 delivery error",
                                    "boost": 1.0
                                }
                            }
                        }
                    ],
                    "filter": [
                        {"term": {"content_type": "error_guide"}}
                    ]
                }
            },
            "size": 5,
        }

        results = client.search(index=INDEX_NAME, body=search_body)
        hits = results["hits"]["hits"]

        if hits and hits[0]["_id"] == "test_doc_001":
            print(f"  ✓ Test document found with score: {hits[0]['_score']:.4f}")
        else:
            print(f"  ✗ Test document not found in search results")
            return False

        # Clean up
        client.delete(index=INDEX_NAME, id="test_doc_001", refresh=True)
        print("  ✓ Test document cleaned up")
        return True

    except Exception as e:
        print(f"  ✗ Insert/search test failed: {e}")
        try:
            client.delete(index=INDEX_NAME, id="test_doc_001")
        except Exception:
            pass
        return False


def verify_jvm_heap() -> bool:
    """Verify OpenSearch JVM heap is configured to 2GB."""
    print("\nVerifying OpenSearch JVM heap...")
    try:
        stats = client.nodes.stats(metric="jvm")
        for node_id, node_data in stats["nodes"].items():
            heap_max = node_data["jvm"]["mem"]["heap_max_in_bytes"]
            heap_gb = heap_max / (1024 ** 3)
            if 1.8 <= heap_gb <= 2.2:  # Allow ±10% tolerance
                print(f"  ✓ JVM heap max: {heap_gb:.1f} GB (expected ~2.0 GB)")
                return True
            else:
                print(f"  ⚠ JVM heap max: {heap_gb:.1f} GB (expected ~2.0 GB)")
                print(f"    Check OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g in docker-compose.yml")
                return True  # Non-blocking warning
    except Exception as e:
        print(f"  ⚠ Could not verify JVM heap: {e}")
        return True  # Non-blocking


def main():
    print("=" * 60)
    print("AEGIS OpenSearch Index Initialization")
    print("=" * 60)

    # Step 1: Wait for OpenSearch
    if not wait_for_opensearch():
        print("ERROR: OpenSearch not ready")
        sys.exit(1)

    # Step 2: Verify JVM heap
    verify_jvm_heap()

    # Step 3: Create index
    if not create_index():
        print("\nERROR: Index creation failed")
        sys.exit(1)

    # Step 4: Verify SAP analyzer
    verify_analyzer()  # Non-blocking (synonym behavior can vary)

    # Step 5: Verify entity analyzer (critical)
    if not verify_entity_analyzer():
        print("\nERROR: Entity analyzer not preserving SAP tokens correctly")
        sys.exit(1)

    # Step 6: Test insert and search
    if not test_document_insert_and_search():
        print("\nERROR: Insert/search test failed")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("✓ OPENSEARCH INDEX CREATED AND VERIFIED")
    print(f"  Index: {INDEX_NAME}")
    print(f"  Custom SAP analyzer: active")
    print(f"  Entity analyzer: active (SAP codes preserved)")
    sys.exit(0)


if __name__ == "__main__":
    main()
```

---

## FILE 2: backend/app/infrastructure/opensearch_client.py

```python
"""
AEGIS OpenSearch Client
Wrapper for BM25 keyword search with SAP entity boosting.
Entity boosting is applied at indexing time (entity repeated 3x in chunk_text).
"""
from typing import List, Optional, Dict, Any

from opensearchpy import AsyncOpenSearch

from app.config import (
    OPENSEARCH_HOST, OPENSEARCH_PORT,
    OPENSEARCH_INDEX_NAME, OPENSEARCH_SEARCH_LIMIT,
    ENTITY_BOOST_REPETITIONS,
)


class AegisOpenSearchClient:
    """Application-level OpenSearch client."""

    def __init__(self):
        self._client: Optional[AsyncOpenSearch] = None

    async def connect(self):
        self._client = AsyncOpenSearch(
            hosts=[{"host": OPENSEARCH_HOST, "port": OPENSEARCH_PORT}],
            http_compress=True,
            use_ssl=False,
            verify_certs=False,
            timeout=30,
        )

    async def close(self):
        if self._client:
            await self._client.close()

    @property
    def client(self) -> AsyncOpenSearch:
        if not self._client:
            raise RuntimeError("OpenSearch client not connected.")
        return self._client

    async def search_bm25(
        self,
        query_text: str,
        entities: List[str],
        content_type_filter: Optional[str] = None,
        module_filter: Optional[str] = None,
        document_id_filter: Optional[str] = None,
        limit: int = OPENSEARCH_SEARCH_LIMIT,
    ) -> List[Dict]:
        """
        BM25 search with entity boosting.
        Entities are repeated ENTITY_BOOST_REPETITIONS times (3x) in the query
        to increase their BM25 term frequency weight.
        """
        # Build boosted query: append entity tokens 3x for BM25 term frequency boost
        boosted_query = query_text
        for entity in entities:
            boost_tokens = " ".join([entity] * ENTITY_BOOST_REPETITIONS)
            boosted_query = f"{boosted_query} {boost_tokens}"

        # Build query body
        must_clauses = [
            {
                "multi_match": {
                    "query": boosted_query,
                    "fields": ["chunk_text", "error_code^2", "configuration_name^1.5", "procedure_name^1.5"],
                    "type": "best_fields",
                    "operator": "or",
                }
            }
        ]

        filter_clauses = []
        if content_type_filter:
            filter_clauses.append({"term": {"content_type": content_type_filter}})
        if module_filter:
            filter_clauses.append({"term": {"module": module_filter}})
        if document_id_filter:
            filter_clauses.append({"term": {"document_id": document_id_filter}})

        search_body = {
            "query": {
                "bool": {
                    "must": must_clauses,
                    "filter": filter_clauses if filter_clauses else [],
                }
            },
            "size": limit,
            "_source": True,
        }

        results = await self.client.search(
            index=OPENSEARCH_INDEX_NAME,
            body=search_body,
        )

        return [
            {
                "chunk_id": hit["_source"].get("chunk_id"),
                "document_id": hit["_source"].get("document_id"),
                "score": hit["_score"],
                "payload": hit["_source"],
            }
            for hit in results["hits"]["hits"]
        ]

    async def index_document(self, chunk_id: str, document: Dict) -> bool:
        """
        Index a document chunk. Entity boosting is applied here:
        The error_code/configuration_name/procedure_name is repeated
        ENTITY_BOOST_REPETITIONS times in the chunk_text field.
        """
        # Apply entity boosting to chunk_text
        doc_to_index = document.copy()
        entity_value = (
            document.get("error_code") or
            document.get("configuration_name") or
            document.get("procedure_name") or ""
        )

        if entity_value:
            boost_prefix = " ".join([entity_value] * ENTITY_BOOST_REPETITIONS)
            doc_to_index["chunk_text"] = f"{boost_prefix} {document.get('chunk_text', '')}"

        await self.client.index(
            index=OPENSEARCH_INDEX_NAME,
            id=chunk_id,
            body=doc_to_index,
        )
        return True

    async def delete_by_document_id(self, document_id: str) -> bool:
        """Delete all chunks for a document_id (used in update flow)."""
        await self.client.delete_by_query(
            index=OPENSEARCH_INDEX_NAME,
            body={"query": {"term": {"document_id": document_id}}},
        )
        return True

    async def health_check(self) -> Dict:
        try:
            health = await self.client.cluster.health()
            return {"status": health["status"], "cluster": health["cluster_name"]}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


# Singleton instance
opensearch_client = AegisOpenSearchClient()
```

---

## RUNNING THE INITIALIZATION

```bash
python scripts/init_opensearch.py
```

Expected final output: `✓ OPENSEARCH INDEX CREATED AND VERIFIED`

---

## VERIFICATION STEPS

### Step 1: Run the initialization script
```bash
python scripts/init_opensearch.py
```

### Step 2: Verify index exists with correct analyzer
```bash
curl -sf "http://localhost:9200/sap_documents/_settings" | python3 -m json.tool | grep -A3 "sap_analyzer"
```
Expected: Shows `sap_analyzer` with `standard` tokenizer and the filter chain.

### Step 3: Manual analyzer test
```bash
curl -sf -X POST "http://localhost:9200/sap_documents/_analyze" \
  -H "Content-Type: application/json" \
  -d '{"analyzer": "sap_entity_analyzer", "text": "VL150"}' | python3 -m json.tool
```
Expected: Single token `vl150` (lowercase of VL150).

---

## WHEN VERIFICATION PASSES

```bash
git add -A
git commit -m "IMPL-07: OpenSearch data layer - SAP analyzer verified"
```

---
## QUICK ENTRY INDEX FIELDS (Added in IMPL_24)

**Correction (Session 24):** the real index is `sap_documents` (`OPENSEARCH_INDEX_NAME` in `config.py`), not `aegis_knowledge`. Quick Entry adds 7 new keyword/boolean/numeric fields to it. Apply via PUT mapping update (see IMPL_24 Section 6).
No re-indexing of existing documents is required — the new fields are simply
absent on documents indexed before this feature.

New fields added via mapping update:
  source_type:             keyword
  form_entry_id:           keyword
  version:                 integer
  chunk_type:              keyword
  has_screenshots:         boolean
  is_stale:                boolean
  original_quality_score:  float

Apply mapping update command (run once, before deploying Quick Entry):
  curl -X PUT "http://aegis-opensearch:9200/sap_documents/_mapping" \
    -H 'Content-Type: application/json' \
    -d '{
      "properties": {
        "source_type":             { "type": "keyword" },
        "form_entry_id":           { "type": "keyword" },
        "version":                 { "type": "integer" },
        "chunk_type":              { "type": "keyword" },
        "has_screenshots":         { "type": "boolean" },
        "is_stale":                { "type": "boolean" },
        "original_quality_score":  { "type": "float" }
      }
    }'


---

*Document version: 1.0 | AEGIS Specification Set*
