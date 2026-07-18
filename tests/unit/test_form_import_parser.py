"""
Unit tests for the Quick Entry bulk import parser (IMPL_29 Section 7).

Written after this module's initial build turned out to have several real
bugs, all found by rigorous re-verification against real .docx uploads
(not by reading the code): content-type detection keyed on labels that
don't exist anywhere in the real frozen AEGIS_DOCUMENT_TEMPLATES.md
error_guide structure, and label-matching regexes that accidentally
matched a label name appearing as an ordinary word inside another field's
own value text. These tests pin down both the correct real-template
structure and the specific failure modes that were fixed, so they don't
regress silently.
"""
from app.services.form_import_parser import (
    detect_content_type, parse_error_guide, parse_procedure, parse_config, _extract_between,
)


class TestDetectContentType:
    def test_error_guide_detected_via_when_this_occurs(self):
        text = "ERROR_CODE: VL150\nWHEN_THIS_OCCURS: Something happens.\nCAUSE_1: Short name"
        assert detect_content_type(text) == "error_guide"

    def test_error_guide_still_detected_with_malformed_cause_block(self):
        # A malformed cause block (missing sub-labels) must not make the
        # whole document undetectable — WHEN_THIS_OCCURS lives outside it.
        text = "WHEN_THIS_OCCURS: Something happens.\nCAUSE_1: just free text, no sub-labels at all"
        assert detect_content_type(text) == "error_guide"

    def test_procedure_detected(self):
        text = "PROCEDURE_NAME: Test\nPHASE_NAME: Phase 1\nSTEP_1: Do something"
        assert detect_content_type(text) == "procedure"

    def test_config_detected(self):
        text = "CONFIGURATION_NAME: Test\nWHAT_THIS_CONTROLS: Something"
        assert detect_content_type(text) == "config"

    def test_unrecognised_text_returns_none(self):
        assert detect_content_type("Just some random unrelated text with no labels.") is None


class TestExtractBetweenLabelBoundaries:
    def test_does_not_match_label_as_substring_of_longer_label(self):
        # "DESCRIPTION" is a literal substring of "ISSUE_DESCRIPTION" —
        # confirmed live this used to falsely match there.
        text = "ISSUE_DESCRIPTION: some issue text\nWHEN_THIS_OCCURS: some occurrence text"
        assert _extract_between(text, "DESCRIPTION", ["WHEN_THIS_OCCURS"]) is None

    def test_does_not_match_label_word_inside_another_fields_value(self):
        # The word "description" can legitimately appear in ordinary prose
        # inside another field's value — confirmed live this used to
        # falsely match there once the substring bug above was fixed.
        text = "ISSUE_DESCRIPTION: issue description text here\nWHEN_THIS_OCCURS: real content"
        assert _extract_between(text, "DESCRIPTION", ["WHEN_THIS_OCCURS"]) is None

    def test_matches_real_label_at_line_start(self):
        text = "DESCRIPTION: real description content\nWHEN_THIS_OCCURS: next field"
        assert _extract_between(text, "DESCRIPTION", ["WHEN_THIS_OCCURS"]) == "real description content"


class TestParseErrorGuide:
    """Against the real frozen AEGIS_DOCUMENT_TEMPLATES.md structure, not IMPL_29's own (wrong) pseudocode."""

    def _well_formed_text(self):
        return (
            "DOCUMENT_ID: SD-ERR-001\nCONTENT_TYPE: error_guide\nMODULE: SD\n"
            "ERROR_CODE: VL150\nTRANSACTIONS: VL01N, MMBE\n"
            "WHEN_THIS_OCCURS: Employees encounter this creating an outbound delivery.\n"
            "CAUSE_1: Safety Stock Setting Too High\n"
            "CAUSE_1_HOW_TO_IDENTIFY: Check MMBE for unrestricted stock.\n"
            "CAUSE_1_RESOLUTION_STEPS: Go to MM02, reduce Safety Stock, save.\n"
            "SUCCESS_INDICATOR: The delivery number is generated.\n"
            "ADMIN_STEPS: NONE\n"
            "ESCALATION_CRITERIA: Escalate if safety stock is already zero.\n"
        )

    def test_well_formed_fields_all_parsed(self):
        parsed = parse_error_guide(self._well_formed_text())
        assert parsed["error_code"] == "VL150"
        assert parsed["when_this_occurs"] == "Employees encounter this creating an outbound delivery."
        assert parsed["success_indicator"] == "The delivery number is generated."
        assert parsed["admin_steps"] == "NONE"
        assert parsed["escalation_criteria"] == "Escalate if safety stock is already zero."

    def test_issue_description_error_message_description_never_present(self):
        # No source field exists for these anywhere in the real template —
        # they must never appear in parsed output (always left unparsed).
        parsed = parse_error_guide(self._well_formed_text())
        assert "issue_description" not in parsed
        assert "error_message" not in parsed
        assert "description" not in parsed

    def test_well_formed_cause_fully_parsed(self):
        parsed = parse_error_guide(self._well_formed_text())
        cause = parsed["causes"][0]
        assert cause["cause_description"] == "Safety Stock Setting Too High"
        assert cause["how_to_identify"] == "Check MMBE for unrestricted stock."
        assert cause["resolution_steps"] == "Go to MM02, reduce Safety Stock, save."

    def test_malformed_cause_degrades_gracefully_not_all_or_nothing(self):
        text = self._well_formed_text() + "\nCAUSE_2: malformed cause with no sub-labels at all\n"
        parsed = parse_error_guide(text)
        # Well-formed cause 1 and all top-level fields still parse correctly.
        assert parsed["error_code"] == "VL150"
        assert len(parsed["causes"]) == 2
        cause2 = parsed["causes"][1]
        assert cause2["cause_description"] == "malformed cause with no sub-labels at all"
        assert cause2["how_to_identify"] == ""
        assert cause2["resolution_steps"] == ""


class TestParseProcedure:
    def test_well_formed_fields_and_steps_parsed(self):
        text = (
            "PROCEDURE_NAME: Test Procedure\nPURPOSE: Creates a test record for verification.\n"
            "WHEN_TO_USE: Use this when testing.\nPREREQUISITES: Customer master must exist.\n"
            "TRANSACTIONS: VA31\nPHASE_NAME: Phase 1\n"
            "STEP_1: Navigate to VA31 transaction.\nSTEP_2: Enter the order type field.\n"
            "VERIFICATION_STEPS: Confirm the document number is displayed.\n"
            "COMMON_ERRORS_IN_THIS_PROCEDURE: NONE\n"
        )
        parsed = parse_procedure(text)
        assert parsed["procedure_name"] == "Test Procedure"
        assert len(parsed["steps"]) == 2
        assert parsed["steps"][0]["action"] == "Navigate to VA31 transaction."
        # verification must stop at COMMON_ERRORS_IN_THIS_PROCEDURE, not
        # bleed into it (confirmed live: a truncated end-label
        # "COMMON_ERRORS" doesn't match the real, longer field name).
        assert parsed["verification"] == "Confirm the document number is displayed."
        assert "COMMON_ERRORS" not in parsed["verification"]


class TestParseConfig:
    def test_well_formed_fields_parsed(self):
        text = (
            "CONFIGURATION_NAME: Test Config\nWHAT_THIS_CONTROLS: Controls something important.\n"
            "CHANGE_FREQUENCY: rare\nNAVIGATION: Use transaction VKOA.\n"
            "CURRENT_PRODUCTION_VALUES: Plant 1000 uses G/L account 800000.\n"
            "CHANGE_PROCESS: Requires Finance Controller approval.\nRELATED_ERRORS: NONE\n"
        )
        parsed = parse_config(text)
        assert parsed["configuration_name"] == "Test Config"
        assert parsed["change_frequency"] == "rare"
        assert parsed["current_values_mode"] == "free_text"
        assert parsed["current_values_free_text"] == "Plant 1000 uses G/L account 800000."
