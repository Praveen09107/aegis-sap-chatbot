"""
AEGIS Quick Entry Chunk Quality Scorer
Used by process_form_entry's quality-scoring stage (IMPL_26 Stage A8).

IMPL_26/IMPL_23 describe this as reusing a quality-scoring service from the
document ingestion pipeline's "Stage 8" — that stage was never actually built
(the real 11-stage ingestion_pipeline.py has no quality-scoring stage, and no
scoring formula exists anywhere in specs/). This module is a new, small
heuristic scorer built specifically for Quick Entry, scoped to this feature
only — it does not touch or claim to match anything in the document pipeline.
"""
from app.services.query_intelligence import query_intelligence_service
from app.services.form_validator import CONFIG_PLACEHOLDER_STRINGS

_LENGTH_SCORE_CEILING_CHARS = 200


def score_chunk_quality(text: str) -> float:
    """
    Returns a quality score in [0.0, 1.0] as the average of three factors:
    - length adequacy (sparse chunks score lower)
    - specificity (presence of a concrete SAP entity — T-code or error code)
    - absence of unfilled placeholder text (e.g. "TBD", "TO BE FILLED")
    """
    length_score = min(1.0, len(text) / _LENGTH_SCORE_CEILING_CHARS)

    entities = query_intelligence_service.extract_sap_entities(text)
    specificity_score = 1.0 if (entities.t_codes or entities.error_codes) else 0.7

    upper_text = text.upper()
    has_placeholder = any(p in upper_text for p in CONFIG_PLACEHOLDER_STRINGS)
    placeholder_score = 0.3 if has_placeholder else 1.0

    return round((length_score + specificity_score + placeholder_score) / 3.0, 4)
