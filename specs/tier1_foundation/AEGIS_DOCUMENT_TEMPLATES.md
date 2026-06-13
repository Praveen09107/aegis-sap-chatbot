# AEGIS DOCUMENT TEMPLATES
## The Three Template Formats for IT Admin Document Uploads
## Place in: specs/tier1_foundation/

---

## PURPOSE OF THIS DOCUMENT

This document contains the three document templates that the IT admin must fill in when creating AEGIS knowledge base documents. These templates define the exact field names, section separators, and content structure that the Document Ingestion Pipeline expects to find.

The ingestion pipeline's field detection stage (Stage 3) identifies fields by scanning for uppercase labels followed by a colon at the start of lines. Section separators (lines of equals signs or dashes) are used to identify cause blocks in error guides and phase boundaries in procedures.

This document serves two audiences:
1. **The IT admin** who fills in the templates
2. **The AI agent** implementing the ingestion pipeline, who must write the field detector to recognise exactly these field names and separators

---

## TEMPLATE 1 — ERROR GUIDE (content_type: error_guide)

Copy everything below the line "=== BEGIN TEMPLATE ===" and replace the [PLACEHOLDER] text with actual content.

Document ID format: `{MODULE}-ERR-{NUMBER}` — for example `SD-ERR-001`, `FI-ERR-003`, `MM-ERR-012`

```
=== BEGIN TEMPLATE ===

DOCUMENT_ID: [MODULE-ERR-NUMBER e.g. SD-ERR-001]
CONTENT_TYPE: error_guide
MODULE: [FI | MM | SD | HR | PP | CO | BASIS]
ERROR_CODE: [The SAP error code e.g. VL150]
TRANSACTIONS: [Comma-separated list of relevant T-codes e.g. VL01N, MMBE, MB52]
WHEN_THIS_OCCURS:
[Describe in 2-4 sentences when employees encounter this error. What were they trying to do? What appears on screen?]

================================================================================
CAUSE_1: [Short name for this cause, e.g. "Safety Stock Setting Too High"]
================================================================================

CAUSE_1_HOW_TO_IDENTIFY:
[Step-by-step instructions for the employee to determine if this specific cause applies to their situation. Be specific about what to look at and what values indicate this cause.]

CAUSE_1_RESOLUTION_STEPS:
[Complete numbered resolution steps. Number each step starting from 1. Include exact field names, exact T-codes, exact button labels. Example:
1. Go to transaction MM02 (Material Master Change).
2. Enter the material number from the error screen.
3. Select plant [the plant code shown in the error] and press Enter.
4. Go to the MRP 2 tab.
5. Find the Safety Stock field and reduce the value to be lower than the current unrestricted stock.
6. Save the change (press Ctrl+S or click the Save button).
7. Return to VL01N and attempt delivery creation again.]

CAUSE_1_RELATED_CONFIG: [Optional: document IDs of related config documents, e.g. SD-CFG-003]

================================================================================
CAUSE_2: [Short name for second cause, e.g. "Excess Reservations Blocking Stock"]
================================================================================

CAUSE_2_HOW_TO_IDENTIFY:
[Identification steps for cause 2]

CAUSE_2_RESOLUTION_STEPS:
[Numbered resolution steps for cause 2]

CAUSE_2_RELATED_CONFIG: [Optional]

[Add more CAUSE_N sections as needed. Each cause block must follow the same pattern.]

================================================================================
SUCCESS_INDICATOR:
[Describe exactly what the employee sees when the issue is resolved. Example: "The delivery number is generated and the VL01N screen shows the delivery document with a document number. No error message appears."]

ADMIN_STEPS:
[Optional: Steps that require IT admin or SAP consultant access. Clearly label these as requiring elevated access. Example: "If the safety stock configuration appears incorrect across multiple materials, an SAP consultant should review the MRP planning parameters in transaction MD04."]

ESCALATION_CRITERIA:
[List the specific conditions under which the employee should escalate to IT instead of trying to resolve themselves. Example:
- If the safety stock is already set to 0 and the error persists
- If the unrestricted stock shows 0 in MMBE but the system shows available quantity in other reports
- If the same error occurs for multiple different materials simultaneously
- If resolution steps were followed but the error recurs within the same business day]

RELATED_ERRORS: [Comma-separated document IDs of related error guides, e.g. SD-ERR-002, FI-ERR-001]

LAST_VERIFIED_DATE: [YYYY-MM-DD format, e.g. 2024-03-28]
VERIFIED_BY: [SAP team member name or ID who verified this document, e.g. Rsuresh1]

=== END TEMPLATE ===
```

### Error Guide Field Reference

| Field Name | Required | Notes |
|---|---|---|
| DOCUMENT_ID | Yes | Must match format MODULE-ERR-NNN |
| CONTENT_TYPE | Yes | Must be exactly: error_guide |
| MODULE | Yes | Must be one of: FI, MM, SD, HR, PP, CO, BASIS |
| ERROR_CODE | Yes | Exact SAP error code as shown on screen |
| TRANSACTIONS | Yes | Comma-separated, no spaces after commas |
| WHEN_THIS_OCCURS | Yes | Must have content, not empty |
| CAUSE_N separator | Yes | Line of equals signs (minimum 20) |
| CAUSE_N | Yes | At least CAUSE_1 must exist |
| CAUSE_N_HOW_TO_IDENTIFY | Yes | For each cause block |
| CAUSE_N_RESOLUTION_STEPS | Yes | For each cause block, MUST have numbered steps |
| CAUSE_N_RELATED_CONFIG | No | Optional, may be omitted |
| SUCCESS_INDICATOR | Yes | Must have content |
| ADMIN_STEPS | No | Optional, may be omitted |
| ESCALATION_CRITERIA | Yes | Must have content |
| RELATED_ERRORS | No | Optional, may be omitted |
| LAST_VERIFIED_DATE | Yes | Must be YYYY-MM-DD format |
| VERIFIED_BY | Yes | Must have content |

---

## TEMPLATE 2 — PROCEDURE (content_type: procedure)

Document ID format: `{MODULE}-PROC-{NUMBER}` — for example `SD-PROC-001`, `MM-PROC-003`

```
=== BEGIN TEMPLATE ===

DOCUMENT_ID: [MODULE-PROC-NUMBER e.g. SD-PROC-001]
CONTENT_TYPE: procedure
MODULE: [FI | MM | SD | HR | PP | CO | BASIS]
PROCEDURE_NAME: [Full descriptive name e.g. "Scheduling Agreement Creation Using YDSA Order Type"]
PURPOSE:
[One to two sentences explaining what this procedure accomplishes. Example: "This procedure creates a scheduling agreement in SAP SD for Sona Comstar's overseas export customers using the YDSA order type, enabling automatic delivery schedule management."]

WHEN_TO_USE:
[Describe the business scenarios when an employee should follow this procedure. Example:
- When creating a new scheduling agreement for a Comestel HK or Comestel overseas customer
- When the customer ordering pattern requires scheduled deliveries over a contract period
- When the sales order type YDSA is specified by the customer or sales team]

PREREQUISITES:
[List everything that must be true or prepared before starting this procedure. Example:
- Customer master data must be created and active in the system
- A valid pricing procedure must be assigned to the customer
- The material master for all products in the agreement must have MRP settings configured
- Plant 9000 (GIT Warehouse): storage location Y013 must exist for all materials being shipped from this plant]

TRANSACTIONS: [Comma-separated T-codes used in this procedure, e.g. VA31, VA32, VL01N, VF01]

================================================================================
PHASE_NAME: Phase 1 — Scheduling Agreement Header Creation
================================================================================

STEP_1:
[Complete description of step 1. Include the exact T-code, the exact screen title, exact field names, and exact values to enter. Example: "Navigate to transaction VA31 (Create Scheduling Agreement). The screen title 'Create Scheduling Agreement: Initial Screen' appears."]

STEP_2:
[Step 2 description. Mention any important field validations or system responses to expect.]

STEP_3:
[Step 3 description.]

STEP_4:
[Step 4 description. If this step requires a specific plant or storage location that varies, note the different values. Example: "In the Plant field, enter the plant code. NOTE: If the plant is 9000 (GIT Warehouse), the Storage Location field Y013 is mandatory and must be entered on the same screen. Do not proceed without entering Y013 for plant 9000."]

================================================================================
PHASE_NAME: Phase 2 — Scheduling Lines and Delivery Dates
================================================================================

STEP_5:
[First step of Phase 2]

STEP_6:
[Continue with steps. Each phase should have 3-6 steps.]

STEP_7:
[...]

================================================================================
PHASE_NAME: Phase 3 — Saving and Confirmation
================================================================================

STEP_8:
[...]

STEP_9:
[...]

VERIFICATION_STEPS:
[After completing all steps, how does the employee verify the procedure completed successfully? Include specific system confirmations to look for. Example:
1. A scheduling agreement document number is displayed at the bottom of the screen (e.g. "Scheduling agreement [number] has been saved").
2. Navigate to VA33 (Display Scheduling Agreement) and enter the document number to confirm all fields are correctly saved.
3. Check the Schedule Lines tab to confirm the delivery dates are correctly entered.]

COMMON_ERRORS_IN_THIS_PROCEDURE: [Comma-separated document IDs of errors commonly encountered while following this procedure, e.g. SD-ERR-001, SD-ERR-005]

POST_COMPLETION_NOTES:
[Optional: Important information about what happens after the procedure, follow-up steps by other teams, or system behaviours to be aware of. Example: "After the scheduling agreement is saved, the warehouse team receives the delivery schedule notification automatically. The finance team will issue invoices based on the billing plan dates configured in the scheduling agreement."]

LAST_VERIFIED_DATE: [YYYY-MM-DD]
VERIFIED_BY: [Name or ID]

=== END TEMPLATE ===
```

### Procedure Field Reference

| Field Name | Required | Notes |
|---|---|---|
| DOCUMENT_ID | Yes | Must match format MODULE-PROC-NNN |
| CONTENT_TYPE | Yes | Must be exactly: procedure |
| MODULE | Yes | One of: FI, MM, SD, HR, PP, CO, BASIS |
| PROCEDURE_NAME | Yes | Full descriptive name |
| PURPOSE | Yes | Must have content |
| WHEN_TO_USE | Yes | Must have content |
| PREREQUISITES | Yes | Must have content |
| TRANSACTIONS | Yes | Comma-separated |
| PHASE_NAME separator | Yes | Line of equals signs before each phase |
| PHASE_NAME | Yes | At least one phase with at least 3 steps |
| STEP_N | Yes | Steps numbered sequentially across all phases |
| VERIFICATION_STEPS | Yes | Must have numbered verification steps |
| COMMON_ERRORS_IN_THIS_PROCEDURE | No | Optional |
| POST_COMPLETION_NOTES | No | Optional |
| LAST_VERIFIED_DATE | Yes | YYYY-MM-DD format |
| VERIFIED_BY | Yes | Must have content |

### Important Procedure Rules for IT Admin

1. Steps must be numbered sequentially across all phases. If Phase 1 has steps 1-4 and Phase 2 starts, Phase 2's first step is STEP_5 (not STEP_1 again).
2. Every STEP_N must have content. Do not create empty steps.
3. Phase boundaries (PHASE_NAME separator lines) must separate steps that belong to genuinely different workflow phases — for example, document creation vs. scheduling lines entry vs. saving.
4. If a step applies differently to different plants or configurations, explain both versions within the same step rather than creating separate steps.

---

## TEMPLATE 3 — CONFIGURATION (content_type: config)

Document ID format: `{MODULE}-CFG-{NUMBER}` — for example `FI-CFG-003`, `MM-CFG-001`

```
=== BEGIN TEMPLATE ===

DOCUMENT_ID: [MODULE-CFG-NUMBER e.g. FI-CFG-003]
CONTENT_TYPE: config
MODULE: [FI | MM | SD | HR | PP | CO | BASIS]
CONFIGURATION_NAME: [Full descriptive name e.g. "G/L Account Determination for SD Billing Types"]
WHAT_THIS_CONTROLS:
[Explain what this configuration setting controls in plain business language. What business process depends on this being correctly configured? Example: "This configuration maps SD billing document types to the Financial Accounting G/L accounts where revenue, tax, and discounts are posted when a billing document is created. Without correct account assignment, billing documents cannot generate accounting entries and the FI document will not be created."]

CHANGE_FREQUENCY: [rare | monthly | quarterly | annual | as-needed]

NAVIGATION:
[Provide the exact SAP navigation path to reach this configuration. Include both the T-code and the menu path. Example:
T-Code: VKOA
Menu path: SAP Easy Access → Logistics → Sales and Distribution → Master Data → Define Account Assignment Groups → Revenue Account Determination (VKOA)
Screen title: "Revenue Account Determination: Condition Table"

Alternatively via customising:
SPRO → Sales and Distribution → Basic Functions → Account Assignment / Costing → Revenue Account Determination → Assign G/L Accounts]

================================================================================
CURRENT_VALUES_AT_SONA_COMSTAR:
================================================================================

[This section MUST contain the actual current configuration values. Do not leave placeholders. This is the most critical section — employees ask about these values constantly. Enter the actual values from Sona Comstar's SAP system.

Format the values as a clear table or structured list. Example:

Account Determination Procedure: KOFI00

Chart of Accounts: INT

Company Code: 1000 (Comstar India)

Billing Type Assignments:
- F2 (Standard Invoice) → G/L Account 800000 (Domestic Revenue)
- YASE (Export Invoice YDSA) → G/L Account 800010 (Export Revenue)
- G2 (Credit Memo) → G/L Account 800020 (Revenue Correction)
- FP (Down Payment Request) → G/L Account 190000 (Customer Down Payment)

Tax Account Assignments:
- Output Tax (MWS) → G/L Account 175100 (Output Tax Payable)
- Withholding Tax (W1) → G/L Account 172000 (Withholding Tax Payable)

Account Assignment Groups (Customer):
- 01 (Domestic Customer) → Account Key: ERL → G/L: 800000
- 02 (Export Customer) → Account Key: ERL → G/L: 800010
- 03 (Intercompany) → Account Key: ERL → G/L: 800020]

CHANGE_PROCESS:
[Who can make changes to this configuration and what approval is required? Example: "Changes to G/L account assignments require approval from the Finance Controller and must be coordinated with the external auditor if they affect the chart of accounts mapping. Changes are made by the SAP FI consultant in the production system during a planned maintenance window. Test must be performed in the quality system first."]

RELATED_ERRORS: [Comma-separated document IDs of errors caused by misconfiguration here, e.g. FI-ERR-003, SD-ERR-007]

LAST_VERIFIED_DATE: [YYYY-MM-DD]
VERIFIED_BY: [Name or ID]

=== END TEMPLATE ===
```

### Configuration Field Reference

| Field Name | Required | Notes |
|---|---|---|
| DOCUMENT_ID | Yes | Must match format MODULE-CFG-NNN |
| CONTENT_TYPE | Yes | Must be exactly: config |
| MODULE | Yes | One of: FI, MM, SD, HR, PP, CO, BASIS |
| CONFIGURATION_NAME | Yes | Full descriptive name |
| WHAT_THIS_CONTROLS | Yes | Must have content |
| CHANGE_FREQUENCY | Yes | Must be one of the listed values |
| NAVIGATION | Yes | Must include T-code |
| CURRENT_VALUES separator | Yes | Line of equals signs above and below |
| CURRENT_VALUES_AT_SONA_COMSTAR | Yes | MUST contain actual current values — not placeholders |
| CHANGE_PROCESS | Yes | Must have content |
| RELATED_ERRORS | No | Optional |
| LAST_VERIFIED_DATE | Yes | YYYY-MM-DD format |
| VERIFIED_BY | Yes | Must have content |

### Critical Rule for Config Documents

The `CURRENT_VALUES_AT_SONA_COMSTAR` section is treated as a single unbreakable chunk by the ingestion pipeline. It is never split regardless of length. The IT admin must enter the complete, current actual values from the production SAP system. This is what employees need when they ask "what is the current setting for X?" — they need Sona Comstar's specific values, not generic SAP defaults.

---

## SECTION SEPARATOR PATTERNS RECOGNISED BY THE INGESTION PIPELINE

The ingestion pipeline recognises three types of separators:

**Type 1 — Major section separator (equals signs, minimum 20 characters):**
```
================================================================================
```
Used in error guides to separate cause blocks. Used in configs to bracket CURRENT_VALUES section.

**Type 2 — Phase separator (dashes, minimum 20 characters):**
```
--------------------------------------------------------------------------------
```
Alternative separator, treated the same as equals sign separator.

**Type 3 — PHASE_NAME keyword:**
The exact text `PHASE_NAME:` followed by content — identifies a new phase in procedure documents.

---

## VALIDATION RULES THE INGESTION PIPELINE ENFORCES

When an IT admin uploads a document, the pipeline validates:

1. CONTENT_TYPE must be exactly `error_guide`, `procedure`, or `config` (lowercase)
2. DOCUMENT_ID must match the regex: `^(FI|MM|SD|HR|PP|CO|BASIS)-(ERR|PROC|CFG)-\d{3}$`
3. For error_guide: must have at least one CAUSE block with both HOW_TO_IDENTIFY and RESOLUTION_STEPS
4. For procedure: must have at least one PHASE_NAME section with at least three STEP_N entries
5. For config: CURRENT_VALUES_AT_SONA_COMSTAR must not be empty or contain only placeholder text (the phrase "[PLACEHOLDER]" causes rejection)
6. LAST_VERIFIED_DATE must be in YYYY-MM-DD format
7. VERIFIED_BY must not be empty

If any validation fails, the pipeline returns a specific error message identifying the exact field that failed and what the correct format should be.

---

## EXAMPLE COMPLETE ERROR GUIDE (for reference)

This is a complete, filled-in example the IT admin can use as a model.

```
DOCUMENT_ID: SD-ERR-001
CONTENT_TYPE: error_guide
MODULE: SD
ERROR_CODE: VL150
TRANSACTIONS: VL01N, MMBE, MB52, MB25, MM02
WHEN_THIS_OCCURS:
This error appears when an employee attempts to create an outbound delivery in VL01N and the system cannot confirm the full delivery quantity because the available stock minus safety stock is less than the requested quantity. The error message reads "Only X EA of material [number] available" where X is less than the quantity being ordered.

================================================================================
CAUSE_1: Safety Stock Configured Higher Than Available Stock
================================================================================

CAUSE_1_HOW_TO_IDENTIFY:
1. Note the material number from the VL150 error message.
2. Go to transaction MMBE (Stock Overview).
3. Enter the material number and plant from the error screen.
4. Check the Unrestricted stock column — if unrestricted stock is greater than 0 but delivery still fails, safety stock may be the cause.
5. Go to transaction MM02 (Change Material Master).
6. Enter the same material number, select the same plant, and navigate to the MRP 2 tab.
7. Look at the Safety Stock field. If this value equals or exceeds the unrestricted stock, this is Cause 1.

CAUSE_1_RESOLUTION_STEPS:
1. Go to transaction MM02 (Change Material Master). If you do not have access, request your IT admin to perform this step.
2. Enter the material number shown in the VL150 error message.
3. Select the plant shown in the error message and press Enter.
4. Navigate to the MRP 2 tab.
5. Locate the Safety Stock field.
6. Reduce the Safety Stock value to a number lower than the current unrestricted stock shown in MMBE.
7. Save the material master record (Ctrl+S or click the floppy disk icon).
8. Return to VL01N and attempt to create the delivery again.
9. If the delivery creates successfully, the issue is resolved.

CAUSE_1_RELATED_CONFIG: MM-CFG-001

================================================================================
CAUSE_2: Excess Reservations Consuming Available Stock
================================================================================

CAUSE_2_HOW_TO_IDENTIFY:
1. Go to transaction MB25 (Reservation List).
2. Enter the material number and plant from the error screen.
3. Review the list of open reservations. If the total reserved quantity approaches or exceeds the unrestricted stock shown in MMBE, this is Cause 2.
4. Alternatively, go to MMBE and check if the "Reserved" quantity column shows a significant value.

CAUSE_2_RESOLUTION_STEPS:
1. Go to transaction MB25 (Reservation List).
2. Enter the material number and plant.
3. Review each reservation to identify any that are outdated or no longer needed.
4. Request your SAP MM consultant or IT admin to close or delete reservations that are no longer required.
5. Note: Do not close reservations without confirming with the relevant department that they are no longer needed — reservations may be linked to production orders.
6. Once unnecessary reservations are closed, return to VL01N and attempt delivery creation again.

================================================================================
SUCCESS_INDICATOR:
The delivery document is created successfully and a delivery number appears at the bottom of the VL01N screen (example: "Delivery [number] has been saved"). No VL150 error message appears. The new delivery document can be viewed in transaction VL03N.

ADMIN_STEPS:
If the safety stock parameter appears incorrectly set across multiple materials simultaneously, the MRP planning parameters should be reviewed. An SAP MM consultant should check the MRP group configuration in transaction OPPR and the plant-level safety stock planning rules.

ESCALATION_CRITERIA:
- If the safety stock is already 0 in MM02 and the VL150 error still appears
- If unrestricted stock in MMBE shows 0 EA but physical stock is confirmed present in the warehouse
- If the error is occurring for more than 5 different materials on the same day (may indicate a system batch job failure)
- If the delivery was previously successful for the same material and plant combination without any configuration changes

RELATED_ERRORS: SD-ERR-002, MM-ERR-001
LAST_VERIFIED_DATE: 2024-03-28
VERIFIED_BY: Rsuresh1
```

---

*These templates are final. The ingestion pipeline is built to recognise exactly these field names. Do not modify field names after implementation begins.*
*Document version: 1.0 | AEGIS Specification Set*
