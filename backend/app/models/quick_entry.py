"""
AEGIS Quick Entry Data Models
Dataclasses for the 4 knowledge_form_* tables and their JSONB payloads
(form_data, processing_log). Field names match EXACTLY the schemas in
IMPL_24_QUICK_ENTRY_DATA_MODEL.md Sections 2-4.

Validation lives at the API/service layer (IMPL_25's form_validator.py,
not yet built) — these are plain data containers, matching the style of
app/models/session.py and app/models/retrieval.py.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ============================================================
# Row models — mirror the 4 tables created by migration 007
# ============================================================

@dataclass
class KnowledgeFormEntry:
    """Row in knowledge_form_entries. form_data always reflects the current published version."""
    id: str
    document_id: str
    content_type: str          # 'error_guide' | 'procedure' | 'config'
    module: str                # one of ALLOWED_MODULES
    transactions: List[str]
    status: str                # 'draft' | 'processing' | 'active' | 'archived' | 'low_quality' | 'failed' | 'partial_index' | 'review_required'
    version: int
    form_data: dict            # ErrorGuideFormData | ProcedureFormData | ConfigFormData, see below
    verified_by_name: str
    verified_date: str         # YYYY-MM-DD
    submitted_by: str          # opaque Keycloak sub claim — no local users table, no FK
    created_at: str
    updated_at: str
    review_frequency: Optional[str] = None      # config only
    next_review_date: Optional[str] = None      # config only
    last_notified_at: Optional[str] = None
    gap_id: Optional[str] = None
    processing_log: Optional["ProcessingLog"] = None


@dataclass
class KnowledgeFormEntryVersion:
    """Row in knowledge_form_entry_versions. Immutable snapshot, written once per version."""
    id: str
    entry_id: str
    version: int
    form_data: dict
    verified_by_name: str
    verified_date: str
    changed_by: str
    changed_at: str
    change_summary: Optional[str] = None


@dataclass
class KnowledgeFormEntryChunk:
    """Row in knowledge_form_entry_chunks. Maps one entry+version chunk to its Qdrant point."""
    id: str
    entry_id: str
    version: int
    chunk_type: str
    qdrant_point_id: str
    chunk_text: str
    quality_score: float
    original_quality_score: float
    created_at: str
    qdrant_status: str = "pending"       # 'pending' | 'success' | 'failed'
    opensearch_status: str = "pending"   # 'pending' | 'success' | 'failed'
    is_current: bool = True


@dataclass
class KnowledgeFormScreenshot:
    """Row in knowledge_form_screenshots. One row per uploaded screenshot file."""
    id: str
    entry_id: str
    version: int
    associated_section: str
    minio_object_key: str
    admin_caption: str
    file_size_bytes: int
    mime_type: str
    created_at: str
    extracted_text: Optional[str] = None
    vision_status: str = "pending"       # 'pending' | 'processing' | 'complete' | 'failed' | 'not_sap'
    vision_error: Optional[str] = None
    vision_confidence: Optional[float] = None   # 0-100
    sap_confirmed: bool = False
    eligible_for_cleanup: bool = False


# ============================================================
# form_data JSONB payloads — one per content_type
# ============================================================

@dataclass
class CauseBlock:
    cause_number: int          # 1-based, always recomputed from array index — never trusted from input
    priority: str               # 'check_first' | 'common' | 'less_common' | 'rare'
    cause_description: str
    how_to_identify: str
    resolution_steps: str
    resolution_requires_admin: bool
    cause_obsolete: bool
    obsolete_reason: str = ""   # required (min 10 chars) if cause_obsolete is True — enforced by form_validator
    screenshot_ids: List[str] = field(default_factory=list)


@dataclass
class ErrorGuideFormData:
    issue_description: str
    error_code: str             # exact code or "NONE"
    error_message: str          # exact SAP text or "NONE"
    description: str
    when_this_occurs: str
    causes: List[CauseBlock]
    success_indicator: str
    escalation_criteria: str
    admin_steps: str            # specific steps or "NONE"
    notes: str = ""


@dataclass
class ProcedureStep:
    action: str
    step_type: str               # 'normal' | 'branch_start' | 'branch_option_a' | 'branch_option_b' | 'branch_end' | 'admin_required'
    specificity_acknowledged: bool
    screenshot_ids: List[str] = field(default_factory=list)
    # step_number is NEVER stored — always computed at read time as
    # (array_index + 1) and injected into API responses (IMPL_24 Section 3.2).


@dataclass
class CommonError:
    error_code: str
    cause_summary: str
    see_document_id: str = ""
    reference_validated: bool = False


@dataclass
class ProcedureFormData:
    procedure_name: str
    purpose: str
    when_to_use: str
    data_required: str          # description or "NONE"
    system_conditions: str      # conditions or "NONE"
    access_required: str
    steps: List[ProcedureStep]
    verification: str
    common_errors: List[CommonError]
    plant_notes: str = ""
    notes: str = ""


@dataclass
class CurrentValueParameter:
    name: str
    value: str


@dataclass
class CurrentValuesGroup:
    group_name: str
    parameters: List[CurrentValueParameter]


@dataclass
class RelatedError:
    error_code: str
    misconfiguration_cause: str
    see_document_id: str = ""
    reference_validated: bool = False


@dataclass
class ConfigFormData:
    configuration_name: str
    what_this_controls: str
    access_view: str
    access_change: str
    change_frequency: str
    current_values_mode: str    # 'structured' | 'free_text'
    how_to_navigate: str
    related_errors: List[RelatedError]
    table_name: str = ""
    current_values_structured: List[CurrentValuesGroup] = field(default_factory=list)
    current_values_free_text: str = ""
    notes: str = ""


# ============================================================
# processing_log JSONB — exact schema, IMPL_24 Section 4
# ============================================================

@dataclass
class ProcessingStage:
    status: str          # 'success' | 'failed'
    duration_ms: int


@dataclass
class ValidationStage(ProcessingStage):
    errors: List[str] = field(default_factory=list)


@dataclass
class ChunkAssemblyStage(ProcessingStage):
    chunks_assembled: int = 0
    chunk_types: List[str] = field(default_factory=list)


@dataclass
class EntityExtractionStage(ProcessingStage):
    t_codes_found: List[str] = field(default_factory=list)
    error_codes_found: List[str] = field(default_factory=list)


@dataclass
class EmbeddingStage(ProcessingStage):
    chunks_embedded: int = 0
    model_used: str = ""


@dataclass
class QualityScoringStage(ProcessingStage):
    # status here overrides the base 'success'|'failed' with a third value,
    # 'below_threshold' — kept as plain str per IMPL_24, not a stricter type.
    avg_score: Optional[float] = None
    threshold_used: float = 0.0
    per_chunk_scores: Dict[str, float] = field(default_factory=dict)


@dataclass
class SimilarEntry:
    document_id: str
    similarity_score: float


@dataclass
class DeduplicationStage(ProcessingStage):
    similar_entries: List[SimilarEntry] = field(default_factory=list)


@dataclass
class QdrantInsertionStage(ProcessingStage):
    chunks_attempted: int = 0
    chunks_succeeded: int = 0
    chunks_failed: int = 0
    point_ids: Dict[str, str] = field(default_factory=dict)
    failed_chunk_types: List[str] = field(default_factory=list)


@dataclass
class OpenSearchIndexingStage(ProcessingStage):
    docs_attempted: int = 0
    docs_succeeded: int = 0
    docs_failed: int = 0
    failed_chunk_types: List[str] = field(default_factory=list)


@dataclass
class ScreenshotEnrichmentStage:
    queued: bool
    screenshot_count: int
    task_id: Optional[str] = None


@dataclass
class ProcessingLogStages:
    validation: Optional[ValidationStage] = None
    chunk_assembly: Optional[ChunkAssemblyStage] = None
    entity_extraction: Optional[EntityExtractionStage] = None
    embedding: Optional[EmbeddingStage] = None
    quality_scoring: Optional[QualityScoringStage] = None
    deduplication: Optional[DeduplicationStage] = None
    qdrant_insertion: Optional[QdrantInsertionStage] = None
    opensearch_indexing: Optional[OpenSearchIndexingStage] = None
    screenshot_enrichment: Optional[ScreenshotEnrichmentStage] = None


@dataclass
class ProcessingLog:
    """
    Written whole at task completion, not incrementally per stage (avoids
    partial writes) — the one exception is the initial `null` placeholder
    already in the DB when the ARQ task is first dispatched. Not every
    stage key is present on every run: a failure at `validation` means
    only `stages.validation` is populated.
    """
    run_id: str
    started_at: str
    entry_id: str
    entry_version: int
    stages: ProcessingLogStages
    overall_status: str          # same enum as knowledge_form_entries.status
    retry_count: int = 0
    completed_at: Optional[str] = None
    total_duration_ms: Optional[int] = None
    failure_stage: Optional[str] = None
    failure_reason: Optional[str] = None
    previous_run_ids: List[str] = field(default_factory=list)
