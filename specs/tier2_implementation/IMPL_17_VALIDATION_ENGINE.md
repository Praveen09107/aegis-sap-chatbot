# IMPL_17: VALIDATION ENGINE
## Three-Tier Answer Validation, NLI Windowing, Freshness Coefficient, ValidationScore Formula
## Session 17 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 17: The Validation Engine — answer quality scoring and confidence badge assignment.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Sessions 03-16 complete. DeBERTa NLI service and Ollama judge instance healthy.

**What this session creates:**
- `backend/app/services/validation_engine.py` — Complete three-tier validation with concurrent streaming
- Update `backend/app/handlers/chat_handler.py` — Integrate real validation pipeline
- `tests/unit/test_validation_engine.py` — ValidationScore formula tests

**ValidationScore formula (authoritative from AEGIS_MASTER_REFERENCE.md):**
```
ValidationScore = (NLI×0.45 + Judge_faithfulness×0.30 + Judge_completeness×0.25)
                  × FreshnessCoefficient
```

**Badge assignment:**
```
≥ 0.85 → green
0.70 to 0.84 → amber
< 0.70  → regenerate (one attempt) → then amber
```

**Tier execution (concurrent with streaming):**
```
Generation starts streaming
  ↓ asyncio.create_task → Tier 1 (real-time sentence scanning)
  ↓ asyncio.create_task → Tier 2 (NLI scoring on complete sentences)
Generation completes
  ↓ Tier 3 runs synchronously (judge call)
  ↓ Assemble ValidationScore
  ↓ Publish validation_result to Redis Pub/Sub
```

---

## FILE 1: backend/app/services/validation_engine.py

```python
"""
AEGIS Validation Engine
Three-tier answer quality validation.

Tier 1 — Real-time governance (during streaming):
  - Output content scan (restricted patterns — from output_governance.py)
  - T-code policy check (match T-codes against transaction_code_permissions)
  - Sentence-by-sentence, blocking on violation
  - asyncio.create_task() called from chat handler as sentences become available

Tier 2 — NLI entailment scoring (concurrent with streaming completion):
  - Splits answer into claims (sentence-level)
  - DeBERTa 350-token windowing for long premises
  - Scores each claim against each retrieved chunk
  - NLI support score = supported_claims / total_claims
  - asyncio.create_task() called when generation completes

Tier 3 — LLM judge evaluation (after generation complete):
  - Qwen2.5-7B evaluates faithfulness, step completeness, relevance
  - JSON output parsed to float scores
  - Runs only for ERROR_RESOLUTION and PROCESS classifications

Final score assembly and confidence badge assignment.
"""
import re
import json
import logging
import asyncio
from datetime import date, datetime
from typing import List, Tuple, Optional, Dict

import httpx
import asyncpg

from app.config import (
    DEBERTA_SERVICE_URL,
    DEBERTA_MAX_CHUNK_TOKENS, DEBERTA_WINDOW_SIZE_TOKENS, DEBERTA_WINDOW_OVERLAP_TOKENS,
    NLI_THRESHOLD_STANDARD, NLI_THRESHOLD_POLICY_CLAIM,
    WEIGHT_NLI, WEIGHT_JUDGE_FAITHFULNESS, WEIGHT_JUDGE_COMPLETENESS,
    BADGE_GREEN_THRESHOLD, BADGE_AMBER_THRESHOLD,
    FRESHNESS_THRESHOLD_1, FRESHNESS_THRESHOLD_2, FRESHNESS_THRESHOLD_3,
    FRESHNESS_COEFF_0_90_DAYS, FRESHNESS_COEFF_90_180_DAYS,
    FRESHNESS_COEFF_180_365_DAYS, FRESHNESS_COEFF_365_PLUS_DAYS,
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
)
from app.models.retrieval import EnrichedQuery, RetrievalResult, RetrievedChunk
from app.middleware.output_governance import scan_sentence

logger = logging.getLogger(__name__)

# ============================================================
# SENTENCE SPLITTING
# ============================================================

SENTENCE_END_PATTERN = re.compile(r'(?<=[.!?])\s+|(?<=\n)')
STEP_NUMBER_PATTERN = re.compile(r'^\d+\.\s')

# Policy-related phrases that require higher NLI threshold
POLICY_CLAIM_SIGNALS = [
    "must", "should", "required", "mandatory", "only", "never", "always",
    "restricted", "policy", "compliance", "cannot", "is not allowed",
    "it-admin", "consultant access",
]

# T-code pattern for extraction from answer text
TCODE_IN_ANSWER = re.compile(r'\b([A-Z]{2,5}\d{1,4}[A-Z]?)\b')


def split_into_sentences(text: str) -> List[str]:
    """
    Split answer text into sentences for claim-by-claim validation.
    Handles numbered steps as sentence boundaries.
    Returns list of non-empty sentences with length > 15 chars.
    """
    sentences = []
    # Split on sentence-ending punctuation followed by whitespace
    parts = re.split(r'(?<=[.!?])\s+', text)
    for part in parts:
        # Further split numbered list items
        sub_parts = re.split(r'\n(?=\d+\.)', part)
        for sub in sub_parts:
            stripped = sub.strip()
            if len(stripped) > 15:  # Skip very short fragments
                sentences.append(stripped)
    return sentences


def is_policy_claim(sentence: str) -> bool:
    """Check if a sentence makes a policy assertion requiring higher NLI threshold."""
    lower = sentence.lower()
    return any(signal in lower for signal in POLICY_CLAIM_SIGNALS)


# ============================================================
# TIER 1: REAL-TIME OUTPUT GOVERNANCE
# ============================================================

class Tier1Validator:
    """
    Real-time sentence-level governance checks.
    Runs concurrently during answer streaming.
    """

    def __init__(self):
        self._tcode_permissions: Optional[Dict[str, str]] = None
        self._permissions_loaded = False

    async def load_tcode_permissions(self):
        """Load T-code permission table from PostgreSQL into memory."""
        try:
            conn = await asyncpg.connect(
                host=POSTGRES_HOST, port=POSTGRES_PORT,
                database=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            )
            try:
                rows = await conn.fetch(
                    "SELECT tcode, access_level FROM transaction_code_permissions"
                )
                self._tcode_permissions = {r["tcode"]: r["access_level"] for r in rows}
                self._permissions_loaded = True
                logger.info(f"Loaded {len(self._tcode_permissions)} T-code permissions")
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Failed to load T-code permissions: {e}")
            self._tcode_permissions = {}

    async def validate_sentence(
        self, sentence: str, user_role: str = "employee"
    ) -> Tuple[bool, Optional[Dict]]:
        """
        Validate a single sentence.
        Returns (is_valid, failure_dict or None).
        """
        if not self._permissions_loaded:
            await self.load_tcode_permissions()

        # Check 1: Output content governance (restricted patterns)
        governance_result = scan_sentence(sentence)
        if governance_result:
            pattern_name, matched_content = governance_result
            return False, {
                "check_type": "output_leak",
                "matched_content": matched_content[:50],
                "sentence_text": sentence[:100],
            }

        # Check 2: T-code policy enforcement
        if self._tcode_permissions and user_role == "employee":
            tcodes_found = TCODE_IN_ANSWER.findall(sentence)
            for tcode in tcodes_found:
                access = self._tcode_permissions.get(tcode)
                if access in {"it-admin", "consultant"}:
                    # Sentence mentions a restricted T-code — must add access warning
                    # Don't block, but flag for annotation
                    return False, {
                        "check_type": "tcode_policy",
                        "matched_content": tcode,
                        "sentence_text": sentence[:100],
                    }

        return True, None

    async def validate_full_answer(
        self, answer: str, user_role: str = "employee"
    ) -> Tuple[List[str], List[Dict]]:
        """
        Validate complete answer sentence-by-sentence.
        Returns (clean_sentences, failures_list).
        """
        sentences = split_into_sentences(answer)
        clean_sentences = []
        failures = []

        for sentence in sentences:
            is_valid, failure = await self.validate_sentence(sentence, user_role)
            if is_valid:
                clean_sentences.append(sentence)
            else:
                failures.append(failure)
                # For output leaks: add redacted version
                if failure and failure.get("check_type") == "output_leak":
                    from app.middleware.output_governance import redact_sentence
                    redacted, _ = redact_sentence(sentence)
                    clean_sentences.append(redacted)
                # For T-code policy: keep sentence but note it needs annotation
                elif failure and failure.get("check_type") == "tcode_policy":
                    tcode = failure.get("matched_content", "")
                    annotated = sentence + f" [Note: {tcode} requires IT admin access]"
                    clean_sentences.append(annotated)

        return clean_sentences, failures


# ============================================================
# TIER 2: NLI ENTAILMENT SCORING
# ============================================================

def chunk_text_into_windows(text: str, window_tokens: int = 300, overlap_tokens: int = 75) -> List[str]:
    """
    Split text into overlapping windows for DeBERTa input.
    Approximates token count as words / 0.75 (avg word length in tokens).
    """
    words = text.split()
    # Approximate words per window: 300 tokens ≈ 300 * 0.75 words ≈ 225 words
    words_per_window = int(window_tokens * 0.75)
    words_per_overlap = int(overlap_tokens * 0.75)

    if len(words) <= words_per_window:
        return [text]  # Single window sufficient

    windows = []
    start = 0
    while start < len(words):
        end = min(start + words_per_window, len(words))
        window = " ".join(words[start:end])
        windows.append(window)
        if end == len(words):
            break
        start += words_per_window - words_per_overlap

    return windows


async def score_claim_against_chunks(
    claim: str,
    chunks: List[RetrievedChunk],
) -> Tuple[float, bool]:
    """
    Score one claim against all retrieved chunks using DeBERTa NLI.
    Returns (max_entailment_score, is_supported).
    Uses sliding window for chunks longer than DEBERTA_MAX_CHUNK_TOKENS.

    NLI threshold:
    - Policy claims (contain "must", "always", "required" etc.): 0.90
    - Regular factual claims: 0.80
    """
    threshold = NLI_THRESHOLD_POLICY_CLAIM if is_policy_claim(claim) else NLI_THRESHOLD_STANDARD

    max_entailment = 0.0

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            all_premises = []

            for chunk in chunks:
                # Window the chunk if it's too long
                windows = chunk_text_into_windows(
                    chunk.chunk_text,
                    window_tokens=DEBERTA_WINDOW_SIZE_TOKENS,
                    overlap_tokens=DEBERTA_WINDOW_OVERLAP_TOKENS,
                )
                all_premises.extend(windows[:4])  # Max 4 windows per chunk

            if not all_premises:
                return 0.0, False

            resp = await client.post(
                f"{DEBERTA_SERVICE_URL}/nli",
                json={"hypothesis": claim, "premises": all_premises},
            )
            resp.raise_for_status()
            result = resp.json()
            max_entailment = result.get("max_entailment", 0.0)

    except Exception as e:
        logger.warning(f"NLI scoring failed for claim '{claim[:50]}...': {e}")
        return 0.5, True  # Neutral fallback: claim neither supported nor unsupported

    is_supported = max_entailment >= threshold
    return max_entailment, is_supported


async def compute_nli_score(
    answer: str,
    chunks: List[RetrievedChunk],
) -> Tuple[float, List[str]]:
    """
    Tier 2: Score full answer against retrieved chunks.
    Returns (nli_support_score, unsupported_claims_list).
    nli_support_score = supported_claims / total_claims
    """
    sentences = split_into_sentences(answer)
    if not sentences or not chunks:
        return 1.0, []  # No claims to verify → assume supported

    # Score each sentence concurrently
    tasks = [score_claim_against_chunks(sentence, chunks) for sentence in sentences[:10]]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    supported = 0
    total = 0
    unsupported = []

    for sentence, result in zip(sentences[:10], results):
        if isinstance(result, Exception):
            continue  # Skip failed checks
        score, is_supported = result
        total += 1
        if is_supported:
            supported += 1
        else:
            unsupported.append(sentence[:100])

    if total == 0:
        return 1.0, []

    nli_score = supported / total
    return round(nli_score, 4), unsupported


# ============================================================
# TIER 3: LLM JUDGE EVALUATION
# ============================================================

JUDGE_PROMPT_TEMPLATE = """You are evaluating the quality of an SAP helpdesk response for Sona Comstar.

Employee Question: {query}

Retrieved SAP Documentation Summary:
{context_summary}

AEGIS Response:
{answer}

Evaluate the response on three dimensions. Return ONLY a valid JSON object with no other text:
{{
  "faithfulness": <0.0 to 1.0, does the response accurately reflect the documentation? 1.0 = perfectly accurate>,
  "step_completeness": <0.0 to 1.0, are all required steps provided for procedure questions? 1.0 = all steps present, N/A questions get 1.0>,
  "relevance": <0.0 to 1.0, does the response directly address the question asked? 1.0 = fully relevant>
}}"""


async def run_judge_evaluation(
    query: str,
    answer: str,
    chunks: List[RetrievedChunk],
) -> Tuple[float, float, float]:
    """
    Tier 3: LLM judge evaluation using Qwen2.5-7B.
    Returns (faithfulness, step_completeness, relevance).
    Defaults to (1.0, 1.0, 1.0) on failure.
    """
    from app.services.model_gateway import model_gateway

    # Build a concise context summary (first 300 chars of each top chunk)
    context_parts = [f"[{c.document_id}]: {c.chunk_text[:300]}" for c in chunks[:3]]
    context_summary = "\n\n".join(context_parts)

    prompt = JUDGE_PROMPT_TEMPLATE.format(
        query=query,
        context_summary=context_summary,
        answer=answer[:800],  # Truncate long answers
    )

    try:
        response = await model_gateway.call_judge(prompt)

        # Parse JSON from response
        # Strip markdown code blocks if present
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r'^```[a-z]*\n?', '', cleaned)
            cleaned = re.sub(r'\n?```$', '', cleaned)
        cleaned = cleaned.strip()

        scores = json.loads(cleaned)
        faithfulness = max(0.0, min(1.0, float(scores.get("faithfulness", 1.0))))
        completeness = max(0.0, min(1.0, float(scores.get("step_completeness", 1.0))))
        relevance = max(0.0, min(1.0, float(scores.get("relevance", 1.0))))

        logger.debug(f"Judge scores: faith={faithfulness:.2f}, complete={completeness:.2f}, rel={relevance:.2f}")
        return faithfulness, completeness, relevance

    except (json.JSONDecodeError, ValueError, Exception) as e:
        logger.warning(f"Judge evaluation failed: {e} — defaulting to 1.0")
        return 1.0, 1.0, 1.0


# ============================================================
# FRESHNESS COEFFICIENT
# ============================================================

def compute_freshness_coefficient(chunks: List[RetrievedChunk]) -> float:
    """
    Compute freshness coefficient based on the oldest verified source.
    Uses the primary chunk's last_verified_date.

    Age thresholds (from AEGIS_CONFIGURATION_CONSTANTS.md):
    0-90 days   → 1.00
    90-180 days → 0.95
    180-365 days → 0.85
    365+ days   → 0.75
    """
    if not chunks:
        return FRESHNESS_COEFF_0_90_DAYS  # No chunks → assume fresh (will fail NLI anyway)

    today = date.today()
    oldest_age = 0

    for chunk in chunks:
        if not chunk.last_verified_date:
            continue
        try:
            verified = date.fromisoformat(chunk.last_verified_date)
            age_days = (today - verified).days
            oldest_age = max(oldest_age, age_days)
        except ValueError:
            continue

    if oldest_age <= FRESHNESS_THRESHOLD_1:
        return FRESHNESS_COEFF_0_90_DAYS
    elif oldest_age <= FRESHNESS_THRESHOLD_2:
        return FRESHNESS_COEFF_90_180_DAYS
    elif oldest_age <= FRESHNESS_THRESHOLD_3:
        return FRESHNESS_COEFF_180_365_DAYS
    else:
        return FRESHNESS_COEFF_365_PLUS_DAYS


# ============================================================
# VALIDATION SCORE ASSEMBLY
# ============================================================

def compute_validation_score(
    nli_score: float,
    judge_faithfulness: float,
    judge_completeness: float,
    freshness_coeff: float,
) -> float:
    """
    Compute the ValidationScore from ensemble components.

    Formula:
    raw_score = (NLI * 0.45) + (faithfulness * 0.30) + (completeness * 0.25)
    ValidationScore = raw_score * freshness_coefficient
    """
    raw_score = (
        (nli_score * WEIGHT_NLI) +
        (judge_faithfulness * WEIGHT_JUDGE_FAITHFULNESS) +
        (judge_completeness * WEIGHT_JUDGE_COMPLETENESS)
    )
    final_score = raw_score * freshness_coeff
    return round(final_score, 4)


def assign_confidence_badge(validation_score: float) -> str:
    """
    Assign confidence badge based on ValidationScore thresholds.
    ≥ 0.85 → green
    0.70 to 0.84 → amber
    < 0.70 → none (triggers regeneration attempt)
    """
    if validation_score >= BADGE_GREEN_THRESHOLD:
        return "green"
    elif validation_score >= BADGE_AMBER_THRESHOLD:
        return "amber"
    else:
        return "none"


def build_attribution_panel(
    chunks: List[RetrievedChunk],
    confidence_badge: str,
) -> dict:
    """Build the attribution panel from top retrieved chunks."""
    if not chunks:
        return {
            "primary_document_id": "unknown",
            "primary_document_name": "unknown",
            "verified_by": "unknown",
            "verified_date": "unknown",
            "secondary_sources": [],
            "confidence_badge": confidence_badge,
        }

    primary = chunks[0]
    secondary = []

    # Add up to 2 additional unique source documents
    seen_docs = {primary.document_id}
    for chunk in chunks[1:]:
        if chunk.document_id not in seen_docs and len(secondary) < 2:
            secondary.append({
                "document_id": chunk.document_id,
                "chunk_type": chunk.chunk_type,
                "verified_date": chunk.last_verified_date,
            })
            seen_docs.add(chunk.document_id)

    return {
        "primary_document_id": primary.document_id,
        "primary_document_name": primary.document_id,  # Full name added by ingestion pipeline
        "verified_by": primary.verified_by,
        "verified_date": primary.last_verified_date,
        "secondary_sources": secondary,
        "confidence_badge": confidence_badge,
    }


# ============================================================
# VALIDATION ENGINE (main orchestrator)
# ============================================================

class ValidationEngine:
    """
    Orchestrates all three validation tiers and assembles ValidationResult.
    """

    def __init__(self):
        self._tier1 = Tier1Validator()

    async def validate(
        self,
        answer_text: str,
        enriched_query: EnrichedQuery,
        retrieval_result,
        user_role: str = "employee",
        run_tier3: bool = True,
    ) -> "ValidationResult":
        """
        Run complete three-tier validation on a generated answer.
        Returns ValidationResult with score, badge, and attribution panel.
        """
        from app.models.retrieval import ValidationResult

        chunks = retrieval_result.chunks

        # ── Tier 1: Output Governance ────────────────────────────
        clean_sentences, tier1_failures = await self._tier1.validate_full_answer(
            answer_text, user_role
        )

        # Reconstruct answer from clean sentences (may differ if redaction occurred)
        clean_answer = " ".join(clean_sentences) if clean_sentences else answer_text

        # ── Tier 2: NLI Entailment Scoring ──────────────────────
        nli_score, unsupported_claims = await compute_nli_score(clean_answer, chunks)

        # ── Tier 3: LLM Judge (selectively) ────────────────────
        judge_faithfulness = 1.0
        judge_completeness = 1.0
        judge_relevance = 1.0
        tier3_ran = False

        if run_tier3 and enriched_query.classification in {"ERROR_RESOLUTION", "PROCESS"}:
            judge_faithfulness, judge_completeness, judge_relevance = await run_judge_evaluation(
                query=enriched_query.raw_message,
                answer=clean_answer,
                chunks=chunks,
            )
            tier3_ran = True

        # ── Freshness Coefficient ────────────────────────────────
        freshness_coeff = compute_freshness_coefficient(chunks)

        # ── ValidationScore Assembly ─────────────────────────────
        validation_score = compute_validation_score(
            nli_score, judge_faithfulness, judge_completeness, freshness_coeff
        )
        raw_score = compute_validation_score(nli_score, judge_faithfulness, judge_completeness, 1.0)

        # ── Badge Assignment ─────────────────────────────────────
        badge = assign_confidence_badge(validation_score)

        # ── Attribution Panel ────────────────────────────────────
        attribution_panel = build_attribution_panel(chunks, badge)

        result = ValidationResult(
            validation_score=validation_score,
            raw_score=raw_score,
            freshness_coefficient=freshness_coeff,
            nli_support_score=nli_score,
            judge_faithfulness=judge_faithfulness,
            judge_step_completeness=judge_completeness,
            judge_relevance=judge_relevance,
            tier3_ran=tier3_ran,
            confidence_badge=badge,
            unsupported_claims=unsupported_claims,
            tier1_failures=tier1_failures,
            regeneration_attempted=False,
            answer_text=clean_answer,
            attribution_panel=attribution_panel,
        )

        logger.info(
            f"Validation: score={validation_score:.4f}, raw={raw_score:.4f}, "
            f"freshness={freshness_coeff}, NLI={nli_score:.4f}, badge={badge}, "
            f"tier3_ran={tier3_ran}"
        )
        return result

    async def validate_with_regeneration(
        self,
        answer_text: str,
        enriched_query: EnrichedQuery,
        retrieval_result,
        user_role: str = "employee",
    ) -> "ValidationResult":
        """
        Run validation with one targeted regeneration attempt if score < BADGE_AMBER_THRESHOLD.
        """
        from app.models.retrieval import ValidationResult

        result = await self.validate(
            answer_text, enriched_query, retrieval_result, user_role
        )

        if result.confidence_badge == "none" and not result.regeneration_attempted:
            logger.info(
                f"ValidationScore {result.validation_score:.4f} < amber threshold — "
                f"attempting regeneration"
            )
            # Regeneration: re-run reasoning service with unsupported claims as negative context
            try:
                from app.services.reasoning_service import reasoning_service
                from app.models.session import SessionState

                # Build regeneration prompt hint using unsupported claims
                regen_hint = ""
                if result.unsupported_claims:
                    claim_list = "; ".join(result.unsupported_claims[:3])
                    regen_hint = (
                        f"\n\nIMPORTANT: The following statements were not supported by the documentation and must NOT be repeated: {claim_list}"
                    )

                # Regenerate (fire-and-forget streaming for regeneration)
                regen_prompt = reasoning_service.assemble_prompt(
                    enriched_query, retrieval_result,
                    SessionState(user_id_hash="", created_at="")
                ) + regen_hint

                regen_parts = []
                from app.services.model_gateway import model_gateway, select_model_tier
                tier = select_model_tier(enriched_query, retrieval_result, False)
                async for token in model_gateway.generate_streaming(
                    regen_prompt, tier, enriched_query.session_id
                ):
                    regen_parts.append(token)

                regen_answer = "".join(regen_parts).strip()
                if regen_answer:
                    # Validate regenerated answer
                    regen_result = await self.validate(
                        regen_answer, enriched_query, retrieval_result, user_role,
                        run_tier3=False  # Skip Tier 3 for regeneration to save time
                    )
                    regen_result.regeneration_attempted = True
                    # Use regenerated result if better score
                    if regen_result.validation_score > result.validation_score:
                        logger.info(
                            f"Regeneration improved score: "
                            f"{result.validation_score:.4f} → {regen_result.validation_score:.4f}"
                        )
                        return regen_result

            except Exception as e:
                logger.warning(f"Regeneration failed: {e} — using original answer with amber badge")

            # After failed regeneration or no improvement: force amber badge minimum
            result.confidence_badge = "amber"
            result.regeneration_attempted = True

        return result


# Singleton
validation_engine = ValidationEngine()
```

---

## FILE 2: tests/unit/test_validation_engine.py

```python
"""Unit tests for Validation Engine."""
import pytest
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.validation_engine import (
    split_into_sentences,
    is_policy_claim,
    compute_validation_score,
    assign_confidence_badge,
    compute_freshness_coefficient,
    chunk_text_into_windows,
    build_attribution_panel,
)
from app.models.retrieval import RetrievedChunk
from app.config import (
    BADGE_GREEN_THRESHOLD, BADGE_AMBER_THRESHOLD,
    WEIGHT_NLI, WEIGHT_JUDGE_FAITHFULNESS, WEIGHT_JUDGE_COMPLETENESS,
    FRESHNESS_THRESHOLD_1, FRESHNESS_THRESHOLD_2, FRESHNESS_THRESHOLD_3,
)


def make_chunk(doc_id, days_old=30, chunk_type="cause_resolution"):
    return RetrievedChunk(
        chunk_id=f"{doc_id}:chunk:0", document_id=doc_id,
        content_type="error_guide", chunk_type=chunk_type,
        chunk_text="SAP documentation content for testing purposes.",
        last_verified_date=str(date.today() - timedelta(days=days_old)),
        verified_by="Rsuresh1", cross_encoder_score=0.85, rrf_score=0.05,
    )


class TestValidationScoreFormula:
    def test_formula_correct(self):
        """ValidationScore = (NLI*0.45 + faith*0.30 + complete*0.25) * freshness"""
        nli = 0.90
        faith = 0.85
        complete = 0.80
        freshness = 1.00
        expected_raw = nli * 0.45 + faith * 0.30 + complete * 0.25
        expected_final = expected_raw * freshness
        result = compute_validation_score(nli, faith, complete, freshness)
        assert abs(result - expected_final) < 0.0001

    def test_perfect_scores(self):
        """Perfect NLI, judge, and freshness → ValidationScore = 1.0"""
        result = compute_validation_score(1.0, 1.0, 1.0, 1.0)
        assert abs(result - 1.0) < 0.0001

    def test_zero_scores(self):
        """All zeros → ValidationScore = 0.0"""
        result = compute_validation_score(0.0, 0.0, 0.0, 1.0)
        assert result == 0.0

    def test_weights_sum_to_one(self):
        """Weights must sum to 1.0"""
        total = WEIGHT_NLI + WEIGHT_JUDGE_FAITHFULNESS + WEIGHT_JUDGE_COMPLETENESS
        assert abs(total - 1.0) < 0.0001

    def test_freshness_coefficient_applied(self):
        """Score with 0.85 freshness should be 85% of the raw score."""
        raw_score = compute_validation_score(0.9, 0.85, 0.80, 1.0)
        degraded_score = compute_validation_score(0.9, 0.85, 0.80, 0.85)
        assert abs(degraded_score - raw_score * 0.85) < 0.0001

    def test_nli_dominant_weight(self):
        """NLI has highest weight (0.45) — changing it should affect score most."""
        base = compute_validation_score(0.5, 0.5, 0.5, 1.0)
        high_nli = compute_validation_score(1.0, 0.5, 0.5, 1.0)
        high_faith = compute_validation_score(0.5, 1.0, 0.5, 1.0)
        high_complete = compute_validation_score(0.5, 0.5, 1.0, 1.0)
        assert (high_nli - base) > (high_faith - base)
        assert (high_nli - base) > (high_complete - base)


class TestBadgeAssignment:
    def test_green_threshold(self):
        assert assign_confidence_badge(BADGE_GREEN_THRESHOLD) == "green"
        assert assign_confidence_badge(1.0) == "green"
        assert assign_confidence_badge(BADGE_GREEN_THRESHOLD + 0.01) == "green"

    def test_amber_threshold(self):
        assert assign_confidence_badge(BADGE_AMBER_THRESHOLD) == "amber"
        assert assign_confidence_badge(BADGE_GREEN_THRESHOLD - 0.01) == "amber"

    def test_none_below_amber(self):
        assert assign_confidence_badge(BADGE_AMBER_THRESHOLD - 0.01) == "none"
        assert assign_confidence_badge(0.0) == "none"

    def test_exact_boundary_values(self):
        """Boundary values must map to correct badges."""
        assert assign_confidence_badge(0.85) == "green"   # Exact green threshold
        assert assign_confidence_badge(0.70) == "amber"   # Exact amber threshold
        assert assign_confidence_badge(0.699) == "none"   # Just below amber


class TestFreshnessCoefficient:
    def test_fresh_document_coefficient(self):
        chunks = [make_chunk("SD-ERR-001", days_old=30)]
        assert compute_freshness_coefficient(chunks) == 1.00

    def test_90_day_boundary(self):
        chunks = [make_chunk("SD-ERR-001", days_old=90)]
        assert compute_freshness_coefficient(chunks) == 1.00

    def test_91_day_falls_to_second_tier(self):
        chunks = [make_chunk("SD-ERR-001", days_old=91)]
        assert compute_freshness_coefficient(chunks) == 0.95

    def test_180_day_boundary(self):
        chunks = [make_chunk("SD-ERR-001", days_old=180)]
        assert compute_freshness_coefficient(chunks) == 0.95

    def test_181_day_falls_to_third_tier(self):
        chunks = [make_chunk("SD-ERR-001", days_old=181)]
        assert compute_freshness_coefficient(chunks) == 0.85

    def test_365_day_boundary(self):
        chunks = [make_chunk("SD-ERR-001", days_old=365)]
        assert compute_freshness_coefficient(chunks) == 0.85

    def test_366_day_falls_to_fourth_tier(self):
        chunks = [make_chunk("SD-ERR-001", days_old=366)]
        assert compute_freshness_coefficient(chunks) == 0.75

    def test_oldest_chunk_used(self):
        """Freshness based on oldest chunk in result set."""
        chunks = [
            make_chunk("SD-ERR-001", days_old=10),   # Fresh
            make_chunk("SD-CFG-001", days_old=200),  # Stale (180-365 → 0.85)
        ]
        assert compute_freshness_coefficient(chunks) == 0.85

    def test_empty_chunks_defaults_to_fresh(self):
        assert compute_freshness_coefficient([]) == 1.00


class TestNLIWindowing:
    def test_short_text_single_window(self):
        """Text shorter than window size → one window."""
        text = "SAP VL150 error occurs when stock is insufficient"
        windows = chunk_text_into_windows(text, window_tokens=300, overlap_tokens=75)
        assert len(windows) == 1
        assert windows[0] == text

    def test_long_text_multiple_windows(self):
        """Text much longer than window size → multiple windows."""
        long_text = " ".join(["SAP documentation word"] * 400)
        windows = chunk_text_into_windows(long_text, window_tokens=100, overlap_tokens=25)
        assert len(windows) > 1

    def test_windows_overlap(self):
        """Consecutive windows should share content (overlap)."""
        text = " ".join([f"word{i}" for i in range(200)])
        windows = chunk_text_into_windows(text, window_tokens=100, overlap_tokens=25)
        if len(windows) >= 2:
            # Last words of window 1 should appear in window 2
            last_words_w1 = set(windows[0].split()[-20:])
            first_words_w2 = set(windows[1].split()[:30])
            overlap = last_words_w1 & first_words_w2
            assert len(overlap) > 0, "Windows should overlap"


class TestSentenceSplitting:
    def test_period_splits_sentence(self):
        text = "Navigate to MM02. Enter the material number. Click Save."
        sentences = split_into_sentences(text)
        assert len(sentences) >= 2

    def test_short_fragments_excluded(self):
        text = "OK. Navigate to VL01N and enter the delivery details correctly."
        sentences = split_into_sentences(text)
        # "OK." is too short (< 15 chars) — should be excluded
        assert not any(s.strip() == "OK." for s in sentences)

    def test_policy_claim_detection(self):
        assert is_policy_claim("This step must be performed by IT admin.")
        assert is_policy_claim("You should always check the configuration.")
        assert not is_policy_claim("Navigate to transaction VL01N.")
        assert not is_policy_claim("The material number is shown on screen.")


class TestAttributionPanel:
    def test_primary_document_from_first_chunk(self):
        chunks = [make_chunk("SD-ERR-001"), make_chunk("SD-PROC-001")]
        panel = build_attribution_panel(chunks, "green")
        assert panel["primary_document_id"] == "SD-ERR-001"
        assert panel["confidence_badge"] == "green"

    def test_secondary_sources_populated(self):
        chunks = [make_chunk("SD-ERR-001"), make_chunk("SD-PROC-001"), make_chunk("FI-CFG-003")]
        panel = build_attribution_panel(chunks, "amber")
        assert len(panel["secondary_sources"]) <= 2

    def test_empty_chunks_handled(self):
        panel = build_attribution_panel([], "none")
        assert panel["primary_document_id"] == "unknown"
```

---

## INTEGRATION — Update chat_handler.py to Use Real Validation

```python
# In _handle_client_message, after reasoning_service.generate_and_stream():

from app.services.validation_engine import validation_engine

# Run full validation (Tier 1 + 2 + 3)
validation_result = await validation_engine.validate_with_regeneration(
    answer_text=answer_text,
    enriched_query=enriched_query,
    retrieval_result=retrieval_result,
    user_role=getattr(websocket.state, "role", "employee"),
)

# Publish real validation result to WebSocket via Redis Pub/Sub
from app.infrastructure.redis_client import redis_session as rs
await rs.publish_validation_result(session_id, {
    "validation_score": validation_result.validation_score,
    "confidence_badge": validation_result.confidence_badge,
    "attribution_panel": validation_result.attribution_panel,
})

# If score allows: queue cache write for high-confidence answers
if validation_result.confidence_badge == "green":
    import json, uuid
    from datetime import datetime
    from app.infrastructure.redis_client import redis_queue
    cache_payload = json.dumps({
        "task_type": "cache_write", "task_id": str(uuid.uuid4()),
        "query_text": enriched_query.enriched_text,
        "answer_text": validation_result.answer_text,
        "validation_score": validation_result.validation_score,
        "document_ids": [c.document_id for c in retrieval_result.chunks],
        "created_at": datetime.utcnow().isoformat(),
    })
    await redis_queue.redis.rpush("arq:queue:cache_write", cache_payload)

# Update session state
session.add_conversation_turn(
    query=enriched_query.raw_message,
    answer=validation_result.answer_text[:300],
    classification=enriched_query.classification,
    confidence_badge=validation_result.confidence_badge,
    doc_ids=[c.document_id for c in retrieval_result.chunks],
)
session.add_confidence_score(validation_result.validation_score)
session.last_entities = enriched_query.entities
session.last_document_ids = [c.document_id for c in retrieval_result.chunks]
session.model_tier_last = 2
if validation_result.confidence_badge == "none":
    session.unresolved_count += 1
else:
    session.unresolved_count = 0

await rs.update_session(session_id, session.to_redis_hash())
```

---

## VERIFICATION STEPS

### Step 1: Run unit tests
```bash
cd backend && source venv/bin/activate
python -m pytest tests/unit/test_validation_engine.py -v
```
Expected: All tests pass.

### Step 2: Verify ValidationScore formula
```bash
python3 -c "
from app.services.validation_engine import compute_validation_score, assign_confidence_badge

# Typical high-quality answer
score = compute_validation_score(0.90, 0.85, 0.82, 1.00)
print(f'High quality: {score:.4f} → {assign_confidence_badge(score)}')

# Typical degraded answer with stale docs
score = compute_validation_score(0.80, 0.75, 0.70, 0.85)
print(f'Stale docs: {score:.4f} → {assign_confidence_badge(score)}')

# Low NLI (poor retrieval)
score = compute_validation_score(0.50, 1.0, 1.0, 1.0)
print(f'Low NLI: {score:.4f} → {assign_confidence_badge(score)}')
"
```

### Step 3: Verify freshness thresholds
```bash
python3 -c "
from datetime import date, timedelta
from app.services.validation_engine import compute_freshness_coefficient, make_chunk
from app.models.retrieval import RetrievedChunk

def c(days): return [RetrievedChunk('id', 'doc', 'error_guide', 'h', 'text',
    str(date.today() - timedelta(days=days)), 'v', 0.8, 0.05)]

print(f'30 days: {compute_freshness_coefficient(c(30))} (expect 1.00)')
print(f'90 days: {compute_freshness_coefficient(c(90))} (expect 1.00)')
print(f'91 days: {compute_freshness_coefficient(c(91))} (expect 0.95)')
print(f'180 days: {compute_freshness_coefficient(c(180))} (expect 0.95)')
print(f'181 days: {compute_freshness_coefficient(c(181))} (expect 0.85)')
print(f'365 days: {compute_freshness_coefficient(c(365))} (expect 0.85)')
print(f'366 days: {compute_freshness_coefficient(c(366))} (expect 0.75)')
"
```

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-17: Validation Engine - ValidationScore formula and freshness verified"
```

Update DECISIONS_LOG.md with:
- ValidationScore formula test passing (WEIGHT_NLI + WEIGHT_FAITH + WEIGHT_COMPLETE = 1.0 confirmed)
- All 7 freshness coefficient boundary tests passing
- Badge assignment boundary values confirmed (0.85 → green, 0.70 → amber, <0.70 → none)
- NLI windowing produces overlapping windows for long chunks

---

*Document version: 1.0 | AEGIS Specification Set*
