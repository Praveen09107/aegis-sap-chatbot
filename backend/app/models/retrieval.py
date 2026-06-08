"""
AEGIS Retrieval Data Models
All dataclasses used between the QIL, Retrieval Engine, Reasoning Service, and Validation Engine.
Field names match EXACTLY the schemas in AEGIS_DATA_CONTRACTS.md.
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class RegistryResult:
    """Result from Known Patterns Registry lookup (Mode A only)."""
    pattern_string: str
    pattern_type: str
    linked_document_id: str
    linked_chunk_type: str
    registry_notes: str


@dataclass
class EnrichedQuery:
    """
    Output of the Query Intelligence Layer.
    Consumed by: Retrieval Engine, Reasoning Service.
    """
    raw_message: str
    enriched_text: str
    entities: List
    context_entity: Optional[object]
    retrieval_mode: str
    classification: str
    registry_result: Optional[RegistryResult]
    session_id: str
    trace_id: str
    cache_hit: bool = False
    cached_answer: Optional[str] = None


@dataclass
class RetrievedChunk:
    """A single retrieved document chunk after reranking."""
    chunk_id: str
    document_id: str
    content_type: str
    chunk_type: str
    chunk_text: str
    last_verified_date: str
    verified_by: str
    cross_encoder_score: float
    rrf_score: float


@dataclass
class ParentHeader:
    """Parent header chunk hydrated from Qdrant (Stage 8 of retrieval)."""
    document_id: str
    content_type: str
    error_code: Optional[str]
    configuration_name: Optional[str]
    procedure_name: Optional[str]
    module: str
    transactions: List[str]
    last_verified_date: str
    verified_by: str


@dataclass
class RetrievalResult:
    """Complete output of the Retrieval Engine. Consumed by Reasoning Service."""
    chunks: List[RetrievedChunk]
    parent_header: Optional[ParentHeader]
    registry_notes: str
    crag_assessment: str
    crag_gap_description: Optional[str]
    retrieval_mode_used: str
    top_cross_encoder_score: float


@dataclass
class ValidationResult:
    """Output of the Validation Engine. Consumed by Orchestration layer."""
    validation_score: float
    raw_score: float
    freshness_coefficient: float
    nli_support_score: float
    judge_faithfulness: float
    judge_step_completeness: float
    judge_relevance: float
    tier3_ran: bool
    confidence_badge: str
    unsupported_claims: List[str]
    tier1_failures: List[dict]
    regeneration_attempted: bool
    answer_text: str
    attribution_panel: dict
