import { describe, it, expect, vi } from "vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { ProcedureFormFields } from "./ProcedureFormFields"
import type { ProcedureFormData, ProcedureStep } from "@/types"

const apiGetMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGetMock(...args) },
}))

function step(overrides: Partial<ProcedureStep> = {}): ProcedureStep {
  return { action: "", step_type: "normal", specificity_acknowledged: false, screenshot_ids: [], ...overrides }
}

function renderFields(data: Partial<ProcedureFormData>, onChange = vi.fn()) {
  const { Wrapper } = createQueryWrapper()
  return render(<ProcedureFormFields data={data} onChange={onChange} entryId={null} screenshots={[]} isReadOnly={false} />, { wrapper: Wrapper })
}

function ControlledProcedureFields({ initial }: { initial: Partial<ProcedureFormData> }) {
  const [data, setData] = useState(initial)
  return <ProcedureFormFields data={data} onChange={setData} entryId={null} screenshots={[]} isReadOnly={false} />
}

function renderControlled(initial: Partial<ProcedureFormData>) {
  const { Wrapper } = createQueryWrapper()
  return render(<ControlledProcedureFields initial={initial} />, { wrapper: Wrapper })
}

describe("ProcedureFormFields", () => {
  it("warns when fewer than 3 steps exist", () => {
    renderFields({ steps: [step(), step()] })
    expect(screen.getByText(/at least 3 required/)).toBeInTheDocument()
  })

  it("does not warn once 3 or more steps exist", () => {
    renderFields({ steps: [step(), step(), step()] })
    expect(screen.queryByText(/at least 3 required/)).not.toBeInTheDocument()
  })

  it("adds a step", async () => {
    const user = userEvent.setup()
    renderControlled({ steps: [step()] })
    await user.click(screen.getByText("Add step"))
    expect(screen.getByText("Step 2")).toBeInTheDocument()
  })

  it("flags an unmatched branch_start with no branch_end", () => {
    renderFields({ steps: [step({ step_type: "branch_start", action: "if condition" })] })
    expect(screen.getByText(/branch_start has no matching branch_end/)).toBeInTheDocument()
  })

  it("flags an unmatched branch_end with no branch_start", () => {
    renderFields({ steps: [step({ step_type: "branch_end", action: "end condition" })] })
    expect(screen.getByText(/branch_end has no matching branch_start/)).toBeInTheDocument()
  })

  it("does not flag a properly paired branch_start/branch_end", () => {
    renderFields({
      steps: [
        step({ step_type: "branch_start", action: "if condition" }),
        step({ step_type: "branch_option_a", action: "do a" }),
        step({ step_type: "branch_end", action: "end" }),
      ],
    })
    expect(screen.queryByText(/no matching/)).not.toBeInTheDocument()
  })

  it("toggling 'No common errors' collapses to a single NONE entry", async () => {
    const user = userEvent.setup()
    renderControlled({ steps: [step(), step(), step()], common_errors: [{ error_code: "", cause_summary: "", see_document_id: "", reference_validated: false }] })
    await user.click(screen.getByLabelText("No common errors for this procedure"))
    expect(screen.queryByPlaceholderText("Error code (e.g. VL150)")).not.toBeInTheDocument()
  })

  it("checks a cross-referenced document ID via validateReference", async () => {
    apiGetMock.mockResolvedValue({ exists: true, title: "SD-ERR-001 title", source_type: "form_entry" })
    const user = userEvent.setup()
    // Controlled input — a stateful harness is required so the typed value
    // actually reaches error.see_document_id (a plain vi.fn() onChange
    // never updates the controlled input's displayed/read-back value).
    renderControlled({ steps: [step(), step(), step()], common_errors: [{ error_code: "VL150", cause_summary: "", see_document_id: "", reference_validated: false }] })

    await user.type(screen.getByPlaceholderText("Cross-reference document ID (optional)"), "SD-ERR-001")
    expect(await screen.findByText(/Found: SD-ERR-001 title/, {}, { timeout: 3000 })).toBeInTheDocument()
  })
})
