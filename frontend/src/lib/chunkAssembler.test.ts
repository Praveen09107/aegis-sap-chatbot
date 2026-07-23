import { describe, it, expect } from "vitest"
import { assembleChunksClient } from "./chunkAssembler"
import type { ErrorGuideFormData, ProcedureFormData, ConfigFormData, CauseBlock, ProcedureStep } from "@/types"

function makeCause(overrides: Partial<CauseBlock> = {}): CauseBlock {
  return {
    cause_number: 1,
    priority: "common",
    cause_description: "Tax condition record missing",
    how_to_identify: "Check VK13 for the condition record",
    resolution_steps: "Create the condition record in VK11",
    resolution_requires_admin: false,
    cause_obsolete: false,
    obsolete_reason: "",
    screenshot_ids: [],
    specificity_acknowledged: false,
    ...overrides,
  }
}

describe("assembleChunksClient — error_guide", () => {
  const baseFormData: ErrorGuideFormData = {
    issue_description: "Tax condition not capturing in Sale Order",
    error_code: "VL150",
    error_message: "Delivery quantity exceeds order quantity",
    description: "The tax condition record is not being applied during sale order creation.",
    when_this_occurs: "Occurs when creating a new sale order for a customer in an exempt tax jurisdiction.",
    causes: [makeCause()],
    success_indicator: "Sale order saved with tax line visible",
    escalation_criteria: "If VK11 shows no applicable condition table",
    admin_steps: "NONE",
    notes: "",
  }

  it("produces one error_overview chunk plus one chunk per active cause", () => {
    const chunks = assembleChunksClient({
      contentType: "error_guide",
      documentId: "SD-ERR-001",
      module: "SD",
      transactions: ["VA01", "VK11"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: baseFormData,
    })

    expect(chunks).toHaveLength(2)
    expect(chunks[0].chunk_type).toBe("error_overview")
    expect(chunks[1].chunk_type).toBe("cause_1")
  })

  it("matches the real backend's exact header and field label format", () => {
    const [overview] = assembleChunksClient({
      contentType: "error_guide",
      documentId: "SD-ERR-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: baseFormData,
    })

    expect(overview.text).toContain("[SD-ERR-001] [SD] [SOURCE: form_entry]")
    expect(overview.text).toContain("ISSUE: Tax condition not capturing in Sale Order")
    expect(overview.text).toContain("ERROR CODE: VL150")
    expect(overview.text).toContain("VERIFIED BY: Gokul on 2026-01-01")
  })

  it("omits ERROR CODE / ERROR MESSAGE / ADMIN STEPS lines entirely when the value is NONE", () => {
    const [overview] = assembleChunksClient({
      contentType: "error_guide",
      documentId: "SD-ERR-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: { ...baseFormData, error_code: "NONE", error_message: "NONE" },
    })

    expect(overview.text).not.toContain("ERROR CODE:")
    expect(overview.text).not.toContain("ERROR MESSAGE:")
    expect(overview.text).not.toContain("ADMIN STEPS:")
  })

  it("sorts active causes by priority (check_first before common before less_common before rare)", () => {
    const chunks = assembleChunksClient({
      contentType: "error_guide",
      documentId: "SD-ERR-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: {
        ...baseFormData,
        causes: [
          makeCause({ cause_description: "Rare cause", priority: "rare" }),
          makeCause({ cause_description: "First cause", priority: "check_first" }),
          makeCause({ cause_description: "Common cause", priority: "common" }),
        ],
      },
    })

    // 1 overview + 3 cause chunks, ordered by priority not input order.
    expect(chunks).toHaveLength(4)
    expect(chunks[1].text).toContain("First cause")
    expect(chunks[2].text).toContain("Common cause")
    expect(chunks[3].text).toContain("Rare cause")
  })

  it("excludes obsolete causes from per-cause chunks and notes the count in the overview", () => {
    const chunks = assembleChunksClient({
      contentType: "error_guide",
      documentId: "SD-ERR-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: {
        ...baseFormData,
        causes: [makeCause({ cause_description: "Active cause" }), makeCause({ cause_description: "Old cause", cause_obsolete: true })],
      },
    })

    expect(chunks).toHaveLength(2) // overview + 1 active cause only
    expect(chunks[0].text).toContain("NOTE: 1 cause(s) have been marked as no longer applicable.")
    expect(chunks[1].text).toContain("Active cause")
  })

  it("prefixes admin-required cause resolution with [Requires IT admin access] and adds the admin note", () => {
    const chunks = assembleChunksClient({
      contentType: "error_guide",
      documentId: "SD-ERR-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: { ...baseFormData, causes: [makeCause({ resolution_requires_admin: true })] },
    })

    expect(chunks[1].text).toContain("RESOLUTION [Requires IT admin access] :")
    expect(chunks[1].text).toContain("ADMIN NOTE: The resolution steps above require IT admin access.")
  })
})

describe("assembleChunksClient — procedure", () => {
  function makeStep(overrides: Partial<ProcedureStep> = {}): ProcedureStep {
    return {
      action: "Enter customer number and press Enter",
      step_type: "normal",
      specificity_acknowledged: false,
      screenshot_ids: [],
      ...overrides,
    }
  }

  const baseFormData: ProcedureFormData = {
    procedure_name: "Create Customer Master Record in SD",
    purpose: "Registers a new customer for sales order processing",
    when_to_use: "When onboarding a new customer for the first time",
    data_required: "NONE",
    system_conditions: "NONE",
    access_required: "VA01 access",
    steps: [makeStep(), makeStep(), makeStep()],
    verification: "Customer number displayed in the status bar",
    common_errors: [{ error_code: "NONE", cause_summary: "", see_document_id: "", reference_validated: false }],
    plant_notes: "",
    notes: "",
  }

  it("produces one proc_overview chunk and batches steps into groups of 5", () => {
    const steps = Array.from({ length: 12 }, () => makeStep())
    const chunks = assembleChunksClient({
      contentType: "procedure",
      documentId: "SD-PROC-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: { ...baseFormData, steps },
    })

    expect(chunks[0].chunk_type).toBe("proc_overview")
    // 12 steps / 5 per batch = 3 batches (5, 5, 2)
    const stepChunks = chunks.filter((c) => c.chunk_type.startsWith("proc_steps_"))
    expect(stepChunks).toHaveLength(3)
    expect(stepChunks[0].text).toContain("STEPS 1 TO 5:")
    expect(stepChunks[1].text).toContain("STEPS 6 TO 10:")
    expect(stepChunks[2].text).toContain("STEPS 11 TO 12:")
  })

  it("computes step_number from array position, 1-based, regardless of stored data", () => {
    const chunks = assembleChunksClient({
      contentType: "procedure",
      documentId: "SD-PROC-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: baseFormData,
    })

    const stepChunk = chunks.find((c) => c.chunk_type === "proc_steps_1")!
    expect(stepChunk.text).toContain("STEP 1 ")
    expect(stepChunk.text).toContain("STEP 2 ")
    expect(stepChunk.text).toContain("STEP 3 ")
  })

  it("keeps a branch_start..branch_end group together in one chunk, with branch prefixes", () => {
    const chunks = assembleChunksClient({
      contentType: "procedure",
      documentId: "SD-PROC-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: {
        ...baseFormData,
        steps: [
          makeStep({ action: "Check the customer type" }),
          makeStep({ step_type: "branch_start", action: "IF customer is domestic" }),
          makeStep({ step_type: "branch_option_a", action: "Use tax code G5" }),
          makeStep({ step_type: "branch_option_b", action: "Use tax code G0" }),
          makeStep({ step_type: "branch_end", action: "Proceed with order entry" }),
        ],
      },
    })

    const stepChunks = chunks.filter((c) => c.chunk_type.startsWith("proc_steps_"))
    // Step 1 (normal) goes in its own batch; the branch group (steps 2-5)
    // stays together as a second batch — matches _batch_steps' real logic
    // of flushing the current batch before starting a branch group.
    expect(stepChunks).toHaveLength(2)
    const branchChunk = stepChunks[1]
    expect(branchChunk.text).toContain("[IF/CONDITION] : IF customer is domestic")
    expect(branchChunk.text).toContain("[OPTION A] : Use tax code G5")
    expect(branchChunk.text).toContain("[OPTION B] : Use tax code G0")
    expect(branchChunk.text).toContain("[END CONDITION] : Proceed with order entry")
  })

  it("prefixes admin_required steps and adds the admin note", () => {
    const chunks = assembleChunksClient({
      contentType: "procedure",
      documentId: "SD-PROC-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: { ...baseFormData, steps: [makeStep({ step_type: "admin_required", action: "Update pricing table" })] },
    })

    const stepChunk = chunks.find((c) => c.chunk_type === "proc_steps_1")!
    expect(stepChunk.text).toContain("[Requires IT admin access] : Update pricing table")
    expect(stepChunk.text).toContain("This step requires IT admin access.")
  })

  it("omits a common_errors entry list body ('None') when the only entry is error_code NONE", () => {
    const [overview] = assembleChunksClient({
      contentType: "procedure",
      documentId: "SD-PROC-001",
      module: "SD",
      transactions: ["VA01"],
      verifiedByName: "Gokul",
      verifiedDate: "2026-01-01",
      formData: baseFormData,
    })
    expect(overview.text).toContain("COMMON ERRORS:\n  None")
  })
})

describe("assembleChunksClient — config", () => {
  const baseFormData: ConfigFormData = {
    configuration_name: "Withholding Tax Type and Rate Setup for India",
    what_this_controls: "Determines the withholding tax rate applied to vendor invoices for India company codes.",
    access_view: "All authorized FI users via SPRO",
    access_change: "FI Consultant + Basis team",
    change_frequency: "Only during go-live or major business changes",
    table_name: "T059Z",
    current_values_mode: "structured",
    current_values_structured: [
      { group_name: "Company Code 1000", parameters: [{ name: "Tax Code G5", value: "Rate: 10%, Type: Input, Active: Yes" }] },
    ],
    current_values_free_text: "",
    how_to_navigate: "Transaction SPRO → Financial Accounting → Tax on Sales/Purchases → Tax Codes",
    related_errors: [{ error_code: "NONE", misconfiguration_cause: "", see_document_id: "", reference_validated: false }],
    notes: "",
  }

  it("always produces exactly 2 chunks: cfg_overview and cfg_values", () => {
    const chunks = assembleChunksClient({
      contentType: "config",
      documentId: "FI-CFG-001",
      module: "FI",
      transactions: ["SPRO"],
      verifiedByName: "Priya",
      verifiedDate: "2026-01-01",
      formData: baseFormData,
    })

    expect(chunks).toHaveLength(2)
    expect(chunks.map((c) => c.chunk_type)).toEqual(["cfg_overview", "cfg_values"])
  })

  it("renders structured current values as GROUP:\\n  name: value lines", () => {
    const chunks = assembleChunksClient({
      contentType: "config",
      documentId: "FI-CFG-001",
      module: "FI",
      transactions: ["SPRO"],
      verifiedByName: "Priya",
      verifiedDate: "2026-01-01",
      formData: baseFormData,
    })

    const values = chunks.find((c) => c.chunk_type === "cfg_values")!
    expect(values.text).toContain("CURRENT PRODUCTION VALUES:")
    expect(values.text).toContain("Company Code 1000:")
    expect(values.text).toContain("  Tax Code G5: Rate: 10%, Type: Input, Active: Yes")
  })

  it("renders free_text current values verbatim when mode is free_text", () => {
    const chunks = assembleChunksClient({
      contentType: "config",
      documentId: "FI-CFG-001",
      module: "FI",
      transactions: ["SPRO"],
      verifiedByName: "Priya",
      verifiedDate: "2026-01-01",
      formData: {
        ...baseFormData,
        current_values_mode: "free_text",
        current_values_free_text: "Company Code 1000:\n  G/L Account for CGST: 14001",
      },
    })

    const values = chunks.find((c) => c.chunk_type === "cfg_values")!
    expect(values.text).toContain("Company Code 1000:\n  G/L Account for CGST: 14001")
  })

  it("omits SAP TABLE line when table_name is blank", () => {
    const chunks = assembleChunksClient({
      contentType: "config",
      documentId: "FI-CFG-001",
      module: "FI",
      transactions: ["SPRO"],
      verifiedByName: "Priya",
      verifiedDate: "2026-01-01",
      formData: { ...baseFormData, table_name: "" },
    })
    expect(chunks[0].text).not.toContain("SAP TABLE:")
  })
})
