"""
AEGIS Retrieval Models
Dataclasses for the retrieval pipeline internal objects.
These are @dataclass (not Pydantic) — internal pipeline objects only.
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class EnrichedQuery:
    """
    Result of query intelligence processing.
    Passed through the retrieval pipeline stages.
    """
    original_query: str
    normalized_query: str
    query_embedding: List[float] = field(default_factory=list)
    sap_entities: List[dict] = field(default_factory=list)
    content_type_hint: Optional[str] = None
    complexity_tier: int = 1
    session_context: Optional[dict] = None
    session_id: str = ""
