"""
AEGIS Quick Entry Structure-Aware Chunking Engine
Per IMPL_27_QUICK_ENTRY_CHUNKING_ENGINE.md. Called from process_form_entry's
Stage A4 (IMPL_26).

CURRENT_PRODUCTION_VALUES label (Section 7) generalized per
AMENDMENT_GENERALIZATION_BACKEND.md's established pattern — IMPL_27's own
text hardcodes "CURRENT VALUES AT SONA COMSTAR:", the same string this
project already renamed in the document pipeline's config chunking
(ingestion_pipeline.py's config_values chunk uses "Current Production
Values:"); this file uses the same label, in this file's ALL-CAPS style.
"""
from typing import Any

from app.config import CHUNK_STEPS_PER_BATCH, CHUNK_BRANCH_MAX_TOKENS


def _header(document_id: str, module: str) -> str:
    return f"[{document_id}] [{module}] [SOURCE: form_entry]\n"


def assemble_chunks(
    entry_id: str,
    document_id: str,
    content_type: str,
    module: str,
    transactions: list[str],
    verified_by_name: str,
    verified_date: Any,
    form_data: dict,
    version: int,
) -> list[dict]:
    """
    Returns a list of chunk dicts. Each dict:
    {chunk_type: str, text: str, associated_section: str}
    """
    verified_str = str(verified_date)

    if content_type == "error_guide":
        return _assemble_error_guide(document_id, module, transactions, verified_by_name, verified_str, form_data)
    elif content_type == "procedure":
        return _assemble_procedure(document_id, module, transactions, verified_by_name, verified_str, form_data)
    elif content_type == "config":
        return _assemble_config(document_id, module, transactions, verified_by_name, verified_str, form_data)
    else:
        raise ValueError(f"Unknown content_type: {content_type}")


def _assemble_error_guide(document_id, module, transactions, verified_by_name, verified_date, form_data) -> list[dict]:
    h = _header(document_id, module)
    fd = form_data
    transactions_str = ", ".join(transactions)

    active_causes = [c for c in fd["causes"] if not c.get("cause_obsolete", False)]
    obsolete_count = len(fd["causes"]) - len(active_causes)

    priority_order = {"check_first": 0, "common": 1, "less_common": 2, "rare": 3}
    active_causes_sorted = sorted(
        active_causes, key=lambda c: priority_order.get(c.get("priority", "common"), 1)
    )

    cause_summary_lines = []
    for i, cause in enumerate(active_causes_sorted, 1):
        priority_label = cause.get("priority", "common").replace("_", " ").title()
        cause_summary_lines.append(f"  Cause {i} [{priority_label}]: {cause['cause_description']}")
    cause_summary = "\n".join(cause_summary_lines)

    lines = [h]
    lines.append(f"ISSUE: {fd['issue_description']}")
    lines.append(f"TRANSACTIONS: {transactions_str}")

    if fd["error_code"].upper() != "NONE":
        lines.append(f"ERROR CODE: {fd['error_code']}")
    if fd["error_message"].upper() != "NONE":
        lines.append(f"ERROR MESSAGE: {fd['error_message']}")

    lines.append(f"DESCRIPTION: {fd['description']}")
    lines.append(f"WHEN THIS OCCURS: {fd['when_this_occurs']}")
    lines.append(f"CAUSES ({len(active_causes)} active, priority-ordered):\n{cause_summary}")

    if obsolete_count > 0:
        lines.append(f"NOTE: {obsolete_count} cause(s) have been marked as no longer applicable.")

    lines.append(f"SUCCESS INDICATOR: {fd['success_indicator']}")
    lines.append(f"ESCALATION CRITERIA: {fd['escalation_criteria']}")

    if fd["admin_steps"].upper() != "NONE":
        lines.append(f"ADMIN STEPS: {fd['admin_steps']}")

    if fd.get("notes", "").strip():
        lines.append(f"NOTES: {fd['notes']}")

    lines.append(f"VERIFIED BY: {verified_by_name} on {verified_date}")

    chunks = [{
        "chunk_type": "error_overview",
        "text": "\n".join(lines),
        "associated_section": "error_overview",
    }]

    total_active = len(active_causes_sorted)
    for i, cause in enumerate(active_causes_sorted, 1):
        priority_label = cause.get("priority", "common").replace("_", " ").title()
        admin_label = "[Requires IT admin access] " if cause.get("resolution_requires_admin") else ""

        cause_lines = [h]
        cause_lines.append(f"ISSUE: {fd['issue_description']}")
        cause_lines.append(f"CAUSE {i} OF {total_active} [{priority_label}]: {cause['cause_description']}")
        cause_lines.append(f"HOW TO IDENTIFY: {cause['how_to_identify']}")
        cause_lines.append(f"RESOLUTION {admin_label}: {cause['resolution_steps']}")

        if cause.get("resolution_requires_admin"):
            cause_lines.append(
                "ADMIN NOTE: The resolution steps above require IT admin access. "
                "Employees unable to perform these steps should raise a support ticket."
            )

        cause_lines.append(f"VERIFIED BY: {verified_by_name} on {verified_date}")

        chunks.append({
            "chunk_type": f"cause_{i}",
            "text": "\n".join(cause_lines),
            "associated_section": f"cause_{i}",
        })

    return chunks


def _assemble_procedure(document_id, module, transactions, verified_by_name, verified_date, form_data) -> list[dict]:
    h = _header(document_id, module)
    fd = form_data
    transactions_str = ", ".join(transactions)

    common_errors_lines = []
    for err in fd["common_errors"]:
        if err["error_code"].upper() == "NONE":
            continue
        line = f"  - {err['error_code']}: {err['cause_summary']}"
        if err.get("see_document_id"):
            line += f" → see {err['see_document_id']}"
        common_errors_lines.append(line)
    common_errors_text = "\n".join(common_errors_lines) if common_errors_lines else "  None"

    overview_lines = [h]
    overview_lines.append(f"PROCEDURE: {fd['procedure_name']}")
    overview_lines.append(f"TRANSACTIONS: {transactions_str}")
    overview_lines.append(f"PURPOSE: {fd['purpose']}")
    overview_lines.append(f"WHEN TO USE: {fd['when_to_use']}")

    if fd["data_required"].upper() != "NONE":
        overview_lines.append(f"DATA REQUIRED: {fd['data_required']}")
    if fd["system_conditions"].upper() != "NONE":
        overview_lines.append(f"SYSTEM CONDITIONS: {fd['system_conditions']}")

    overview_lines.append(f"ACCESS REQUIRED: {fd['access_required']}")
    overview_lines.append(f"VERIFICATION: {fd['verification']}")
    overview_lines.append(f"COMMON ERRORS:\n{common_errors_text}")

    if fd.get("plant_notes", "").upper() not in ("", "NONE"):
        overview_lines.append(f"PLANT NOTES: {fd['plant_notes']}")

    overview_lines.append(f"VERIFIED BY: {verified_by_name} on {verified_date}")

    chunks = [{
        "chunk_type": "proc_overview",
        "text": "\n".join(overview_lines),
        "associated_section": "proc_overview",
    }]

    steps = fd["steps"]
    for i, step in enumerate(steps):
        step["step_number"] = i + 1

    batches = _batch_steps(steps)

    for batch_idx, batch in enumerate(batches, 1):
        chunk_type = f"proc_steps_{batch_idx}"
        step_nums = [s["step_number"] for s in batch]
        range_label = f"{step_nums[0]}" if len(step_nums) == 1 else f"{step_nums[0]} TO {step_nums[-1]}"

        step_lines = [h]
        step_lines.append(f"PROCEDURE: {fd['procedure_name']}")
        step_lines.append(f"STEPS {range_label}:")

        for step in batch:
            admin_prefix = "[Requires IT admin access] " if step["step_type"] == "admin_required" else ""
            branch_prefix = _get_branch_prefix(step["step_type"])
            step_lines.append(f"STEP {step['step_number']} {branch_prefix}{admin_prefix}: {step['action']}")
            if step["step_type"] == "admin_required":
                step_lines.append(
                    "  → This step requires IT admin access. "
                    "Raise a support ticket if you cannot perform this action."
                )

        chunks.append({
            "chunk_type": chunk_type,
            "text": "\n".join(step_lines),
            "associated_section": chunk_type,
        })

    return chunks


def _batch_steps(steps: list[dict]) -> list[list[dict]]:
    """
    Groups steps into batches of CHUNK_STEPS_PER_BATCH. Branch groups
    (branch_start through branch_end) are kept together unless they exceed
    CHUNK_BRANCH_MAX_TOKENS, in which case they are split.
    """
    batches = []
    current_batch = []
    in_branch = False
    branch_buffer = []

    for step in steps:
        step_type = step.get("step_type", "normal")

        if step_type == "branch_start":
            if current_batch:
                batches.append(current_batch)
                current_batch = []
            in_branch = True
            branch_buffer = [step]

        elif in_branch:
            branch_buffer.append(step)

            if step_type == "branch_end":
                in_branch = False
                branch_text = "\n".join(s["action"] for s in branch_buffer)
                if len(branch_text) > CHUNK_BRANCH_MAX_TOKENS:
                    batches.extend(_split_branch_group(branch_buffer))
                else:
                    batches.append(branch_buffer)
                branch_buffer = []

        else:
            current_batch.append(step)
            if len(current_batch) >= CHUNK_STEPS_PER_BATCH:
                batches.append(current_batch)
                current_batch = []

    if branch_buffer:
        batches.append(branch_buffer)
    if current_batch:
        batches.append(current_batch)

    return batches


def _split_branch_group(branch_steps: list[dict]) -> list[list[dict]]:
    """Split an oversized branch group at the last complete step before CHUNK_BRANCH_MAX_TOKENS."""
    continues_note = {"step_number": 0, "action": "[Branch continues in next chunk]",
                       "step_type": "normal", "screenshot_ids": []}
    continuation_note = {"step_number": 0, "action": "[Branch continues from previous chunk]",
                          "step_type": "normal", "screenshot_ids": []}

    cumulative_chars = 0
    split_idx = len(branch_steps) // 2

    for i, step in enumerate(branch_steps):
        cumulative_chars += len(step["action"])
        if cumulative_chars > CHUNK_BRANCH_MAX_TOKENS:
            split_idx = max(i - 1, 1)
            break

    first_half = branch_steps[:split_idx] + [continues_note]
    second_half = [continuation_note] + branch_steps[split_idx:]

    return [first_half, second_half]


def _get_branch_prefix(step_type: str) -> str:
    prefixes = {
        "branch_start": "[IF/CONDITION] ",
        "branch_option_a": "[OPTION A] ",
        "branch_option_b": "[OPTION B] ",
        "branch_end": "[END CONDITION] ",
        "admin_required": "",
        "normal": "",
    }
    return prefixes.get(step_type, "")


def _assemble_config(document_id, module, transactions, verified_by_name, verified_date, form_data) -> list[dict]:
    h = _header(document_id, module)
    fd = form_data
    transactions_str = ", ".join(transactions)

    related_errors_lines = []
    for err in fd["related_errors"]:
        if err["error_code"].upper() == "NONE":
            continue
        line = f"  - {err['error_code']}: {err['misconfiguration_cause']}"
        if err.get("see_document_id"):
            line += f" → see {err['see_document_id']}"
        related_errors_lines.append(line)
    related_errors_text = "\n".join(related_errors_lines) if related_errors_lines else "  None"

    overview_lines = [h]
    overview_lines.append(f"CONFIGURATION: {fd['configuration_name']}")
    overview_lines.append(f"TRANSACTIONS: {transactions_str}")

    if fd.get("table_name", "").strip():
        overview_lines.append(f"SAP TABLE: {fd['table_name']}")

    overview_lines.append(f"WHAT THIS CONTROLS: {fd['what_this_controls']}")
    overview_lines.append(f"ACCESS - VIEW: {fd['access_view']}")
    overview_lines.append(f"ACCESS - CHANGE: {fd['access_change']}")
    overview_lines.append(f"CHANGE FREQUENCY: {fd['change_frequency']}")
    overview_lines.append(f"HOW TO NAVIGATE: {fd['how_to_navigate']}")
    overview_lines.append(f"RELATED ERRORS:\n{related_errors_text}")

    if fd.get("notes", "").strip():
        overview_lines.append(f"NOTES: {fd['notes']}")

    overview_lines.append(f"VERIFIED BY: {verified_by_name} on {verified_date}")

    values_text = _build_config_values_text(fd)

    values_lines = [h]
    values_lines.append(f"CONFIGURATION: {fd['configuration_name']}")
    values_lines.append("CURRENT PRODUCTION VALUES:")
    values_lines.append(values_text)
    values_lines.append(f"LAST VERIFIED: {verified_by_name} on {verified_date}")

    return [
        {"chunk_type": "cfg_overview", "text": "\n".join(overview_lines), "associated_section": "cfg_overview"},
        {"chunk_type": "cfg_values", "text": "\n".join(values_lines), "associated_section": "cfg_values"},
    ]


def _build_config_values_text(fd: dict) -> str:
    if fd["current_values_mode"] == "structured":
        lines = []
        for group in fd["current_values_structured"]:
            lines.append(f"{group['group_name']}:")
            for param in group["parameters"]:
                lines.append(f"  {param['name']}: {param['value']}")
        return "\n".join(lines)
    else:
        return fd["current_values_free_text"]
