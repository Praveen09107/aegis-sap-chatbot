"""Unit tests for the Quick Entry chunk quality heuristic scorer."""
from app.services.quick_entry_quality import score_chunk_quality


def test_well_formed_chunk_scores_high():
    text = (
        "ISSUE: Tax condition not capturing in Sale Order\n"
        "CAUSE 1 OF 1 [Check First]: Tax classification is maintained as exempt in the BP\n"
        "HOW TO IDENTIFY: Go to VA31 transaction and check the customer master billing tab.\n"
        "RESOLUTION: Change the tax classification as Taxable in VA31.\n"
    )
    score = score_chunk_quality(text)
    assert 0.9 <= score <= 1.0


def test_very_short_chunk_scores_low():
    score = score_chunk_quality("Just fix it now.")
    assert score < 0.65


def test_placeholder_text_penalized():
    text = "CURRENT PRODUCTION VALUES:\nCompany Code 1000:\n  Tax Code: TBD\n" * 3
    score = score_chunk_quality(text)
    assert score < 0.65


def test_score_bounded_between_zero_and_one():
    assert 0.0 <= score_chunk_quality("") <= 1.0
    assert 0.0 <= score_chunk_quality("x" * 5000) <= 1.0
