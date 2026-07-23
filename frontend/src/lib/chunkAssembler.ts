/**
 * AEGIS Quick Entry Chunk Preview — client-side port of
 * backend/app/services/form_chunker.py.
 *
 * Must stay byte-for-byte in sync with the Python implementation (same
 * header prefix, same NONE omission, same priority ordering, same branch
 * handling) — this is a preview of exactly what the backend will index,
 * not an independent reimplementation with its own opinions.
 *
 * Ported directly (2026-07-23, F19) from the real backend file, not from
 * FRONTEND_37's own pseudocode description of it.
 */
import type {
  AssembledChunk,
  QuickEntryContentType,
  ErrorGuideFormData,
  ProcedureFormData,
  ProcedureStep,
  ConfigFormData,
  CauseBlock,
  CausePriority,
} from "@/types"

// Matches backend/app/config.py exactly.
const CHUNK_STEPS_PER_BATCH = 5
const CHUNK_BRANCH_MAX_TOKENS = 1500

interface AssembleParams {
  contentType: QuickEntryContentType
  documentId: string
  module: string
  transactions: string[]
  verifiedByName: string
  verifiedDate: string
  formData: object
}

export function assembleChunksClient(params: AssembleParams): AssembledChunk[] {
  const { contentType, documentId, module, transactions, verifiedByName, verifiedDate, formData } = params

  if (contentType === "error_guide") {
    return assembleErrorGuide(documentId, module, transactions, verifiedByName, verifiedDate, formData as ErrorGuideFormData)
  } else if (contentType === "procedure") {
    return assembleProcedure(documentId, module, transactions, verifiedByName, verifiedDate, formData as ProcedureFormData)
  } else if (contentType === "config") {
    return assembleConfig(documentId, module, transactions, verifiedByName, verifiedDate, formData as ConfigFormData)
  }
  throw new Error(`Unknown content_type: ${contentType}`)
}

function header(documentId: string, module: string): string {
  return `[${documentId}] [${module}] [SOURCE: form_entry]\n`
}

const PRIORITY_ORDER: Record<CausePriority, number> = {
  check_first: 0,
  common: 1,
  less_common: 2,
  rare: 3,
}

function titleCase(s: string): string {
  return s
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

function assembleErrorGuide(
  documentId: string,
  module: string,
  transactions: string[],
  verifiedByName: string,
  verifiedDate: string,
  fd: ErrorGuideFormData
): AssembledChunk[] {
  const h = header(documentId, module)
  const transactionsStr = transactions.join(", ")

  const causes = fd.causes ?? []
  const activeCauses = causes.filter((c) => !c.cause_obsolete)
  const obsoleteCount = causes.length - activeCauses.length

  const activeCausesSorted = [...activeCauses].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  )

  const causeSummaryLines = activeCausesSorted.map((cause, i) => {
    const priorityLabel = titleCase(cause.priority ?? "common")
    return `  Cause ${i + 1} [${priorityLabel}]: ${cause.cause_description}`
  })
  const causeSummary = causeSummaryLines.join("\n")

  const lines: string[] = [h]
  lines.push(`ISSUE: ${fd.issue_description}`)
  lines.push(`TRANSACTIONS: ${transactionsStr}`)

  if ((fd.error_code ?? "").toUpperCase() !== "NONE") {
    lines.push(`ERROR CODE: ${fd.error_code}`)
  }
  if ((fd.error_message ?? "").toUpperCase() !== "NONE") {
    lines.push(`ERROR MESSAGE: ${fd.error_message}`)
  }

  lines.push(`DESCRIPTION: ${fd.description}`)
  lines.push(`WHEN THIS OCCURS: ${fd.when_this_occurs}`)
  lines.push(`CAUSES (${activeCauses.length} active, priority-ordered):\n${causeSummary}`)

  if (obsoleteCount > 0) {
    lines.push(`NOTE: ${obsoleteCount} cause(s) have been marked as no longer applicable.`)
  }

  lines.push(`SUCCESS INDICATOR: ${fd.success_indicator}`)
  lines.push(`ESCALATION CRITERIA: ${fd.escalation_criteria}`)

  if ((fd.admin_steps ?? "").toUpperCase() !== "NONE") {
    lines.push(`ADMIN STEPS: ${fd.admin_steps}`)
  }

  if ((fd.notes ?? "").trim()) {
    lines.push(`NOTES: ${fd.notes}`)
  }

  lines.push(`VERIFIED BY: ${verifiedByName} on ${verifiedDate}`)

  const chunks: AssembledChunk[] = [
    { chunk_type: "error_overview", text: lines.join("\n"), associated_section: "error_overview" },
  ]

  const totalActive = activeCausesSorted.length
  activeCausesSorted.forEach((cause: CauseBlock, idx) => {
    const i = idx + 1
    const priorityLabel = titleCase(cause.priority ?? "common")
    const adminLabel = cause.resolution_requires_admin ? "[Requires IT admin access] " : ""

    const causeLines: string[] = [h]
    causeLines.push(`ISSUE: ${fd.issue_description}`)
    causeLines.push(`CAUSE ${i} OF ${totalActive} [${priorityLabel}]: ${cause.cause_description}`)
    causeLines.push(`HOW TO IDENTIFY: ${cause.how_to_identify}`)
    causeLines.push(`RESOLUTION ${adminLabel}: ${cause.resolution_steps}`)

    if (cause.resolution_requires_admin) {
      causeLines.push(
        "ADMIN NOTE: The resolution steps above require IT admin access. " +
          "Employees unable to perform these steps should raise a support ticket."
      )
    }

    causeLines.push(`VERIFIED BY: ${verifiedByName} on ${verifiedDate}`)

    chunks.push({
      chunk_type: `cause_${i}`,
      text: causeLines.join("\n"),
      associated_section: `cause_${i}`,
    })
  })

  return chunks
}

function assembleProcedure(
  documentId: string,
  module: string,
  transactions: string[],
  verifiedByName: string,
  verifiedDate: string,
  fd: ProcedureFormData
): AssembledChunk[] {
  const h = header(documentId, module)
  const transactionsStr = transactions.join(", ")

  const commonErrorsLines = (fd.common_errors ?? [])
    .filter((err) => (err.error_code ?? "").toUpperCase() !== "NONE")
    .map((err) => {
      let line = `  - ${err.error_code}: ${err.cause_summary}`
      if (err.see_document_id) line += ` → see ${err.see_document_id}`
      return line
    })
  const commonErrorsText = commonErrorsLines.length > 0 ? commonErrorsLines.join("\n") : "  None"

  const overviewLines: string[] = [h]
  overviewLines.push(`PROCEDURE: ${fd.procedure_name}`)
  overviewLines.push(`TRANSACTIONS: ${transactionsStr}`)
  overviewLines.push(`PURPOSE: ${fd.purpose}`)
  overviewLines.push(`WHEN TO USE: ${fd.when_to_use}`)

  if ((fd.data_required ?? "").toUpperCase() !== "NONE") {
    overviewLines.push(`DATA REQUIRED: ${fd.data_required}`)
  }
  if ((fd.system_conditions ?? "").toUpperCase() !== "NONE") {
    overviewLines.push(`SYSTEM CONDITIONS: ${fd.system_conditions}`)
  }

  overviewLines.push(`ACCESS REQUIRED: ${fd.access_required}`)
  overviewLines.push(`VERIFICATION: ${fd.verification}`)
  overviewLines.push(`COMMON ERRORS:\n${commonErrorsText}`)

  const plantNotes = (fd.plant_notes ?? "").toUpperCase()
  if (plantNotes !== "" && plantNotes !== "NONE") {
    overviewLines.push(`PLANT NOTES: ${fd.plant_notes}`)
  }

  overviewLines.push(`VERIFIED BY: ${verifiedByName} on ${verifiedDate}`)

  const chunks: AssembledChunk[] = [
    { chunk_type: "proc_overview", text: overviewLines.join("\n"), associated_section: "proc_overview" },
  ]

  // step_number is computed here (array index + 1), same as the backend's
  // read-time injection — never trusted from stored data.
  const steps: (ProcedureStep & { step_number: number })[] = (fd.steps ?? []).map((s, i) => ({ ...s, step_number: i + 1 }))

  const batches = batchSteps(steps)

  batches.forEach((batch, batchIdx) => {
    const chunkType = `proc_steps_${batchIdx + 1}`
    const stepNums = batch.map((s) => s.step_number)
    const rangeLabel = stepNums.length === 1 ? `${stepNums[0]}` : `${stepNums[0]} TO ${stepNums[stepNums.length - 1]}`

    const stepLines: string[] = [h]
    stepLines.push(`PROCEDURE: ${fd.procedure_name}`)
    stepLines.push(`STEPS ${rangeLabel}:`)

    for (const step of batch) {
      const adminPrefix = step.step_type === "admin_required" ? "[Requires IT admin access] " : ""
      const branchPrefix = getBranchPrefix(step.step_type)
      stepLines.push(`STEP ${step.step_number} ${branchPrefix}${adminPrefix}: ${step.action}`)
      if (step.step_type === "admin_required") {
        stepLines.push(
          "  → This step requires IT admin access. " + "Raise a support ticket if you cannot perform this action."
        )
      }
    }

    chunks.push({ chunk_type: chunkType, text: stepLines.join("\n"), associated_section: chunkType })
  })

  return chunks
}

export type StepWithNumber = ProcedureStep & { step_number: number }

/**
 * Groups steps into batches of CHUNK_STEPS_PER_BATCH. Branch groups
 * (branch_start through branch_end) are kept together unless they exceed
 * CHUNK_BRANCH_MAX_TOKENS, in which case they are split.
 *
 * Exported (not just used internally by assembleProcedure) so
 * ProcedureFormFields.tsx can compute the same batch boundaries to decide
 * which `proc_steps_N` associated_section a step-batch's screenshot zone
 * belongs to — reusing the real grouping logic rather than a second,
 * potentially-drifting reimplementation of it.
 */
export function batchSteps(steps: StepWithNumber[]): StepWithNumber[][] {
  const batches: StepWithNumber[][] = []
  let currentBatch: StepWithNumber[] = []
  let inBranch = false
  let branchBuffer: StepWithNumber[] = []

  for (const step of steps) {
    const stepType = step.step_type ?? "normal"

    if (stepType === "branch_start") {
      if (currentBatch.length > 0) {
        batches.push(currentBatch)
        currentBatch = []
      }
      inBranch = true
      branchBuffer = [step]
    } else if (inBranch) {
      branchBuffer.push(step)

      if (stepType === "branch_end") {
        inBranch = false
        const branchText = branchBuffer.map((s) => s.action).join("\n")
        if (branchText.length > CHUNK_BRANCH_MAX_TOKENS) {
          batches.push(...splitBranchGroup(branchBuffer))
        } else {
          batches.push(branchBuffer)
        }
        branchBuffer = []
      }
    } else {
      currentBatch.push(step)
      if (currentBatch.length >= CHUNK_STEPS_PER_BATCH) {
        batches.push(currentBatch)
        currentBatch = []
      }
    }
  }

  if (branchBuffer.length > 0) batches.push(branchBuffer)
  if (currentBatch.length > 0) batches.push(currentBatch)

  return batches
}

/** Split an oversized branch group at the last complete step before CHUNK_BRANCH_MAX_TOKENS. */
function splitBranchGroup(branchSteps: StepWithNumber[]): StepWithNumber[][] {
  const continuesNote: StepWithNumber = {
    step_number: 0,
    action: "[Branch continues in next chunk]",
    step_type: "normal",
    specificity_acknowledged: true,
    screenshot_ids: [],
  }
  const continuationNote: StepWithNumber = {
    step_number: 0,
    action: "[Branch continues from previous chunk]",
    step_type: "normal",
    specificity_acknowledged: true,
    screenshot_ids: [],
  }

  let cumulativeChars = 0
  let splitIdx = Math.floor(branchSteps.length / 2)

  for (let i = 0; i < branchSteps.length; i++) {
    cumulativeChars += branchSteps[i].action.length
    if (cumulativeChars > CHUNK_BRANCH_MAX_TOKENS) {
      splitIdx = Math.max(i - 1, 1)
      break
    }
  }

  const firstHalf = [...branchSteps.slice(0, splitIdx), continuesNote]
  const secondHalf = [continuationNote, ...branchSteps.slice(splitIdx)]

  return [firstHalf, secondHalf]
}

function getBranchPrefix(stepType: string): string {
  const prefixes: Record<string, string> = {
    branch_start: "[IF/CONDITION] ",
    branch_option_a: "[OPTION A] ",
    branch_option_b: "[OPTION B] ",
    branch_end: "[END CONDITION] ",
    admin_required: "",
    normal: "",
  }
  return prefixes[stepType] ?? ""
}

function assembleConfig(
  documentId: string,
  module: string,
  transactions: string[],
  verifiedByName: string,
  verifiedDate: string,
  fd: ConfigFormData
): AssembledChunk[] {
  const h = header(documentId, module)
  const transactionsStr = transactions.join(", ")

  const relatedErrorsLines = (fd.related_errors ?? [])
    .filter((err) => (err.error_code ?? "").toUpperCase() !== "NONE")
    .map((err) => {
      let line = `  - ${err.error_code}: ${err.misconfiguration_cause}`
      if (err.see_document_id) line += ` → see ${err.see_document_id}`
      return line
    })
  const relatedErrorsText = relatedErrorsLines.length > 0 ? relatedErrorsLines.join("\n") : "  None"

  const overviewLines: string[] = [h]
  overviewLines.push(`CONFIGURATION: ${fd.configuration_name}`)
  overviewLines.push(`TRANSACTIONS: ${transactionsStr}`)

  if ((fd.table_name ?? "").trim()) {
    overviewLines.push(`SAP TABLE: ${fd.table_name}`)
  }

  overviewLines.push(`WHAT THIS CONTROLS: ${fd.what_this_controls}`)
  overviewLines.push(`ACCESS - VIEW: ${fd.access_view}`)
  overviewLines.push(`ACCESS - CHANGE: ${fd.access_change}`)
  overviewLines.push(`CHANGE FREQUENCY: ${fd.change_frequency}`)
  overviewLines.push(`HOW TO NAVIGATE: ${fd.how_to_navigate}`)
  overviewLines.push(`RELATED ERRORS:\n${relatedErrorsText}`)

  if ((fd.notes ?? "").trim()) {
    overviewLines.push(`NOTES: ${fd.notes}`)
  }

  overviewLines.push(`VERIFIED BY: ${verifiedByName} on ${verifiedDate}`)

  const valuesText = buildConfigValuesText(fd)

  const valuesLines: string[] = [h]
  valuesLines.push(`CONFIGURATION: ${fd.configuration_name}`)
  valuesLines.push("CURRENT PRODUCTION VALUES:")
  valuesLines.push(valuesText)
  valuesLines.push(`LAST VERIFIED: ${verifiedByName} on ${verifiedDate}`)

  return [
    { chunk_type: "cfg_overview", text: overviewLines.join("\n"), associated_section: "cfg_overview" },
    { chunk_type: "cfg_values", text: valuesLines.join("\n"), associated_section: "cfg_values" },
  ]
}

function buildConfigValuesText(fd: ConfigFormData): string {
  if (fd.current_values_mode === "structured") {
    const lines: string[] = []
    for (const group of fd.current_values_structured ?? []) {
      lines.push(`${group.group_name}:`)
      for (const param of group.parameters ?? []) {
        lines.push(`  ${param.name}: ${param.value}`)
      }
    }
    return lines.join("\n")
  }
  return fd.current_values_free_text ?? ""
}
