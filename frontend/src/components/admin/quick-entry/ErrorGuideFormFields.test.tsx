import { describe, it, expect, vi } from "vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { ErrorGuideFormFields } from "./ErrorGuideFormFields"
import type { ErrorGuideFormData, CauseBlock } from "@/types"

function makeCause(overrides: Partial<CauseBlock> = {}): CauseBlock {
  return {
    cause_number: 1,
    priority: "common",
    cause_description: "",
    how_to_identify: "",
    resolution_steps: "",
    resolution_requires_admin: false,
    cause_obsolete: false,
    obsolete_reason: "",
    screenshot_ids: [],
    specificity_acknowledged: false,
    ...overrides,
  }
}

function renderFields(data: Partial<ErrorGuideFormData>, onChange = vi.fn()) {
  const { Wrapper } = createQueryWrapper()
  return render(<ErrorGuideFormFields data={data} onChange={onChange} entryId={null} screenshots={[]} isReadOnly={false} />, { wrapper: Wrapper })
}

/** Stateful harness for tests that need a real controlled re-render after onChange. */
function ControlledErrorGuideFields({ initial }: { initial: Partial<ErrorGuideFormData> }) {
  const [data, setData] = useState(initial)
  return <ErrorGuideFormFields data={data} onChange={setData} entryId={null} screenshots={[]} isReadOnly={false} />
}

function renderControlled(initial: Partial<ErrorGuideFormData>) {
  const { Wrapper } = createQueryWrapper()
  return render(<ControlledErrorGuideFields initial={initial} />, { wrapper: Wrapper })
}

describe("ErrorGuideFormFields", () => {
  it("renders one cause card by default", () => {
    renderFields({ causes: [makeCause()] })
    expect(screen.getByText("Cause 1")).toBeInTheDocument()
  })

  it("calls onChange with the literal string NONE when the error-code checkbox is checked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFields({ causes: [makeCause()], error_code: "" }, onChange)
    await user.click(screen.getByLabelText("No error code displayed"))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ error_code: "NONE" }))
  })

  it("adds a new cause, capped at 10", async () => {
    const user = userEvent.setup()
    renderControlled({ causes: [makeCause()] })
    await user.click(screen.getByText("Add cause"))
    expect(screen.getByText("Cause 2")).toBeInTheDocument()
  })

  it("does not allow removing the last remaining cause", () => {
    renderFields({ causes: [makeCause()] })
    expect(screen.getByLabelText("Remove cause 1")).toBeDisabled()
  })

  it("shows a specificity warning for vague resolution steps and clears it on acknowledge", async () => {
    const user = userEvent.setup()
    renderControlled({ causes: [makeCause({ resolution_steps: "fix it somehow" })] })
    expect(screen.getByText(/may lack specificity/)).toBeInTheDocument()

    await user.click(screen.getByText("✓ Acknowledge and continue"))
    expect(screen.queryByText(/may lack specificity/)).not.toBeInTheDocument()
  })

  it("does not warn about specificity when the text names a real T-code", () => {
    renderFields({ causes: [makeCause({ resolution_steps: "In VL01N, set field X to Y" })] })
    expect(screen.queryByText(/may lack specificity/)).not.toBeInTheDocument()
  })

  it("shows the obsolete-reason field only once a cause is marked obsolete", async () => {
    const user = userEvent.setup()
    renderControlled({ causes: [makeCause()] })
    expect(screen.queryByText("Obsolete reason")).not.toBeInTheDocument()

    await user.click(screen.getByText("Mark this cause as obsolete (no longer applicable)"))
    expect(screen.getByText("Obsolete reason")).toBeInTheDocument()
  })
})
