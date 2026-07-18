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
    """
    Extract text between start_label and the first matching end_label (or
    end of text). Anchored to the start of a line, case-sensitive on the
    label itself — matching this codebase's own established field-label
    convention (ingestion_pipeline.py's FIELD_LABEL_PATTERN: an uppercase
    label at the start of a line, followed by a colon).

    Two weaker versions of this were each confirmed live, in order: a bare
    substring search matched "DESCRIPTION" inside "ISSUE_DESCRIPTION"
    (fixed with \b) — then, still case-insensitive, it matched the ordinary
    English word "description" appearing inside another field's own value
    text ("issue description text here"), since prose can legitimately
    contain a label's word in lowercase. Only a real label — uppercase, at
    the start of its own line — can be trusted as a field boundary.
    """
    end_alternation = "|".join(r"^" + re.escape(e) + r"\s*:" for e in end_labels) if end_labels else r"\Z"
    pattern = re.compile(
        r"^" + re.escape(start_label) + r"\s*:\s*\n?(.*?)(?=" + end_alternation + r"|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return None
    value = match.group(1).strip()
    return value or None


def detect_content_type(text: str) -> Optional[str]:
    text_upper = text.upper()
    # error_guide detection previously keyed on CAUSE_DESCRIPTION/
    # ISSUE_DESCRIPTION — neither exists anywhere in the real frozen
    # AEGIS_DOCUMENT_TEMPLATES.md error_guide structure (confirmed by
    # reading the actual template, not IMPL_29's own pseudocode, which was
    # wrong about this). WHEN_THIS_OCCURS is real, always-required, and
    # error_guide-specific (procedure/config templates don't use it) — a
    # malformed cause block no longer makes the whole document
    # undetectable, since this field lives outside the repeating block.
    if "WHEN_THIS_OCCURS" in text_upper:
        return "error_guide"
    if "PROCEDURE_NAME" in text_upper or "PHASE_NAME" in text_upper:
        return "procedure"
    if "CONFIGURATION_NAME" in text_upper and "WHAT_THIS_CONTROLS" in text_upper:
        return "config"
    return None


def _extract_cause_blocks(text: str) -> List[dict]:
    """
    The real frozen AEGIS_DOCUMENT_TEMPLATES.md error_guide structure
    (verified directly, not from IMPL_29's own pseudocode — confirmed
    wrong by that cross-check) uses per-cause-prefixed labels:
    CAUSE_N: [short name], CAUSE_N_HOW_TO_IDENTIFY:,
    CAUSE_N_RESOLUTION_STEPS: — there is no shared CAUSE_DESCRIPTION/
    HOW_TO_IDENTIFY/RESOLUTION_STEPS trio reused per block. The cause's
    own short name (given directly on the CAUSE_N: line) is the closest
    available source for Quick Entry's cause_description field.
    """
    causes = []
    cause_number_pattern = re.compile(r"^CAUSE_(\d+)\s*:\s*(.*?)\s*$", re.MULTILINE)
    for m in cause_number_pattern.finditer(text):
        n = m.group(1)
        short_name = m.group(2).strip()
        how_to_identify = _extract_between(text, f"CAUSE_{n}_HOW_TO_IDENTIFY", [f"CAUSE_{n}_RESOLUTION_STEPS"])
        resolution_steps = _extract_between(
            text, f"CAUSE_{n}_RESOLUTION_STEPS",
            [f"CAUSE_{n}_RELATED_CONFIG", f"CAUSE_{int(n) + 1}", "SUCCESS_INDICATOR"],
        )
        if short_name or how_to_identify or resolution_steps:
            causes.append({
                "cause_number": int(n),
                "priority": "common",
                "cause_description": short_name,
                "how_to_identify": how_to_identify or "",
                "resolution_steps": resolution_steps or "",
                "resolution_requires_admin": False,
                "cause_obsolete": False,
                "obsolete_reason": "",
                "screenshot_ids": [],
            })
    return causes


def parse_error_guide(text: str) -> dict:
    # issue_description, error_message, and description have no
    # corresponding source field anywhere in the real frozen error_guide
    # template (confirmed directly against AEGIS_DOCUMENT_TEMPLATES.md,
    # not assumed from IMPL_29's pseudocode) — always left for
    # unparsed_sections to flag, not guessed at.
    parsed = {
        "error_code": _extract_between(text, "ERROR_CODE", ["TRANSACTIONS", "WHEN_THIS_OCCURS"]),
        "when_this_occurs": _extract_between(text, "WHEN_THIS_OCCURS", ["CAUSE_1"]),
        "success_indicator": _extract_between(text, "SUCCESS_INDICATOR", ["ADMIN_STEPS", "ESCALATION_CRITERIA"]),
        "admin_steps": _extract_between(text, "ADMIN_STEPS", ["ESCALATION_CRITERIA", "RELATED_ERRORS", "LAST_VERIFIED_DATE"]),
        "escalation_criteria": _extract_between(text, "ESCALATION_CRITERIA", ["RELATED_ERRORS", "LAST_VERIFIED_DATE"]),
    }
    causes = _extract_cause_blocks(text)
    if causes:
        parsed["causes"] = causes
    return {k: v for k, v in parsed.items() if v not in (None, "")}


def _extract_steps(text: str) -> List[dict]:
    # Same line-start, case-sensitive anchoring as _extract_between/
    # _extract_cause_blocks, for consistency and the same reason.
    step_pattern = re.compile(r"^STEP_(\d+)\s*:\s*\n?(.*?)(?=^STEP_\d+\s*:|^VERIFICATION_STEPS\s*:|\Z)", re.MULTILINE | re.DOTALL)
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
        "verification": _extract_between(text, "VERIFICATION_STEPS", ["COMMON_ERRORS_IN_THIS_PROCEDURE"]),
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
