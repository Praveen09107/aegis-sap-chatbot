# IMPL_23 — QUICK ENTRY: OVERVIEW AND ARCHITECTURE
## AEGIS SAP Helpdesk AI — Knowledge Quick Entry Feature
## Master Reference Document — Read First Before Any Other Quick Entry Document

---

## 1. DOCUMENT PURPOSE AND READING ORDER

This document is the architectural entry point for the AEGIS Quick Entry feature.
It defines what the feature is, where it sits in the existing system, what it
changes, what it leaves untouched, and how all Quick Entry implementation documents
relate to each other.

**Reading order for implementing agents:**
1. IMPL_23 (this document) — architecture and context
2. IMPL_24 — data model and schema
3. IMPL_25 — API endpoints
4. IMPL_26 — processing pipeline (ARQ tasks)
5. IMPL_27 — chunking engine
6. IMPL_28 — screenshot pipeline
7. IMPL_29 — operational systems
8. FRONTEND_36 through FRONTEND_40 — frontend implementation

Every Quick Entry document is self-contained but cross-references others.
An agent implementing any single layer can read only that document, but must
have read IMPL_23 first for architectural context.

---

## 2. FEATURE SUMMARY

Quick Entry is a structured form-based knowledge contribution interface added
to the AEGIS admin portal. It provides IT admins with an alternative to the
existing document upload workflow for adding knowledge to the AEGIS knowledge base.

Instead of creating a formatted Word or PDF document following one of three
templates, then uploading it through the Documents page and waiting for the
eleven-stage ingestion pipeline, an IT admin fills out a structured web form.
The form captures the same information as the document templates — field by
field — and the system processes those fields directly into knowledge chunks
without any intermediate document file.

The feature has two interconnected components:

**Component 1 — Quick Entry form and pipeline:**
Structured forms for Error Guide, Procedure, and Configuration Reference
knowledge types. Form submissions bypass pipeline Stages 1, 2, and 3 (file
upload, text extraction, type classification) and enter the pipeline at Stage 5
(entity extraction) with structure-aware, semantically superior chunking that
cannot be achieved through generic document processing.

**Component 2 — Multimodal screenshot enrichment:**
IT admins can attach SAP screenshots to individual sections of a Quick Entry.
Screenshots are processed by the existing `aegis-ollama-vision` service at
ingestion time. Extracted text is appended to the relevant knowledge chunk,
enriching retrieval. When an employee query retrieves a chunk with associated
screenshots, those screenshots are returned in the attribution panel as visual
references alongside the text answer.

---

## 3. PROBLEM STATEMENT

**Why this feature was built:**

The existing document upload path has two categories of problems:

Category A — Admin workflow friction:
Creating a correctly formatted Word document, following template structure,
saving as the correct format, and uploading through the portal adds 15–25
minutes of overhead per knowledge entry. IT admins solving SAP problems
throughout the day cannot afford this overhead and defer documentation, causing
knowledge gaps in the AEGIS knowledge base.

Category B — Pipeline fragility:
Stage 2 (text extraction) uses OCR for scanned PDFs and pdfminer for digital
PDFs. Both fail on image-heavy documents. Embedded screenshots in documents are
silently dropped. Stage 3 (classification) occasionally misidentifies document
types. Stage 6 (generic chunking) splits content at token boundaries without
semantic awareness, potentially separating a cause description from its
resolution steps across different chunks.

Quick Entry eliminates Category A entirely (no document to create) and
eliminates Category B for all Quick Entry content (form fields are already
structured, no extraction needed, type is known, chunking is semantic).

The existing document upload path remains fully intact for documents that already
exist as files or for complex multi-topic documents that exceed what a form can
capture.

---

## 4. ARCHITECTURAL POSITION

### 4.1 Two parallel knowledge ingestion paths

```
EXISTING PATH (unchanged):
  PDF/DOCX file
  → Stage 1: File upload and storage
  → Stage 2: Text extraction (OCR / pdfminer)
  → Stage 3: Document type classification
  → Stage 4: Content validation
  → Stage 5: SAP entity extraction
  → Stage 6: Generic chunking (token-count based)
  → Stage 7: BGE embedding
  → Stage 8: Quality scoring
  → Stage 9: Semantic deduplication check
  → Stage 10: Qdrant insertion
  → Stage 11: OpenSearch indexing
  → Document active in knowledge base

NEW PATH (Quick Entry):
  Structured form submission (JSON payload)
  → Server-side schema validation (replaces Stages 1–4)
  → Structure-aware chunking (replaces Stage 6 — semantically superior)
  → Stage 5: SAP entity extraction (same service, called directly)
  → Stage 7: BGE embedding (same service, called directly)
  → Stage 8: Quality scoring (same service, called directly)
  → Stage 9: Semantic deduplication check (same logic, same Qdrant collection)
  → Stage 10: Qdrant insertion (same collection)
  → Stage 11: OpenSearch indexing (same index)
  → Entry active in knowledge base
  → [Async] Screenshot vision extraction if screenshots attached
```

Both paths deposit knowledge into the **same Qdrant collection** and the
**same OpenSearch index**. The retrieval system (IMPL_14, IMPL_15) has no
awareness of which path produced a given chunk. All chunks are retrieved and
ranked identically.

### 4.2 Pipeline services used by Quick Entry

| Service | Used by Quick Entry | How |
|---|---|---|
| Stage 2 text extractor | Yes (bulk import only) | Parser calls it on uploaded .docx/.pdf to pre-fill form |
| BGE embedding model | Yes | Called directly from process_form_entry ARQ task |
| Quality scorer | Yes | Called directly from process_form_entry ARQ task |
| SAP entity extractor | Yes | Called directly from process_form_entry ARQ task |
| Qdrant client | Yes | Called directly for insert, payload update, search |
| OpenSearch client | Yes | Called directly for index and update |
| aegis-ollama-vision | Yes | Called from enrich_entry_screenshots ARQ task |
| ARQ worker | Yes | Two new tasks registered in existing worker |
| Redis | Yes | Rate limiting (sliding window counter per user) |
| MinIO | Yes | New bucket: knowledge-screenshots |
| PostgreSQL | Yes | Four new tables via migration |

### 4.3 What triggers retrieval of Quick Entry chunks

The CRAG pipeline (IMPL_12, IMPL_14, IMPL_15) performs hybrid search against
Qdrant and OpenSearch. No change to retrieval logic is required. Quick Entry
chunks exist in the same collections as document chunks and are retrieved by
the same semantic + keyword hybrid search.

Two minimal additions to the retrieval path (detailed in IMPL_28):
1. When chunks with `has_screenshots: true` are retrieved, a DB lookup fetches
   screenshot metadata to include in the `attribution_panel` WebSocket message.
2. When a retrieved chunk has `is_stale: true` in its payload, a contextual
   note is passed to the LLM prompt: "[Note: this information was last verified
   on {date} and may be outdated. Verify with the IT team if critical.]"

---

## 5. COMPLETE DELTA TABLE

### 5.1 Unchanged — zero modifications

| Component | Reason unchanged |
|---|---|
| Stage 1 — File upload | Document path only; Quick Entry has no file |
| Stage 2 — Text extraction | Document path only (bulk import re-uses but does not modify it) |
| Stage 3 — Classification | Document path only; Quick Entry type is form-selected |
| Stage 4 — Content validation | Document path only; Quick Entry uses schema validation |
| Stage 6 — Generic chunking | Document path only; Quick Entry uses structure-aware chunker |
| CRAG pipeline (IMPL_12) | No logic changes; two additive context injections detailed in IMPL_28 |
| ValidationScore engine (IMPL_17) | No changes |
| All existing admin portal pages | Documents, Registry, Config Snapshot, Audit Trail, Review Queue, Tickets |
| Employee chat interface | No changes except attribution panel screenshots section |
| Employee history page | No changes |
| Nginx configuration | No changes |
| Keycloak / Vault | No changes |
| Redis session store | No changes (rate limiting uses separate key namespace) |
| ARQ queue infrastructure | No changes; only new task registrations |
| BGE embedding service | No changes; Quick Entry calls same endpoint |
| Deberta / ValidationScore | No changes |

### 5.2 Changed — additive modifications only

| Component | What is added | Where documented |
|---|---|---|
| CRAG pipeline | Screenshot URL lookup when `has_screenshots: true`; `is_stale` note to LLM context | IMPL_28 |
| WebSocket handler (IMPL_11) | `screenshots[]` array in `validation_result.attribution_panel`; `form_entry_id` field | IMPL_28 |
| ARQ worker registration | Two new tasks: `process_form_entry`, `enrich_entry_screenshots` | IMPL_26 |
| Qdrant collection payload | 7 new optional fields on Quick Entry chunks only | IMPL_24, IMPL_06 |
| OpenSearch index mapping | Same 7 new fields | IMPL_24, IMPL_07 |
| FastAPI router | New router mounted at `/api/admin/knowledge-entries` and `/api/admin/knowledge-screenshots` | IMPL_25 |
| PostgreSQL | 4 new tables via migration | IMPL_24, IMPL_05 |
| MinIO | 1 new bucket: `knowledge-screenshots` | IMPL_28 |
| Admin nav (ADMIN_NAV_ITEMS) | One new Quick Entry entry | FRONTEND_36 |
| AttributionPanel component | Screenshots sub-section | FRONTEND_40 |
| Knowledge Gaps page | "Create Quick Entry" button per gap card | FRONTEND_36, IMPL_29 |
| System Health page | Quick Entry Pipeline metrics section | FRONTEND_22 addition, IMPL_29 |
| Analytics page | Feedback and vision metrics subsection | IMPL_29 |
| `AEGIS_DATA_CONTRACTS.md` | New TypeScript interfaces for all Quick Entry types | This document (Section 8) |
| `AEGIS_CONFIGURATION_CONSTANTS.md` | New constants | This document (Section 9) |

### 5.3 New — net-new components

| Component | Location | Document |
|---|---|---|
| `knowledge_form_entries` table | PostgreSQL | IMPL_24 |
| `knowledge_form_entry_versions` table | PostgreSQL | IMPL_24 |
| `knowledge_form_entry_chunks` table | PostgreSQL | IMPL_24 |
| `knowledge_form_screenshots` table | PostgreSQL | IMPL_24 |
| `process_form_entry` ARQ task | ARQ worker | IMPL_26 |
| `enrich_entry_screenshots` ARQ task | ARQ worker | IMPL_28 |
| `retry_partial_indexing` ARQ task | ARQ worker | IMPL_26 |
| `check_config_staleness` daily job | APScheduler | IMPL_29 |
| `cleanup_eligible_screenshots` nightly job | APScheduler | IMPL_28 |
| Structure-aware chunking module | `app/services/form_chunker.py` | IMPL_27 |
| Form schema validation module | `app/services/form_validator.py` | IMPL_25 |
| Vision classification client | `app/clients/ollama_vision.py` | IMPL_28 |
| Bulk import parser | `app/services/form_import_parser.py` | IMPL_29 |
| `/api/admin/knowledge-entries/*` (11 endpoints) | FastAPI router | IMPL_25 |
| `/api/admin/knowledge-screenshots/*` (3 endpoints) | FastAPI router | IMPL_25 |
| `knowledge-screenshots` MinIO bucket | MinIO | IMPL_28 |
| `/admin/quick-entry` page | Next.js admin portal | FRONTEND_36, 37, 38, 39 |
| `/api/screenshots/[...path]` proxy route | Next.js API route | FRONTEND_40 |
| `QuickEntryListPage` component | Frontend | FRONTEND_36 |
| `QuickEntryForm` component | Frontend | FRONTEND_37 |
| `ErrorGuideFormFields` component | Frontend | FRONTEND_38 |
| `ProcedureFormFields` component | Frontend | FRONTEND_38 |
| `ConfigFormFields` component | Frontend | FRONTEND_38 |
| `ScreenshotUploadZone` component | Frontend | FRONTEND_39 |
| `ScreenshotThumbnail` component | Frontend | FRONTEND_40 |
| All Quick Entry modal/drawer components | Frontend | FRONTEND_39 |
| TanStack Query hooks for Quick Entry | Frontend | FRONTEND_37 |
| New TypeScript types for Quick Entry | `src/types/index.ts` | FRONTEND_36 |

---

## 6. SYSTEM-WIDE INTEGRATION POINTS

### 6.1 Qdrant integration

Quick Entry chunks are inserted into the existing `aegis_knowledge` Qdrant
collection. They use the same vector dimensions as document chunks (BGE output
dimension: 1024). All existing retrieval queries continue to function because
the new payload fields are additive — they are present on Quick Entry chunks
and absent on document chunks. No retrieval filter checks these new fields.

New payload fields on Quick Entry chunks:
```
source_type:           "form_entry"  (document chunks have "document")
form_entry_id:         UUID string
version:               integer
chunk_type:            string (see IMPL_27 for all valid values)
has_screenshots:       boolean
screenshot_ids:        string[] (UUIDs from knowledge_form_screenshots table)
is_stale:              boolean (false by default, true when Config entry overdue)
original_quality_score: float (preserved for staleness restore, never modified)
```

### 6.2 OpenSearch integration

Quick Entry chunks are indexed in the existing `aegis_knowledge` OpenSearch
index. Same fields as document chunks, plus the same 7 new fields listed above.
All existing keyword search queries continue to function.

### 6.3 WebSocket integration

The existing `validation_result` WebSocket message gains one new sub-field
inside the existing `attribution_panel` object:

```json
{
  "type": "validation_result",
  "validation_score": 0.84,
  "confidence_badge": "green",
  "attribution_panel": {
    "primary_document_id": "SAP-SD-PRO-IN-21",
    ...existing fields unchanged...
    "form_entry_id": "uuid-or-null",
    "screenshots": [
      {
        "url": "/api/screenshots/knowledge-screenshots/uuid/filename.png",
        "caption": "Admin-written caption for this screenshot",
        "section": "cause_1"
      }
    ]
  }
}
```

`form_entry_id` is null when the answer is sourced from document chunks.
`screenshots` is an empty array when the answer chunk has no screenshots.
Backward compatibility: existing frontend code that does not read these new
fields continues to work without modification.

### 6.4 Knowledge Gaps integration

The existing Knowledge Gaps admin page (`/admin/knowledge-gaps`, implemented
in IMPL_20 and FRONTEND_20) is extended with a "Create Quick Entry" button
per gap card. Clicking navigates to `/admin/quick-entry/new` with URL
parameters. The Quick Entry form reads these parameters and pre-populates
fields. When the entry is published, a write-back updates the gap record.
Full specification in IMPL_29.

### 6.5 Feedback integration

The existing employee feedback mechanism (thumbs up/down on answers) is
extended to record `form_entry_id` when the answer chunk was sourced from a
Quick Entry. The Quick Entry list page reads feedback counts per entry via
a new API endpoint. Full specification in IMPL_29.

---

## 7. PREREQUISITES BEFORE IMPLEMENTATION

All prerequisites must be verified before any Quick Entry code is written:

```
PREREQUISITE 1: aegis-ollama-vision is responding
  Verify: curl http://aegis-ollama-vision:11434/api/health
  Expected: {"status": "ok"} or equivalent healthy response
  If not responding: do not start IMPL_28 screenshot pipeline implementation

PREREQUISITE 2: MinIO bucket created
  Command: mc mb myminio/knowledge-screenshots
  Policy: private (no public access)
  Verify FastAPI has write credentials for this bucket
  Existing MinIO configuration must not be changed

PREREQUISITE 3: PostgreSQL migration run on staging
  Migration adds 4 new tables — does NOT modify any existing table
  Run migration on staging first, verify with queries, then production
  Migration file: in IMPL_24

PREREQUISITE 4: Qdrant and OpenSearch field additions
  No schema migration needed for Qdrant (schema-free)
  OpenSearch: PUT mapping update to add 7 new fields as optional
  Existing documents are not modified — new fields simply absent on them

PREREQUISITE 5: ARQ worker can graceful-reload
  Verify: check current task queue depth before registering new tasks
  Method: add new task registrations to worker file, reload worker
  Graceful reload: in-progress tasks complete before worker restarts

PREREQUISITE 6: Redis accessibility for rate limiting
  Rate limiting uses Redis sorted set, key namespace: "qe_rate:{user_id}"
  Verify FastAPI can write and read from Redis
  Existing Redis keys are not modified (rate limiting uses unique namespace)
```

---

## 8. NEW TYPESCRIPT INTERFACES

The following interfaces must be added to `src/types/index.ts` in the frontend
project. They are referenced by all Quick Entry frontend components (FRONTEND_36
through FRONTEND_40).

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
  // Derived for frontend use:
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
    chunk_assembly: ProcessingStage & {
      chunks_assembled: number
      chunk_types: string[]
    }
    entity_extraction: ProcessingStage & {
      t_codes_found: string[]
      error_codes_found: string[]
    }
    embedding: ProcessingStage & {
      chunks_embedded: number
      model_used: string
    }
    quality_scoring: ProcessingStage & {
      avg_score: number | null
      threshold_used: number
      per_chunk_scores: Record<string, number>
      status: 'success' | 'below_threshold' | 'failed'
    }
    deduplication: ProcessingStage & {
      similar_entries: Array<{ document_id: string; similarity_score: number }>
    }
    qdrant_insertion: ProcessingStage & {
      chunks_attempted: number
      chunks_succeeded: number
      chunks_failed: number
      point_ids: Record<string, string>
      failed_chunk_types: string[]
      status: 'success' | 'partial' | 'failed'
    }
    opensearch_indexing: ProcessingStage & {
      docs_attempted: number
      docs_succeeded: number
      docs_failed: number
      failed_chunk_types: string[]
      status: 'success' | 'partial' | 'failed'
    }
    screenshot_enrichment: {
      queued: boolean
      screenshot_count: number
      task_id: string | null
    }
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

## 9. NEW CONFIGURATION CONSTANTS

The following constants must be added to `AEGIS_CONFIGURATION_CONSTANTS.md`
and to `src/lib/constants.ts` in the frontend:

```typescript
// ─── Quick Entry Rate Limiting ────────────────────────────────────────────
export const QUICK_ENTRY_RATE_LIMIT_MAX = 5          // submissions
export const QUICK_ENTRY_RATE_LIMIT_WINDOW_SECONDS = 900  // 15 minutes
export const QUICK_ENTRY_RATE_LIMIT_REDIS_PREFIX = 'qe_rate:'

// ─── Quick Entry Quality ──────────────────────────────────────────────────
export const QUICK_ENTRY_QUALITY_THRESHOLD = 0.65    // min avg score to publish
export const QUICK_ENTRY_QUALITY_FLOOR = 0.40        // min score after staleness deduction
export const QUICK_ENTRY_STALENESS_SCORE_DEDUCTION = 0.10

// ─── Quick Entry Deduplication ────────────────────────────────────────────
export const QUICK_ENTRY_DEDUP_THRESHOLD = 0.92     // similarity above = flagged
export const QUICK_ENTRY_PRESUBMIT_DEDUP_THRESHOLD = 0.85  // UI warning threshold

// ─── Screenshot Processing ────────────────────────────────────────────────
export const VISION_SAP_CONFIDENCE_THRESHOLD = 60   // 0-100; below = reject
export const VISION_EXTRACTION_TIMEOUT_SECONDS = 30
export const SCREENSHOT_MAX_SIZE_BYTES = 10_485_760  // 10 MB
export const SCREENSHOT_MAX_PER_CAUSE = 3
export const SCREENSHOT_MAX_OVERALL = 5
export const SCREENSHOT_ACCEPTED_MIME_TYPES = ['image/png','image/jpeg','image/webp']
export const SCREENSHOT_MINIO_BUCKET = 'knowledge-screenshots'
export const SCREENSHOT_PROXY_CACHE_SECONDS = 86_400 // 24 hours

// ─── Screenshot Lifecycle ─────────────────────────────────────────────────
export const SCREENSHOT_CLEANUP_MIN_VERSIONS_OLD = 2
export const SCREENSHOT_CLEANUP_MIN_ARCHIVED_DAYS = 90

// ─── Chunking ─────────────────────────────────────────────────────────────
export const CHUNK_STEPS_PER_BATCH = 5
export const CHUNK_BRANCH_MAX_TOKENS = 1500          // ceiling before forced split

// ─── Staleness ────────────────────────────────────────────────────────────
export const STALENESS_JOB_CRON = '30 0 * * *'      // 00:30 IST (19:00 UTC prev day)
export const REVIEW_FREQUENCY_DAYS: Record<ReviewFrequency, number | null> = {
  monthly:     30,
  quarterly:   90,
  semi_annual: 180,
  annual:      365,
  as_needed:   null,   // null = no automatic next_review_date
}

// ─── Feedback Notifications ───────────────────────────────────────────────
export const FEEDBACK_NEGATIVE_ALERT_THRESHOLD = 3  // negatives to trigger notification
export const FEEDBACK_NEGATIVE_ALERT_WINDOW_DAYS = 7
export const FEEDBACK_NOTIFICATION_COOLDOWN_DAYS = 7

// ─── Auto-save ────────────────────────────────────────────────────────────
export const FORM_AUTOSAVE_INTERVAL_SECONDS = 30

// ─── Review Frequency Options (for Config dropdown) ───────────────────────
export const REVIEW_FREQUENCY_OPTIONS = [
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly (every 3 months)' },
  { value: 'semi_annual', label: 'Semi-annual (every 6 months)' },
  { value: 'annual',      label: 'Annual (once per year)' },
  { value: 'as_needed',   label: 'As-needed (no automatic review date)' },
] as const

// ─── Admin Nav Entry ──────────────────────────────────────────────────────
// Add to ADMIN_NAV_ITEMS array in constants.ts, after the Documents entry:
// { label: 'Quick Entry', href: '/admin/quick-entry', icon: 'PenLine' }

// ─── Chunk Type Labels ────────────────────────────────────────────────────
export const CHUNK_TYPE_LABELS: Record<string, string> = {
  error_overview: 'Error overview',
  proc_overview:  'Procedure overview',
  cfg_overview:   'Configuration overview',
  cfg_values:     'Configuration values',
  // cause_N and proc_steps_N are formatted dynamically
}

// ─── Vision Status Labels ──────────────────────────────────────────────────
export const VISION_STATUS_LABELS: Record<VisionStatus, string> = {
  pending:    'Queued for processing',
  processing: 'Extracting content...',
  complete:   'Content extracted',
  failed:     'Extraction failed',
  not_sap:    'Rejected — not a SAP screenshot',
}
```

---

## 10. IMPLEMENTATION DEPENDENCY ORDER

The following order must be followed. Each phase depends on the previous.

```
PHASE 0 — INFRASTRUCTURE (prerequisites from Section 7)
  0.1 Verify ollama-vision health
  0.2 Create MinIO bucket
  0.3 Run PostgreSQL migration (IMPL_24)
  0.4 Update OpenSearch mapping (IMPL_24 + IMPL_07 addition)
  0.5 Verify Redis accessibility

PHASE 1 — BACKEND CORE
  1.1 Data models (SQLAlchemy) — IMPL_24
  1.2 Form schema validator — IMPL_25
  1.3 Structure-aware chunker — IMPL_27
  1.4 Core API endpoints (create, list, get, update, archive) — IMPL_25
  1.5 Utility endpoints (suggest-doc-id, check-duplicate, validate-reference) — IMPL_25
  1.6 process_form_entry ARQ task — IMPL_26
  1.7 retry_partial_indexing ARQ task — IMPL_26
  1.8 Version and restore endpoints — IMPL_25
  1.9 Staleness daily job — IMPL_29
  1.10 Feedback endpoints — IMPL_25, IMPL_29

PHASE 2 — SCREENSHOT BACKEND
  2.1 Vision client (ollama_vision.py) — IMPL_28
  2.2 Screenshot upload endpoint with SAP classification — IMPL_28
  2.3 enrich_entry_screenshots ARQ task — IMPL_28
  2.4 Screenshot lifecycle job — IMPL_28
  2.5 Screenshot proxy route — IMPL_28

PHASE 3 — OPERATIONAL BACKEND
  3.1 Rate limiting middleware — IMPL_29
  3.2 Bulk import parser — IMPL_29
  3.3 Pipeline health endpoint — IMPL_29
  3.4 Knowledge Gaps write-back — IMPL_29

PHASE 4 — FRONTEND CORE
  4.1 Types (types/index.ts additions) — IMPL_23 Section 8
  4.2 Constants (constants.ts additions) — IMPL_23 Section 9
  4.3 TanStack Query hooks — FRONTEND_37
  4.4 Quick Entry list page — FRONTEND_36
  4.5 Quick Entry form shell — FRONTEND_37
  4.6 Header fields section — FRONTEND_38
  4.7 Error Guide form fields — FRONTEND_38
  4.8 Procedure form fields — FRONTEND_38
  4.9 Config form fields — FRONTEND_38

PHASE 5 — FRONTEND SCREENSHOTS AND MODALS
  5.1 Screenshot upload component — FRONTEND_39
  5.2 Archive confirmation modal — FRONTEND_39
  5.3 Duplicate check modal — FRONTEND_39
  5.4 Version history drawer — FRONTEND_39
  5.5 Processing status drawer — FRONTEND_39
  5.6 Onboarding modal — FRONTEND_39

PHASE 6 — SYSTEM INTEGRATIONS
  6.1 Attribution panel screenshots — FRONTEND_40
  6.2 MinIO proxy route — FRONTEND_40
  6.3 WebSocket validation_result extension — FRONTEND_40
  6.4 Knowledge Gaps "Create Quick Entry" button — FRONTEND_36 + IMPL_29
  6.5 System Health Quick Entry section — IMPL_29 + FRONTEND_22 update
  6.6 Analytics feedback metrics — IMPL_29

PHASE 7 — HARDENING AND VERIFICATION
  7.1 Rate limiting end-to-end test
  7.2 Concurrent edit 409 test
  7.3 Partial index recovery test
  7.4 Staleness job manual test
  7.5 Screenshot lifecycle test
  7.6 Full end-to-end: form → submission → employee query → screenshot display
```

---

## 11. EXISTING DOCUMENT MODIFICATION SUMMARY

The following additions must be appended to existing spec documents. Full
copy-paste blocks are provided at the end of each relevant IMPL document.

| Existing Document | What to add | Provided in |
|---|---|---|
| `IMPL_05_DATA_LAYER_POSTGRESQL.md` | Migration SQL for 4 new tables | IMPL_24 |
| `IMPL_06_DATA_LAYER_QDRANT.md` | New payload field definitions | IMPL_24 |
| `IMPL_07_DATA_LAYER_OPENSEARCH.md` | New index mapping fields | IMPL_24 |
| `IMPL_13_VISION_SERVICE.md` | Ingestion-time vision call pattern | IMPL_28 |
| `IMPL_18_INGESTION_PIPELINE.md` | Quick Entry parallel path section | IMPL_26 |
| `IMPL_20_ADMIN_PORTAL_OBSERVABILITY.md` | Quick Entry Pipeline health metrics | IMPL_29 |
| `AEGIS_DATA_CONTRACTS.md` | New TypeScript interfaces | IMPL_23 Section 8 |
| `AEGIS_CONFIGURATION_CONSTANTS.md` | New constants | IMPL_23 Section 9 |
| `FRONTEND_20_ADMIN_GAPS_AUDIT.md` | Create Quick Entry button spec | IMPL_29 |
| `FRONTEND_22_ADMIN_HEALTH_ANALYTICS.md` | Quick Entry Pipeline health section | IMPL_29 |
| `FRONTEND_MASTER_REFERENCE.md` | Quick Entry in admin portal feature list | Add one line |

---

*IMPL_23 — Quick Entry Overview and Architecture | AEGIS v1.0 | Sona Comstar*
