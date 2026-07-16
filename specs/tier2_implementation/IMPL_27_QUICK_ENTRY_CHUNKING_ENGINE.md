# IMPL_27 — QUICK ENTRY: CHUNKING ENGINE
## AEGIS SAP Helpdesk AI — Structure-Aware Chunking for Quick Entry Submissions
## Depends on: IMPL_23, IMPL_24, IMPL_26

---

## 1. OVERVIEW

This document specifies the complete structure-aware chunking system for Quick
Entry submissions. The chunking engine (`app/services/form_chunker.py`) is called
from Stage A4 of the `process_form_entry` ARQ task (IMPL_26).

Structure-aware chunking is superior to the document pipeline's generic token-
count chunking because:

1. Cause-resolution pairs always stay together in one chunk (never split)
2. Priority-ordered causes guide the LLM to present high-priority resolutions first
3. Config values always occupy a separate chunk for precise value lookups
4. Branch groups in procedures are never split across chunk boundaries
5. Admin-required steps are explicitly labelled in chunk text
6. The NONE keyword is never written into chunk text (prevents retrieval pollution)

---

## 2. CHUNK TYPE ENUM — ALL VALID VALUES

```
For content_type = 'error_guide':
  error_overview          — always exactly 1 chunk per entry
  cause_1                 — one per non-obsolete cause (index 1-based)
  cause_2
  cause_N (up to cause_10)

For content_type = 'procedure':
  proc_overview           — always exactly 1 chunk per entry
  proc_steps_1            — steps 1-5 (or first branch group)
  proc_steps_2            — steps 6-10 (or second batch)
  proc_steps_N            — continues as needed

For content_type = 'config':
  cfg_overview            — always exactly 1 chunk per entry
  cfg_values              — always exactly 1 chunk per entry (always 2 total)
```

The `associated_section` field on screenshots uses these same values to
indicate which chunk the screenshot enriches.

---

## 3. HEADER PREFIX

Every chunk begins with the same short header prefix. The prefix is short to
minimise its semantic weight in the embedding relative to the actual content.

```
[{document_id}] [{module}] [SOURCE: form_entry]
```

Transactions are **not** repeated in the header prefix of non-overview chunks.
They appear once in the overview chunk's body under the TRANSACTIONS line.
This prevents over-representation of popular transaction names in the vector
space.

The full header with a concrete example:
```
[SAP-SD-PRO-IN-21] [SD] [SOURCE: form_entry]
```

---

## 4. ASSEMBLY MODULE: app/services/form_chunker.py

```python
from typing import Any

HEADER = lambda doc_id, module: (
    f"[{doc_id}] [{module}] [SOURCE: form_entry]\n"
)

def assemble_chunks(
    entry_id: str,
    document_id: str,
    content_type: str,
    module: str,
    transactions: list[str],
    verified_by_name: str,
    verified_date: Any,      # date object or YYYY-MM-DD string
    form_data: dict,
    version: int
) -> list[dict]:
    """
    Returns a list of chunk dicts. Each dict:
    {
      chunk_type:         str
      text:               str  (complete assembled text for this chunk)
      associated_section: str  (same as chunk_type)
    }
    """
    verified_str = str(verified_date)  # ensure string for text assembly

    if content_type == 'error_guide':
        return _assemble_error_guide(
            document_id, module, transactions, verified_by_name, verified_str, form_data
        )
    elif content_type == 'procedure':
        return _assemble_procedure(
            document_id, module, transactions, verified_by_name, verified_str, form_data
        )
    elif content_type == 'config':
        return _assemble_config(
            document_id, module, transactions, verified_by_name, verified_str, form_data
        )
    else:
        raise ValueError(f"Unknown content_type: {content_type}")
```

---

## 5. ERROR GUIDE CHUNKING

### 5.1 Overview chunk

```python
def _assemble_error_guide(
    document_id, module, transactions, verified_by_name, verified_date, form_data
) -> list[dict]:

    h = HEADER(document_id, module)
    fd = form_data
    transactions_str = ', '.join(transactions)

    # Filter to non-obsolete causes only
    active_causes = [c for c in fd['causes'] if not c.get('cause_obsolete', False)]
    obsolete_count = len(fd['causes']) - len(active_causes)

    # Sort active causes by priority (check_first first, then common, less_common, rare)
    priority_order = {'check_first': 0, 'common': 1, 'less_common': 2, 'rare': 3}
    active_causes_sorted = sorted(
        active_causes,
        key=lambda c: priority_order.get(c.get('priority', 'common'), 1)
    )

    # Build cause summary for overview (priority-ordered)
    cause_summary_lines = []
    for i, cause in enumerate(active_causes_sorted, 1):
        priority_label = cause.get('priority', 'common').replace('_', ' ').title()
        cause_summary_lines.append(
            f"  Cause {i} [{priority_label}]: {cause['cause_description']}"
        )
    cause_summary = '\n'.join(cause_summary_lines)

    # Build overview chunk text
    # RULE: Lines for error_code and error_message are OMITTED if value is "NONE"
    lines = [h]
    lines.append(f"ISSUE: {fd['issue_description']}")
    lines.append(f"TRANSACTIONS: {transactions_str}")

    if fd['error_code'].upper() != 'NONE':
        lines.append(f"ERROR CODE: {fd['error_code']}")

    if fd['error_message'].upper() != 'NONE':
        lines.append(f"ERROR MESSAGE: {fd['error_message']}")

    lines.append(f"DESCRIPTION: {fd['description']}")
    lines.append(f"WHEN THIS OCCURS: {fd['when_this_occurs']}")

    lines.append(
        f"CAUSES ({len(active_causes)} active, priority-ordered):\n{cause_summary}"
    )

    if obsolete_count > 0:
        lines.append(
            f"NOTE: {obsolete_count} cause(s) have been marked as no longer applicable."
        )

    lines.append(f"SUCCESS INDICATOR: {fd['success_indicator']}")
    lines.append(f"ESCALATION CRITERIA: {fd['escalation_criteria']}")

    if fd['admin_steps'].upper() != 'NONE':
        lines.append(f"ADMIN STEPS: {fd['admin_steps']}")

    if fd.get('notes', '').strip():
        lines.append(f"NOTES: {fd['notes']}")

    lines.append(f"VERIFIED BY: {verified_by_name} on {verified_date}")

    overview_text = '\n'.join(lines)

    chunks = [{
        "chunk_type": "error_overview",
        "text": overview_text,
        "associated_section": "error_overview"
    }]

    # Cause chunks — one per non-obsolete cause in priority order
    total_active = len(active_causes_sorted)
    for i, cause in enumerate(active_causes_sorted, 1):
        priority_label = cause.get('priority', 'common').replace('_', ' ').title()
        admin_label = "[Requires IT admin access] " if cause.get('resolution_requires_admin') else ""

        cause_lines = [h]
        cause_lines.append(f"ISSUE: {fd['issue_description']}")
        cause_lines.append(
            f"CAUSE {i} OF {total_active} [{priority_label}]: {cause['cause_description']}"
        )
        cause_lines.append(f"HOW TO IDENTIFY: {cause['how_to_identify']}")
        cause_lines.append(
            f"RESOLUTION {admin_label}: {cause['resolution_steps']}"
        )

        if cause.get('resolution_requires_admin'):
            cause_lines.append(
                "ADMIN NOTE: The resolution steps above require IT admin access. "
                "Employees unable to perform these steps should raise a support ticket."
            )

        # Screenshot placeholder — actual text appended by enrich_entry_screenshots task
        # The has_screenshots field in the Qdrant payload handles retrieval linking

        chunk_number = i
        cause_lines.append(f"VERIFIED BY: {verified_by_name} on {verified_date}")

        chunks.append({
            "chunk_type": f"cause_{chunk_number}",
            "text": '\n'.join(cause_lines),
            "associated_section": f"cause_{chunk_number}"
        })

    return chunks
```

### 5.2 Priority label in chunk text

The `[priority_label]` in cause chunk titles serves the CRAG/LLM system:

When the CRAG prompt instructs the LLM: "If the source chunk contains cause
priority information in square brackets, present higher-priority causes first
in your answer and explicitly note which cause is most common." (IMPL_12/IMPL_15
system prompt — see addition in IMPL_29.)

---

## 6. PROCEDURE CHUNKING

### 6.1 Overview + steps batching

```python
CHUNK_STEPS_PER_BATCH = 5          # from constants
CHUNK_BRANCH_MAX_TOKENS = 1500     # from constants
```

```python
def _assemble_procedure(
    document_id, module, transactions, verified_by_name, verified_date, form_data
) -> list[dict]:

    h = HEADER(document_id, module)
    fd = form_data
    transactions_str = ', '.join(transactions)

    # Build common errors text
    common_errors_lines = []
    for err in fd['common_errors']:
        if err['error_code'].upper() == 'NONE':
            continue
        line = f"  - {err['error_code']}: {err['cause_summary']}"
        if err.get('see_document_id'):
            line += f" → see {err['see_document_id']}"
        common_errors_lines.append(line)

    common_errors_text = '\n'.join(common_errors_lines) if common_errors_lines else '  None'

    # Build overview chunk
    overview_lines = [h]
    overview_lines.append(f"PROCEDURE: {fd['procedure_name']}")
    overview_lines.append(f"TRANSACTIONS: {transactions_str}")
    overview_lines.append(f"PURPOSE: {fd['purpose']}")
    overview_lines.append(f"WHEN TO USE: {fd['when_to_use']}")

    if fd['data_required'].upper() != 'NONE':
        overview_lines.append(f"DATA REQUIRED: {fd['data_required']}")
    if fd['system_conditions'].upper() != 'NONE':
        overview_lines.append(f"SYSTEM CONDITIONS: {fd['system_conditions']}")
    overview_lines.append(f"ACCESS REQUIRED: {fd['access_required']}")

    overview_lines.append(f"VERIFICATION: {fd['verification']}")
    overview_lines.append(f"COMMON ERRORS:\n{common_errors_text}")

    if fd.get('plant_notes', '').upper() not in ('', 'NONE'):
        overview_lines.append(f"PLANT NOTES: {fd['plant_notes']}")

    overview_lines.append(f"VERIFIED BY: {verified_by_name} on {verified_date}")

    chunks = [{
        "chunk_type": "proc_overview",
        "text": '\n'.join(overview_lines),
        "associated_section": "proc_overview"
    }]

    # Step batching — respects branch boundaries
    steps = fd['steps']
    # Inject step_number at batch time
    for i, step in enumerate(steps):
        step['step_number'] = i + 1

    batches = _batch_steps(steps)

    for batch_idx, batch in enumerate(batches, 1):
        chunk_type = f"proc_steps_{batch_idx}"
        step_nums = [s['step_number'] for s in batch]
        range_label = f"{step_nums[0]}" if len(step_nums) == 1 else f"{step_nums[0]} TO {step_nums[-1]}"

        step_lines = [h]
        step_lines.append(f"PROCEDURE: {fd['procedure_name']}")
        step_lines.append(f"STEPS {range_label}:")

        for step in batch:
            admin_prefix = "[Requires IT admin access] " if step['step_type'] == 'admin_required' else ""
            branch_prefix = _get_branch_prefix(step['step_type'])
            step_lines.append(
                f"STEP {step['step_number']} {branch_prefix}{admin_prefix}: {step['action']}"
            )
            if step['step_type'] == 'admin_required':
                step_lines.append(
                    "  → This step requires IT admin access. "
                    "Raise a support ticket if you cannot perform this action."
                )

        chunks.append({
            "chunk_type": chunk_type,
            "text": '\n'.join(step_lines),
            "associated_section": chunk_type
        })

    return chunks
```

### 6.2 Branch-aware step batching

```python
def _batch_steps(steps: list[dict]) -> list[list[dict]]:
    """
    Groups steps into batches of CHUNK_STEPS_PER_BATCH (5).
    Branch groups (branch_start through branch_end) are kept together.
    If a branch group exceeds CHUNK_BRANCH_MAX_TOKENS (1500), it is split
    at the last step before the token limit, with continuation annotations.
    """
    batches = []
    current_batch = []
    in_branch = False
    branch_buffer = []

    for step in steps:
        step_type = step.get('step_type', 'normal')

        if step_type == 'branch_start':
            # Flush current batch before starting branch group
            if current_batch:
                batches.append(current_batch)
                current_batch = []
            in_branch = True
            branch_buffer = [step]

        elif in_branch:
            branch_buffer.append(step)

            if step_type == 'branch_end':
                in_branch = False
                # Check if branch group exceeds token limit
                branch_text = '\n'.join([s['action'] for s in branch_buffer])
                if len(branch_text) > CHUNK_BRANCH_MAX_TOKENS:
                    # Split branch group at token limit
                    batches.extend(_split_branch_group(branch_buffer))
                else:
                    batches.append(branch_buffer)
                branch_buffer = []

        else:
            # Normal step
            current_batch.append(step)
            if len(current_batch) >= CHUNK_STEPS_PER_BATCH:
                batches.append(current_batch)
                current_batch = []

    # Remaining steps
    if branch_buffer:
        batches.append(branch_buffer)  # unclosed branch — include as-is
    if current_batch:
        batches.append(current_batch)

    return batches


def _split_branch_group(branch_steps: list[dict]) -> list[list[dict]]:
    """
    Split an oversized branch group at the last complete step before
    CHUNK_BRANCH_MAX_TOKENS, annotating both resulting chunks.
    """
    CONTINUATION_NOTE = {"step_number": 0, "action": "[Branch continues from previous chunk]",
                         "step_type": "normal", "screenshot_ids": []}
    CONTINUES_NOTE = {"step_number": 0, "action": "[Branch continues in next chunk]",
                      "step_type": "normal", "screenshot_ids": []}

    cumulative_chars = 0
    split_idx = len(branch_steps) // 2  # default midpoint

    for i, step in enumerate(branch_steps):
        cumulative_chars += len(step['action'])
        if cumulative_chars > CHUNK_BRANCH_MAX_TOKENS:
            split_idx = max(i - 1, 1)  # split before this step, min 1 step in first batch
            break

    first_half = branch_steps[:split_idx] + [CONTINUES_NOTE]
    second_half = [CONTINUATION_NOTE] + branch_steps[split_idx:]

    return [first_half, second_half]


def _get_branch_prefix(step_type: str) -> str:
    """Returns visual prefix for branch steps in chunk text."""
    prefixes = {
        'branch_start':    '[IF/CONDITION] ',
        'branch_option_a': '[OPTION A] ',
        'branch_option_b': '[OPTION B] ',
        'branch_end':      '[END CONDITION] ',
        'admin_required':  '',  # handled separately
        'normal':          '',
    }
    return prefixes.get(step_type, '')
```

---

## 7. CONFIGURATION REFERENCE CHUNKING

Config entries always produce exactly 2 chunks.

```python
def _assemble_config(
    document_id, module, transactions, verified_by_name, verified_date, form_data
) -> list[dict]:

    h = HEADER(document_id, module)
    fd = form_data
    transactions_str = ', '.join(transactions)

    # Build related errors text
    related_errors_lines = []
    for err in fd['related_errors']:
        if err['error_code'].upper() == 'NONE':
            continue
        line = f"  - {err['error_code']}: {err['misconfiguration_cause']}"
        if err.get('see_document_id'):
            line += f" → see {err['see_document_id']}"
        related_errors_lines.append(line)

    related_errors_text = '\n'.join(related_errors_lines) if related_errors_lines else '  None'

    # ── CHUNK 1: cfg_overview ─────────────────────────────────────────────────
    overview_lines = [h]
    overview_lines.append(f"CONFIGURATION: {fd['configuration_name']}")
    overview_lines.append(f"TRANSACTIONS: {transactions_str}")

    if fd.get('table_name', '').strip():
        overview_lines.append(f"SAP TABLE: {fd['table_name']}")

    overview_lines.append(f"WHAT THIS CONTROLS: {fd['what_this_controls']}")
    overview_lines.append(f"ACCESS - VIEW: {fd['access_view']}")
    overview_lines.append(f"ACCESS - CHANGE: {fd['access_change']}")
    overview_lines.append(f"CHANGE FREQUENCY: {fd['change_frequency']}")
    overview_lines.append(f"HOW TO NAVIGATE: {fd['how_to_navigate']}")
    overview_lines.append(f"RELATED ERRORS:\n{related_errors_text}")

    if fd.get('notes', '').strip():
        overview_lines.append(f"NOTES: {fd['notes']}")

    overview_lines.append(f"VERIFIED BY: {verified_by_name} on {verified_date}")

    # ── CHUNK 2: cfg_values ───────────────────────────────────────────────────
    # This chunk is the target for "what is the current value of X" questions.
    # It is intentionally separate from the overview to ensure precise retrieval.
    values_text = _build_config_values_text(h, fd)

    values_lines = [h]
    values_lines.append(f"CONFIGURATION: {fd['configuration_name']}")
    values_lines.append(f"CURRENT VALUES AT SONA COMSTAR:")
    values_lines.append(values_text)
    values_lines.append(f"LAST VERIFIED: {verified_by_name} on {verified_date}")

    return [
        {
            "chunk_type": "cfg_overview",
            "text": '\n'.join(overview_lines),
            "associated_section": "cfg_overview"
        },
        {
            "chunk_type": "cfg_values",
            "text": '\n'.join(values_lines),
            "associated_section": "cfg_values"
        }
    ]


def _build_config_values_text(h: str, fd: dict) -> str:
    """
    Converts structured or free-text current values into consistent chunk text.
    Structured mode: groups of parameters with consistent "Name: Value" format.
    Free text mode: used as-is.
    """
    if fd['current_values_mode'] == 'structured':
        lines = []
        for group in fd['current_values_structured']:
            lines.append(f"{group['group_name']}:")
            for param in group['parameters']:
                lines.append(f"  {param['name']}: {param['value']}")
        return '\n'.join(lines)
    else:
        return fd['current_values_free_text']
```

---

## 8. COMPLETE CHUNK FORMAT REFERENCE

The following shows the exact assembled text for a real example, using the
filled SAP-SD-PRO-IN-20 document as reference data.

### Error Guide overview chunk (error_overview):
```
[SAP-SD-PRO-IN-20] [SD] [SOURCE: form_entry]
ISSUE: Tax condition not capturing in Sale Order
TRANSACTIONS: VA01, VA02, BP, MM02, VK12
DESCRIPTION: Tax not captured in the condition tab of the sale order
WHEN THIS OCCURS: Tax classification not maintained in BP and Material master, condition record for the tax category not maintained
CAUSES (5 active, priority-ordered):
  Cause 1 [Check First]: Tax classification is maintained as exempt in the BP
  Cause 2 [Common]: Tax classification is maintained as exempt in Material Master
  Cause 3 [Common]: Condition record was not maintained as per HSN & Region combination
  Cause 4 [Less Common]: Plant data not maintained in sale order
  Cause 5 [Less Common]: Region not maintained in BP
SUCCESS INDICATOR: Sale order has been saved
ESCALATION CRITERIA: If still tax not captured after all the causes have been checked and corrected, raise SAP ticket in issue type
VERIFIED BY: Gokul on 28/03/2025
```

### Error Guide cause chunk (cause_1):
```
[SAP-SD-PRO-IN-20] [SD] [SOURCE: form_entry]
ISSUE: Tax condition not capturing in Sale Order
CAUSE 1 OF 5 [Check First]: Tax classification is maintained as exempt in the BP
HOW TO IDENTIFY: Go to BP T.Code, select the customer master and go to billing tab for the tax classification
RESOLUTION : Change the tax classification as Taxable
VERIFIED BY: Gokul on 28/03/2025
```

Note: If the cause resolution_requires_admin were true, it would read:
```
RESOLUTION [Requires IT admin access]: Change the tax classification as Taxable
ADMIN NOTE: The resolution steps above require IT admin access. Employees unable to perform these steps should raise a support ticket.
```

### Config values chunk (cfg_values):
```
[FI-CFG-001] [FI] [SOURCE: form_entry]
CONFIGURATION: Withholding tax type and rate setup for India
CURRENT VALUES AT SONA COMSTAR:
Company Code 1000 — Comstar India:
  Tax Code G5: Rate: 10%, Type: Input, Active: Yes
  G/L Account CGST: 14001
  G/L Account SGST: 14002
Company Code 4200 — Comestel HK:
  Tax Code H1: Rate: 8%, Type: Input, Active: Yes
LAST VERIFIED: Arun on 15/01/2025
```

---

## 9. CRAG SYSTEM PROMPT ADDITION

The following text must be added to the CRAG LLM system prompt in IMPL_15/IMPL_16
(existing system prompt addition — append, do not replace):

```
When the retrieved context contains cause chunks with priority labels in square
brackets (e.g. [Check First], [Common], [Less Common], [Rare]):
- Present causes in priority order: Check First causes before Common, etc.
- Explicitly state at the start: "The most common cause of this issue is..."
- For each cause, clearly separate the identification method from the resolution steps.

When resolution steps are prefixed with [Requires IT admin access]:
- Clearly inform the employee that this step cannot be performed without IT support.
- Suggest raising a support ticket for admin-required steps.
- Still present the step so the employee understands what will be done on their behalf.

When a retrieved chunk has is_stale: true in its metadata:
- Note to the employee: "Note: This information was last verified on {verified_date}
  and may be outdated. Please verify current values with the IT team."
- Do not omit the information — present it with the caveat.
```

---

## 10. CHUNK COUNT REFERENCE

| Content Type | Causes/Steps | Chunks Produced |
|---|---|---|
| Error Guide | 1 cause | 2 (overview + cause_1) |
| Error Guide | 5 causes | 6 (overview + cause_1..5) |
| Error Guide | 10 causes | 11 (overview + cause_1..10) |
| Procedure | 5 steps | 2 (overview + proc_steps_1) |
| Procedure | 10 steps | 3 (overview + proc_steps_1 + proc_steps_2) |
| Procedure | 25 steps | 6 (overview + proc_steps_1..5) |
| Procedure | 1 branch of 15 steps | 3 (overview + 2 split branch chunks) |
| Config | any | Always exactly 2 (cfg_overview + cfg_values) |

---

*IMPL_27 — Quick Entry Chunking Engine | AEGIS v1.0 | Sona Comstar*
