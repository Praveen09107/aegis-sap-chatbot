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
