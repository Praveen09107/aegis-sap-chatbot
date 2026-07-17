"""
AEGIS Quick Entry Form Schema Validator
Validates form_data JSONB against the schema for the given content_type,
per IMPL_24_QUICK_ENTRY_DATA_MODEL.md Section 3.

Called by the create/update API endpoints (Phase 1.4). Also run at the
start of the process_form_entry ARQ task as defence-in-depth (IMPL_26,
not yet built).

Returns a list of {"field": ..., "message": ...} dicts, matching
IMPL_25 Section 20's error format exactly. An empty list means valid.
"""
from typing import Dict, List

CONTENT_TYPES = {"error_guide", "procedure", "config"}
CAUSE_PRIORITIES = {"check_first", "common", "less_common", "rare"}
PROCEDURE_STEP_TYPES = {
    "normal", "branch_start", "branch_option_a", "branch_option_b",
    "branch_end", "admin_required",
}
CURRENT_VALUES_MODES = {"structured", "free_text"}
CONFIG_PLACEHOLDER_STRINGS = [
    "TBD", "TO BE FILLED", "PLACEHOLDER", "ENTER VALUE", "YOUR VALUE HERE",
]


def _err(field: str, message: str) -> Dict[str, str]:
    return {"field": field, "message": message}


def _min_length(errors: List[dict], field: str, value, min_len: int, label: str = None):
    if not isinstance(value, str) or len(value.strip()) < min_len:
        errors.append(_err(field, f"{label or field} must be at least {min_len} characters."))


def check_specificity(text: str, acknowledged: bool) -> str | None:
    """
    Returns an error message, or None if the text is specific enough (or
    the admin explicitly acknowledged the vague-step warning). Uses the
    existing SAP entity extractor (query_intelligence_service), not a
    separate module — IMPL_25 Section 20 names a standalone
    "sap_entity_extractor" that doesn't exist as its own module; this
    codebase's real, equivalent, reusable extraction lives on
    QueryIntelligenceService.extract_sap_entities().
    """
    if acknowledged:
        return None
    if not text:
        return None

    from app.services.query_intelligence import query_intelligence_service
    entities = query_intelligence_service.extract_sap_entities(text)
    has_entity = bool(entities.t_codes or entities.error_codes) or any(
        kw in text.upper() for kw in ["TAB", "FIELD", "SCREEN", "TRANSACTION", "T-CODE"]
    )
    if not has_entity and len(text) < 80:
        return (
            "This step may lack specificity. Name the T-code, field, and value. "
            "If you understand, set specificity_acknowledged to true."
        )
    return None


def _validate_error_guide(form_data: dict) -> List[dict]:
    errors: List[dict] = []

    _min_length(errors, "issue_description", form_data.get("issue_description"), 10)

    error_code = form_data.get("error_code", "")
    if not error_code:
        errors.append(_err("error_code", "Error code is required — enter the exact code or 'NONE'."))
    elif error_code != "NONE" and (not error_code.strip() or " " in error_code):
        errors.append(_err("error_code", "Error code must be non-empty with no whitespace, or exactly 'NONE'."))

    error_message = form_data.get("error_message", "")
    if not error_message:
        errors.append(_err("error_message", "Error message is required — enter the exact SAP text or 'NONE'."))
    elif error_message != "NONE" and len(error_message) < 10:
        errors.append(_err("error_message", "Error message must be at least 10 characters, or exactly 'NONE'."))

    _min_length(errors, "description", form_data.get("description"), 30)
    _min_length(errors, "when_this_occurs", form_data.get("when_this_occurs"), 30)

    causes = form_data.get("causes", [])
    if not isinstance(causes, list) or not (1 <= len(causes) <= 10):
        errors.append(_err("causes", "At least 1 and at most 10 causes are required."))
    else:
        if not any(not c.get("cause_obsolete", False) for c in causes):
            errors.append(_err("causes", "At least one cause must not be marked obsolete."))
        for i, cause in enumerate(causes):
            prefix = f"causes[{i}]"
            if cause.get("priority") not in CAUSE_PRIORITIES:
                errors.append(_err(f"{prefix}.priority", f"Priority must be one of: {', '.join(sorted(CAUSE_PRIORITIES))}."))
            _min_length(errors, f"{prefix}.cause_description", cause.get("cause_description"), 20)
            _min_length(errors, f"{prefix}.how_to_identify", cause.get("how_to_identify"), 20)
            _min_length(errors, f"{prefix}.resolution_steps", cause.get("resolution_steps"), 20)
            spec_msg = check_specificity(
                cause.get("resolution_steps", ""), cause.get("specificity_acknowledged", cause.get("resolution_requires_admin", False))
            )
            if spec_msg:
                errors.append(_err(f"{prefix}.resolution_steps", spec_msg))
            if cause.get("cause_obsolete", False):
                _min_length(errors, f"{prefix}.obsolete_reason", cause.get("obsolete_reason", ""), 10)

    _min_length(errors, "success_indicator", form_data.get("success_indicator"), 15)
    _min_length(errors, "escalation_criteria", form_data.get("escalation_criteria"), 20)

    if not form_data.get("admin_steps"):
        errors.append(_err("admin_steps", "Admin steps is required — enter specific steps or 'NONE'."))

    return errors


def _validate_branch_pairing(steps: List[dict]) -> List[dict]:
    """branch_start/branch_end markers must nest correctly — a simple stack check."""
    errors: List[dict] = []
    stack: List[int] = []
    for i, step in enumerate(steps):
        step_type = step.get("step_type")
        if step_type == "branch_start":
            stack.append(i)
        elif step_type == "branch_end":
            if not stack:
                errors.append(_err(f"steps[{i}].step_type", "branch_end has no matching branch_start."))
            else:
                stack.pop()
    for unclosed_index in stack:
        errors.append(_err(f"steps[{unclosed_index}].step_type", "branch_start has no matching branch_end."))
    return errors


def _validate_procedure(form_data: dict) -> List[dict]:
    errors: List[dict] = []

    _min_length(errors, "procedure_name", form_data.get("procedure_name"), 10)
    _min_length(errors, "purpose", form_data.get("purpose"), 30)
    _min_length(errors, "when_to_use", form_data.get("when_to_use"), 20)

    if not form_data.get("data_required"):
        errors.append(_err("data_required", "Data required is required — enter a description or 'NONE'."))
    if not form_data.get("system_conditions"):
        errors.append(_err("system_conditions", "System conditions is required — enter conditions or 'NONE'."))

    _min_length(errors, "access_required", form_data.get("access_required"), 3)

    steps = form_data.get("steps", [])
    if not isinstance(steps, list) or len(steps) < 3:
        errors.append(_err("steps", "At least 3 steps are required."))
    else:
        for i, step in enumerate(steps):
            prefix = f"steps[{i}]"
            _min_length(errors, f"{prefix}.action", step.get("action"), 20)
            if step.get("step_type") not in PROCEDURE_STEP_TYPES:
                errors.append(_err(f"{prefix}.step_type", f"step_type must be one of: {', '.join(sorted(PROCEDURE_STEP_TYPES))}."))
            spec_msg = check_specificity(step.get("action", ""), step.get("specificity_acknowledged", False))
            if spec_msg:
                errors.append(_err(f"{prefix}.action", spec_msg))
        errors.extend(_validate_branch_pairing(steps))

    _min_length(errors, "verification", form_data.get("verification"), 20)

    common_errors = form_data.get("common_errors", [])
    is_explicit_none = len(common_errors) == 1 and common_errors[0].get("error_code") == "NONE"
    if not common_errors or (not is_explicit_none and len(common_errors) < 1):
        errors.append(_err("common_errors", "At least 1 common error is required, or a single entry with error_code 'NONE'."))

    return errors


def _validate_config(form_data: dict) -> List[dict]:
    errors: List[dict] = []

    _min_length(errors, "configuration_name", form_data.get("configuration_name"), 10)
    _min_length(errors, "what_this_controls", form_data.get("what_this_controls"), 50)
    _min_length(errors, "access_view", form_data.get("access_view"), 3)
    _min_length(errors, "access_change", form_data.get("access_change"), 3)

    if not form_data.get("change_frequency"):
        errors.append(_err("change_frequency", "Change frequency is required."))

    mode = form_data.get("current_values_mode")
    if mode not in CURRENT_VALUES_MODES:
        errors.append(_err("current_values_mode", f"current_values_mode must be one of: {', '.join(sorted(CURRENT_VALUES_MODES))}."))
    elif mode == "structured":
        groups = form_data.get("current_values_structured", [])
        if not groups:
            errors.append(_err("current_values_structured", "At least 1 group is required when mode is 'structured'."))
        for i, group in enumerate(groups):
            _min_length(errors, f"current_values_structured[{i}].group_name", group.get("group_name"), 3)
            if not group.get("parameters"):
                errors.append(_err(f"current_values_structured[{i}].parameters", "At least 1 parameter is required per group."))
    elif mode == "free_text":
        free_text = form_data.get("current_values_free_text", "")
        _min_length(errors, "current_values_free_text", free_text, 50)
        upper_text = free_text.upper()
        for placeholder in CONFIG_PLACEHOLDER_STRINGS:
            if placeholder in upper_text:
                errors.append(_err("current_values_free_text", f"Contains placeholder text ('{placeholder}') — enter real production values."))
                break

    _min_length(errors, "how_to_navigate", form_data.get("how_to_navigate"), 30)

    related_errors = form_data.get("related_errors", [])
    is_explicit_none = len(related_errors) == 1 and related_errors[0].get("error_code") == "NONE"
    if not related_errors or (not is_explicit_none and len(related_errors) < 1):
        errors.append(_err("related_errors", "At least 1 related error is required, or a single entry with error_code 'NONE'."))

    return errors


_VALIDATORS = {
    "error_guide": _validate_error_guide,
    "procedure": _validate_procedure,
    "config": _validate_config,
}


def validate_form_data(content_type: str, form_data: dict) -> List[Dict[str, str]]:
    """
    Validate form_data against the schema for content_type.
    Returns a list of field errors (empty list = valid).
    Recomputes cause_number/step_number are NOT done here — that happens
    at read time in the API layer (IMPL_24 Section 3.2), not at validation.
    """
    if content_type not in CONTENT_TYPES:
        return [_err("content_type", f"content_type must be one of: {', '.join(sorted(CONTENT_TYPES))}.")]
    if not isinstance(form_data, dict):
        return [_err("form_data", "form_data must be an object.")]

    return _VALIDATORS[content_type](form_data)
