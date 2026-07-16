# FRONTEND_38 — ADMIN QUICK ENTRY: FORM FIELDS
## AEGIS SAP Helpdesk AI — All Form Fields for All Three Content Types
## Depends on: IMPL_24, IMPL_25, IMPL_27, FRONTEND_37

---

## 1. OVERVIEW

This document is the authoritative specification for every field in every
Quick Entry content type. It defines:
- The exact fields for Error Guide, Procedure, and Config Reference forms
- Validation rules per field (client-side + what matches server validation)
- UX behaviours: NONE checkbox, specificity checker, cross-reference validation,
  priority selector, branch step markers, step auto-renumber, structured values
- The SAP entity detector panel
- The header section (shared across all three content types)

Every field listed here must be implemented exactly as specified. No fields
may be omitted, added, or reordered without updating both this document
and the corresponding backend schema in IMPL_24.

---

## 2. SHARED HEADER SECTION

**Component:** `src/components/quick-entry/FormHeaderSection.tsx`

Present for all three content types. Positioned above the type-specific fields.

### 2.1 Document ID field

```
Type:        Text input
Label:       "Document ID"
Placeholder: "e.g. SAP-SD-PRO-IN-21"
Required:    Yes
Validation:
  - Non-empty, no spaces (spaces → error "Document IDs cannot contain spaces")
  - Unique across all entries (validated by API on submit — 409 if conflict)
  - Pattern: alphanumeric with hyphens only, regex: /^[A-Z0-9-]+$/i
UI behaviour:
  - "Suggest ID" button next to field
  - On click: GET /suggest-doc-id?module={module}&content_type={content_type}
  - Fills field with suggested ID
  - Suggestion only shown if module is already selected
  - Suggestion link: "or let us suggest one →" — subtle text link

Component:
  <FormField label="Document ID" required hint="Unique identifier for this entry">
    <div className="flex items-center gap-2">
      <TextInput
        value={documentId}
        onChange={onDocumentIdChange}
        pattern="[A-Z0-9-]+"
        className="uppercase"
        placeholder="e.g. SAP-SD-PRO-IN-21"
      />
      <button onClick={handleSuggestId} className="text-xs text-[var(--color-accent)] hover:underline whitespace-nowrap">
        Suggest →
      </button>
    </div>
  </FormField>
```

### 2.2 Module field

```
Type:        Select dropdown
Label:       "SAP Module"
Required:    Yes
Options:     FI, MM, SD, HR, PP, CO, BASIS
Validation:  Must select one; no default (start with empty placeholder option)
```

### 2.3 Transactions field

```
Type:        Multi-value tag input (comma-separated, enter to add)
Label:       "Relevant T-Codes / Transactions"
Required:    Yes (at least 1)
Validation:
  - At least 1 transaction
  - Each entry: uppercase letters, numbers, slashes — max 20 chars
  - Auto-uppercase on input
UI:
  - Each transaction shown as a removable pill tag
  - Enter or comma → add tag
  - Backspace on empty input → remove last tag
Hint: "Enter SAP transaction codes separated by commas"
```

### 2.4 Verified by field

```
Type:        Text input
Label:       "Verified by"
Placeholder: "IT team member who verified this"
Required:    Yes (min 2 chars)
Validation:  Min 2 characters
```

### 2.5 Verified date field

```
Type:        Date input (HTML date picker, formatted display dd/mm/yyyy)
Label:       "Verified on"
Required:    Yes
Validation:
  - Must not be a future date (checked in IST timezone)
  - Error: "Verification date cannot be in the future"
```

### 2.6 Review frequency field (Config only)

```
Type:        Select dropdown
Label:       "Review frequency"
Required:    Yes for Config entries, hidden for Error Guide and Procedure
Options:     (from REVIEW_FREQUENCY_OPTIONS constant)
  - Monthly
  - Quarterly (every 3 months)
  - Semi-annual (every 6 months)
  - Annual (once per year)
  - As-needed (no automatic review date)
Default:     Quarterly
Hint:        "You'll be notified when values are due for review"
```

### 2.7 Gap indicator (read-only when pre-filled from Knowledge Gaps)

```
When gapId is set:
  Show: info chip below header
  Text: "📎 Created from Knowledge Gap — submitting will mark that gap as addressed"
  Not a form field — display only
```

---

## 3. ERROR GUIDE FORM FIELDS

**Component:** `src/components/quick-entry/ErrorGuideFormFields.tsx`

### 3.1 Issue description

```
Type:     Textarea (2 rows, auto-expand)
Label:    "Issue description"
Required: Yes, min 10 chars
Hint:     "One sentence describing the problem from the employee's perspective"
Example:  "Tax condition not capturing in Sale Order"
```

### 3.2 Error code

```
Type:     Text input with NONE checkbox
Label:    "SAP error code"
Required: Yes (must fill OR check NONE)
Hint:     "The exact error code displayed in SAP (e.g. VL150)"

NONE checkbox UX:
  Checkbox label: "No error code displayed"
  When checked: input field is greyed out, value set to "NONE" internally
  When unchecked: input field is active, value must be non-empty
  The word "NONE" is NEVER visible to the end user — it is a backend value only
```

### 3.3 Error message

```
Type:     Textarea (2 rows) with NONE checkbox
Label:    "Exact SAP error message text"
Required: Yes (must fill OR check NONE)
Hint:     "Copy the message exactly as SAP displays it, including any codes"

NONE checkbox label: "No specific error message"
```

### 3.4 Description

```
Type:     Textarea (3 rows, auto-expand)
Label:    "Description"
Required: Yes, min 30 chars
Hint:     "Explain in more detail what happens and why this is a problem"
```

### 3.5 When this occurs

```
Type:     Textarea (3 rows)
Label:    "When does this typically occur?"
Required: Yes, min 30 chars
Hint:     "Describe the business context and conditions that trigger this issue"
```

### 3.6 Causes section

The causes section is a dynamic list. Minimum 1, maximum 10 causes.

**Add cause button:**
```
Button: "+ Add cause"  (disabled at 10 causes)
Position: Below last cause block, above success indicator
```

**Per-cause block:**

```
Each cause renders as a card with a subtle border and cause number header.
Cause number is shown in the card header as "Cause N" but is NOT editable —
it is derived from array position.

─── Cause N ─────────────────────────────────── [Drag handle] [Remove ×]
│
│  Priority:          [Select: Check first / Common / Less common / Rare]
│                     Default: Common
│
│  Cause description: [Textarea, min 20 chars]
│  Hint: "What specific misconfiguration or missing data causes this issue?"
│
│  How to identify:   [Textarea, min 20 chars]
│  Hint: "Which T-code, tab, or field does the admin check to confirm this cause?"
│
│  Resolution steps:  [Textarea, min 20 chars + specificity checker]
│  Hint: "Exact steps with T-codes, field names, and values to enter"
│  [SpecificityWarning when triggered]
│
│  ☐ These steps require IT admin access  (sets resolution_requires_admin = true)
│     When checked: prepends [Requires IT admin access] in chunk text
│
│  ☐ Mark this cause as obsolete (no longer applicable)
│     When checked: shows "Obsolete reason" field (required, min 10 chars)
│     Obsolete causes are excluded from chunk assembly (IMPL_27)
│
│  Screenshots for this cause:
│     [ScreenshotUploadZone for this cause section]
│     associated_section = "cause_N"
│
└────────────────────────────────────────────────────────────────────────
```

**Priority selector:**
```typescript
const PRIORITY_OPTIONS = [
  { value: 'check_first', label: 'Check first', description: 'Always try this before others' },
  { value: 'common',      label: 'Common',       description: 'Seen in most occurrences' },
  { value: 'less_common', label: 'Less common',  description: 'Seen occasionally' },
  { value: 'rare',        label: 'Rare',         description: 'Edge case, check last' },
]
// Rendered as a segmented control or styled radio group — not a plain select
```

**Specificity checker:**
A non-blocking warning that appears when the resolution_steps or
how_to_identify field is detected to lack SAP specificity.

```
Triggered when:
  - Field value < 80 characters AND
  - No uppercase T-code pattern found (regex: /\b[A-Z]{2,4}\d{0,2}\b/)
  - AND not acknowledged

Warning UI:
  Yellow inline warning below the field:
  "⚠ This step may lack specificity. AEGIS answers are most useful when
     resolution steps name the exact T-code, field, and value to enter.
     If this level of detail isn't available, you can acknowledge and continue."
  [✓ Acknowledge and continue]

When acknowledged:
  - Warning dismisses
  - specificity_acknowledged = true for this step
  - Acknowledged state persists in form data
  - Warning does not re-appear unless text changes significantly (>30% edit)
```

**Cause reordering:**
- Causes can be reordered by drag-and-drop
- Step numbers automatically update based on array order
- Priority selection does NOT determine order — only labels the cause
- Visual order in the form = order in form_data array = order in chunks

**Cause remove button:**
- Confirmation: simple inline "Remove this cause?" with [Cancel] [Remove] — no modal
- Cannot remove last cause (button disabled when only 1 cause)

### 3.7 Success indicator

```
Type:     Textarea (2 rows)
Label:    "Success indicator"
Required: Yes, min 15 chars
Hint:     "What specific SAP message or screen change confirms the issue is resolved?"
Example:  "Sale order has been saved" or "Document posted, document number displayed"
```

### 3.8 Escalation criteria

```
Type:     Textarea (2 rows)
Label:    "Escalation criteria"
Required: Yes, min 20 chars
Hint:     "When should the employee stop and raise a support ticket?"
```

### 3.9 Admin steps

```
Type:     Textarea (3 rows) with NONE checkbox
Label:    "Admin-only resolution steps"
NONE checkbox label: "No admin-only steps required for this issue"
Required: Yes (must fill OR check NONE)
Hint:     "Steps that AEGIS should not attempt on its own — requires IT admin involvement"
```

### 3.10 Notes

```
Type:     Textarea (2 rows, optional)
Label:    "Additional notes"
Required: No
Hint:     "Version-specific information, edge cases, known limitations"
```

---

## 4. PROCEDURE FORM FIELDS

**Component:** `src/components/quick-entry/ProcedureFormFields.tsx`

### 4.1 Procedure name

```
Type:     Text input
Label:    "Procedure name"
Required: Yes, min 10 chars
Hint:     "A clear, specific name for what this procedure accomplishes"
Example:  "Create Customer Master Record in SD"
```

### 4.2 Purpose

```
Type:     Textarea (2 rows)
Label:    "Purpose"
Required: Yes, min 30 chars
Hint:     "What business objective does this procedure achieve?"
```

### 4.3 When to use

```
Type:     Textarea (2 rows)
Label:    "When to use this procedure"
Required: Yes, min 20 chars
Hint:     "Describe the business scenario that triggers this procedure"
```

### 4.4 Data required

```
Type:     Textarea with NONE checkbox
Label:    "Data required before starting"
NONE label: "No pre-existing data required — can start immediately"
Required: Yes (or NONE checked)
Hint:     "What customer data, document numbers, or other information must the employee have ready?"
```

### 4.5 System conditions

```
Type:     Textarea with NONE checkbox
Label:    "System conditions required"
NONE label: "No specific system state required"
Required: Yes (or NONE checked)
Hint:     "Any SAP configuration or master data that must be in place before starting"
```

### 4.6 Access required

```
Type:     Text input
Label:    "Access required"
Required: Yes, min 3 chars
Hint:     "Authorization object, role, or transaction access needed (e.g. 'VA01 access')"
```

### 4.7 Steps section

Steps are the core of a Procedure. Minimum 3 steps.

**Add step button:** "+ Add step" (always enabled, no maximum)

**Per-step row:**

```
Steps render as a numbered list. Step number is computed from array index.
Numbers are never editable and auto-update when steps are reordered.

Step N: [drag handle] ─────────────────────────────── [remove]

  Step type: [Step type selector — see below]

  Action text: [Textarea, min 20 chars + specificity checker]
  Hint: "Describe this step with the exact T-code, screen name, field, and value"

  ☐ [SpecificityWarning if triggered]

  Screenshots: [ScreenshotUploadZone, associated_section = proc_steps_N batch]
               (actually associated with the batch chunk this step falls in)

────────────────────────────────────────────────────────────────────────────
```

**Step type selector:**

```typescript
const STEP_TYPE_OPTIONS = [
  {
    value: 'normal',
    label: 'Normal step',
    description: 'Standard sequential action',
  },
  {
    value: 'admin_required',
    label: 'Requires IT admin',
    description: 'Step needs admin access — auto-prefixed with [Requires IT admin access] in chunk',
    visual: 'amber border on the step row'
  },
  {
    value: 'branch_start',
    label: 'Branch: Condition start',
    description: 'Marks the beginning of a conditional path (IF/WHEN)',
    visual: 'branch indicator line on left edge of step group'
  },
  {
    value: 'branch_option_a',
    label: 'Branch: Option A',
    description: 'First option in the conditional',
  },
  {
    value: 'branch_option_b',
    label: 'Branch: Option B',
    description: 'Second option in the conditional',
  },
  {
    value: 'branch_end',
    label: 'Branch: Condition end',
    description: 'Marks the end of the conditional block',
  },
]
```

**Branch group visual:**
Steps with type `branch_start`, `branch_option_a`, `branch_option_b`, `branch_end`
are visually connected with a left border line and indentation to indicate
they form a logical group.

**Step reordering:**
- Drag-and-drop reorder
- Step numbers auto-update after each reorder (displayed only, not stored)
- Branch groups: can be reordered as a group (all branch steps move together)
  — a branch_start and its matching branch_end must stay adjacent

**Validation on branch types:**
At submit time, the frontend warns (not errors) if:
- A `branch_start` has no matching `branch_end`
- A `branch_option_a` exists without a `branch_start`

### 4.8 Verification

```
Type:     Textarea (2 rows)
Label:    "Verification"
Required: Yes, min 20 chars
Hint:     "How does the employee confirm the procedure completed successfully?"
```

### 4.9 Common errors section

```
Label:   "Common errors encountered during this procedure"
Type:    Dynamic list. Minimum 1. One element may have error_code="NONE" to indicate none.

Per error row:
  Error code: [Text input] or [NONE checkbox]
  Cause summary: [Text input, min 5 chars]
  See document: [Cross-reference field — see below]

"+ Add common error" button
```

**Cross-reference field:**

```
Type:      Text input with live validation
Label:     "See document (optional)"
Hint:      "Document ID of a related entry that documents this error in detail"

Validation UX:
  - Debounced call: GET /validate-reference?doc_id={value} after 500ms of no typing
  - While validating: spinner icon in field
  - Valid:   Green checkmark + "{document title}" shown below field
  - Invalid: Red X + "Document ID not found in knowledge base"
  - Empty:   No validation (field is optional)

Stores: see_document_id (string) and reference_validated (boolean)
```

### 4.10 Plant notes

```
Type:     Textarea with NONE checkbox
Label:    "Plant-specific notes"
NONE label: "No plant-specific variations"
Required: Yes (or NONE checked)
Hint:     "Any steps or values that differ between Sona Comstar plant locations"
```

### 4.11 Notes

```
Type:     Textarea (optional)
Label:    "Additional notes"
Required: No
```

---

## 5. CONFIGURATION REFERENCE FORM FIELDS

**Component:** `src/components/quick-entry/ConfigFormFields.tsx`

### 5.1 Configuration name

```
Type:     Text input
Label:    "Configuration name"
Required: Yes, min 10 chars
Hint:     "The official name of this SAP configuration setting or group"
Example:  "Withholding Tax Type and Rate Setup for India"
```

### 5.2 What this controls

```
Type:     Textarea (3 rows)
Label:    "What this configuration controls"
Required: Yes, min 50 chars
Hint:     "Explain in plain language what business behaviour is affected by this configuration"
```

### 5.3 Access — view

```
Type:     Text input
Label:    "Who can view this configuration"
Required: Yes, min 3 chars
Example:  "All authorized FI users via SPRO", "IT admin only"
```

### 5.4 Access — change

```
Type:     Text input
Label:    "Who can change this configuration"
Required: Yes, min 3 chars
Example:  "FI Consultant + Basis team"
```

### 5.5 Change frequency

```
Type:     Text input (free text, not a dropdown)
Label:    "How often is this typically changed?"
Required: Yes
Example:  "Only during go-live or major business changes", "Updated quarterly for tax rates"
```

### 5.6 Table name

```
Type:     Text input (optional)
Label:    "SAP table name (optional)"
Required: No
Example:  "T005", "TCURR"
Hint:     "The SAP configuration table where this is stored, if known"
```

### 5.7 Current values section

This is the most important section of a Config entry. It documents the
actual values configured at Sona Comstar.

**Mode toggle:**
```
[Structured values (recommended)] [Free text]
Toggle renders as two-button segmented control
Default: Structured
```

**Structured mode:**
```
Groups of configuration parameters.

"+ Add group" button creates a new group block.

Per group:
  Group name: [Text input, required, min 3 chars]
  Example: "Company Code 1000 — Comstar India"
  Example: "Controlling Area 1000"

  Parameters within group (dynamic list, min 1 per group):
    Name:  [Text input, required]  e.g. "Tax Code G5"
    Value: [Text input, required]  e.g. "Rate: 10%, Type: Input, Active: Yes"
    "+ Add parameter" button
    [Remove parameter] × per row

  "+ Add group" button
  [Remove group] × per group header (confirm: "Remove this group and all its parameters?")
```

**Free text mode:**
```
Type:     Textarea (8 rows minimum)
Required: Yes (min 50 chars when in free text mode)
Placeholder text:
  "Enter current configuration values at Sona Comstar.
   Tip: Use a format like:
   Company Code 1000:
     G/L Account for CGST: 14001
     G/L Account for SGST: 14002
   Company Code 4200:
     G/L Account for VAT: 22001"

Validation:
  - Min 50 chars
  - Must not contain placeholder strings (TBD, PLACEHOLDER, etc.)
    → Error: "Please replace placeholder text with actual Sona Comstar values"
```

### 5.8 How to navigate

```
Type:     Textarea (3 rows)
Label:    "How to navigate to this configuration in SAP"
Required: Yes, min 30 chars
Hint:     "Which T-code and menu path does an admin follow to find these settings?"
Example:  "Transaction SPRO → Financial Accounting → Tax on Sales/Purchases → Tax Codes"
```

### 5.9 Related errors section

```
Label:   "Errors caused by misconfiguration"
Type:    Dynamic list (min 1 — or one element with error_code="NONE")

Per row:
  Error code:             [Text input] or [NONE checkbox]
  Misconfiguration cause: [Text input, min 5 chars]
                          "What specific misconfiguration causes this error?"
  See document:           [Cross-reference field — same as in Procedure]

"+ Add related error" button
```

### 5.10 Notes

```
Type:     Textarea (optional)
Label:    "Additional notes"
Required: No
Hint:     "Historical changes, pending updates, or important caveats"
```

---

## 6. SAP ENTITY DETECTOR PANEL

**Component:** `src/components/quick-entry/SapEntityPanel.tsx`

The right-side panel continuously scans all form text for SAP T-codes and
error codes. It provides real-time feedback to help the admin verify that
AEGIS will correctly index their content.

```typescript
interface SapEntityPanelProps {
  entities: { t_codes: string[]; error_codes: string[] }
  contentType: QuickEntryContentType
  formData: object
  documentId: string
  module: string
  onChunkPreview: () => void
}

export function SapEntityPanel({
  entities, contentType, formData, documentId, module, onChunkPreview
}: SapEntityPanelProps) {
  const chunkCount = useMemo(() => estimateChunkCount(contentType, formData), [contentType, formData])

  return (
    <div className="px-4 py-4 space-y-5">
      <div>
        <p className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
          Live detection
        </p>

        {/* T-codes detected */}
        <div className="mb-3">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1">
            SAP T-codes found:
          </p>
          {entities.t_codes.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {entities.t_codes.map(code => (
                <span key={code} className="text-[10px] font-mono bg-[var(--color-accent-subtle)] text-[var(--color-accent)] px-1.5 py-0.5 rounded">
                  {code}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[var(--color-text-muted)] italic">
              None detected yet — name T-codes in your fields
            </p>
          )}
        </div>

        {/* Error codes detected */}
        <div>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1">
            Error codes found:
          </p>
          {entities.error_codes.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {entities.error_codes.map(code => (
                <span key={code} className="text-[10px] font-mono bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] px-1.5 py-0.5 rounded">
                  {code}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[var(--color-text-muted)] italic">
              None detected
            </p>
          )}
        </div>
      </div>

      {/* Estimated chunk count */}
      <div>
        <p className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
          Chunks to be created
        </p>
        <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
          {chunkCount}
        </p>
        <p className="text-[10px] text-[var(--color-text-muted)]">
          {contentType === 'error_guide' && '1 overview + 1 per cause'}
          {contentType === 'procedure' && '1 overview + batches of 5 steps'}
          {contentType === 'config' && 'always 2 (overview + values)'}
        </p>
      </div>

      {/* Chunk preview trigger */}
      <button
        onClick={onChunkPreview}
        disabled={!documentId || !module}
        className="w-full text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40 disabled:cursor-not-allowed text-left"
      >
        Preview indexed chunks →
      </button>

      {/* Module info */}
      {module && (
        <div>
          <p className="text-[10px] text-[var(--color-text-muted)]">
            Module: <span className="font-medium text-[var(--color-text-primary)]">{module}</span>
          </p>
        </div>
      )}
    </div>
  )
}

// Estimate chunk count without running full assembly
function estimateChunkCount(contentType: string, formData: any): number {
  if (contentType === 'config') return 2
  if (contentType === 'error_guide') {
    const activeCauses = (formData?.causes ?? []).filter((c: any) => !c.cause_obsolete).length
    return 1 + Math.max(1, activeCauses)
  }
  if (contentType === 'procedure') {
    const stepCount = (formData?.steps ?? []).length
    const batches = Math.ceil(stepCount / 5)
    return 1 + Math.max(1, batches)
  }
  return 0
}
```

**Entity detector hook:**

**File:** `src/hooks/useSapEntityDetector.ts`

```typescript
import { useState, useEffect } from 'react'
import { useDebounce } from '@/hooks/useDebounce'

const T_CODE_REGEX = /\b([A-Z]{2,4}\d{0,2})\b/g
const ERROR_CODE_REGEX = /\b([A-Z]{1,3}\d{3,6})\b/g

// Common false positives to exclude
const EXCLUDED_PATTERNS = new Set([
  'NONE', 'SAP', 'IBM', 'YES', 'THE', 'AND', 'FOR', 'NOT', 'BUT',
  'ALL', 'ARE', 'WITH', 'FROM', 'HAS', 'HAVE', 'THIS', 'THAT',
  'WILL', 'CAN', 'ONLY', 'ALSO', 'INTO', 'OVER', 'WHEN',
])

interface DetectedEntities { t_codes: string[]; error_codes: string[] }

export function useEntityDetector(
  formDataStr: string,
  options: { debounceMs: number; enabled: boolean }
) {
  const [entities, setEntities] = useState<DetectedEntities>({ t_codes: [], error_codes: [] })
  const debouncedStr = useDebounce(formDataStr, options.debounceMs)

  useEffect(() => {
    if (!options.enabled || !debouncedStr) return

    const tCodes = new Set<string>()
    const errorCodes = new Set<string>()

    let match: RegExpExecArray | null
    T_CODE_REGEX.lastIndex = 0
    while ((match = T_CODE_REGEX.exec(debouncedStr)) !== null) {
      const code = match[1]
      if (!EXCLUDED_PATTERNS.has(code) && code.length >= 2) {
        tCodes.add(code)
      }
    }

    ERROR_CODE_REGEX.lastIndex = 0
    while ((match = ERROR_CODE_REGEX.exec(debouncedStr)) !== null) {
      const code = match[1]
      if (!EXCLUDED_PATTERNS.has(code)) {
        errorCodes.add(code)
      }
    }

    setEntities({
      t_codes: Array.from(tCodes).sort(),
      error_codes: Array.from(errorCodes).sort(),
    })
  }, [debouncedStr, options.enabled])

  return { entities }
}
```

---

## 7. VALIDATION SUMMARY

All validations run on the client before submit. The backend re-validates
server-side as defence-in-depth. Client validation errors must match the
server error format to avoid confusing discrepancies.

| Field | Client validation | Server validation |
|---|---|---|
| document_id | Non-empty, no spaces, pattern | Unique (409 if conflict) |
| module | Non-empty | Valid enum |
| transactions | Min 1 entry | Array not empty |
| verified_date | Not future date | Same |
| form_data fields | Per-field min length | Schema per content_type |
| error_code | "NONE" or non-empty | Same |
| causes | Min 1 active cause | Same |
| cause.resolution_steps | Min 20 chars + specificity | Same + acknowledged flag |
| steps | Min 3 steps | Same |
| current_values | Mode-appropriate completeness | No placeholder strings |
| cross-references | API validation per reference | DB lookup |

---

*FRONTEND_38 — Admin Quick Entry Form Fields | AEGIS v1.0 | Sona Comstar*
