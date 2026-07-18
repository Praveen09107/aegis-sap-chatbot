"""
AEGIS Quick Entry Bulk Import Parser
Per IMPL_29_QUICK_ENTRY_OPERATIONAL_SYSTEMS.md Section 7. Best-effort
pre-fill from an existing .docx/.pdf document — the admin always reviews
before submitting (per this section's own "extraction_accuracy_note").

Real-schema corrections applied:
  - No standalone app/services/text_extractor.py module exists — the real
    Stage 2 extraction (python-docx / pdfplumber) is a private method on
    ingestion_pipeline.py's IngestionPipeline class. Rather than reach into
    another class's private methods, this file has its own small,
    byte-based extraction (no temp file needed — both libraries accept a
    BytesIO directly), intentionally without ingestion's minimum-length
    rejection gate, since bulk-import is meant to return partial results.
  - Field labels matched against the real, generalized template labels
    this codebase's own field detection uses (CURRENT_PRODUCTION_VALUES,
    not the frozen AEGIS_DOCUMENT_TEMPLATES.md's stale
    CURRENT_VALUES_AT_SONA_COMSTAR), per AMENDMENT_GENERALIZATION_BACKEND.md.
  - Procedure steps: the frozen template uses individual STEP_N: labels
    within PHASE_NAME sections (not free-flowing phase prose) — each
    STEP_N maps to one Quick Entry steps[] entry. The template has no
    concept of branch_start/branch_option_a/admin_required step types at
    all, so every parsed step defaults to step_type='normal'; the admin
    reviews and reclassifies branches manually (flagged in
    unparsed_sections).
"""
import re
from io import BytesIO
from typing import Dict, List, Optional

CHANGE_FREQUENCY_MAP = {
    "rare": "rare", "monthly": "monthly", "quarterly": "quarterly",
    "annual": "annual", "as-needed": "as_needed", "as_needed": "as_needed",
    "semi-annual": "semi_annual", "semi_annual": "semi_annual",
}


def _extract_docx_text(file_bytes: bytes) -> Optional[str]:
    try:
        from docx import Document
        doc = Document(BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs) or None
    except Exception:
        return None


def _extract_pdf_text(file_bytes: bytes) -> Optional[str]:
    try:
        import pdfplumber
        all_text = []
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    all_text.append(page_text)
        return "\n".join(all_text) or None
    except Exception:
        return None


def _extract_between(text: str, start_label: str, end_labels: List[str]) -> Optional[str]:
    """Extract text between start_label and the first matching end_label (or end of text)."""
    end_alternation = "|".join(re.escape(e) for e in end_labels) if end_labels else r"\Z"
    pattern = re.compile(
        re.escape(start_label) + r"\s*:?\s*\n?(.*?)(?=" + end_alternation + r"|\Z)",
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return None
    value = match.group(1).strip()
    return value or None


def detect_content_type(text: str) -> Optional[str]:
    text_upper = text.upper()
    if "CAUSE_DESCRIPTION" in text_upper or "CAUSE DESCRIPTION" in text_upper:
        return "error_guide"
    if "PROCEDURE_NAME" in text_upper or "PHASE_NAME" in text_upper:
        return "procedure"
    if "CONFIGURATION_NAME" in text_upper and "WHAT_THIS_CONTROLS" in text_upper:
        return "config"
    return None


def _extract_cause_blocks(text: str) -> List[dict]:
    causes = []
    cause_pattern = re.compile(
        r"CAUSE_(\d+).*?CAUSE_DESCRIPTION\s*:?\s*\n?(.*?)"
        r"HOW_TO_IDENTIFY\s*:?\s*\n?(.*?)"
        r"RESOLUTION_STEPS\s*:?\s*\n?(.*?)"
        r"(?=CAUSE_\d+|SUCCESS_INDICATOR|\Z)",
        re.IGNORECASE | re.DOTALL,
    )
    for match in cause_pattern.finditer(text):
        causes.append({
            "cause_number": int(match.group(1)),
            "priority": "common",
            "cause_description": match.group(2).strip(),
            "how_to_identify": match.group(3).strip(),
            "resolution_steps": match.group(4).strip(),
            "resolution_requires_admin": False,
            "cause_obsolete": False,
            "obsolete_reason": "",
            "screenshot_ids": [],
        })
    return causes


def parse_error_guide(text: str) -> dict:
    parsed = {
        "issue_description": _extract_between(text, "ISSUE_DESCRIPTION", ["DOCUMENT_ID", "MODULE", "TRANSACTIONS", "ERROR_CODE"]),
        "error_code": _extract_between(text, "ERROR_CODE", ["ERROR_MESSAGE", "DESCRIPTION"]),
        "error_message": _extract_between(text, "ERROR_MESSAGE", ["DESCRIPTION", "WHEN_THIS_OCCURS"]),
        "description": _extract_between(text, "DESCRIPTION", ["WHEN_THIS_OCCURS", "CAUSE_1"]),
        "when_this_occurs": _extract_between(text, "WHEN_THIS_OCCURS", ["CAUSE_1"]),
        "success_indicator": _extract_between(text, "SUCCESS_INDICATOR", ["ESCALATION_CRITERIA"]),
        "escalation_criteria": _extract_between(text, "ESCALATION_CRITERIA", ["ADMIN_STEPS"]),
        "admin_steps": _extract_between(text, "ADMIN_STEPS", ["NOTES", "LAST_VERIFIED_DATE"]),
        "notes": _extract_between(text, "NOTES", ["LAST_VERIFIED_DATE", "VERIFIED_BY"]),
    }
    causes = _extract_cause_blocks(text)
    if causes:
        parsed["causes"] = causes
    return {k: v for k, v in parsed.items() if v not in (None, "")}


def _extract_steps(text: str) -> List[dict]:
    step_pattern = re.compile(r"STEP_(\d+)\s*:?\s*\n?(.*?)(?=STEP_\d+|VERIFICATION_STEPS|\Z)", re.IGNORECASE | re.DOTALL)
    steps = []
    for match in step_pattern.finditer(text):
        action = match.group(2).strip()
        if action:
            steps.append({"action": action, "step_type": "normal", "specificity_acknowledged": False, "screenshot_ids": []})
    return steps


def parse_procedure(text: str) -> dict:
    parsed = {
        "procedure_name": _extract_between(text, "PROCEDURE_NAME", ["PURPOSE"]),
        "purpose": _extract_between(text, "PURPOSE", ["WHEN_TO_USE"]),
        "when_to_use": _extract_between(text, "WHEN_TO_USE", ["PREREQUISITES", "TRANSACTIONS"]),
        "data_required": _extract_between(text, "PREREQUISITES", ["TRANSACTIONS", "PHASE_NAME"]),
        "verification": _extract_between(text, "VERIFICATION_STEPS", ["COMMON_ERRORS"]),
        "plant_notes": _extract_between(text, "POST_COMPLETION_NOTES", ["LAST_VERIFIED_DATE", "VERIFIED_BY"]),
    }
    steps = _extract_steps(text)
    if steps:
        parsed["steps"] = steps
    common_errors_raw = _extract_between(text, "COMMON_ERRORS_IN_THIS_PROCEDURE", ["POST_COMPLETION_NOTES", "LAST_VERIFIED_DATE"])
    if common_errors_raw:
        doc_ids = [d.strip() for d in common_errors_raw.split(",") if d.strip()]
        parsed["common_errors"] = [
            {"error_code": "NONE", "cause_summary": "", "see_document_id": doc_id, "reference_validated": False}
            for doc_id in doc_ids
        ]
    return {k: v for k, v in parsed.items() if v not in (None, "")}


def parse_config(text: str) -> dict:
    change_frequency_raw = _extract_between(text, "CHANGE_FREQUENCY", ["NAVIGATION"])
    parsed = {
        "configuration_name": _extract_between(text, "CONFIGURATION_NAME", ["WHAT_THIS_CONTROLS"]),
        "what_this_controls": _extract_between(text, "WHAT_THIS_CONTROLS", ["CHANGE_FREQUENCY"]),
        "change_frequency": CHANGE_FREQUENCY_MAP.get((change_frequency_raw or "").strip().lower()),
        "how_to_navigate": _extract_between(text, "NAVIGATION", ["CURRENT_PRODUCTION_VALUES", "CURRENT_VALUES_AT_SONA_COMSTAR"]),
        "notes": _extract_between(text, "CHANGE_PROCESS", ["RELATED_ERRORS", "LAST_VERIFIED_DATE"]),
    }
    values_text = (
        _extract_between(text, "CURRENT_PRODUCTION_VALUES", ["CHANGE_PROCESS"])
        or _extract_between(text, "CURRENT_VALUES_AT_SONA_COMSTAR", ["CHANGE_PROCESS"])
    )
    if values_text:
        parsed["current_values_mode"] = "free_text"
        parsed["current_values_free_text"] = values_text

    related_errors_raw = _extract_between(text, "RELATED_ERRORS", ["LAST_VERIFIED_DATE", "VERIFIED_BY"])
    if related_errors_raw:
        doc_ids = [d.strip() for d in related_errors_raw.split(",") if d.strip()]
        parsed["related_errors"] = [
            {"error_code": "NONE", "misconfiguration_cause": "", "see_document_id": doc_id, "reference_validated": False}
            for doc_id in doc_ids
        ]
    return {k: v for k, v in parsed.items() if v not in (None, "")}


_PARSERS = {"error_guide": parse_error_guide, "procedure": parse_procedure, "config": parse_config}

_REQUIRED_FIELDS = {
    "error_guide": ["issue_description", "error_code", "error_message", "description", "when_this_occurs", "causes", "success_indicator", "escalation_criteria", "admin_steps"],
    "procedure": ["procedure_name", "purpose", "when_to_use", "data_required", "system_conditions", "access_required", "steps", "verification", "common_errors", "plant_notes"],
    "config": ["configuration_name", "what_this_controls", "access_view", "access_change", "change_frequency", "table_name", "current_values_mode", "how_to_navigate", "related_errors"],
}


def _identify_unparsed(content_type: Optional[str], parsed: dict) -> List[str]:
    if not content_type:
        return ["content_type could not be detected"]
    return [f for f in _REQUIRED_FIELDS.get(content_type, []) if f not in parsed]


async def parse_document_for_form_prefill(file_bytes: bytes, filename: str) -> dict:
    """Extracts text and maps it to form fields using known template header labels."""
    if filename.lower().endswith(".docx"):
        extracted_text = _extract_docx_text(file_bytes)
    elif filename.lower().endswith(".pdf"):
        extracted_text = _extract_pdf_text(file_bytes)
    else:
        extracted_text = None

    if not extracted_text:
        return {
            "content_type_detected": None,
            "parsed_fields": {},
            "unparsed_sections": ["Could not extract any text from this file."],
            "extraction_accuracy_note": (
                "No text could be extracted. This file may be a scanned/image-based "
                "document, an unsupported format, or empty."
            ),
        }

    content_type = detect_content_type(extracted_text)
    parser = _PARSERS.get(content_type or "error_guide")
    parsed = parser(extracted_text) if content_type else {}

    return {
        "content_type_detected": content_type,
        "parsed_fields": parsed,
        "unparsed_sections": _identify_unparsed(content_type, parsed),
        "extraction_accuracy_note": (
            "Fields extracted with best effort from known template header labels. "
            "Image-heavy PDFs, non-standard formatting, and any field listed in "
            "unparsed_sections may need manual entry. Review all pre-filled fields "
            "before submitting."
        ),
    }
