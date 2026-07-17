"""Unit tests for the Quick Entry structure-aware chunking engine (IMPL_27)."""
import pytest
from app.services.form_chunker import assemble_chunks, _batch_steps, _split_branch_group


def _error_guide_form_data(num_causes=1, extra_causes=None):
    causes = [
        {
            "cause_number": 1, "priority": "check_first",
            "cause_description": "Safety stock exceeds unrestricted stock in MM02.",
            "how_to_identify": "Check MMBE for unrestricted stock, MM02 MRP 2 for safety stock.",
            "resolution_steps": "Go to MM02, MRP 2 tab, reduce Safety Stock field, save.",
            "resolution_requires_admin": False, "cause_obsolete": False,
            "obsolete_reason": "",
        }
    ]
    if extra_causes:
        causes.extend(extra_causes)
    return {
        "issue_description": "VL150 delivery blocked when creating outbound delivery",
        "error_code": "VL150",
        "error_message": "Not enough stock available for this material",
        "description": "This occurs when safety stock exceeds unrestricted stock.",
        "when_this_occurs": "Creating an outbound delivery via VL01N for the affected material.",
        "causes": causes,
        "success_indicator": "Delivery document number is generated.",
        "escalation_criteria": "Escalate if safety stock is already zero.",
        "admin_steps": "NONE",
        "notes": "",
    }


def _procedure_form_data(steps=None):
    return {
        "procedure_name": "Scheduling Agreement Creation",
        "purpose": "Creates an export scheduling agreement for overseas customers.",
        "when_to_use": "When an overseas customer needs scheduled deliveries.",
        "data_required": "Customer master must exist.",
        "system_conditions": "NONE",
        "access_required": "SD module",
        "steps": steps or [
            {"action": "Navigate to VA31 transaction code.", "step_type": "normal"},
            {"action": "Enter order type YDSA in the header field.", "step_type": "normal"},
            {"action": "Enter the customer number field and save the record via VA31.", "step_type": "normal"},
        ],
        "verification": "Scheduling agreement number is generated on save.",
        "common_errors": [{"error_code": "NONE", "cause_summary": "", "see_document_id": ""}],
        "plant_notes": "NONE",
        "notes": "",
    }


def _config_form_data():
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
        "related_errors": [{"error_code": "NONE", "misconfiguration_cause": "", "see_document_id": ""}],
        "notes": "",
    }


class TestErrorGuideChunking:
    def test_single_cause_produces_two_chunks(self):
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-ERR-001", content_type="error_guide", module="SD",
            transactions=["VL01N"], verified_by_name="Gokul", verified_date="2025-03-28",
            form_data=_error_guide_form_data(), version=1,
        )
        assert [c["chunk_type"] for c in chunks] == ["error_overview", "cause_1"]

    def test_header_prefix_present_on_every_chunk(self):
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-ERR-001", content_type="error_guide", module="SD",
            transactions=["VL01N"], verified_by_name="Gokul", verified_date="2025-03-28",
            form_data=_error_guide_form_data(), version=1,
        )
        for c in chunks:
            assert c["text"].startswith("[SD-ERR-001] [SD] [SOURCE: form_entry]\n")

    def test_none_error_code_and_message_omitted(self):
        fd = _error_guide_form_data()
        fd["error_code"] = "NONE"
        fd["error_message"] = "NONE"
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-ERR-001", content_type="error_guide", module="SD",
            transactions=[], verified_by_name="Gokul", verified_date="2025-03-28",
            form_data=fd, version=1,
        )
        overview = chunks[0]["text"]
        assert "ERROR CODE:" not in overview
        assert "ERROR MESSAGE:" not in overview

    def test_obsolete_causes_excluded_and_noted(self):
        extra = [{
            "cause_number": 2, "priority": "rare",
            "cause_description": "Old obsolete cause.", "how_to_identify": "N/A",
            "resolution_steps": "N/A", "resolution_requires_admin": False,
            "cause_obsolete": True, "obsolete_reason": "No longer applicable since patch.",
        }]
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-ERR-001", content_type="error_guide", module="SD",
            transactions=[], verified_by_name="Gokul", verified_date="2025-03-28",
            form_data=_error_guide_form_data(extra_causes=extra), version=1,
        )
        chunk_types = [c["chunk_type"] for c in chunks]
        assert "cause_2" not in chunk_types
        assert "1 cause(s) have been marked as no longer applicable" in chunks[0]["text"]

    def test_causes_sorted_by_priority(self):
        extra = [{
            "cause_number": 2, "priority": "less_common",
            "cause_description": "Less common cause.", "how_to_identify": "Check X.",
            "resolution_steps": "Do Y.", "resolution_requires_admin": False,
            "cause_obsolete": False, "obsolete_reason": "",
        }]
        fd = _error_guide_form_data(extra_causes=extra)
        fd["causes"][0]["priority"] = "rare"
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-ERR-001", content_type="error_guide", module="SD",
            transactions=[], verified_by_name="Gokul", verified_date="2025-03-28",
            form_data=fd, version=1,
        )
        assert "Less common cause." in chunks[1]["text"]
        assert "Safety stock exceeds" in chunks[2]["text"]

    def test_admin_required_resolution_labelled(self):
        fd = _error_guide_form_data()
        fd["causes"][0]["resolution_requires_admin"] = True
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-ERR-001", content_type="error_guide", module="SD",
            transactions=[], verified_by_name="Gokul", verified_date="2025-03-28",
            form_data=fd, version=1,
        )
        cause_text = chunks[1]["text"]
        assert "RESOLUTION [Requires IT admin access] :" in cause_text
        assert "ADMIN NOTE:" in cause_text

    def test_ten_causes_produce_eleven_chunks(self):
        extra = [{
            "cause_number": i, "priority": "common",
            "cause_description": f"Cause {i}.", "how_to_identify": "Check.",
            "resolution_steps": "Fix it.", "resolution_requires_admin": False,
            "cause_obsolete": False, "obsolete_reason": "",
        } for i in range(2, 11)]
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-ERR-001", content_type="error_guide", module="SD",
            transactions=[], verified_by_name="Gokul", verified_date="2025-03-28",
            form_data=_error_guide_form_data(extra_causes=extra), version=1,
        )
        assert len(chunks) == 11


class TestProcedureChunking:
    def test_three_steps_produce_two_chunks(self):
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-PROC-001", content_type="procedure", module="SD",
            transactions=["VA31"], verified_by_name="Arun", verified_date="2025-01-15",
            form_data=_procedure_form_data(), version=1,
        )
        assert [c["chunk_type"] for c in chunks] == ["proc_overview", "proc_steps_1"]

    def test_ten_steps_produce_three_chunks(self):
        steps = [{"action": f"Do step {i} with enough detail to pass validation.", "step_type": "normal"} for i in range(1, 11)]
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-PROC-001", content_type="procedure", module="SD",
            transactions=[], verified_by_name="Arun", verified_date="2025-01-15",
            form_data=_procedure_form_data(steps=steps), version=1,
        )
        assert [c["chunk_type"] for c in chunks] == ["proc_overview", "proc_steps_1", "proc_steps_2"]

    def test_admin_required_step_labelled(self):
        steps = [
            {"action": "Navigate to VA31.", "step_type": "normal"},
            {"action": "Approve the credit override in FD32.", "step_type": "admin_required"},
            {"action": "Save the record via VA31.", "step_type": "normal"},
        ]
        chunks = assemble_chunks(
            entry_id="e1", document_id="SD-PROC-001", content_type="procedure", module="SD",
            transactions=[], verified_by_name="Arun", verified_date="2025-01-15",
            form_data=_procedure_form_data(steps=steps), version=1,
        )
        steps_text = chunks[1]["text"]
        assert "[Requires IT admin access]" in steps_text
        assert "This step requires IT admin access" in steps_text

    def test_branch_group_kept_together(self):
        steps = [
            {"action": "Navigate to VA31.", "step_type": "normal"},
            {"action": "Check if customer is export type.", "step_type": "branch_start"},
            {"action": "Select export scheduling agreement.", "step_type": "branch_option_a"},
            {"action": "Select domestic scheduling agreement.", "step_type": "branch_option_b"},
            {"action": "Continue with common fields.", "step_type": "branch_end"},
            {"action": "Save the record via VA31.", "step_type": "normal"},
        ]
        batches = _batch_steps(steps)
        branch_batch = next(b for b in batches if any(s["step_type"] == "branch_start" for s in b))
        assert len(branch_batch) == 4
        assert branch_batch[0]["step_type"] == "branch_start"
        assert branch_batch[-1]["step_type"] == "branch_end"

    def test_oversized_branch_group_split(self):
        long_action = "A" * 400
        steps = (
            [{"action": "Check condition.", "step_type": "branch_start"}]
            + [{"action": long_action, "step_type": "branch_option_a"} for _ in range(5)]
            + [{"action": "End condition.", "step_type": "branch_end"}]
        )
        result = _split_branch_group(steps)
        assert len(result) == 2
        assert result[0][-1]["action"] == "[Branch continues in next chunk]"
        assert result[1][0]["action"] == "[Branch continues from previous chunk]"


class TestConfigChunking:
    def test_always_exactly_two_chunks(self):
        chunks = assemble_chunks(
            entry_id="e1", document_id="FI-CFG-001", content_type="config", module="FI",
            transactions=["VKOA"], verified_by_name="Arun", verified_date="2025-01-15",
            form_data=_config_form_data(), version=1,
        )
        assert [c["chunk_type"] for c in chunks] == ["cfg_overview", "cfg_values"]

    def test_structured_values_formatted(self):
        chunks = assemble_chunks(
            entry_id="e1", document_id="FI-CFG-001", content_type="config", module="FI",
            transactions=[], verified_by_name="Arun", verified_date="2025-01-15",
            form_data=_config_form_data(), version=1,
        )
        values_text = chunks[1]["text"]
        assert "CURRENT PRODUCTION VALUES:" in values_text
        assert "SONA COMSTAR" not in values_text
        assert "Company Code 1000" in values_text
        assert "Billing Type F2: G/L 800000" in values_text

    def test_free_text_values_used_as_is(self):
        fd = _config_form_data()
        fd["current_values_mode"] = "free_text"
        fd["current_values_free_text"] = "All plants use standard costing variant PPC1 for FY2025."
        chunks = assemble_chunks(
            entry_id="e1", document_id="FI-CFG-001", content_type="config", module="FI",
            transactions=[], verified_by_name="Arun", verified_date="2025-01-15",
            form_data=fd, version=1,
        )
        assert "All plants use standard costing variant PPC1 for FY2025." in chunks[1]["text"]


class TestUnknownContentType:
    def test_unknown_content_type_raises(self):
        with pytest.raises(ValueError):
            assemble_chunks(
                entry_id="e1", document_id="X-ERR-001", content_type="not_a_type", module="SD",
                transactions=[], verified_by_name="A", verified_date="2025-01-15",
                form_data={}, version=1,
            )
