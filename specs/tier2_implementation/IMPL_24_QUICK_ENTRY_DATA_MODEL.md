# IMPL_24 — QUICK ENTRY: DATA MODEL
## AEGIS SAP Helpdesk AI — Complete Schema for All Quick Entry Storage Layers
## Depends on: IMPL_23, IMPL_05, IMPL_06, IMPL_07

---

## 1. OVERVIEW

This document defines every storage structure required by the Quick Entry feature:
- Four new PostgreSQL tables (complete DDL with all constraints and indexes)
- The `processing_log` JSONB schema (exact structure, every key typed)
- Qdrant collection payload extensions (additive fields on Quick Entry chunks)
- OpenSearch index mapping extensions (same additive fields)
- MinIO bucket convention
- The database migration file structure

No existing table is modified. All changes are additive.

---

## 2. POSTGRESQL TABLES — COMPLETE DDL

### 2.1 knowledge_form_entries

Primary table. One row per Quick Entry. The `form_data` column always reflects
the current published version. `version` increments on every published update.

```sql
CREATE TABLE knowledge_form_entries (
  -- Identity
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           TEXT          NOT NULL,
  content_type          TEXT          NOT NULL,
  module                TEXT          NOT NULL,
  transactions          TEXT[]        NOT NULL DEFAULT '{}',

  -- Status and versioning
  status                TEXT          NOT NULL DEFAULT 'draft',
  version               INTEGER       NOT NULL DEFAULT 1,

  -- Form content (current version)
  form_data             JSONB         NOT NULL,

  -- Verification metadata
  verified_by_name      TEXT          NOT NULL,
  verified_date         DATE          NOT NULL,

  -- Config-only fields (NULL for error_guide and procedure)
  review_frequency      TEXT          NULL,
  next_review_date      DATE          NULL,
  last_notified_at      TIMESTAMPTZ   NULL,  -- last negative-feedback notification

  -- Relationships
  gap_id                UUID          NULL,   -- links to gap_events if created from gap
  submitted_by          UUID          NOT NULL,

  -- Processing state
  processing_log        JSONB         NULL,   -- updated by ARQ task on each run

  -- Timestamps
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT uq_kfe_document_id
    UNIQUE (document_id),

  CONSTRAINT chk_kfe_content_type
    CHECK (content_type IN ('error_guide', 'procedure', 'config')),

  CONSTRAINT chk_kfe_module
    CHECK (module IN ('FI', 'MM', 'SD', 'HR', 'PP', 'CO', 'BASIS')),

  CONSTRAINT chk_kfe_status
    CHECK (status IN (
      'draft', 'processing', 'active', 'archived',
      'low_quality', 'failed', 'partial_index', 'review_required'
    )),

  CONSTRAINT chk_kfe_review_frequency
    CHECK (review_frequency IS NULL OR review_frequency IN (
      'monthly', 'quarterly', 'semi_annual', 'annual', 'as_needed'
    )),

  CONSTRAINT chk_kfe_version
    CHECK (version >= 1),

  CONSTRAINT chk_kfe_config_fields
    CHECK (
      content_type != 'config'
      OR review_frequency IS NOT NULL
    )
);

-- Trigger: auto-update updated_at on any row modification
CREATE OR REPLACE FUNCTION kfe_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kfe_updated_at_trigger
  BEFORE UPDATE ON knowledge_form_entries
  FOR EACH ROW EXECUTE FUNCTION kfe_update_updated_at();

-- Indexes
CREATE INDEX idx_kfe_status
  ON knowledge_form_entries (status);

CREATE INDEX idx_kfe_content_type
  ON knowledge_form_entries (content_type);

CREATE INDEX idx_kfe_module
  ON knowledge_form_entries (module);

CREATE INDEX idx_kfe_module_type
  ON knowledge_form_entries (module, content_type);

CREATE INDEX idx_kfe_gap_id
  ON knowledge_form_entries (gap_id)
  WHERE gap_id IS NOT NULL;

CREATE INDEX idx_kfe_review_date
  ON knowledge_form_entries (next_review_date)
  WHERE next_review_date IS NOT NULL AND status = 'active';

CREATE INDEX idx_kfe_submitted_by
  ON knowledge_form_entries (submitted_by);

-- Full-text search index on document_id and title (extracted from form_data)
-- Note: The title is the first meaningful field (issue_description, procedure_name,
-- or configuration_name) extracted at insert time via a partial GIN index.
CREATE INDEX idx_kfe_document_id_trgm
  ON knowledge_form_entries
  USING gin (document_id gin_trgm_ops);
```

### 2.2 knowledge_form_entry_versions

Immutable snapshot of every published version. Written once per version,
never updated. Enables rollback and full audit trail.

```sql
CREATE TABLE knowledge_form_entry_versions (
  -- Identity
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        UUID          NOT NULL,
  version         INTEGER       NOT NULL,

  -- Snapshot
  form_data       JSONB         NOT NULL,   -- complete form_data at this version
  verified_by_name TEXT         NOT NULL,
  verified_date   DATE          NOT NULL,

  -- Audit
  changed_by      UUID          NOT NULL,
  changed_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  change_summary  TEXT          NULL,       -- admin-written, may be null

  -- Constraints
  CONSTRAINT fk_kfev_entry
    FOREIGN KEY (entry_id)
    REFERENCES knowledge_form_entries (id)
    ON DELETE CASCADE,

  CONSTRAINT uq_kfev_entry_version
    UNIQUE (entry_id, version),

  CONSTRAINT chk_kfev_version
    CHECK (version >= 1)
);

-- Indexes
CREATE INDEX idx_kfev_entry_id
  ON knowledge_form_entry_versions (entry_id);

CREATE INDEX idx_kfev_changed_at
  ON knowledge_form_entry_versions (entry_id, changed_at DESC);
```

### 2.3 knowledge_form_entry_chunks

Maps each entry+version to its Qdrant point IDs. Tracks per-store indexing
status for partial-failure detection and retry. `original_quality_score` is
preserved here for staleness score restoration.

```sql
CREATE TABLE knowledge_form_entry_chunks (
  -- Identity
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id              UUID          NOT NULL,
  version               INTEGER       NOT NULL,
  chunk_type            TEXT          NOT NULL,

  -- Qdrant reference
  qdrant_point_id       UUID          NOT NULL,

  -- Content
  chunk_text            TEXT          NOT NULL,   -- assembled text that was embedded

  -- Per-store status (fixes partial-index tracking)
  qdrant_status         TEXT          NOT NULL DEFAULT 'pending',
  opensearch_status     TEXT          NOT NULL DEFAULT 'pending',

  -- Quality score (fixed values — never modified after insertion)
  quality_score         FLOAT         NOT NULL,
  original_quality_score FLOAT        NOT NULL,   -- preserved for staleness restore

  -- Currency
  is_current            BOOLEAN       NOT NULL DEFAULT TRUE,

  -- Timestamp
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_kfec_entry
    FOREIGN KEY (entry_id)
    REFERENCES knowledge_form_entries (id)
    ON DELETE CASCADE,

  CONSTRAINT uq_kfec_qdrant_point
    UNIQUE (qdrant_point_id),

  CONSTRAINT chk_kfec_qdrant_status
    CHECK (qdrant_status IN ('pending', 'success', 'failed')),

  CONSTRAINT chk_kfec_opensearch_status
    CHECK (opensearch_status IN ('pending', 'success', 'failed')),

  CONSTRAINT chk_kfec_quality_range
    CHECK (quality_score >= 0.0 AND quality_score <= 1.0),

  CONSTRAINT chk_kfec_original_quality_range
    CHECK (original_quality_score >= 0.0 AND original_quality_score <= 1.0)
);

-- Indexes
CREATE INDEX idx_kfec_entry_current
  ON knowledge_form_entry_chunks (entry_id, is_current);

CREATE INDEX idx_kfec_entry_version
  ON knowledge_form_entry_chunks (entry_id, version);

CREATE INDEX idx_kfec_qdrant_point_id
  ON knowledge_form_entry_chunks (qdrant_point_id);

CREATE INDEX idx_kfec_partial_qdrant
  ON knowledge_form_entry_chunks (entry_id)
  WHERE qdrant_status = 'failed';

CREATE INDEX idx_kfec_partial_opensearch
  ON knowledge_form_entry_chunks (entry_id)
  WHERE opensearch_status = 'failed';
```

### 2.4 knowledge_form_screenshots

One row per screenshot file. Tracks MinIO storage, vision extraction lifecycle,
and cleanup eligibility.

```sql
CREATE TABLE knowledge_form_screenshots (
  -- Identity
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id              UUID          NOT NULL,
  version               INTEGER       NOT NULL,  -- which version uploaded this

  -- Section association (must match a valid chunk_type for this entry's content_type)
  associated_section    TEXT          NOT NULL,

  -- MinIO storage
  minio_object_key      TEXT          NOT NULL,  -- full key within bucket
  -- Convention: knowledge-screenshots/{entry_id}/{uuid}-{original_filename}

  -- Admin metadata
  admin_caption         TEXT          NOT NULL,  -- min 10 chars enforced at API

  -- Vision extraction state
  extracted_text        TEXT          NULL,       -- null until vision completes
  vision_status         TEXT          NOT NULL DEFAULT 'pending',
  vision_error          TEXT          NULL,       -- error message if failed
  vision_confidence     FLOAT         NULL,       -- 0-100, from SAP classification
  sap_confirmed         BOOLEAN       NOT NULL DEFAULT FALSE,
  -- sap_confirmed = TRUE after admin confirms extraction looks correct
  -- (set during upload flow when admin views extraction preview)

  -- File metadata
  file_size_bytes       INTEGER       NOT NULL,
  mime_type             TEXT          NOT NULL,

  -- Lifecycle
  eligible_for_cleanup  BOOLEAN       NOT NULL DEFAULT FALSE,
  -- Set by nightly cleanup job: version >= 2 old AND entry archived >= 90 days

  -- Timestamp
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_kfs_entry
    FOREIGN KEY (entry_id)
    REFERENCES knowledge_form_entries (id)
    ON DELETE CASCADE,

  CONSTRAINT uq_kfs_minio_key
    UNIQUE (minio_object_key),

  CONSTRAINT chk_kfs_vision_status
    CHECK (vision_status IN (
      'pending', 'processing', 'complete', 'failed', 'not_sap'
    )),

  CONSTRAINT chk_kfs_mime_type
    CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),

  CONSTRAINT chk_kfs_caption_length
    CHECK (LENGTH(admin_caption) >= 10),

  CONSTRAINT chk_kfs_file_size
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)
    -- max 10 MB enforced at DB level (also enforced at API)
);

-- Indexes
CREATE INDEX idx_kfs_entry_id
  ON knowledge_form_screenshots (entry_id);

CREATE INDEX idx_kfs_entry_section
  ON knowledge_form_screenshots (entry_id, associated_section);

CREATE INDEX idx_kfs_vision_status
  ON knowledge_form_screenshots (vision_status)
  WHERE vision_status NOT IN ('complete', 'not_sap');

CREATE INDEX idx_kfs_cleanup_eligible
  ON knowledge_form_screenshots (eligible_for_cleanup)
  WHERE eligible_for_cleanup = TRUE;
```

---

## 3. FORM_DATA JSONB — VALID SCHEMAS PER CONTENT TYPE

The `form_data` column is JSONB without a PostgreSQL-level schema constraint.
The application enforces schema at the API validation layer (IMPL_25) and
the form schema validator service (`app/services/form_validator.py`).

### 3.1 Error Guide form_data schema

```json
{
  "issue_description":     "string, required, min_length: 10",
  "error_code":            "string, required — exact code or 'NONE'",
  "error_message":         "string, required — exact SAP text or 'NONE'",
  "description":           "string, required, min_length: 30",
  "when_this_occurs":      "string, required, min_length: 30",
  "causes": [
    {
      "cause_number":               "integer — always 1-based sequential from array index",
      "priority":                   "enum: check_first | common | less_common | rare",
      "cause_description":          "string, required, min_length: 20",
      "how_to_identify":            "string, required, min_length: 20",
      "resolution_steps":           "string, required, min_length: 20",
      "resolution_requires_admin":  "boolean",
      "cause_obsolete":             "boolean",
      "obsolete_reason":            "string — required and min_length: 10 if cause_obsolete: true",
      "screenshot_ids":             "string[] — UUIDs from knowledge_form_screenshots"
    }
  ],
  "success_indicator":     "string, required, min_length: 15",
  "escalation_criteria":   "string, required, min_length: 20",
  "admin_steps":           "string, required — specific steps or 'NONE'",
  "notes":                 "string — optional, may be empty"
}
```

Validation rules applied at API level (not DB constraint):
- `causes` array: minimum 1 element, maximum 10
- `causes` array: at least 1 element must have `cause_obsolete: false`
- `error_code`: if not "NONE", must be non-empty and no whitespace
- `error_message`: if not "NONE", minimum 10 characters
- `cause_number` values must equal their 1-based array positions
  (enforced by backend before storage; frontend sends without this field
  and backend computes it)

### 3.2 Procedure form_data schema

```json
{
  "procedure_name":    "string, required, min_length: 10",
  "purpose":           "string, required, min_length: 30",
  "when_to_use":       "string, required, min_length: 20",
  "data_required":     "string, required — description or 'NONE'",
  "system_conditions": "string, required — conditions or 'NONE'",
  "access_required":   "string, required, min_length: 3",
  "steps": [
    {
      "step_number":                "integer — computed from array index, never stored in form_data",
      "action":                     "string, required, min_length: 20",
      "step_type":                  "enum: normal | branch_start | branch_option_a | branch_option_b | branch_end | admin_required",
      "specificity_acknowledged":   "boolean — true if admin acknowledged the vague-step warning",
      "screenshot_ids":             "string[]"
    }
  ],
  "verification":    "string, required, min_length: 20",
  "common_errors": [
    {
      "error_code":          "string",
      "cause_summary":       "string",
      "see_document_id":     "string — may be empty",
      "reference_validated": "boolean"
    }
  ],
  "plant_notes":     "string — optional or 'NONE'",
  "notes":           "string — optional"
}
```

Validation rules:
- `steps` array: minimum 3 elements
- `steps` array: `step_number` is NOT stored in the JSONB — it is always
  computed at read time as `(array_index + 1)` and injected into API responses
- `common_errors` array: minimum 1 element, OR the array contains one element
  with `error_code: "NONE"` to explicitly indicate no common errors
- `step_type` branch groups must have matching `branch_start` and `branch_end`
  markers (validated at API layer)

**Step number handling — critical implementation detail:**
The `step_number` field is NEVER written to the database `form_data` column.
It is computed by the backend at response time:
```python
for i, step in enumerate(form_data["steps"]):
    step["step_number"] = i + 1  # inject at read time
```
This ensures that when a step is deleted and the array re-indexes, all step
numbers are automatically correct without any migration or update needed.
The frontend never sends `step_number` in PUT/POST requests.

### 3.3 Configuration Reference form_data schema

```json
{
  "configuration_name":     "string, required, min_length: 10",
  "what_this_controls":     "string, required, min_length: 50",
  "access_view":            "string, required, min_length: 3",
  "access_change":          "string, required, min_length: 3",
  "change_frequency":       "string, required",
  "table_name":             "string — optional, empty string if not provided",
  "current_values_mode":    "enum: structured | free_text",
  "current_values_structured": [
    {
      "group_name": "string, required if mode=structured, min_length: 3",
      "parameters": [
        {
          "name":  "string, required, min_length: 2",
          "value": "string, required, min_length: 1"
        }
      ]
    }
  ],
  "current_values_free_text": "string — required and min_length: 50 if mode=free_text",
  "how_to_navigate":    "string, required, min_length: 30",
  "related_errors": [
    {
      "error_code":             "string",
      "misconfiguration_cause": "string",
      "see_document_id":        "string — may be empty",
      "reference_validated":    "boolean"
    }
  ],
  "notes": "string — optional"
}
```

Validation rules:
- If `current_values_mode = 'structured'`, `current_values_structured` must have
  at least 1 group, each group must have at least 1 parameter
- If `current_values_mode = 'free_text'`, `current_values_free_text` must be
  at least 50 characters and must not contain placeholder strings:
  ["TBD", "TO BE FILLED", "PLACEHOLDER", "ENTER VALUE", "YOUR VALUE HERE"]
  (case-insensitive check)
- `related_errors`: minimum 1 element, OR one element with `error_code: "NONE"`

---

## 4. PROCESSING_LOG JSONB — EXACT SCHEMA

This is the authoritative schema for `knowledge_form_entries.processing_log`.
The backend ARQ task writes this structure. The frontend `ProcessingStatusDrawer`
reads this structure. Both must implement exactly this schema — no deviation.

```json
{
  "run_id": "string (UUID) — unique per processing run",
  "started_at": "string (ISO 8601 UTC) — when ARQ task began",
  "completed_at": "string (ISO 8601 UTC) | null — null while still running",
  "total_duration_ms": "integer | null — null while still running",
  "entry_id": "string (UUID)",
  "entry_version": "integer",

  "stages": {
    "validation": {
      "status": "string: 'success' | 'failed'",
      "duration_ms": "integer",
      "errors": "string[] — human-readable error messages, empty if success"
    },

    "chunk_assembly": {
      "status": "string: 'success' | 'failed'",
      "duration_ms": "integer",
      "chunks_assembled": "integer",
      "chunk_types": "string[] — list of chunk_type values assembled"
    },

    "entity_extraction": {
      "status": "string: 'success' | 'failed'",
      "duration_ms": "integer",
      "t_codes_found": "string[] — e.g. ['VA01', 'MM02']",
      "error_codes_found": "string[] — e.g. ['VL150']"
    },

    "embedding": {
      "status": "string: 'success' | 'failed'",
      "duration_ms": "integer",
      "chunks_embedded": "integer",
      "model_used": "string — e.g. 'bge-m3'"
    },

    "quality_scoring": {
      "status": "string: 'success' | 'below_threshold' | 'failed'",
      "duration_ms": "integer",
      "avg_score": "float | null — null if failed",
      "threshold_used": "float — value of QUICK_ENTRY_QUALITY_THRESHOLD constant",
      "per_chunk_scores": {
        "<chunk_type_string>": "float"
      }
    },

    "deduplication": {
      "status": "string: 'success' | 'failed'",
      "duration_ms": "integer",
      "similar_entries": [
        {
          "document_id": "string",
          "similarity_score": "float (0-1)"
        }
      ]
    },

    "qdrant_insertion": {
      "status": "string: 'success' | 'partial' | 'failed'",
      "duration_ms": "integer",
      "chunks_attempted": "integer",
      "chunks_succeeded": "integer",
      "chunks_failed": "integer",
      "point_ids": {
        "<chunk_type_string>": "string (UUID of Qdrant point)"
      },
      "failed_chunk_types": "string[]"
    },

    "opensearch_indexing": {
      "status": "string: 'success' | 'partial' | 'failed'",
      "duration_ms": "integer",
      "docs_attempted": "integer",
      "docs_succeeded": "integer",
      "docs_failed": "integer",
      "failed_chunk_types": "string[]"
    },

    "screenshot_enrichment": {
      "queued": "boolean",
      "screenshot_count": "integer",
      "task_id": "string (ARQ task ID) | null — null if not queued"
    }
  },

  "overall_status": "string: same enum as knowledge_form_entries.status",
  "failure_stage": "string | null — e.g. 'embedding' if that stage caused failure",
  "failure_reason": "string | null — human-readable explanation",
  "retry_count": "integer — 0 on first run, increments on each retry",
  "previous_run_ids": "string[] — UUIDs of previous processing runs for this version"
}
```

**Stage ordering note:** Not all stages will be present in every `processing_log`.
If the task fails at `validation`, only the `validation` stage object is written.
If it fails at `quality_scoring` with `below_threshold`, stages up to
`quality_scoring` are present but `qdrant_insertion` and `opensearch_indexing`
are absent. The frontend must handle missing stage keys gracefully.

**Writing behaviour:** The ARQ task writes the full `processing_log` object
to the database at the end of the task run (not incrementally per stage, to
avoid partial writes). The exception: when the task is first dispatched, an
initial `processing_log` of `null` is already in the DB. The task writes
the complete log at completion. This means the frontend shows a loading state
until the first log is written.

---

## 5. QDRANT COLLECTION PAYLOAD EXTENSIONS

The existing `aegis_knowledge` Qdrant collection receives 7 new optional
payload fields on Quick Entry chunks. These fields are absent on document
chunks — no existing query filters on them.

```python
# New Qdrant payload fields — Quick Entry chunks only
{
  # Source identification
  "source_type":             "form_entry",  # document chunks have "document"
  "form_entry_id":           "uuid-string", # PK from knowledge_form_entries

  # Versioning
  "version":                 1,             # integer — matches entry version

  # Chunk classification (see IMPL_27 for all valid chunk_type values)
  "chunk_type":              "error_overview" | "cause_1" | "proc_overview" | ...,

  # Screenshot presence
  "has_screenshots":         True | False,
  "screenshot_ids":          ["uuid-string", ...],  # from knowledge_form_screenshots

  # Quality tracking (staleness system)
  "is_stale":                False,  # True when Config entry overdue for review
  "original_quality_score":  0.78,   # float — never modified; preserved for restore
}
```

**Document chunks continue to have only the existing payload fields.**
No migration of existing documents is required or performed.

**Qdrant mutation operations used by Quick Entry:**
- `upsert` — inserting new chunks (A9 in pipeline)
- `set_payload` — marking chunks `is_current: false` on retire (A3 in pipeline)
- `set_payload` — updating `is_stale` and `quality_score` (staleness job)
- `upsert` — updating vector + text after screenshot enrichment (V8)

All Qdrant operations in Quick Entry use the existing Qdrant client configured
in the FastAPI application. No new client configuration is needed.

---

## 6. OPENSEARCH INDEX MAPPING EXTENSIONS

The existing `aegis_knowledge` OpenSearch index receives the same 7 new fields.

```json
{
  "mappings": {
    "properties": {
      "source_type":             { "type": "keyword" },
      "form_entry_id":           { "type": "keyword" },
      "version":                 { "type": "integer" },
      "chunk_type":              { "type": "keyword" },
      "has_screenshots":         { "type": "boolean" },
      "is_stale":                { "type": "boolean" },
      "original_quality_score":  { "type": "float" }
    }
  }
}
```

Apply this mapping update:
```bash
curl -X PUT "http://aegis-opensearch:9200/aegis_knowledge/_mapping" \
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
```

OpenSearch allows adding new fields to an existing mapping without reindexing.
The command above is additive and does not affect existing documents.

---

## 7. MINIO BUCKET

```
Bucket name:  knowledge-screenshots
Region:       same as existing MinIO configuration
Access:       private — no public access
Lifecycle:    no automatic S3 lifecycle policy (managed by application nightly job)

Object key convention:
  knowledge-screenshots/{entry_id}/{uuid4}-{original_filename_sanitised}

  entry_id:                  UUID of the knowledge_form_entries row
  uuid4:                     a new UUID generated at upload time (ensures uniqueness)
  original_filename_sanitised: lowercase, spaces replaced with underscores,
                               only [a-z0-9_.-] retained, truncated to 50 chars

Example key:
  knowledge-screenshots/
    7f3a2c1d-4e5f-6a7b-8c9d-0e1f2a3b4c5d/
    9b8c7d6e-5f4a-3b2c-1d0e-9f8a7b6c5d4e-bp_tax_classification.png
```

---

## 8. DATABASE MIGRATION FILE

Place this migration in `alembic/versions/` (or equivalent migration system).
Migration name: `add_quick_entry_tables`

```sql
-- Migration: add_quick_entry_tables
-- Run AFTER all existing migrations
-- Rolls back cleanly by dropping the 4 tables in reverse dependency order

-- Enable pg_trgm if not already enabled (for trigram indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Table 1: Main entries table
CREATE TABLE knowledge_form_entries (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           TEXT          NOT NULL,
  content_type          TEXT          NOT NULL,
  module                TEXT          NOT NULL,
  transactions          TEXT[]        NOT NULL DEFAULT '{}',
  status                TEXT          NOT NULL DEFAULT 'draft',
  version               INTEGER       NOT NULL DEFAULT 1,
  form_data             JSONB         NOT NULL,
  verified_by_name      TEXT          NOT NULL,
  verified_date         DATE          NOT NULL,
  review_frequency      TEXT          NULL,
  next_review_date      DATE          NULL,
  last_notified_at      TIMESTAMPTZ   NULL,
  gap_id                UUID          NULL,
  submitted_by          UUID          NOT NULL,
  processing_log        JSONB         NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_kfe_document_id UNIQUE (document_id),
  CONSTRAINT chk_kfe_content_type CHECK (content_type IN ('error_guide','procedure','config')),
  CONSTRAINT chk_kfe_module CHECK (module IN ('FI','MM','SD','HR','PP','CO','BASIS')),
  CONSTRAINT chk_kfe_status CHECK (status IN ('draft','processing','active','archived','low_quality','failed','partial_index','review_required')),
  CONSTRAINT chk_kfe_review_frequency CHECK (review_frequency IS NULL OR review_frequency IN ('monthly','quarterly','semi_annual','annual','as_needed')),
  CONSTRAINT chk_kfe_version CHECK (version >= 1),
  CONSTRAINT chk_kfe_config_fields CHECK (content_type != 'config' OR review_frequency IS NOT NULL)
);

CREATE OR REPLACE FUNCTION kfe_update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER kfe_updated_at_trigger
  BEFORE UPDATE ON knowledge_form_entries
  FOR EACH ROW EXECUTE FUNCTION kfe_update_updated_at();

CREATE INDEX idx_kfe_status ON knowledge_form_entries (status);
CREATE INDEX idx_kfe_module_type ON knowledge_form_entries (module, content_type);
CREATE INDEX idx_kfe_review_date ON knowledge_form_entries (next_review_date) WHERE next_review_date IS NOT NULL AND status = 'active';
CREATE INDEX idx_kfe_gap_id ON knowledge_form_entries (gap_id) WHERE gap_id IS NOT NULL;
CREATE INDEX idx_kfe_document_id_trgm ON knowledge_form_entries USING gin (document_id gin_trgm_ops);

-- Table 2: Version history
CREATE TABLE knowledge_form_entry_versions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id         UUID          NOT NULL,
  version          INTEGER       NOT NULL,
  form_data        JSONB         NOT NULL,
  verified_by_name TEXT          NOT NULL,
  verified_date    DATE          NOT NULL,
  changed_by       UUID          NOT NULL,
  changed_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  change_summary   TEXT          NULL,
  CONSTRAINT fk_kfev_entry FOREIGN KEY (entry_id) REFERENCES knowledge_form_entries (id) ON DELETE CASCADE,
  CONSTRAINT uq_kfev_entry_version UNIQUE (entry_id, version),
  CONSTRAINT chk_kfev_version CHECK (version >= 1)
);

CREATE INDEX idx_kfev_entry_id ON knowledge_form_entry_versions (entry_id);
CREATE INDEX idx_kfev_changed_at ON knowledge_form_entry_versions (entry_id, changed_at DESC);

-- Table 3: Chunks
CREATE TABLE knowledge_form_entry_chunks (
  id                     UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id               UUID     NOT NULL,
  version                INTEGER  NOT NULL,
  chunk_type             TEXT     NOT NULL,
  qdrant_point_id        UUID     NOT NULL,
  chunk_text             TEXT     NOT NULL,
  qdrant_status          TEXT     NOT NULL DEFAULT 'pending',
  opensearch_status      TEXT     NOT NULL DEFAULT 'pending',
  quality_score          FLOAT    NOT NULL,
  original_quality_score FLOAT    NOT NULL,
  is_current             BOOLEAN  NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_kfec_entry FOREIGN KEY (entry_id) REFERENCES knowledge_form_entries (id) ON DELETE CASCADE,
  CONSTRAINT uq_kfec_qdrant_point UNIQUE (qdrant_point_id),
  CONSTRAINT chk_kfec_qdrant_status CHECK (qdrant_status IN ('pending','success','failed')),
  CONSTRAINT chk_kfec_opensearch_status CHECK (opensearch_status IN ('pending','success','failed')),
  CONSTRAINT chk_kfec_quality_range CHECK (quality_score >= 0.0 AND quality_score <= 1.0),
  CONSTRAINT chk_kfec_original_quality_range CHECK (original_quality_score >= 0.0 AND original_quality_score <= 1.0)
);

CREATE INDEX idx_kfec_entry_current ON knowledge_form_entry_chunks (entry_id, is_current);
CREATE INDEX idx_kfec_entry_version ON knowledge_form_entry_chunks (entry_id, version);
CREATE INDEX idx_kfec_qdrant_point_id ON knowledge_form_entry_chunks (qdrant_point_id);
CREATE INDEX idx_kfec_partial_qdrant ON knowledge_form_entry_chunks (entry_id) WHERE qdrant_status = 'failed';
CREATE INDEX idx_kfec_partial_opensearch ON knowledge_form_entry_chunks (entry_id) WHERE opensearch_status = 'failed';

-- Table 4: Screenshots
CREATE TABLE knowledge_form_screenshots (
  id                   UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id             UUID     NOT NULL,
  version              INTEGER  NOT NULL,
  associated_section   TEXT     NOT NULL,
  minio_object_key     TEXT     NOT NULL,
  admin_caption        TEXT     NOT NULL,
  extracted_text       TEXT     NULL,
  vision_status        TEXT     NOT NULL DEFAULT 'pending',
  vision_error         TEXT     NULL,
  vision_confidence    FLOAT    NULL,
  sap_confirmed        BOOLEAN  NOT NULL DEFAULT FALSE,
  file_size_bytes      INTEGER  NOT NULL,
  mime_type            TEXT     NOT NULL,
  eligible_for_cleanup BOOLEAN  NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_kfs_entry FOREIGN KEY (entry_id) REFERENCES knowledge_form_entries (id) ON DELETE CASCADE,
  CONSTRAINT uq_kfs_minio_key UNIQUE (minio_object_key),
  CONSTRAINT chk_kfs_vision_status CHECK (vision_status IN ('pending','processing','complete','failed','not_sap')),
  CONSTRAINT chk_kfs_mime_type CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  CONSTRAINT chk_kfs_caption_length CHECK (LENGTH(admin_caption) >= 10),
  CONSTRAINT chk_kfs_file_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)
);

CREATE INDEX idx_kfs_entry_id ON knowledge_form_screenshots (entry_id);
CREATE INDEX idx_kfs_entry_section ON knowledge_form_screenshots (entry_id, associated_section);
CREATE INDEX idx_kfs_vision_status ON knowledge_form_screenshots (vision_status) WHERE vision_status NOT IN ('complete','not_sap');
CREATE INDEX idx_kfs_cleanup_eligible ON knowledge_form_screenshots (eligible_for_cleanup) WHERE eligible_for_cleanup = TRUE;

-- Seed data: Onboarding fixture entries (placeholder content)
-- IMPORTANT: Replace all [PLACEHOLDER] values with real Sona Comstar SAP examples
-- before deploying to production. These fixtures are the quality standard
-- IT admins calibrate to when using Quick Entry for the first time.

INSERT INTO knowledge_form_entries (
  id, document_id, content_type, module, transactions, status, version,
  form_data, verified_by_name, verified_date, submitted_by
) VALUES (
  gen_random_uuid(),
  'EXAMPLE-SD-ERR-001',
  'error_guide',
  'SD',
  ARRAY['VA01', 'VA02'],
  'active',
  1,
  '{
    "issue_description": "[PLACEHOLDER: Real SD error issue title]",
    "error_code": "[PLACEHOLDER: SAP error code or NONE]",
    "error_message": "[PLACEHOLDER: Exact SAP error message text]",
    "description": "[PLACEHOLDER: 1-2 sentence description]",
    "when_this_occurs": "[PLACEHOLDER: Business context]",
    "causes": [
      {
        "cause_number": 1,
        "priority": "check_first",
        "cause_description": "[PLACEHOLDER: Most common cause description]",
        "how_to_identify": "[PLACEHOLDER: T-code and field to check]",
        "resolution_steps": "[PLACEHOLDER: Exact steps with T-code, field, value]",
        "resolution_requires_admin": false,
        "cause_obsolete": false,
        "obsolete_reason": "",
        "screenshot_ids": []
      }
    ],
    "success_indicator": "[PLACEHOLDER: Exact SAP success message]",
    "escalation_criteria": "[PLACEHOLDER: When to raise a ticket]",
    "admin_steps": "NONE",
    "notes": ""
  }',
  '[PLACEHOLDER: IT admin name]',
  CURRENT_DATE,
  (SELECT id FROM users WHERE role = ''it-admin'' LIMIT 1)
);
-- Repeat for EXAMPLE-SD-PROC-001 (procedure) and EXAMPLE-FI-CFG-001 (config)
-- Full INSERT statements follow the same pattern with appropriate form_data structure
-- THESE MUST BE REPLACED BEFORE PRODUCTION DEPLOYMENT

-- Rollback instructions:
-- DROP TABLE IF EXISTS knowledge_form_screenshots CASCADE;
-- DROP TABLE IF EXISTS knowledge_form_entry_chunks CASCADE;
-- DROP TABLE IF EXISTS knowledge_form_entry_versions CASCADE;
-- DROP TABLE IF EXISTS knowledge_form_entries CASCADE;
-- DROP FUNCTION IF EXISTS kfe_update_updated_at CASCADE;
```

---

## 9. ADDITIONS TO EXISTING DOCUMENTS

### 9.1 Addition to IMPL_05_DATA_LAYER_POSTGRESQL.md

Append to the end of the document:

```
---
## QUICK ENTRY TABLES (Added in IMPL_24)

The Quick Entry feature adds 4 new tables to the PostgreSQL schema.
Full DDL, constraints, indexes, and migration SQL are in IMPL_24.

Tables added:
  knowledge_form_entries         — one row per Quick Entry submission
  knowledge_form_entry_versions  — immutable version history snapshots
  knowledge_form_entry_chunks    — Qdrant point mappings with per-store status
  knowledge_form_screenshots     — screenshot storage and vision status tracking

No existing tables are modified.
```

### 9.2 Addition to IMPL_06_DATA_LAYER_QDRANT.md

Append to the end of the document:

```
---
## QUICK ENTRY PAYLOAD FIELDS (Added in IMPL_24)

Quick Entry chunks in the aegis_knowledge collection carry 7 additional
optional payload fields. These fields are absent on document-based chunks.
No existing retrieval queries filter on these fields.

New fields (present only on Quick Entry chunks):
  source_type:             "form_entry" (string)
  form_entry_id:           UUID string
  version:                 integer
  chunk_type:              string (see IMPL_27 for all valid values)
  has_screenshots:         boolean
  screenshot_ids:          string[] (screenshot record UUIDs)
  is_stale:                boolean (Config staleness flag)
  original_quality_score:  float (preserved pre-staleness quality score)

Qdrant operations used by Quick Entry:
  upsert        — chunk insertion and screenshot enrichment updates
  set_payload   — retiring chunks (is_current=false) and staleness updates
```

### 9.3 Addition to IMPL_07_DATA_LAYER_OPENSEARCH.md

Append to the end of the document:

```
---
## QUICK ENTRY INDEX FIELDS (Added in IMPL_24)

Quick Entry adds 7 new keyword/boolean/numeric fields to the aegis_knowledge
OpenSearch index. Apply via PUT mapping update (see IMPL_24 Section 6).
No re-indexing of existing documents is required.

New fields: source_type, form_entry_id, version, chunk_type,
            has_screenshots, is_stale, original_quality_score
```

---

*IMPL_24 — Quick Entry Data Model | AEGIS v1.0 | Sona Comstar*
