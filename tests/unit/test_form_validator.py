"""Unit tests for the Quick Entry form schema validator."""
import pytest
from app.services.form_validator import validate_form_data, check_specificity


def _valid_error_guide():
    return {
        "issue_description": "VL150 delivery blocked when creating outbound delivery",
        "error_code": "VL150",
        "error_message": "Not enough stock available for this material",
        "description": "This occurs when safety stock exceeds unrestricted stock.",
        "when_this_occurs": "Creating an outbound delivery via VL01N for the affected material.",
        "causes": [
            {
                "cause_number": 1, "priority": "check_first",
                "cause_description": "Safety stock exceeds unrestricted stock in MM02.",
                "how_to_identify": "Check MMBE for unrestricted stock, MM02 MRP 2 for safety stock.",
                "resolution_steps": "Go to MM02, MRP 2 tab, reduce Safety Stock field, save.",
                "resolution_requires_admin": False, "cause_obsolete": False,
                "obsolete_reason": "", "screenshot_ids": [],
            }
        ],
        "success_indicator": "Delivery document number is generated.",
        "escalation_criteria": "Escalate if safety stock is already zero.",
        "admin_steps": "NONE",
        "notes": "",
    }


def _valid_procedure():
    return {
        "procedure_name": "Scheduling Agreement Creation",
        "purpose": "Creates an export scheduling agreement for overseas customers.",
        "when_to_use": "When an overseas customer needs scheduled deliveries.",
        "data_required": "Customer master must exist.",
        "system_conditions": "NONE",
        "access_required": "SD module",
        "steps": [
            {"action": "Navigate to VA31 transaction code.", "step_type": "normal", "specificity_acknowledged": False, "screenshot_ids": []},
            {"action": "Enter order type YDSA in the header field.", "step_type": "normal", "specificity_acknowledged": False, "screenshot_ids": []},
            {"action": "Enter the customer number field and save the record via VA31.", "step_type": "normal", "specificity_acknowledged": False, "screenshot_ids": []},
        ],
        "verification": "Scheduling agreement number is generated on save.",
        "common_errors": [{"error_code": "NONE", "cause_summary": "", "see_document_id": "", "reference_validated": False}],
        "plant_notes": "NONE",
        "notes": "",
    }


def _valid_config():
    return {
        "configuration_name": "G/L Account Determination for SD Billing",
        "what_this_controls": "Maps billing document types to G/L accounts for revenue recognition postings.",
        "access_view": "FI team, display only",
        "access_change": "Finance Controller",
        "change_frequency": "rare",
        "table_name": "",
        "current_values_mode": "structured",
        "current_values_structured": [
            {"group_name": "Company Code 1000", "parameters": [{"name": "Billing Type F2", "value": "G/L 800000"}]}
        ],
        "current_values_free_text": "",
        "how_to_navigate": "Use transaction code VKOA to view the account determination table.",
        "related_errors": [{"error_code": "NONE", "misconfiguration_cause": "", "see_document_id": "", "reference_validated": False}],
        "notes": "",
    }


class TestUnknownContentType:
    def test_unknown_content_type_rejected(self):
        errors = validate_form_data("not_a_type", {})
        assert any(e["field"] == "content_type" for e in errors)

    def test_non_dict_form_data_rejected(self):
        errors = validate_form_data("error_guide", "not a dict")
        assert any(e["field"] == "form_data" for e in errors)


class TestErrorGuideValidation:
    def test_valid_error_guide_passes(self):
        assert validate_form_data("error_guide", _valid_error_guide()) == []

    def test_short_issue_description_rejected(self):
        data = _valid_error_guide()
        data["issue_description"] = "too short"
        errors = validate_form_data("error_guide", data)
        assert any(e["field"] == "issue_description" for e in errors)

    def test_error_code_missing_rejected(self):
        data = _valid_error_guide()
        data["error_code"] = ""
        errors = validate_form_data("error_guide", data)
        assert any(e["field"] == "error_code" for e in errors)

    def test_error_code_none_is_valid(self):
        data = _valid_error_guide()
        data["error_code"] = "NONE"
        assert validate_form_data("error_guide", data) == []

    def test_empty_causes_rejected(self):
        data = _valid_error_guide()
        data["causes"] = []
        errors = validate_form_data("error_guide", data)
        assert any(e["field"] == "causes" for e in errors)

    def test_all_causes_obsolete_rejected(self):
        data = _valid_error_guide()
        data["causes"][0]["cause_obsolete"] = True
        data["causes"][0]["obsolete_reason"] = "No longer applies to this system"
        errors = validate_form_data("error_guide", data)
        assert any(e["field"] == "causes" and "obsolete" in e["message"] for e in errors)

    def test_obsolete_cause_requires_reason(self):
        data = _valid_error_guide()
        data["causes"].append(dict(data["causes"][0]))
        data["causes"][1]["cause_obsolete"] = True
        data["causes"][1]["obsolete_reason"] = ""
        errors = validate_form_data("error_guide", data)
        assert any("obsolete_reason" in e["field"] for e in errors)

    def test_vague_resolution_steps_flagged_without_acknowledgement(self):
        data = _valid_error_guide()
        data["causes"][0]["resolution_steps"] = "Fix the issue by checking things carefully"
        data["causes"][0]["specificity_acknowledged"] = False
        errors = validate_form_data("error_guide", data)
        assert any("specificity" in e["message"].lower() or "T-code" in e["message"] for e in errors)

    def test_vague_resolution_steps_allowed_when_acknowledged(self):
        data = _valid_error_guide()
        data["causes"][0]["resolution_steps"] = "Fix the issue by checking things carefully"
        data["causes"][0]["specificity_acknowledged"] = True
        errors = validate_form_data("error_guide", data)
        assert not any("T-code" in e["message"] for e in errors)


class TestProcedureValidation:
    def test_valid_procedure_passes(self):
        assert validate_form_data("procedure", _valid_procedure()) == []

    def test_fewer_than_3_steps_rejected(self):
        data = _valid_procedure()
        data["steps"] = data["steps"][:2]
        errors = validate_form_data("procedure", data)
        assert any(e["field"] == "steps" for e in errors)

    def test_invalid_step_type_rejected(self):
        data = _valid_procedure()
        data["steps"][0]["step_type"] = "not_a_type"
        errors = validate_form_data("procedure", data)
        assert any(e["field"] == "steps[0].step_type" for e in errors)

    def test_unmatched_branch_start_rejected(self):
        data = _valid_procedure()
        data["steps"][0]["step_type"] = "branch_start"
        errors = validate_form_data("procedure", data)
        assert any("branch_end" in e["message"] for e in errors)

    def test_matched_branch_pair_accepted(self):
        data = _valid_procedure()
        data["steps"][0]["step_type"] = "branch_start"
        data["steps"][0]["action"] = "Begin the branching decision point here in the flow"
        data["steps"][2]["step_type"] = "branch_end"
        data["steps"][2]["action"] = "End of the branching decision point in this flow"
        errors = validate_form_data("procedure", data)
        assert not any("branch" in e["message"] for e in errors)

    def test_empty_common_errors_rejected(self):
        data = _valid_procedure()
        data["common_errors"] = []
        errors = validate_form_data("procedure", data)
        assert any(e["field"] == "common_errors" for e in errors)


class TestConfigValidation:
    def test_valid_config_structured_passes(self):
        assert validate_form_data("config", _valid_config()) == []

    def test_valid_config_free_text_passes(self):
        data = _valid_config()
        data["current_values_mode"] = "free_text"
        data["current_values_structured"] = []
        data["current_values_free_text"] = "Company Code 1000: Billing Type F2 maps to G/L account 800000 for domestic sales."
        assert validate_form_data("config", data) == []

    def test_free_text_placeholder_rejected(self):
        data = _valid_config()
        data["current_values_mode"] = "free_text"
        data["current_values_free_text"] = "TBD - need to fill this in later with the real production values here"
        errors = validate_form_data("config", data)
        assert any("placeholder" in e["message"].lower() for e in errors)

    def test_free_text_too_short_rejected(self):
        data = _valid_config()
        data["current_values_mode"] = "free_text"
        data["current_values_free_text"] = "Too short"
        errors = validate_form_data("config", data)
        assert any(e["field"] == "current_values_free_text" for e in errors)

    def test_structured_mode_requires_groups(self):
        data = _valid_config()
        data["current_values_structured"] = []
        errors = validate_form_data("config", data)
        assert any(e["field"] == "current_values_structured" for e in errors)

    def test_invalid_mode_rejected(self):
        data = _valid_config()
        data["current_values_mode"] = "not_a_mode"
        errors = validate_form_data("config", data)
        assert any(e["field"] == "current_values_mode" for e in errors)

    def test_empty_related_errors_rejected(self):
        data = _valid_config()
        data["related_errors"] = []
        errors = validate_form_data("config", data)
        assert any(e["field"] == "related_errors" for e in errors)


class TestCheckSpecificity:
    def test_acknowledged_always_passes(self):
        assert check_specificity("do the thing", True) is None

    def test_empty_text_passes(self):
        assert check_specificity("", False) is None

    def test_text_with_tcode_passes(self):
        assert check_specificity("Go to MM02 and update the field", False) is None

    def test_long_text_without_entities_passes(self):
        long_text = "This is a sufficiently long description of what to do here that exceeds eighty characters total"
        assert check_specificity(long_text, False) is None

    def test_short_vague_text_flagged(self):
        assert check_specificity("Fix it somehow", False) is not None
