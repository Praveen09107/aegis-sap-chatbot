# AEGIS DATA CONTRACTS
## All Data Structures, Schemas, and Formats That Cross Component Boundaries
## Attach to Every Agent Session

---

## CRITICAL INSTRUCTION FOR THE AI AGENT

Every data structure in this document is authoritative. When one component writes data and another component reads it, both must use the exact field names, exact data types, and exact formats specified here. A single field name mismatch between writer and reader causes a silent runtime failure that is extremely difficult to diagnose.

If you need to pass data between two components and that data structure is not defined here, STOP and report the gap. Do not invent field names.

---

## 1. REDIS KEY FORMAT REGISTRY

Every Redis key used in AEGIS follows a specific format. All key formats are listed here. Do not create new Redis keys not in this list.

### Redis Instance 1 Keys (Session, Cache, Rate Limiting)

```
session:{session_id}
  Type: Hash
  TTL: 7200 seconds (2 hours, reset on every request)
  Fields: See Section 2 — Session State Hash

diagnostic:{session_id}
  Type: String (JSON-serialised DiagnosticObject)
  TTL: 600 seconds (10 minutes)
  Value: See Section 3 — DiagnosticObject Schema

revoked_tokens
  Type: Set
  Members: jti values (strings) of revoked JWT tokens
  Per-member TTL: Equal to the token's remaining lifetime at revocation time
  Note: Use SEXPIREAT {member} {unix_timestamp} to set per-member expiry

ratelimit:{user_id_hash}:{minute_epoch}
  Type: String (integer counter)
  TTL: 120 seconds (2 minutes)
  Value: Integer count of requests in this minute window
  minute_epoch: Unix timestamp divided by 60, integer result

stream:{session_id}
  Type: Pub/Sub channel (NOT a stored key — publish/subscribe only)
  Purpose: Token streaming from generation model to WebSocket handler

vision_complete:{session_id}
  Type: Pub/Sub channel (NOT a stored key — publish/subscribe only)
  Purpose: ARQ vision worker signals completion to WebSocket handler

cache:{query_embedding_hash}
  Type: NOT a Redis key — semantic cache is stored in Qdrant collection cache_queries
  Note: Do not store semantic cache entries in Redis. Store in Qdrant cache_queries.
```

### Redis Instance 2 Keys (ARQ Task Queue)

```
arq:queue:{task_type}
  Type: List (RPUSH to enqueue, LPOP to dequeue — FIFO)
  task_type values: vision | audit | feedback_diagnosis | cache_write | knowledge_gap | mock_ticket | nightly_cleanup
  Value: JSON-serialised task payload (see Section 4)

arq:task:{task_id}
  Type: Hash
  Fields: task_id (string), task_type (string), status (enum: queued|running|completed|failed), retry_count (integer), last_attempt_at (ISO timestamp), error_message (string, nullable)
  TTL: 86400 seconds (24 hours after completion)

arq:dead_letter:{task_type}
  Type: List
  Value: JSON-serialised task payloads that exhausted retries
  TTL: No expiry (manual inspection required)
```

---

## 2. SESSION STATE HASH — COMPLETE FIELD SPECIFICATION

Stored at Redis key `session:{session_id}` as a Redis Hash. Every field name is exact — do not abbreviate or rename.

```python
# Exact field names and Python types:

"user_id_hash"           : str   # SHA-256 hex digest of JWT 'sub' claim
"created_at"             : str   # ISO 8601 datetime: "2024-01-15T09:30:00Z"
"conversation_history"   : str   # JSON-serialised list, max 3 turns
"active_retrieval_mode"  : str   # Exactly one of: "A" | "B" | "C"
"last_entities"          : str   # JSON-serialised list of EntityObject dicts
"last_document_ids"      : str   # JSON-serialised list of document_id strings
"model_tier_last"        : str   # String representation of integer: "1" | "2" | "3"
"confidence_history"     : str   # JSON-serialised list of float values, max 5
"unresolved_count"       : str   # String representation of integer: "0", "1", "2", "3"
"intent_label"           : str   # Format: "{CLASSIFICATION}:{entity_value}" e.g. "ERROR_RESOLUTION:VL150"
"diagnostic_object_ready": str   # "true" | "false" (string, not bool — Redis stores strings)
"last_updated_at"        : str   # ISO 8601 datetime
```

### conversation_history Item Schema (one turn):
```json
{
  "query_summary": "string, max 200 chars truncated",
  "answer_summary": "string, max 300 chars truncated",
  "classification": "ERROR_RESOLUTION | PROCESS | CONFIG | SIMPLE_FACT",
  "confidence_badge": "green | amber | none",
  "retrieved_doc_ids": ["SD-ERR-001", "SD-PROC-001"]
}
```

### EntityObject Schema (items in last_entities list):
```json
{
  "type": "error_code | tcode | document_number | module",
  "value": "string, e.g. VL150 or VL01N or SD"
}
```

---

## 3. DIAGNOSTICOBJECT SCHEMA

Produced by the ARQ vision task after Qwen2.5-VL-7B processes a screenshot.
Stored as JSON string in Redis at `diagnostic:{session_id}`.

```json
{
  "error_code": "string or null",
  "error_message_text": "string or null",
  "transaction_code": "string or null",
  "screen_title": "string or null",
  "material_number": "string or null",
  "plant_code": "string or null",
  "document_number": "string or null",
  "batch_number": "string or null",
  "field_values": [
    {
      "field": "string (field label)",
      "value": "string (field value)"
    }
  ],
  "visible_quantities": [
    {
      "label": "string (quantity label)",
      "value": "string (quantity with unit)"
    }
  ]
}
```

**Null field rule:** Any field not visible in the screenshot MUST be null. Do not guess, infer, or leave as empty string. Empty string `""` is not the same as `null`.

**field_values** and **visible_quantities** are always lists. If no field values are visible, use `[]` (empty list), not null.

---

## 4. ARQ TASK PAYLOAD SCHEMAS

Each task type has an exact payload format. The ARQ worker reads these fields by name.

### vision task payload:
```json
{
  "task_type": "vision",
  "task_id": "string (UUID4)",
  "session_id": "string",
  "file_path": "string (absolute path: /tmp/aegis_uploads/{session_id}_{timestamp_ms}.{ext})",
  "created_at": "ISO 8601 datetime"
}
```
**CRITICAL:** `file_path` is a string file path. NEVER `image_bytes`. NEVER `image_data`. The file exists on the shared filesystem volume `/tmp/aegis_uploads/`.

### audit task payload:
```json
{
  "task_type": "audit",
  "task_id": "string (UUID4)",
  "occurred_at": "ISO 8601 datetime",
  "user_id_hash": "string",
  "session_id": "string",
  "trace_id": "string (UUID4)",
  "request_type": "chat | upload | admin",
  "governance_trigger_flags": {
    "input_schema_fail": false,
    "file_type_fail": false,
    "injection_pattern_detected": false,
    "output_leak_detected": false
  },
  "validation_score": 0.0,
  "model_tier": 1,
  "retrieved_document_ids": ["string"],
  "confidence_badge": "green | amber | none",
  "feedback_signal": "positive | negative | none"
}
```

### feedback_diagnosis task payload:
```json
{
  "task_type": "feedback_diagnosis",
  "task_id": "string (UUID4)",
  "feedback_event_id": "string (UUID4)",
  "session_id": "string",
  "query_text": "string (original enriched query)",
  "answer_text": "string (the delivered answer)",
  "retrieved_document_ids": ["string"],
  "validation_score": 0.0,
  "created_at": "ISO 8601 datetime"
}
```

### cache_write task payload:
```json
{
  "task_type": "cache_write",
  "task_id": "string (UUID4)",
  "query_text": "string (enriched query)",
  "answer_text": "string (delivered answer)",
  "validation_score": 0.0,
  "document_ids": ["string"],
  "created_at": "ISO 8601 datetime"
}
```

### knowledge_gap task payload:
```json
{
  "task_type": "knowledge_gap",
  "task_id": "string (UUID4)",
  "session_id": "string",
  "query_text": "string",
  "extracted_entities": [{"type": "string", "value": "string"}],
  "gap_description": "string (from CRAG self-reflection output)",
  "occurred_at": "ISO 8601 datetime"
}
```

### mock_ticket task payload:
```json
{
  "task_type": "mock_ticket",
  "task_id": "string (UUID4)",
  "session_id": "string",
  "user_id_hash": "string",
  "query_text": "string",
  "reason": "string (INSUFFICIENT reason or unresolved escalation)",
  "created_at": "ISO 8601 datetime"
}
```

### nightly_cleanup task payload:
```json
{
  "task_type": "nightly_cleanup",
  "task_id": "string (UUID4)",
  "created_at": "ISO 8601 datetime"
}
```

---

## 5. ENRICHED QUERY OBJECT SCHEMA

Produced by the Query Intelligence Layer, consumed by the Retrieval Engine and Reasoning Service.

```python
@dataclass
class EnrichedQuery:
    raw_message: str                    # Original employee message, unmodified
    enriched_text: str                  # Message + synonym expansions appended
    entities: List[EntityObject]        # Extracted SAP entities
    context_entity: Optional[EntityObject]  # Entity substituted by context resolver (or None)
    retrieval_mode: str                 # "A" | "B" | "C"
    classification: str                 # "ERROR_RESOLUTION" | "PROCESS" | "CONFIG" | "SIMPLE_FACT"
    registry_result: Optional[RegistryResult]  # Populated if mode == "A", else None
    session_id: str
    trace_id: str
```

```python
@dataclass
class RegistryResult:
    pattern_string: str
    pattern_type: str
    linked_document_id: str
    linked_chunk_type: str
    registry_notes: str                 # Injected into prompt context section
```

---

## 6. RETRIEVAL RESULT OBJECT SCHEMA

Produced by the Retrieval Engine, consumed by the Reasoning Service.

```python
@dataclass
class RetrievalResult:
    chunks: List[RetrievedChunk]        # Top 5 chunks after reranking
    parent_header: Optional[ParentHeader]  # From hydration, None if header was in top 5
    registry_notes: str                 # Empty string if not Mode A
    crag_assessment: str                # "SUFFICIENT" | "INSUFFICIENT" | "SKIPPED"
    crag_gap_description: Optional[str] # Populated if INSUFFICIENT, else None
    retrieval_mode_used: str            # Final mode used (may differ if Mode C activated)
    top_cross_encoder_score: float      # Highest cross-encoder score among top 5
```

```python
@dataclass
class RetrievedChunk:
    chunk_id: str                       # Format: "{document_id}:chunk:{index}"
    document_id: str
    content_type: str                   # "error_guide" | "procedure" | "config"
    chunk_type: str                     # header | cause_resolution | outcome | procedure_header | etc.
    chunk_text: str                     # Full text content of this chunk
    last_verified_date: str             # ISO date string: "2024-03-28"
    verified_by: str
    cross_encoder_score: float          # Score from ms-marco-MiniLM-L-12-v2
    rrf_score: float                    # Score from RRF fusion
```

```python
@dataclass
class ParentHeader:
    document_id: str
    content_type: str
    error_code: Optional[str]
    configuration_name: Optional[str]
    procedure_name: Optional[str]
    module: str
    transactions: List[str]
    last_verified_date: str
    verified_by: str
```

---

## 7. VALIDATION RESULT OBJECT SCHEMA

Produced by the Validation Engine, consumed by the Orchestration layer.

```python
@dataclass
class ValidationResult:
    validation_score: float             # Final ValidationScore (0.0 to 1.0)
    raw_score: float                    # Before freshness coefficient
    freshness_coefficient: float        # 1.0 | 0.95 | 0.85 | 0.75
    nli_support_score: float            # supported_claims / total_claims
    judge_faithfulness: float           # From Tier 3 (1.0 if Tier 3 skipped)
    judge_step_completeness: float      # From Tier 3 (1.0 if Tier 3 skipped)
    judge_relevance: float              # From Tier 3 (1.0 if Tier 3 skipped)
    tier3_ran: bool
    confidence_badge: str               # "green" | "amber" | "none"
    unsupported_claims: List[str]       # Claim texts that failed NLI threshold
    tier1_failures: List[Tier1Failure]  # List of Tier 1 check failures
    regeneration_attempted: bool
    answer_text: str                    # Final delivered answer (may be regenerated)
    attribution_panel: AttributionPanel
```

```python
@dataclass
class Tier1Failure:
    check_type: str                     # "output_leak" | "scope_violation" | "tcode_policy"
    matched_content: str                # The specific content that triggered the failure
    sentence_text: str                  # The sentence containing the failure
```

```python
@dataclass
class AttributionPanel:
    primary_document_id: str
    primary_document_name: str          # Error code, config name, or procedure name
    verified_by: str
    verified_date: str                  # ISO date string
    secondary_sources: List[dict]       # Up to 2 additional sources for Mode C multi-doc answers
    confidence_badge: str               # "green" | "amber" | "none"
```

---

## 8. POSTGRESQL TABLE SCHEMAS — COMPLETE COLUMN DEFINITIONS

### operational schema — known_patterns_registry
```sql
CREATE TABLE known_patterns_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_string TEXT NOT NULL,
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('error_code','order_type','plant_code','tax_code','pricing_procedure','transaction')),
    linked_document_id TEXT NOT NULL,
    linked_chunk_type TEXT NOT NULL,
    registry_notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
    approved_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ
);
CREATE INDEX idx_registry_pattern ON known_patterns_registry(pattern_string) WHERE status = 'approved';
```

### operational schema — documents_registry
```sql
CREATE TABLE documents_registry (
    document_id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL CHECK (content_type IN ('error_guide','procedure','config')),
    module TEXT NOT NULL CHECK (module IN ('FI','MM','SD','HR','PP','CO','BASIS')),
    transactions TEXT[] NOT NULL DEFAULT '{}',
    last_verified_date DATE NOT NULL,
    verified_by TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    chunk_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('active','processing','failed','deprecated')),
    parent_content BYTEA
);
```

### operational schema — document_relationships
```sql
CREATE TABLE document_relationships (
    from_document_id TEXT NOT NULL,
    to_document_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('causes_error','common_in_procedure','related_to')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (from_document_id, to_document_id),
    FOREIGN KEY (from_document_id) REFERENCES documents_registry(document_id),
    FOREIGN KEY (to_document_id) REFERENCES documents_registry(document_id)
);
CREATE INDEX idx_doc_rel_from ON document_relationships(from_document_id);
CREATE INDEX idx_doc_rel_to ON document_relationships(to_document_id);
```

### operational schema — transaction_code_permissions
```sql
CREATE TABLE transaction_code_permissions (
    tcode TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('employee','it-admin','consultant')),
    module TEXT NOT NULL
);
```

### operational schema — audit_log (APPEND-ONLY — no UPDATE, no DELETE)
```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL,
    user_id_hash TEXT NOT NULL,
    session_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('chat','upload','admin')),
    governance_trigger_flags JSONB NOT NULL DEFAULT '{}',
    validation_score FLOAT,
    model_tier INTEGER CHECK (model_tier IN (1,2,3)),
    retrieved_document_ids TEXT[],
    confidence_badge TEXT CHECK (confidence_badge IN ('green','amber','none')),
    feedback_signal TEXT NOT NULL DEFAULT 'none' CHECK (feedback_signal IN ('positive','negative','none'))
);
CREATE INDEX idx_audit_session ON audit_log(session_id);
CREATE INDEX idx_audit_user ON audit_log(user_id_hash);
CREATE INDEX idx_audit_time ON audit_log(occurred_at DESC);
-- REVOKE UPDATE, DELETE ON audit_log FROM aegis_app_role;
```

### operational schema — mock_tickets
```sql
CREATE TABLE mock_tickets (
    ticket_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id TEXT NOT NULL,
    user_id_hash TEXT NOT NULL,
    query_text TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
    resolution_notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tickets_status ON mock_tickets(status);
```

### operational schema — feedback_events
```sql
CREATE TABLE feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    feedback_signal TEXT NOT NULL CHECK (feedback_signal IN ('positive','negative')),
    retrieved_document_ids TEXT[],
    validation_score FLOAT,
    query_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    diagnosis_result JSONB,
    diagnosis_completed_at TIMESTAMPTZ
);
```

### operational schema — human_review_queue
```sql
CREATE TABLE human_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_feedback_id UUID NOT NULL REFERENCES feedback_events(id),
    query_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    unsupported_claims TEXT[] NOT NULL DEFAULT '{}',
    retrieved_document_ids TEXT[],
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_review','resolved')),
    admin_correct_answer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
```

### operational schema — synonym_map
```sql
CREATE TABLE synonym_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phrase TEXT NOT NULL UNIQUE,
    expansion TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_synonym_phrase ON synonym_map(phrase) WHERE active = TRUE;
```

### operational schema — config_snapshot
```sql
CREATE TABLE config_snapshot (
    config_category TEXT NOT NULL,
    config_key TEXT NOT NULL,
    config_value TEXT NOT NULL,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL,
    notes TEXT,
    PRIMARY KEY (config_category, config_key)
);
```

### analytical schema — knowledge_gap_events
```sql
CREATE TABLE knowledge_gap_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    query_text TEXT NOT NULL,
    extracted_entities JSONB NOT NULL DEFAULT '[]',
    gap_description TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gap_events_time ON knowledge_gap_events(occurred_at DESC);
```

### analytical schema — confidence_history
```sql
CREATE TABLE confidence_history (
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    query_type TEXT NOT NULL,
    avg_validation_score FLOAT NOT NULL,
    p50_score FLOAT NOT NULL,
    p95_score FLOAT NOT NULL,
    total_queries INTEGER NOT NULL,
    escalation_count INTEGER NOT NULL,
    PRIMARY KEY (period_start, query_type)
);
```

### analytical schema — session_quality_daily
```sql
CREATE TABLE session_quality_daily (
    date DATE PRIMARY KEY,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    total_queries INTEGER NOT NULL DEFAULT 0,
    cache_hit_rate FLOAT NOT NULL DEFAULT 0.0,
    avg_validation_score FLOAT NOT NULL DEFAULT 0.0,
    green_badge_pct FLOAT NOT NULL DEFAULT 0.0,
    amber_badge_pct FLOAT NOT NULL DEFAULT 0.0,
    insufficient_pct FLOAT NOT NULL DEFAULT 0.0,
    mode_a_pct FLOAT NOT NULL DEFAULT 0.0,
    mode_b_pct FLOAT NOT NULL DEFAULT 0.0,
    mode_c_pct FLOAT NOT NULL DEFAULT 0.0
);
```

---

## 9. QDRANT POINT SCHEMAS — PAYLOAD FIELDS

### meridian_errors collection — point payload
```python
{
    "chunk_id": str,            # Format: "{document_id}:chunk:{index}" e.g. "SD-ERR-001:chunk:1"
    "document_id": str,         # e.g. "SD-ERR-001"
    "content_type": str,        # Always "error_guide"
    "module": str,              # "FI" | "MM" | "SD" | "HR" | "PP" | "CO" | "BASIS"
    "error_code": str,          # e.g. "VL150"
    "chunk_type": str,          # "header" | "cause_resolution" | "outcome"
    "chunk_index": int,         # 0-based index within document
    "total_chunks": int,        # Total chunks in this document
    "cause_number": int | None, # Integer for cause_resolution chunks, None otherwise
    "transactions": list[str],  # e.g. ["VL01N", "MMBE"]
    "last_verified_date": str,  # ISO date: "2024-03-28"
    "verified_by": str,         # e.g. "Rsuresh1"
    "chunk_text": str,          # Full chunk content
    "embedding_model_version": str  # Always "bge-base-en-v1.5"
}
```

### meridian_procedures collection — point payload
```python
{
    "chunk_id": str,
    "document_id": str,
    "content_type": str,        # Always "procedure"
    "module": str,
    "procedure_name": str,      # e.g. "Scheduling Agreement Creation YDSA"
    "chunk_type": str,          # "procedure_header" | "procedure_steps" | "procedure_outcome"
    "chunk_index": int,
    "total_chunks": int,
    "phase_name": str | None,   # Phase name for step chunks, None for header/outcome
    "step_range": str | None,   # e.g. "1-3" for step chunks, None otherwise
    "transactions": list[str],
    "last_verified_date": str,
    "verified_by": str,
    "chunk_text": str,
    "embedding_model_version": str  # Always "bge-base-en-v1.5"
}
```

### meridian_configs collection — point payload
```python
{
    "chunk_id": str,
    "document_id": str,
    "content_type": str,        # Always "config"
    "module": str,
    "configuration_name": str,  # e.g. "Withholding Tax Configuration"
    "chunk_type": str,          # "config_overview" | "config_values" | "config_navigation"
    "chunk_index": int,
    "total_chunks": int,
    "transactions": list[str],
    "last_verified_date": str,
    "verified_by": str,
    "chunk_text": str,
    "embedding_model_version": str  # Always "bge-base-en-v1.5"
}
```

### cache_queries collection — point payload
```python
{
    "query_text": str,          # The enriched query text
    "answer_text": str,         # The delivered answer
    "validation_score": float,  # ValidationScore at time of caching
    "document_ids": list[str],  # Document IDs used in this answer
    "created_at": str,          # ISO 8601 datetime
    "embedding_model_version": str  # Always "bge-base-en-v1.5"
}
```

---

## 10. OPENSEARCH DOCUMENT SCHEMA

Each ingested chunk is stored as one OpenSearch document in the `sap_documents` index.

```json
{
  "_id": "{chunk_id}",
  "chunk_id": "string",
  "document_id": "string",
  "content_type": "error_guide | procedure | config",
  "module": "string",
  "chunk_type": "string",
  "error_code": "string or null",
  "configuration_name": "string or null",
  "procedure_name": "string or null",
  "transactions": ["string"],
  "last_verified_date": "date string",
  "chunk_text": "string (analyzed with SAP custom analyzer, entity appears 3x for boosting)"
}
```

**Entity boosting implementation:** When indexing, if the document has an `error_code`, the `chunk_text` field is constructed as: `{error_code} {error_code} {error_code} {original_chunk_text}`. The triple repetition increases BM25 term frequency for the entity. Same applies to `configuration_name` and `procedure_name`.

---

## 11. WEBSOCKET MESSAGE FORMATS

All WebSocket messages between FastAPI server and browser client are JSON strings.

### Server → Client: Token Message (streaming generation)
```json
{
  "type": "token",
  "token": "string (one or more characters from model output)",
  "session_id": "string"
}
```

### Server → Client: Stream Complete Message
```json
{
  "type": "stream_complete",
  "session_id": "string"
}
```

### Server → Client: Validation Result Message (sent after stream_complete)
```json
{
  "type": "validation_result",
  "validation_score": 0.87,
  "confidence_badge": "green | amber | none",
  "attribution_panel": {
    "primary_document_id": "string",
    "primary_document_name": "string",
    "verified_by": "string",
    "verified_date": "string",
    "secondary_sources": []
  },
  "session_id": "string"
}
```

### Server → Client: Vision Complete Message (proactive push)
```json
{
  "type": "vision_refined_answer",
  "message": "Screenshot processed — here is a more specific answer based on your SAP screen:",
  "answer_text": "string (the refined answer with DiagnosticObject context)",
  "validation_score": 0.91,
  "confidence_badge": "green",
  "attribution_panel": {},
  "session_id": "string"
}
```

### Server → Client: Error Message
```json
{
  "type": "error",
  "error_code": "string (e.g. INSUFFICIENT | VALIDATION_FAILED | SERVICE_UNAVAILABLE)",
  "message": "string (user-friendly message)",
  "ticket_id": "string or null (populated if mock ticket was created)",
  "session_id": "string"
}
```

*(A `"correction"` server→client message type — a short targeted-fix note distinct from the full answer — was documented here originally but never implemented by `IMPL_17_VALIDATION_ENGINE.md`'s real Tier 3 judge call, which only ever produces numeric faithfulness/completeness/relevance scores, never free-text correction content. `validate_with_regeneration()`'s real behavior is a full-answer regeneration, already delivered through the `validation_result` message's `answer_text` field — confirmed to fully cover this case, not a gap. Removed rather than built as unused code; see `DECISIONS_LOG.md` OPEN-08.)*

### Client → Server: Chat Message
```json
{
  "type": "message",
  "message": "string (employee query text)",
  "session_id": "string"
}
```

### Client → Server: Feedback Message
```json
{
  "type": "feedback",
  "signal": "positive | negative",
  "session_id": "string",
  "turn_index": 0
}
```

---

## 12. FASTAPI API ENDPOINT CONTRACTS

### POST /api/chat
**Request:**
```json
{
  "message": "string (required, max 2000 chars)",
  "session_id": "string (optional, omit for new session)"
}
```
**Files:** Optional file upload via multipart form, field name: `screenshot`
**Auth:** JWT cookie required (employee or it-admin role)
**Response:** WebSocket upgrade for streaming, OR JSON error

### GET /api/session/{session_id}
**Auth:** JWT cookie required
**Response:**
```json
{
  "session_id": "string",
  "created_at": "ISO timestamp",
  "turn_count": 0,
  "active_retrieval_mode": "A | B | C",
  "unresolved_count": 0
}
```

### POST /api/feedback
**Auth:** JWT cookie required
**Request:**
```json
{
  "session_id": "string",
  "turn_index": 0,
  "signal": "positive | negative"
}
```
**Response:**
```json
{"status": "recorded", "feedback_id": "UUID string"}
```

### POST /admin/documents/upload
**Auth:** JWT cookie required (it-admin role only)
**Files:** Multipart form, field name: `document_file`, field `document_type` optional (auto-detected)
**Response (success):**
```json
{
  "status": "processing | complete | failed",
  "document_id": "string",
  "chunk_count": 0,
  "message": "string"
}
```
**Response (error):**
```json
{
  "status": "failed",
  "stage": "string (which ingestion stage failed)",
  "message": "string (specific error description)"
}
```

### GET /admin/documents
**Auth:** JWT cookie required (it-admin role only)
**Query params:** `content_type`, `module`, `status`, `page`, `page_size`
**Response:**
```json
{
  "documents": [{"document_id": "string", "content_type": "string", "status": "string", "chunk_count": 0, "last_verified_date": "string"}],
  "total": 0,
  "page": 1,
  "page_size": 50
}
```

### GET /admin/knowledge-gaps
**Auth:** JWT cookie required (it-admin role only)
**Query params:** `days` (7 or 30), `min_occurrences`
**Response:**
```json
{
  "clusters": [
    {
      "entity_combination": "string (e.g. VL150+reservation)",
      "count_7d": 0,
      "count_30d": 0,
      "example_queries": ["string"],
      "gap_description": "string"
    }
  ]
}
```

### GET /health
**Auth:** None required
**Response:**
```json
{
  "status": "healthy | degraded | unhealthy",
  "services": {
    "qdrant": "healthy | unhealthy",
    "opensearch": "healthy | unhealthy",
    "postgres": "healthy | unhealthy",
    "redis_session": "healthy | unhealthy",
    "redis_queue": "healthy | unhealthy",
    "ollama_main": "healthy | unhealthy",
    "ollama_judge": "healthy | unhealthy",
    "ollama_vision": "healthy | unhealthy",
    "deberta": "healthy | unhealthy",
    "bge": "healthy | unhealthy",
    "vault": "healthy | unhealthy",
    "keycloak": "healthy | unhealthy"
  }
}
```

---

## 13. EXTERNAL SERVICE API FORMATS

### BGE Embedding Service API
The BGE service is a custom FastAPI endpoint wrapping the sentence-transformers library.

**POST /embed**
```json
Request: {"texts": ["string1", "string2"]}
Response: {"embeddings": [[0.1, 0.2, ...], [0.3, 0.4, ...]], "dimension": 768}
```

**POST /embed-single**
```json
Request: {"text": "string"}
Response: {"embedding": [0.1, 0.2, ...], "dimension": 768}
```

### DeBERTa NLI Service API
The DeBERTa service is a custom FastAPI endpoint wrapping the transformers pipeline.

**POST /nli**
```json
Request: {
  "hypothesis": "string (claim to verify)",
  "premises": ["string (chunk text, max 350 tokens)"]
}
Response: {
  "scores": [
    {
      "premise_index": 0,
      "entailment": 0.92,
      "neutral": 0.06,
      "contradiction": 0.02
    }
  ],
  "max_entailment": 0.92
}
```

**POST /nli-batch**
```json
Request: {
  "pairs": [
    {"hypothesis": "string", "premise": "string"}
  ]
}
Response: {
  "results": [
    {"entailment": 0.92, "neutral": 0.06, "contradiction": 0.02}
  ]
}
```

### Ollama API (OpenAI-compatible format)
All three Ollama instances use the same API format.

**POST /api/chat (Ollama native)**
```json
Request: {
  "model": "qwen2.5:32b-instruct-q4_K_M",
  "messages": [{"role": "user", "content": "string"}],
  "stream": true,
  "options": {"num_thread": 10}
}
```

**POST /v1/chat/completions (OpenAI-compatible, used by Model Gateway)**
```json
Request: {
  "model": "model-name",
  "messages": [
    {"role": "system", "content": "string"},
    {"role": "user", "content": "string"}
  ],
  "stream": true,
  "temperature": 0.1,
  "max_tokens": 1000
}
```

---

## 14. MOCK TICKET ID FORMAT

```
TKT-{YYYYMMDD}-{first-8-chars-of-UUID4}

Example: TKT-20240315-a1b2c3d4
```

Generate using: `f"TKT-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid4())[:8]}"`

---

## 15. DOCUMENT ID FORMAT

```
{MODULE}-{TYPE}-{NUMBER}

MODULE: FI | MM | SD | HR | PP | CO | BASIS
TYPE: ERR | PROC | CFG
NUMBER: three-digit zero-padded integer

Examples: SD-ERR-001, FI-CFG-003, MM-PROC-012
```

Validation regex: `^(FI|MM|SD|HR|PP|CO|BASIS)-(ERR|PROC|CFG)-\d{3}$`

---

## 16. KEYCLOAK TOKEN CLAIMS

The AEGIS application reads these specific claims from the JWT:

```python
jwt_payload = {
    "sub": "string (unique user ID, used as user identifier)",
    "role": "employee | it-admin",
    "iat": 1234567890,    # Issued-at Unix timestamp
    "exp": 1234568790,    # Expiry Unix timestamp (iat + 900 seconds)
    "jti": "UUID string", # Unique token ID, used for revocation
    "aud": "aegis-chat | aegis-admin",  # Audience (client ID)
    "iss": "http://keycloak:8080/realms/aegis-realm"  # Issuer
}
```

**user_id_hash computation:** `hashlib.sha256(payload["sub"].encode()).hexdigest()`

---
## 17. QUICK ENTRY TYPESCRIPT INTERFACES (Added in IMPL_23)

```typescript

// ─── Quick Entry Core Types ───────────────────────────────────────────────

export type QuickEntryContentType = 'error_guide' | 'procedure' | 'config'

export type QuickEntryStatus =
  | 'draft'
  | 'processing'
  | 'active'
  | 'archived'
  | 'low_quality'
  | 'failed'
  | 'partial_index'
  | 'review_required'

export type ReviewFrequency =
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual'
  | 'as_needed'

export type VisionStatus =
  | 'pending'
  | 'processing'
  | 'complete'
  | 'failed'
  | 'not_sap'

export type ChunkStorageStatus = 'pending' | 'success' | 'failed'

// ─── Entry List Item (returned by GET /api/admin/knowledge-entries) ────────

export interface QuickEntryListItem {
  id: string
  document_id: string
  content_type: QuickEntryContentType
  module: string
  status: QuickEntryStatus
  version: number
  verified_by_name: string
  verified_date: string           // YYYY-MM-DD
  submitted_by_name: string
  chunk_count: number
  screenshot_count: number
  has_failed_screenshots: boolean
  next_review_date: string | null // YYYY-MM-DD, Config only
  gap_id: string | null
  feedback_summary: FeedbackSummary
  issue_title: string             // derived from form_data (first meaningful field)
  created_at: string
  updated_at: string
}

export interface FeedbackSummary {
  positive: number
  negative: number
  net: number
  period_days: number
  last_negative_at: string | null
}

export interface ScreenshotReference {
  url:     string
  caption: string
  section: string
}

// ─── Full Entry (returned by GET /api/admin/knowledge-entries/:id) ─────────

export interface QuickEntryFull {
  id: string
  document_id: string
  content_type: QuickEntryContentType
  module: string
  transactions: string[]
  status: QuickEntryStatus
  version: number
  form_data: ErrorGuideFormData | ProcedureFormData | ConfigFormData
  verified_by_name: string
  verified_date: string
  review_frequency: ReviewFrequency | null
  next_review_date: string | null
  gap_id: string | null
  processing_log: ProcessingLog | null
  submitted_by: string
  created_at: string
  updated_at: string
  screenshots: QuickEntryScreenshot[]
  chunks: QuickEntryChunkSummary[]
}

// ─── Form Data Types ───────────────────────────────────────────────────────

export interface ErrorGuideFormData {
  issue_description: string
  error_code: string              // exact code or "NONE"
  error_message: string           // exact SAP text or "NONE"
  description: string
  when_this_occurs: string
  causes: CauseBlock[]
  success_indicator: string
  escalation_criteria: string
  admin_steps: string             // specific steps or "NONE"
  notes: string
}

export interface CauseBlock {
  cause_number: number            // 1-based, auto-assigned from array index
  priority: CausePriority
  cause_description: string
  how_to_identify: string
  resolution_steps: string
  resolution_requires_admin: boolean
  cause_obsolete: boolean
  obsolete_reason: string         // required if cause_obsolete is true
  screenshot_ids: string[]        // IDs from knowledge_form_screenshots
}

export type CausePriority = 'check_first' | 'common' | 'less_common' | 'rare'

export interface ProcedureFormData {
  procedure_name: string
  purpose: string
  when_to_use: string
  data_required: string           // or "NONE"
  system_conditions: string       // or "NONE"
  access_required: string
  steps: ProcedureStep[]
  verification: string
  common_errors: CommonError[]
  plant_notes: string             // or "NONE"
  notes: string
}

export interface ProcedureStep {
  step_number: number             // computed from array index, never stored
  action: string
  step_type: ProcedureStepType
  specificity_acknowledged: boolean  // true if admin acknowledged vague warning
  screenshot_ids: string[]
}

export type ProcedureStepType =
  | 'normal'
  | 'branch_start'
  | 'branch_option_a'
  | 'branch_option_b'
  | 'branch_end'
  | 'admin_required'

export interface CommonError {
  error_code: string
  cause_summary: string
  see_document_id: string         // empty string if not applicable
  reference_validated: boolean    // true if doc ID was found in knowledge base
}

export interface ConfigFormData {
  configuration_name: string
  what_this_controls: string
  access_view: string
  access_change: string
  change_frequency: string
  table_name: string              // or empty string
  current_values_mode: 'structured' | 'free_text'
  current_values_structured: CurrentValuesGroup[]
  current_values_free_text: string
  how_to_navigate: string
  related_errors: RelatedError[]
  notes: string
}

export interface CurrentValuesGroup {
  group_name: string              // e.g. "Company Code 1000 — Comstar India"
  parameters: CurrentValueParameter[]
}

export interface CurrentValueParameter {
  name: string                    // e.g. "Tax Code G5"
  value: string                   // e.g. "Rate: 10%, Type: Input, Active: Yes"
}

export interface RelatedError {
  error_code: string
  misconfiguration_cause: string
  see_document_id: string
  reference_validated: boolean
}

// ─── Screenshot Types ──────────────────────────────────────────────────────

export interface QuickEntryScreenshot {
  id: string
  entry_id: string
  version: number
  associated_section: string      // chunk_type this screenshot enriches
  minio_object_key: string
  admin_caption: string
  extracted_text: string | null
  vision_status: VisionStatus
  vision_error: string | null
  vision_confidence: number | null // 0-100
  sap_confirmed: boolean
  file_size_bytes: number
  mime_type: string
  eligible_for_cleanup: boolean
  created_at: string
  proxy_url: string               // /api/screenshots/{minio_object_key}
}

// ─── Processing Log ────────────────────────────────────────────────────────

export interface ProcessingLog {
  run_id: string
  started_at: string
  completed_at: string | null
  total_duration_ms: number | null
  entry_id: string
  entry_version: number
  stages: {
    validation: ProcessingStage & { errors: string[] }
    chunk_assembly: ProcessingStage & { chunks_assembled: number; chunk_types: string[] }
    entity_extraction: ProcessingStage & { t_codes_found: string[]; error_codes_found: string[] }
    embedding: ProcessingStage & { chunks_embedded: number; model_used: string }
    quality_scoring: ProcessingStage & { avg_score: number | null; threshold_used: number; per_chunk_scores: Record<string, number>; status: 'success' | 'below_threshold' | 'failed' }
    deduplication: ProcessingStage & { similar_entries: Array<{ document_id: string; similarity_score: number }> }
    qdrant_insertion: ProcessingStage & { chunks_attempted: number; chunks_succeeded: number; chunks_failed: number; point_ids: Record<string, string>; failed_chunk_types: string[]; status: 'success' | 'partial' | 'failed' }
    opensearch_indexing: ProcessingStage & { docs_attempted: number; docs_succeeded: number; docs_failed: number; failed_chunk_types: string[]; status: 'success' | 'partial' | 'failed' }
    screenshot_enrichment: { queued: boolean; screenshot_count: number; task_id: string | null }
  }
  overall_status: QuickEntryStatus
  failure_stage: string | null
  failure_reason: string | null
  retry_count: number
  previous_run_ids: string[]
}

export interface ProcessingStage {
  status: 'success' | 'failed'
  duration_ms: number
}

// ─── Chunk Summary ─────────────────────────────────────────────────────────

export interface QuickEntryChunkSummary {
  id: string
  version: number
  chunk_type: string
  qdrant_status: ChunkStorageStatus
  opensearch_status: ChunkStorageStatus
  is_current: boolean
  created_at: string
}

// ─── Version History ───────────────────────────────────────────────────────

export interface QuickEntryVersion {
  id: string
  entry_id: string
  version: number
  form_data: ErrorGuideFormData | ProcedureFormData | ConfigFormData
  changed_by_name: string
  changed_at: string
  change_summary: string | null
}

// ─── Duplicate Check ───────────────────────────────────────────────────────

export interface DuplicateCheckResult {
  has_similar: boolean
  matches: DuplicateMatch[]
}

export interface DuplicateMatch {
  document_id: string
  title: string
  source_type: 'form_entry' | 'document'
  content_type: QuickEntryContentType
  module: string
  similarity_score: number        // 0-1
  preview: string                 // first 200 chars of overview chunk text
  last_verified: string
  status: string
}

// ─── Pipeline Health ───────────────────────────────────────────────────────

export interface QuickEntryPipelineHealth {
  processing_queue_depth: number
  screenshot_queue_depth: number
  avg_processing_time_ms_24h: number | null
  status_distribution: Record<QuickEntryStatus, number>
  screenshot_status_distribution: Record<VisionStatus, number>
  avg_quality_score_form_entries: number | null
  avg_quality_score_documents: number | null
  entries_with_net_negative_feedback: number
  screenshot_storage_bytes: number
  screenshots_eligible_for_cleanup: number
  last_staleness_check_at: string | null
  stale_config_count: number
}

```

---

*All schemas in this document are authoritative. Do not rename fields. Do not change data types. Do not omit required fields.*
*Document version: 1.0 | AEGIS Specification Set*
