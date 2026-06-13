# IMPL_12: QUERY INTELLIGENCE LAYER
## Entity Extraction, Context Resolver, Synonym Expansion, Mode Assignment, Semantic Cache Check
## Session 12 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 12: The Query Intelligence Layer (QIL) — AEGIS's first AI processing stage.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-11 complete. PostgreSQL, Qdrant, BGE service all healthy.

**What this session creates:**
- `backend/app/models/retrieval.py` — All retrieval dataclasses (EnrichedQuery, RetrievalResult, etc.)
- `backend/app/services/query_intelligence.py` — Complete QIL implementation
- `tests/unit/test_query_intelligence.py` — Unit tests for all QIL components

**Critical design constraints:**
- The QIL is **zero-latency AI** — no model inference calls whatsoever. Everything is regex, database lookup, and dictionary expansion.
- The intent label is **rule-based deterministic**: `{CLASSIFICATION}:{entity_value}`. Never use a model to generate it.
- Synonym expansion happens by **appending** expanded terms to the query, not replacing — both original and expanded terms are present.
- Context resolution is a **substitution** if reference signals are detected AND last_entities is non-empty. Otherwise, current query stands unchanged.

---

## FILE 1: backend/app/models/retrieval.py

```python
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
    registry_notes: str     # Injected verbatim into prompt context section


@dataclass
class EnrichedQuery:
    """
    Output of the Query Intelligence Layer.
    Consumed by: Retrieval Engine, Reasoning Service.
    """
    raw_message: str                            # Original employee message, unmodified
    enriched_text: str                          # Message with synonym expansions appended
    entities: List                              # List of EntityObject
    context_entity: Optional[object]           # EntityObject substituted by context resolver (or None)
    retrieval_mode: str                         # "A" | "B" | "C"
    classification: str                         # "ERROR_RESOLUTION" | "PROCESS" | "CONFIG" | "SIMPLE_FACT"
    registry_result: Optional[RegistryResult]  # Populated if mode == "A", else None
    session_id: str
    trace_id: str
    cache_hit: bool = False                    # True if semantic cache returned a result
    cached_answer: Optional[str] = None        # Populated if cache_hit is True


@dataclass
class RetrievedChunk:
    """A single retrieved document chunk after reranking."""
    chunk_id: str                       # Format: {document_id}:chunk:{index}
    document_id: str
    content_type: str                   # "error_guide" | "procedure" | "config"
    chunk_type: str                     # header | cause_resolution | outcome | etc.
    chunk_text: str
    last_verified_date: str             # ISO date string: "2024-03-28"
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
    crag_assessment: str                # "SUFFICIENT" | "INSUFFICIENT" | "SKIPPED"
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
    confidence_badge: str               # "green" | "amber" | "none"
    unsupported_claims: List[str]
    tier1_failures: List[dict]
    regeneration_attempted: bool
    answer_text: str
    attribution_panel: dict
```

---

## FILE 2: backend/app/services/query_intelligence.py

```python
"""
AEGIS Query Intelligence Layer (QIL)
Transforms raw employee query into a structured EnrichedQuery.

Pipeline (all rule-based, zero model inference):
  1. Entity extraction   — regex patterns for SAP error codes, T-codes, document numbers
  2. Context resolver    — reference signal detection → substitute last session entity
  3. Synonym expansion   — PostgreSQL synonym_map lookup → append expanded terms
  4. Intent classifier   — keyword signals → ERROR_RESOLUTION | PROCESS | CONFIG | SIMPLE_FACT
  5. Mode assignment     — Mode A (registry hit) > Mode C (complex) > Mode B (default)
  6. Registry lookup     — Mode A: PostgreSQL known_patterns_registry exact match
  7. Semantic cache check — BGE embed + Qdrant cache_queries similarity search

Complete in < 150ms on demo hardware (dominated by PostgreSQL query).
"""
import re
import logging
import asyncio
from typing import List, Optional, Dict, Tuple

import asyncpg
import httpx

from app.config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
    BGE_SERVICE_URL,
    SEMANTIC_CACHE_THRESHOLD,
    MODE_C_QUERY_LENGTH_THRESHOLD,
)
from app.models.session import SessionState, EntityObject
from app.models.retrieval import EnrichedQuery, RegistryResult

logger = logging.getLogger(__name__)

# ============================================================
# ENTITY EXTRACTION PATTERNS (from AEGIS_CONFIGURATION_CONSTANTS.md)
# ============================================================

# SAP error code: 1-4 capital letters followed by 2-6 digits
PATTERN_ERROR_CODE = re.compile(r'\b[A-Z]{1,4}\d{2,6}\b')

# SAP transaction code: 2-5 capital letters, 1-4 digits, optional trailing capital
PATTERN_TCODE = re.compile(r'\b[A-Z]{2,5}\d{1,4}[A-Z]?\b')

# SAP document number: exactly 10 consecutive digits
PATTERN_DOCUMENT_NUMBER = re.compile(r'\b\d{10}\b')

# SAP module keywords (exact word match only)
SAP_MODULE_KEYWORDS = {'FI', 'MM', 'SD', 'HR', 'PP', 'CO', 'BASIS'}

# Known non-entity uppercase sequences to exclude from entity extraction
EXCLUDE_TOKENS = {
    'SAP', 'ERP', 'THE', 'AND', 'FOR', 'NOT', 'CAN', 'GET',
    'USE', 'SET', 'ADD', 'RUN', 'NEW', 'OLD', 'ALL', 'ANY',
    'HAS', 'HAD', 'NOW', 'TOP', 'TXT', 'PDF', 'URL',
}

# ============================================================
# INTENT CLASSIFICATION SIGNALS (from AEGIS_CONFIGURATION_CONSTANTS.md)
# ============================================================

ERROR_RESOLUTION_SIGNALS = [
    "error", "message", "issue", "problem", "failing", "blocked",
    "not working", "showing", "getting", "receiving", "occurred",
    "appears", "failed", "cannot", "unable", "stuck",
]

PROCESS_SIGNALS = [
    "how to", "how do i", "steps to", "procedure", "process",
    "create", "post", "run", "execute", "configure", "set up",
    "complete", "perform", "what is the process",
]

CONFIG_SIGNALS = [
    "configured", "configuration", "setting", "value", "current",
    "what is set", "what period", "open period", "company code",
    "plant", "assignment", "what are the settings",
]

# ============================================================
# CONTEXT RESOLVER REFERENCE SIGNALS (from AEGIS_CONFIGURATION_CONSTANTS.md)
# ============================================================

REFERENCE_SIGNAL_PHRASES = [
    "what if", "what about", "that error", "the same issue",
    "it still", "this problem", "does that also", "after that",
    "then what", "what happens when", "how about when",
    "what else", "same thing", "that same", "this same",
    "still not", "still showing", "still getting",
]

# ============================================================
# MODE C COMPLEXITY SIGNALS
# ============================================================

MODE_C_SIGNALS = [
    "compare", "difference between", "both", "also affects",
    "multiple", "across", "in addition", "and also", "as well as",
    "related to", "depends on", "impacts both", "affects",
]


class QueryIntelligenceLayer:
    """
    Transforms raw employee query into EnrichedQuery.
    Instantiated once at FastAPI startup and reused across requests.
    """

    def __init__(self):
        # In-memory synonym map cache (loaded from PostgreSQL at startup)
        self._synonym_map: Dict[str, str] = {}
        self._synonym_loaded = False
        self._synonym_load_lock = asyncio.Lock()

    # ============================================================
    # MAIN ENTRY POINT
    # ============================================================

    async def process(
        self,
        raw_message: str,
        session: SessionState,
        session_id: str,
        trace_id: str,
    ) -> EnrichedQuery:
        """
        Process a raw employee message into an EnrichedQuery.
        Returns the enriched query object for the Retrieval Engine.
        """
        logger.debug(f"QIL processing: session={session_id}, trace={trace_id}")

        # Ensure synonym map is loaded
        await self._ensure_synonym_map_loaded()

        # Stage 1: Entity extraction
        entities = self._extract_entities(raw_message)

        # Stage 2: Context resolution
        context_entity = self._resolve_context(raw_message, entities, session)
        if context_entity and not entities:
            entities = [context_entity]

        # Stage 3: Synonym expansion
        enriched_text = self._expand_synonyms(raw_message)

        # Stage 4: Intent classification
        classification = self._classify_intent(raw_message, entities)

        # Stage 5: Mode assignment (A > C > B)
        registry_result, retrieval_mode = await self._assign_mode(
            raw_message, entities, enriched_text
        )

        # Stage 6: Semantic cache check
        cache_hit, cached_answer = await self._check_semantic_cache(enriched_text)

        return EnrichedQuery(
            raw_message=raw_message,
            enriched_text=enriched_text,
            entities=entities,
            context_entity=context_entity,
            retrieval_mode=retrieval_mode,
            classification=classification,
            registry_result=registry_result,
            session_id=session_id,
            trace_id=trace_id,
            cache_hit=cache_hit,
            cached_answer=cached_answer,
        )

    # ============================================================
    # STAGE 1: ENTITY EXTRACTION
    # ============================================================

    def _extract_entities(self, text: str) -> List[EntityObject]:
        """
        Extract SAP entities from text using regex patterns.
        Priority: document_number > error_code > tcode > module
        Returns list in priority order.
        """
        entities = []
        found_values = set()

        # Extract document numbers first (most specific — 10-digit)
        for match in PATTERN_DOCUMENT_NUMBER.finditer(text):
            value = match.group(0)
            if value not in found_values:
                entities.append(EntityObject(type="document_number", value=value))
                found_values.add(value)

        # Extract error codes (e.g. VL150, F5201, CNTRL_2)
        for match in PATTERN_ERROR_CODE.finditer(text):
            value = match.group(0)
            if value in EXCLUDE_TOKENS or value in found_values:
                continue
            if value in SAP_MODULE_KEYWORDS:
                continue
            # Distinguish from T-codes: error codes don't have trailing letter
            if not re.match(r'^[A-Z]{2,5}\d{1,4}[A-Z]$', value):
                entities.append(EntityObject(type="error_code", value=value))
                found_values.add(value)

        # Extract T-codes (e.g. VL01N, MM02, MIGO)
        for match in PATTERN_TCODE.finditer(text):
            value = match.group(0)
            if value in EXCLUDE_TOKENS or value in found_values:
                continue
            if value in SAP_MODULE_KEYWORDS:
                continue
            entities.append(EntityObject(type="tcode", value=value))
            found_values.add(value)

        # Extract module keywords (FI, MM, SD, etc.)
        words = text.upper().split()
        for word in words:
            clean_word = re.sub(r'[^A-Z]', '', word)
            if clean_word in SAP_MODULE_KEYWORDS and clean_word not in found_values:
                entities.append(EntityObject(type="module", value=clean_word))
                found_values.add(clean_word)

        return entities

    # ============================================================
    # STAGE 2: CONTEXT RESOLVER
    # ============================================================

    def _resolve_context(
        self,
        message: str,
        current_entities: List[EntityObject],
        session: SessionState,
    ) -> Optional[EntityObject]:
        """
        Detect reference signals in message.
        If reference detected AND current query has no entities AND session has last_entities →
        substitute the primary entity from the previous turn.

        Returns the substituted entity or None.
        """
        # Only resolve if current message has no entities of its own
        if current_entities:
            return None

        # Check for reference signal phrases
        message_lower = message.lower()
        has_reference = any(signal in message_lower for signal in REFERENCE_SIGNAL_PHRASES)

        if not has_reference:
            return None

        # Use the first entity from the last session turn (most recent context)
        if not session.last_entities:
            return None

        resolved = session.last_entities[0]
        logger.debug(f"Context resolved: substituted entity={resolved.type}:{resolved.value}")
        return resolved

    # ============================================================
    # STAGE 3: SYNONYM EXPANSION
    # ============================================================

    async def _ensure_synonym_map_loaded(self):
        """Load synonym map from PostgreSQL if not already in memory."""
        if self._synonym_loaded:
            return

        async with self._synonym_load_lock:
            if self._synonym_loaded:
                return  # Double-check after lock acquired
            await self._load_synonym_map()
            self._synonym_loaded = True

    async def _load_synonym_map(self):
        """Fetch all active synonyms from PostgreSQL into memory."""
        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            )
            try:
                rows = await conn.fetch(
                    "SELECT phrase, expansion FROM synonym_map WHERE active = TRUE"
                )
                self._synonym_map = {row["phrase"]: row["expansion"] for row in rows}
                logger.info(f"Synonym map loaded: {len(self._synonym_map)} entries")
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Failed to load synonym map: {e}")
            self._synonym_map = {}

    def _expand_synonyms(self, text: str) -> str:
        """
        Append synonym expansions to query text.
        Checks each synonym phrase (lowercase) against the lowercased text.
        If matched, appends the expansion to the enriched text.
        Does NOT replace original text — both original and expansion are present.
        """
        text_lower = text.lower()
        expansions = []

        for phrase, expansion in self._synonym_map.items():
            if phrase in text_lower:
                expansions.append(expansion)

        if expansions:
            enriched = text + " " + " ".join(expansions)
            logger.debug(f"Synonym expansion: added {len(expansions)} expansion(s)")
            return enriched
        return text

    def reload_synonym_map(self):
        """Force reload of synonym map on next request (called by admin portal)."""
        self._synonym_loaded = False

    # ============================================================
    # STAGE 4: INTENT CLASSIFICATION
    # ============================================================

    def _classify_intent(self, text: str, entities: List[EntityObject]) -> str:
        """
        Classify query intent using keyword signals.
        Returns one of: ERROR_RESOLUTION | PROCESS | CONFIG | SIMPLE_FACT
        Priority: ERROR_RESOLUTION > CONFIG > PROCESS > SIMPLE_FACT
        """
        text_lower = text.lower()

        # Check for error codes → strong signal for ERROR_RESOLUTION
        has_error_code = any(e.type == "error_code" for e in entities)
        if has_error_code:
            return "ERROR_RESOLUTION"

        # Check ERROR_RESOLUTION signals
        if any(signal in text_lower for signal in ERROR_RESOLUTION_SIGNALS):
            return "ERROR_RESOLUTION"

        # Check CONFIG signals (check before PROCESS — config questions often use "how")
        if any(signal in text_lower for signal in CONFIG_SIGNALS):
            return "CONFIG"

        # Check PROCESS signals
        if any(signal in text_lower for signal in PROCESS_SIGNALS):
            return "PROCESS"

        return "SIMPLE_FACT"

    # ============================================================
    # STAGE 5: MODE ASSIGNMENT
    # ============================================================

    async def _assign_mode(
        self,
        raw_message: str,
        entities: List[EntityObject],
        enriched_text: str,
    ) -> Tuple[Optional[RegistryResult], str]:
        """
        Determine retrieval mode: A (registry hit) > C (complex) > B (default).
        Returns (registry_result, mode_string).
        """
        # Check for Mode A: entity matches Known Patterns Registry
        if entities:
            registry_result = await self._check_registry(entities)
            if registry_result:
                logger.debug(f"Mode A: registry hit for {entities[0].value}")
                return registry_result, "A"

        # Check for Mode C: complex multi-module or long query
        if self._is_mode_c(raw_message, entities, enriched_text):
            logger.debug("Mode C: complex query detected")
            return None, "C"

        # Default: Mode B
        return None, "B"

    def _is_mode_c(
        self,
        text: str,
        entities: List[EntityObject],
        enriched_text: str,
    ) -> bool:
        """
        Check Mode C conditions. Returns True if query needs multi-source diverse retrieval.
        Conditions (any one triggers Mode C):
        1. Query length exceeds threshold (200 chars)
        2. Three or more distinct SAP modules mentioned
        3. Mode C complexity signals present in text
        """
        # Condition 1: Long query
        if len(text) > MODE_C_QUERY_LENGTH_THRESHOLD:
            logger.debug(f"Mode C condition 1: query length {len(text)} > {MODE_C_QUERY_LENGTH_THRESHOLD}")
            return True

        # Condition 2: Multiple modules
        module_entities = [e for e in entities if e.type == "module"]
        if len(module_entities) >= 3:
            logger.debug(f"Mode C condition 2: {len(module_entities)} modules detected")
            return True

        # Condition 3: Complexity signals
        text_lower = text.lower()
        if any(signal in text_lower for signal in MODE_C_SIGNALS):
            logger.debug("Mode C condition 3: complexity signal detected")
            return True

        return False

    # ============================================================
    # STAGE 6: REGISTRY LOOKUP (Mode A)
    # ============================================================

    async def _check_registry(
        self, entities: List[EntityObject]
    ) -> Optional[RegistryResult]:
        """
        Check Known Patterns Registry for any extracted entity.
        Returns RegistryResult for first matching entity, or None.
        Only checks error_code and tcode entities (not module/document_number).
        """
        checkable = [e for e in entities if e.type in {"error_code", "tcode"}]
        if not checkable:
            return None

        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            )
            try:
                for entity in checkable:
                    row = await conn.fetchrow(
                        """
                        SELECT pattern_string, pattern_type, linked_document_id,
                               linked_chunk_type, registry_notes
                        FROM known_patterns_registry
                        WHERE pattern_string = $1 AND status = 'approved'
                        LIMIT 1
                        """,
                        entity.value,
                    )
                    if row:
                        return RegistryResult(
                            pattern_string=row["pattern_string"],
                            pattern_type=row["pattern_type"],
                            linked_document_id=row["linked_document_id"],
                            linked_chunk_type=row["linked_chunk_type"],
                            registry_notes=row["registry_notes"],
                        )
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Registry lookup failed: {e}")

        return None

    # ============================================================
    # STAGE 7: SEMANTIC CACHE CHECK
    # ============================================================

    async def _check_semantic_cache(
        self, enriched_text: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Check semantic cache before retrieval.
        Embeds enriched_text with BGE → search Qdrant cache_queries collection.
        Returns (cache_hit, cached_answer_text).
        Cache hit requires similarity >= SEMANTIC_CACHE_THRESHOLD (0.88).
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                embed_resp = await client.post(
                    f"{BGE_SERVICE_URL}/embed-single",
                    json={"text": enriched_text},
                )
                embed_resp.raise_for_status()
                query_vector = embed_resp.json()["embedding"]

            from app.infrastructure.qdrant_client import qdrant_client
            cache_result = await qdrant_client.search_cache(query_vector)

            if cache_result:
                score = cache_result["score"]
                answer = cache_result["payload"].get("answer_text", "")
                logger.info(f"Semantic cache HIT: score={score:.4f} (threshold={SEMANTIC_CACHE_THRESHOLD})")
                return True, answer

        except Exception as e:
            logger.warning(f"Semantic cache check failed (non-blocking): {e}")

        return False, None

    # ============================================================
    # UTILITY
    # ============================================================

    def get_primary_entity(self, entities: List[EntityObject]) -> Optional[EntityObject]:
        """Return the highest-priority entity (error_code > tcode > document_number > module)."""
        priority = {"error_code": 0, "tcode": 1, "document_number": 2, "module": 3}
        if not entities:
            return None
        return min(entities, key=lambda e: priority.get(e.type, 99))


# Singleton instance (initialised in FastAPI startup)
query_intelligence = QueryIntelligenceLayer()
```

---

## FILE 3: tests/unit/test_query_intelligence.py

```python
"""
Unit tests for the Query Intelligence Layer.
Tests all stages independently using mocks for database and HTTP calls.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.query_intelligence import QueryIntelligenceLayer
from app.models.session import SessionState, EntityObject


@pytest.fixture
def qil():
    """Create a QIL instance with synonym map pre-loaded."""
    layer = QueryIntelligenceLayer()
    layer._synonym_map = {
        "delivery blocked": "outbound delivery creation error VL01N VL150 material available stock",
        "goods receipt": "goods receipt MIGO movement type 101 MM",
        "posting period": "posting period OB52 FI fiscal year",
    }
    layer._synonym_loaded = True
    return layer


@pytest.fixture
def empty_session():
    return SessionState(user_id_hash="abc123", created_at="2024-01-01T00:00:00Z")


@pytest.fixture
def session_with_entity():
    s = SessionState(user_id_hash="abc123", created_at="2024-01-01T00:00:00Z")
    s.last_entities = [EntityObject(type="error_code", value="VL150")]
    return s


class TestEntityExtraction:
    def test_error_code_extracted(self, qil):
        entities = qil._extract_entities("I am getting VL150 error in VL01N")
        error_entities = [e for e in entities if e.type == "error_code"]
        assert any(e.value == "VL150" for e in error_entities), "VL150 not found"

    def test_tcode_extracted(self, qil):
        entities = qil._extract_entities("How do I use VL01N to create a delivery?")
        tcode_entities = [e for e in entities if e.type == "tcode"]
        assert any(e.value == "VL01N" for e in tcode_entities)

    def test_document_number_extracted(self, qil):
        entities = qil._extract_entities("My delivery document 4500012345 is blocked")
        doc_entities = [e for e in entities if e.type == "document_number"]
        assert any(e.value == "4500012345" for e in doc_entities)

    def test_module_keyword_extracted(self, qil):
        entities = qil._extract_entities("This is an SD module billing issue")
        module_entities = [e for e in entities if e.type == "module"]
        assert any(e.value == "SD" for e in module_entities)

    def test_clean_query_no_entities(self, qil):
        entities = qil._extract_entities("How do I create a delivery in SAP?")
        # SAP is in EXCLUDE_TOKENS
        assert not any(e.value == "SAP" for e in entities)

    def test_multiple_entities(self, qil):
        entities = qil._extract_entities("VL150 error occurs when using VL01N in plant 1000")
        types = {e.type for e in entities}
        assert "error_code" in types

    def test_exclude_tokens_filtered(self, qil):
        entities = qil._extract_entities("THE AND FOR NOT CAN GET USE SET")
        assert len(entities) == 0

    def test_fi_error_code(self, qil):
        entities = qil._extract_entities("Getting F5201 error during billing")
        error_entities = [e for e in entities if e.type == "error_code"]
        assert any(e.value == "F5201" for e in error_entities)


class TestContextResolver:
    def test_reference_without_entities_resolves(self, qil, session_with_entity):
        result = qil._resolve_context("what if it still shows that error?", [], session_with_entity)
        assert result is not None
        assert result.value == "VL150"

    def test_no_reference_signal_returns_none(self, qil, session_with_entity):
        result = qil._resolve_context("How do I fix VL150?", [], session_with_entity)
        assert result is None

    def test_has_own_entities_no_resolution(self, qil, session_with_entity):
        own_entities = [EntityObject(type="error_code", value="F5201")]
        result = qil._resolve_context("still getting that error", own_entities, session_with_entity)
        assert result is None  # Has own entities, no resolution needed

    def test_empty_session_entities_returns_none(self, qil, empty_session):
        result = qil._resolve_context("what about that issue?", [], empty_session)
        assert result is None


class TestSynonymExpansion:
    def test_synonym_expansion_appended(self, qil):
        result = qil._expand_synonyms("delivery blocked in VL01N")
        assert "outbound delivery creation error" in result
        assert "delivery blocked in VL01N" in result  # Original preserved

    def test_no_match_returns_original(self, qil):
        text = "how to close a purchase order"
        result = qil._expand_synonyms(text)
        assert result == text

    def test_multiple_synonyms_appended(self, qil):
        result = qil._expand_synonyms("delivery blocked and posting period issue")
        assert "VL150" in result or "VL01N" in result
        assert "OB52" in result or "posting period" in result.lower()


class TestIntentClassification:
    def test_error_code_entity_forces_error_resolution(self, qil):
        entities = [EntityObject(type="error_code", value="VL150")]
        assert qil._classify_intent("what is VL150", entities) == "ERROR_RESOLUTION"

    def test_error_signal_detected(self, qil):
        assert qil._classify_intent("I am getting an error", []) == "ERROR_RESOLUTION"

    def test_process_signal_detected(self, qil):
        assert qil._classify_intent("how do I create a delivery?", []) == "PROCESS"

    def test_config_signal_detected(self, qil):
        assert qil._classify_intent("what is the current posting period?", []) == "CONFIG"

    def test_no_signal_is_simple_fact(self, qil):
        assert qil._classify_intent("tell me about VL01N", []) == "SIMPLE_FACT"


class TestModeAssignment:
    def test_long_query_triggers_mode_c(self, qil):
        long_query = "explain " + "what happens " * 20
        assert qil._is_mode_c(long_query, [], long_query) is True

    def test_three_modules_triggers_mode_c(self, qil):
        entities = [
            EntityObject(type="module", value="FI"),
            EntityObject(type="module", value="MM"),
            EntityObject(type="module", value="SD"),
        ]
        assert qil._is_mode_c("question about FI MM SD", entities, "") is True

    def test_compare_signal_triggers_mode_c(self, qil):
        assert qil._is_mode_c("compare the difference between", [], "") is True

    def test_short_simple_query_is_mode_b(self, qil):
        assert qil._is_mode_c("How do I fix VL150?", [], "") is False


class TestPrimaryEntity:
    def test_error_code_prioritized_over_tcode(self, qil):
        entities = [
            EntityObject(type="tcode", value="VL01N"),
            EntityObject(type="error_code", value="VL150"),
        ]
        primary = qil.get_primary_entity(entities)
        assert primary.value == "VL150"

    def test_empty_returns_none(self, qil):
        assert qil.get_primary_entity([]) is None
```

---

## INTEGRATION — Update chat_handler.py to use QIL

In `backend/app/handlers/chat_handler.py`, replace the placeholder pipeline with the QIL call:

```python
# In _handle_client_message, replace the placeholder with:

async def _handle_client_message(...):
    ...
    if message_type == "message":
        from app.services.query_intelligence import query_intelligence
        from app.models.session import SessionState

        # Load session
        session_data = await redis_session.get_session(session_id)
        if session_data:
            session = SessionState.from_redis_hash(session_data)
        else:
            import hashlib
            session = SessionState(
                user_id_hash=hashlib.sha256(user_id.encode()).hexdigest(),
                created_at=datetime.utcnow().isoformat() + "Z",
            )

        # Process query through QIL
        enriched_query = await query_intelligence.process(
            raw_message=query_text,
            session=session,
            session_id=session_id,
            trace_id=getattr(websocket.state, "trace_id", str(uuid.uuid4())),
        )

        # Cache hit: return immediately without retrieval
        if enriched_query.cache_hit:
            await websocket.send_json({
                "type": "token",
                "token": enriched_query.cached_answer,
                "session_id": session_id,
            })
            await websocket.send_json({
                "type": "stream_complete",
                "session_id": session_id,
            })
            return

        # Continue to retrieval engine (Sessions 14-17)
        # For now send placeholder
        await websocket.send_json({
            "type": "token",
            "token": f"[QIL complete: mode={enriched_query.retrieval_mode}, "
                     f"entities={[e.value for e in enriched_query.entities]}, "
                     f"classification={enriched_query.classification}]",
            "session_id": session_id,
        })
        await websocket.send_json({"type": "stream_complete", "session_id": session_id})
```

---

## VERIFICATION STEPS

### Step 1: Run unit tests
```bash
cd backend && source venv/bin/activate
python -m pytest tests/unit/test_query_intelligence.py -v
```
Expected: All tests pass.

### Step 2: Test entity extraction live
```bash
python3 -c "
from app.services.query_intelligence import QueryIntelligenceLayer
qil = QueryIntelligenceLayer()
qil._synonym_loaded = True

# Test SAP error code extraction
entities = qil._extract_entities('I am getting VL150 error when creating delivery in VL01N')
for e in entities:
    print(f'{e.type}: {e.value}')
"
```
Expected output:
```
error_code: VL150
tcode: VL01N
```

### Step 3: Test classification
```bash
python3 -c "
from app.services.query_intelligence import QueryIntelligenceLayer
from app.models.session import EntityObject
qil = QueryIntelligenceLayer()
qil._synonym_loaded = True

tests = [
    ('VL150 error in VL01N', [EntityObject('error_code', 'VL150')]),
    ('How to create a scheduling agreement?', []),
    ('What is the current posting period?', []),
]
for text, entities in tests:
    cls = qil._classify_intent(text, entities)
    print(f'{cls}: {text[:50]}')
"
```

### Step 4: Test Mode C detection
```bash
python3 -c "
from app.services.query_intelligence import QueryIntelligenceLayer
qil = QueryIntelligenceLayer()
qil._synonym_loaded = True

long_q = 'Please compare the difference between how the SD and FI modules handle account determination for billing documents and explain how they interact with the CO module'
print('Long query Mode C:', qil._is_mode_c(long_q, [], long_q))
print('Short query Mode C:', qil._is_mode_c('Fix VL150', [], ''))
"
```
Expected: Long query → True, Short query → False.

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-12: Query Intelligence Layer - all tests passing"
```

Update DECISIONS_LOG.md with:
- All QIL unit tests passing (exact count)
- Entity extraction verified for VL150, VL01N, 10-digit document numbers, module keywords
- Mode C correctly identifies long/multi-module/comparison queries
- Synonym map loading from PostgreSQL verified

---

*Document version: 1.0 | AEGIS Specification Set*
