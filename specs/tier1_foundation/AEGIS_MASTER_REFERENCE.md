# AEGIS MASTER REFERENCE
## Condensed Architecture Authority — Attach to Every Agent Session
## Version 2.0 — Final (reflects all architectural decisions)

---
## CRITICAL INSTRUCTION FOR THE AI AGENT

This document is the master authority for every architectural decision in the AEGIS system. When you are implementing any component:

1. If a value, configuration, or design decision is in this document, use it exactly. Do not substitute or approximate.
2. If something is not in this document, check AEGIS_DATA_CONTRACTS.md and AEGIS_CONFIGURATION_CONSTANTS.md before making any assumption.
3. If the information is not in any of the three always-present documents, STOP and report what is missing rather than guessing.

You are implementing a production-grade enterprise AI platform. Incorrect architectural decisions here will cause the system to fail in ways that are difficult to diagnose. Accuracy is more important than speed.

---

## IDENTITY

**System:** AEGIS — Adaptive Enterprise Grade Intelligence System
**Client:** Sona Comstar, Chennai, India (automotive manufacturer)
**Purpose:** SAP ERP helpdesk AI for employees and IT admins
**Demo hardware:** Intel Xeon E-2278G (16 threads), 64GB RAM, no usable GPU
**Team:** 3 interns, fully AI-assisted implementation using GitHub Copilot Agent

---

## SIX-ZONE ARCHITECTURE

```
Zone A: Edge + Security          Nginx TLS1.3, Keycloak OIDC/ROPC, Vault dev, mTLS
Zone B: Orchestration            FastAPI 2 workers, ARQ background tasks, WebSocket, Circuit Breakers
Zone C: AI Services              QIL, Vision, Retrieval Engine (8 stages), Reasoning, Validation
Zone D: Data                     Qdrant×4, OpenSearch, PostgreSQL+PgBouncer+replica, Redis×2
Zone E: Knowledge/Admin          11-stage ingestion pipeline, 7-screen admin portal
Zone F: Observability            Prometheus + Grafana 8-panel quality dashboard
```

---

## 19 DOCKER SERVICES

| Service | Image | Role | Network(s) |
|---|---|---|---|
| aegis-nginx | nginx:1.27-alpine | TLS termination, rate limiting, reverse proxy | nexus-public, nexus-app |
| aegis-keycloak | quay.io/keycloak/keycloak:26.0.5 | Identity provider (aegis-realm, ROPC) | nexus-app |
| aegis-vault | hashicorp/vault:1.18.1 | Secrets (dev mode, token=aegis-dev-root-token) | nexus-app, nexus-data |
| aegis-fastapi | custom build | Main application (2 uvicorn workers) | nexus-app, nexus-ai, nexus-data |
| aegis-arq | custom build (same image) | Background task worker | nexus-app, nexus-ai, nexus-data |
| aegis-ollama-main | ollama/ollama:0.4.1 | Qwen2.5-32B generation (10 threads) | nexus-ai |
| aegis-ollama-judge | ollama/ollama:0.4.1 | Qwen2.5-7B CRAG + judge (3 threads) | nexus-ai |
| aegis-ollama-vision | ollama/ollama:0.4.1 | Qwen2.5-VL-7B screenshots (3 threads) | nexus-ai |
| aegis-bge | custom build | BGE-base-en-v1.5 embeddings, port 8002 | nexus-ai |
| aegis-deberta | custom build | DeBERTa NLI + cross-encoder, port 8001 | nexus-ai |
| aegis-qdrant | qdrant/qdrant:v1.12.1 | Vector store (4 collections, 768-dim) | nexus-data |
| aegis-opensearch | opensearchproject/opensearch:2.17.0 | BM25 keyword search, JVM 2g+2g | nexus-data |
| aegis-postgres-primary | postgres:16.4-alpine | Primary database (13 tables) | nexus-data |
| aegis-postgres-replica | postgres:16.4-alpine | Read replica (analytics queries) | nexus-data |
| aegis-pgbouncer | pgbouncer/pgbouncer:1.23.1 | Connection pool (transaction mode, pool=20) | nexus-data |
| aegis-redis-session | redis:7.4-alpine | Sessions, JWT revocation, rate limits (6GB LRU) | nexus-data |
| aegis-redis-queue | redis:7.4-alpine | ARQ task queue (1GB noeviction, AOF) | nexus-data |
| aegis-prometheus | prom/prometheus:v2.55.0 | Metrics scraper (15s interval) | nexus-obs |
| aegis-grafana | grafana/grafana:11.3.1 | Quality dashboard (8 panels) | nexus-obs |

---

## AI MODELS (EXACT IDENTIFIERS)

```python
MODEL_MAIN_GENERATION = "qwen2.5:32b-instruct-q4_K_M"   # ollama-main, 10 threads
MODEL_JUDGE_CRAG      = "qwen2.5:7b-instruct-q4_K_M"    # ollama-judge, 3 threads
MODEL_VISION          = "qwen2.5vl:7b-instruct-q4_K_M"  # ollama-vision, 3 threads
MODEL_EMBEDDING       = "BAAI/bge-base-en-v1.5"          # BGE service, 768-dim
MODEL_NLI             = "cross-encoder/nli-deberta-v3-large"
MODEL_CROSS_ENCODER   = "cross-encoder/ms-marco-MiniLM-L-12-v2"
EMBEDDING_DIMENSION   = 768   # NEVER change this
```

---

## QDRANT COLLECTIONS

| Collection | Vectors | HNSW m | ef_construct | Quantization |
|---|---|---|---|---|
| meridian_errors | content(768) + identity(768) | 32 | 200 | INT8 scalar |
| meridian_procedures | content(768) + identity(768) | 32 | 200 | INT8 scalar |
| meridian_configs | content(768) + identity(768) | 32 | 200 | INT8 scalar |
| cache_queries | single(768) | 16 | 100 | none |

Search ef at query time: 128 (content collections), 64 (cache). Semantic cache threshold: **0.88**.

---

## THE COMPLETE QUERY PIPELINE

```
Employee message
    ↓
[GATE] Authentication middleware → 401 if no valid JWT
[GATE] Input Governance → 400 if SAP injection detected
[GATE] Rate limiting → 429 if > 60/min
    ↓
[QIL] Entity extraction (regex: error_code, tcode, document_number, module)
[QIL] Context resolver (reference signals → substitute last session entity)
[QIL] Synonym expansion (PostgreSQL synonym_map → append terms)
[QIL] Intent classification (ERROR_RESOLUTION | PROCESS | CONFIG | SIMPLE_FACT)
[QIL] Mode assignment: Registry hit → A  |  Complex query → C  |  Default → B
[QIL] Semantic cache check → if score ≥ 0.88: return cached answer immediately
    ↓ (cache miss only)
[RETRIEVAL Stage 1] Registry fetch (Mode A: direct document pull from Qdrant)
[RETRIEVAL Stage 2] Qdrant dual-vector search (content + identity named vectors)
[RETRIEVAL Stage 3] OpenSearch BM25 with entity triple-repetition boosting
[RETRIEVAL Stage 4] Knowledge Graph expansion (document_relationships edges)
[RETRIEVAL Stage 5] RRF fusion: score = 1/(rank + 60), Mode C +0.15 diversity bonus
[RETRIEVAL Stage 7] Cross-encoder reranking → top 5 chunks (*** RUNS BEFORE STAGE 6 ***)
[RETRIEVAL Stage 6] CRAG self-reflection (Qwen2.5-7B assesses sufficiency)
    → Mode A + score > 0.82: SKIP  |  Mode B + score > 0.80: SKIP  |  Mode C: ALWAYS RUN
    → INSUFFICIENT: queue knowledge_gap_task, return escalation message
[RETRIEVAL Stage 8] Parent header hydration (fetch header if missing from top 5)
    ↓
[REASONING] 6-section prompt: System | Documentation | Registry Note | Screen | History | Query
[REASONING] Model tier: SIMPLE_FACT→7B | ERROR_RESOLUTION/PROCESS/CONFIG→32B | Mode C/Vision→32B
[REASONING] Stream tokens → Redis Pub/Sub stream:{session_id} → WebSocket → browser
    ↓
[VALIDATION Tier 1] Concurrent output governance + T-code policy (during streaming)
[VALIDATION Tier 2] DeBERTa NLI: claim entailment, 350-token windowing, 75-token overlap
[VALIDATION Tier 3] Qwen2.5-7B judge: faithfulness + step_completeness + relevance
[VALIDATION] FreshnessCoefficient: 0-90d=1.00 | 90-180d=0.95 | 180-365d=0.85 | 365+d=0.75
[VALIDATION] ValidationScore = (NLI×0.45 + faithfulness×0.30 + completeness×0.25) × freshness
[VALIDATION] Badge: ≥0.85→green | 0.70-0.84→amber | <0.70→regenerate once, then amber
[VALIDATION] Green badge: queue cache_write_task (store in Qdrant cache_queries)
    ↓
[SESSION] Update conversation history (max 3 turns), update last_entities, update unresolved_count
[AUDIT] Queue audit_task (write to append-only audit_log PostgreSQL table)
```

---

## MODE A / B / C DECISION

```python
# In QueryIntelligenceLayer._assign_mode():

# Registry lookup: error_code or tcode entity → check known_patterns_registry
if registry_result:
    return registry_result, "A"

# Mode C conditions (any one triggers Mode C):
if (
    len(query) > 200          # Long complex query
    or len(module_entities) >= 3  # Three or more SAP modules mentioned
    or any(signal in query_lower for signal in MODE_C_SIGNALS)  # compare/difference/both/etc.
):
    return None, "C"

# Default
return None, "B"
```

---

## REDIS CONFIGURATION (CRITICAL — MUST MATCH EXACTLY)

```
Redis Instance 1 (aegis-redis-session):
  maxmemory: 6gb
  maxmemory-policy: allkeys-lru
  appendonly: no          ← NO PERSISTENCE (intentional)
  Keys: session:{sid}, diagnostic:{sid}, revoked_tokens, ratelimit:{uid}:{min}

Redis Instance 2 (aegis-redis-queue):
  maxmemory: 1gb
  maxmemory-policy: noeviction
  appendonly: yes         ← AOF PERSISTENCE (required for task durability)
  appendfsync: everysec
  Keys: arq:queue:{task_type}, arq:task:{task_id}, arq:dead_letter:{task_type}
```

---

## SESSION STATE HASH (Redis key: session:{session_id})

All 12 fields — all stored as strings in Redis hash:

```python
"user_id_hash"            # SHA-256(JWT sub)
"created_at"              # ISO8601 UTC
"conversation_history"    # JSON list, max 3 turns
"active_retrieval_mode"   # "A" | "B" | "C"
"last_entities"           # JSON list of {type, value} dicts
"last_document_ids"       # JSON list of document_id strings
"model_tier_last"         # "1" | "2" | "3"
"confidence_history"      # JSON list of floats, max 5
"unresolved_count"        # "0" through "3" (escalation at 3)
"intent_label"            # "{CLASSIFICATION}:{entity_value}"
"diagnostic_object_ready" # "true" | "false"
"last_updated_at"         # ISO8601 UTC
```

TTL: 7200 seconds (2 hours), reset on every request.

---

## VALIDATION FORMULA (EXACT)

```python
# Weights (must sum to 1.0):
WEIGHT_NLI                = 0.45
WEIGHT_JUDGE_FAITHFULNESS = 0.30
WEIGHT_JUDGE_COMPLETENESS = 0.25

raw_score = (NLI * 0.45) + (faithfulness * 0.30) + (completeness * 0.25)
ValidationScore = raw_score * FreshnessCoefficient

# Freshness (based on oldest source chunk):
if age_days <= 90:   coefficient = 1.00
elif age_days <= 180: coefficient = 0.95
elif age_days <= 365: coefficient = 0.85
else:                coefficient = 0.75

# Badges:
if ValidationScore >= 0.85: badge = "green"
elif ValidationScore >= 0.70: badge = "amber"
else: badge = "none"  → one regeneration attempt → then force "amber"
```

---

## CRAG SKIP LOGIC (EXACT)

```python
# Stage 7 (reranking) MUST run BEFORE Stage 6 (CRAG) in execute order
# CRAG needs top_cross_encoder_score which only exists after reranking

if mode == "A" and top_cross_encoder_score > 0.82:
    return "SKIPPED", None
if mode == "B" and top_cross_encoder_score > 0.80:
    return "SKIPPED", None
# Mode C NEVER skips
# model failure → return "SUFFICIENT", None (never block employees)
```

CRAG uses: Qwen2.5-7B (ollama-judge). Responds: "SUFFICIENT" or "INSUFFICIENT: {description}"

---

## SEVEN RULES THAT MUST NEVER BE VIOLATED

1. **Vector dimension = 768 everywhere.** BGE-base-en-v1.5 output. Any other dim = hard bug.
2. **Pipeline order: Stage 7 before Stage 6.** Reranking before CRAG assessment.
3. **Redis Instance 2 must have AOF persistence.** Task durability requirement.
4. **config_values chunk is never split.** CURRENT_VALUES_AT_SONA_COMSTAR = one indivisible chunk.
5. **audit_log is append-only.** No UPDATE or DELETE on this table, ever.
6. **Mode C always runs CRAG.** No skip condition for Mode C regardless of score.
7. **CRAG failure defaults to SUFFICIENT.** Non-blocking — log and continue.

---

## POSTGRESQL TABLES (13 TOTAL)

**Operational:** known_patterns_registry, documents_registry, document_relationships, transaction_code_permissions, audit_log (append-only), mock_tickets, feedback_events, human_review_queue, synonym_map, config_snapshot

**Analytical:** knowledge_gap_events, confidence_history, session_quality_daily

---

## KEY PORTS (INTERNAL DOCKER NETWORK)

```
FastAPI:         8000    BGE service:     8002    Ollama (all):   11434
Nginx HTTPS:      443    DeBERTa service: 8001    Grafana:         3000
Keycloak:        8080    Qdrant REST:     6333    Prometheus:      9090
Vault:           8200    OpenSearch:      9200    PgBouncer:       6432
Redis (both):    6379    PostgreSQL:      5432
```

---

## 7 ARQ TASK TYPES

| Task | Retry | Delay | Purpose |
|---|---|---|---|
| vision | 3× | 30s | Screenshot → DiagnosticObject → Redis |
| audit | 5× | 10s | Append row to audit_log |
| feedback_diagnosis | 2× | 60s | Classify thumbs-down as retrieval or generation failure |
| cache_write | 0× | — | Store green answer in Qdrant cache_queries |
| knowledge_gap | 3× | 15s | Record INSUFFICIENT event in PostgreSQL |
| mock_ticket | 3× | 15s | Create TKT-YYYYMMDD-uuid8 ticket |
| nightly_cleanup | 1× | — | Delete cache_queries entries older than 24h |

---

## DOCUMENT ID FORMAT

```
{MODULE}-{TYPE}-{NUMBER}
Examples: SD-ERR-001, FI-CFG-003, MM-PROC-012
Regex: ^(FI|MM|SD|HR|PP|CO|BASIS)-(ERR|PROC|CFG)-\d{3}$
```

---

## INGESTION PIPELINE (11 STAGES)

```
Stage  1: Magic bytes         → JPEG/PNG/DOCX/PDF validation
Stage  2: Content extraction  → python-docx or pdfplumber
Stage  3: Field detection     → UPPERCASE_LABEL: pattern parsing
Stage  4: Schema validation   → required fields, DOCUMENT_ID regex
Stage  5: Content validation  → enum values, type/id consistency
Stage  6: Chunking            → error_guide: header+causes | procedure: header+phases | config: overview+values(unsplittable)+nav
Stage  7: Embedding           → BGE batch embed content + identity vectors
Stage  8: Qdrant upsert       → correct collection by document_id suffix
Stage  9: OpenSearch index    → entity boosting (3× repetition in chunk_text)
Stage 10: KG edges            → document_relationships from RELATED_ERRORS field
Stage 11: Registry update     → documents_registry status=active, chunk_count
```

---

*Document version: 2.0 | AEGIS Specification Set | Final — all architectural decisions resolved*
