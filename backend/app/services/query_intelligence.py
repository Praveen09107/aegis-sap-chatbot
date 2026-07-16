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
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB,
    BGE_SERVICE_URL,
    SEMANTIC_CACHE_THRESHOLD,
    MODE_C_QUERY_LENGTH_THRESHOLD,
)
from app.infrastructure.vault_client import vault_client
from app.models.session import SessionState, EntityObject
from app.models.retrieval import EnrichedQuery, RegistryResult

logger = logging.getLogger(__name__)

# ============================================================
# ENTITY EXTRACTION PATTERNS (from AEGIS_CONFIGURATION_CONSTANTS.md)
# ============================================================

PATTERN_ERROR_CODE = re.compile(r'\b[A-Z]{1,4}\d{2,6}\b')

PATTERN_TCODE = re.compile(r'\b[A-Z]{2,5}\d{1,4}[A-Z]?\b')

PATTERN_DOCUMENT_NUMBER = re.compile(r'\b\d{10}\b')

SAP_MODULE_KEYWORDS = {'FI', 'MM', 'SD', 'HR', 'PP', 'CO', 'BASIS'}

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
        """Process a raw employee message into an EnrichedQuery."""
        logger.debug("qil_processing_start", extra={"session_id": session_id, "trace_id": trace_id})

        await self._ensure_synonym_map_loaded()

        entities = self._extract_entities(raw_message)

        context_entity = self._resolve_context(raw_message, entities, session)
        if context_entity and not entities:
            entities = [context_entity]

        enriched_text = self._expand_synonyms(raw_message)

        classification = self._classify_intent(raw_message, entities)

        registry_result, retrieval_mode = await self._assign_mode(
            raw_message, entities, enriched_text
        )

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
        """Extract SAP entities from text using regex patterns."""
        entities: List[EntityObject] = []
        found_values: set = set()

        for match in PATTERN_DOCUMENT_NUMBER.finditer(text):
            value = match.group(0)
            if value not in found_values:
                entities.append(EntityObject(type="document_number", value=value))
                found_values.add(value)

        for match in PATTERN_ERROR_CODE.finditer(text):
            value = match.group(0)
            if value in EXCLUDE_TOKENS or value in found_values:
                continue
            if value in SAP_MODULE_KEYWORDS:
                continue
            # T-codes have trailing letter (ME21N) or short digit suffix (VA01, FB50)
            if re.match(r'^[A-Z]{2,5}\d{1,4}[A-Z]$', value):
                continue
            # T-codes typically have 1-2 digit suffix; error codes have 3+ digits
            if re.match(r'^[A-Z]{2,5}\d{1,2}$', value):
                continue
            entities.append(EntityObject(type="error_code", value=value))
            found_values.add(value)

        for match in PATTERN_TCODE.finditer(text):
            value = match.group(0)
            if value in EXCLUDE_TOKENS or value in found_values:
                continue
            if value in SAP_MODULE_KEYWORDS:
                continue
            entities.append(EntityObject(type="tcode", value=value))
            found_values.add(value)

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
        """Detect reference signals and substitute last session entity if applicable."""
        if current_entities:
            return None

        message_lower = message.lower()
        has_reference = any(signal in message_lower for signal in REFERENCE_SIGNAL_PHRASES)

        if not has_reference:
            return None

        if not session.last_entities:
            return None

        resolved = session.last_entities[0]
        logger.debug("context_resolved", extra={"entity_type": resolved.type, "entity_value": resolved.value})
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
                return
            await self._load_synonym_map()
            self._synonym_loaded = True

    async def _load_synonym_map(self):
        """Fetch all active synonyms from PostgreSQL into memory."""
        try:
            pg_user, pg_password = await vault_client.get_postgres_credentials()
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=pg_user, password=pg_password,
            )
            try:
                rows = await conn.fetch(
                    "SELECT phrase, expansion FROM synonym_map WHERE active = TRUE"
                )
                self._synonym_map = {row["phrase"]: row["expansion"] for row in rows}
                logger.info("synonym_map_loaded", extra={"count": len(self._synonym_map)})
            finally:
                await conn.close()
        except Exception as e:
            logger.error("synonym_map_load_failed", extra={"error": str(e)})
            self._synonym_map = {}

    def _expand_synonyms(self, text: str) -> str:
        """Append synonym expansions to query text (original preserved)."""
        text_lower = text.lower()
        expansions: List[str] = []

        for phrase, expansion in self._synonym_map.items():
            if phrase in text_lower:
                expansions.append(expansion)

        if expansions:
            enriched = text + " " + " ".join(expansions)
            logger.debug("synonym_expansion_applied", extra={"count": len(expansions)})
            return enriched
        return text

    def reload_synonym_map(self):
        """Force reload of synonym map on next request (called by admin portal)."""
        self._synonym_loaded = False

    # ============================================================
    # STAGE 4: INTENT CLASSIFICATION
    # ============================================================

    def _classify_intent(self, text: str, entities: List[EntityObject]) -> str:
        """Classify query intent using keyword signals and entity presence."""
        text_lower = text.lower()

        has_error_code = any(e.type == "error_code" for e in entities)
        if has_error_code:
            return "ERROR_RESOLUTION"

        if any(signal in text_lower for signal in ERROR_RESOLUTION_SIGNALS):
            return "ERROR_RESOLUTION"

        if any(signal in text_lower for signal in CONFIG_SIGNALS):
            return "CONFIG"

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
        """Determine retrieval mode: A (registry hit) > C (complex) > B (default)."""
        if entities:
            registry_result = await self._check_registry(entities)
            if registry_result:
                logger.debug("mode_a_registry_hit", extra={"entity": entities[0].value})
                return registry_result, "A"

        if self._is_mode_c(raw_message, entities, enriched_text):
            logger.debug("mode_c_complex_query")
            return None, "C"

        return None, "B"

    def _is_mode_c(
        self,
        text: str,
        entities: List[EntityObject],
        enriched_text: str,
    ) -> bool:
        """Check Mode C conditions for complex multi-source retrieval."""
        if len(text) > MODE_C_QUERY_LENGTH_THRESHOLD:
            return True

        module_entities = [e for e in entities if e.type == "module"]
        if len(module_entities) >= 3:
            return True

        text_lower = text.lower()
        if any(signal in text_lower for signal in MODE_C_SIGNALS):
            return True

        return False

    # ============================================================
    # STAGE 6: REGISTRY LOOKUP (Mode A)
    # ============================================================

    async def _check_registry(
        self, entities: List[EntityObject]
    ) -> Optional[RegistryResult]:
        """Check Known Patterns Registry for any extracted entity."""
        checkable = [e for e in entities if e.type in {"error_code", "tcode"}]
        if not checkable:
            return None

        try:
            pg_user, pg_password = await vault_client.get_postgres_credentials()
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=pg_user, password=pg_password,
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
            logger.error("registry_lookup_failed", extra={"error": str(e)})

        return None

    # ============================================================
    # STAGE 7: SEMANTIC CACHE CHECK
    # ============================================================

    async def _check_semantic_cache(
        self, enriched_text: str
    ) -> Tuple[bool, Optional[str]]:
        """Embed enriched_text with BGE and search Qdrant cache_queries collection."""
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
                logger.info("semantic_cache_hit", extra={"score": round(score, 4)})
                return True, answer

        except Exception as e:
            logger.warning("semantic_cache_check_failed", extra={"error": str(e)})

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


# ============================================================
# PUBLIC COMPATIBILITY API (QueryIntelligenceService)
# Wraps QueryIntelligenceLayer with convenience methods
# used by verification checks and external callers.
# ============================================================

from dataclasses import dataclass, field as dc_field


@dataclass
class SAPEntityResult:
    """Structured entity extraction result with typed lists."""
    error_codes: List[str] = dc_field(default_factory=list)
    t_codes: List[str] = dc_field(default_factory=list)
    document_numbers: List[str] = dc_field(default_factory=list)
    modules: List[str] = dc_field(default_factory=list)


class QueryIntelligenceService(QueryIntelligenceLayer):
    """
    Public API wrapper over QueryIntelligenceLayer.
    Adds convenience methods for entity extraction, classification,
    and full query processing with embedding.
    """

    def extract_sap_entities(self, text: str) -> SAPEntityResult:
        """Extract SAP entities and return typed lists."""
        entities = self._extract_entities(text)
        result = SAPEntityResult()
        for e in entities:
            if e.type == "error_code":
                result.error_codes.append(e.value)
            elif e.type == "tcode":
                result.t_codes.append(e.value)
            elif e.type == "document_number":
                result.document_numbers.append(e.value)
            elif e.type == "module":
                result.modules.append(e.value)
        return result

    def classify_complexity(self, query: str) -> int:
        """Classify query complexity tier: 1 (simple) or 2 (complex)."""
        entities = self._extract_entities(query)
        if self._is_mode_c(query, entities, query):
            return 2
        words = query.split()
        if len(words) > 15:
            return 2
        query_lower = query.lower()
        question_words = [w for w in ['why', 'how', 'what', 'when', 'where']
                          if w in query_lower.split()]
        if len(question_words) >= 2:
            return 2
        return 1

    async def process_query(self, query: str, session_context: dict = None) -> EnrichedQuery:
        """
        Full query processing with embedding.
        Convenience method that builds a SessionState from dict context,
        computes BGE embedding, and returns EnrichedQuery with all fields populated.
        """
        import uuid

        session_context = session_context or {}
        last_entities_raw = session_context.get("last_entities", [])
        last_entities = [
            EntityObject(type=e["type"], value=e["value"]) for e in last_entities_raw
        ]
        session = SessionState(
            user_id_hash="process_query_caller",
            created_at="",
            last_entities=last_entities,
        )

        await self._ensure_synonym_map_loaded()

        entities = self._extract_entities(query)
        context_entity = self._resolve_context(query, entities, session)
        if context_entity and not entities:
            entities = [context_entity]

        enriched_text = self._expand_synonyms(query)
        classification = self._classify_intent(query, entities)
        complexity_tier = self.classify_complexity(query)

        registry_result, retrieval_mode = await self._assign_mode(
            query, entities, enriched_text
        )

        # Compute BGE embedding
        query_embedding: List[float] = []
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                embed_resp = await client.post(
                    f"{BGE_SERVICE_URL}/embed-single",
                    json={"text": enriched_text},
                )
                embed_resp.raise_for_status()
                query_embedding = embed_resp.json()["embedding"]
        except Exception as e:
            logger.warning("bge_embedding_failed_in_process_query", extra={"error": str(e)})

        cache_hit, cached_answer = False, None
        if query_embedding:
            try:
                from app.infrastructure.qdrant_client import qdrant_client as qc
                cache_result = await qc.search_cache(query_embedding)
                if cache_result:
                    cache_hit = True
                    cached_answer = cache_result["payload"].get("answer_text", "")
            except Exception:
                pass

        trace_id = str(uuid.uuid4())
        return EnrichedQuery(
            raw_message=query,
            enriched_text=enriched_text,
            entities=entities,
            context_entity=context_entity,
            retrieval_mode=retrieval_mode,
            classification=classification,
            registry_result=registry_result,
            session_id="",
            trace_id=trace_id,
            cache_hit=cache_hit,
            cached_answer=cached_answer,
            original_query=query,
            query_embedding=query_embedding,
            complexity_tier=complexity_tier,
        )

    def expand_synonyms(self, text: str) -> str:
        """Public synonym expansion."""
        return self._expand_synonyms(text)

    async def determine_mode(
        self, query: str, error_codes: List[str], t_codes: List[str]
    ) -> str:
        """Determine retrieval mode from query and entity lists."""
        entities: List[EntityObject] = []
        for code in error_codes:
            entities.append(EntityObject(type="error_code", value=code))
        for code in t_codes:
            entities.append(EntityObject(type="tcode", value=code))
        _, mode = await self._assign_mode(query, entities, query)
        return mode

    def resolve_context(self, message: str, session_ctx: dict) -> Optional[dict]:
        """Resolve context from session context dict."""
        last_entities_raw = session_ctx.get("last_entities", [])
        last_entities = [
            EntityObject(type=e["type"], value=e["value"]) for e in last_entities_raw
        ]
        session = SessionState(
            user_id_hash="context_resolver",
            created_at="",
            last_entities=last_entities,
        )
        result = self._resolve_context(message, [], session)
        if result:
            return {"type": result.type, "value": result.value}
        return None


# Singleton instances
query_intelligence = QueryIntelligenceLayer()
query_intelligence_service = QueryIntelligenceService()
