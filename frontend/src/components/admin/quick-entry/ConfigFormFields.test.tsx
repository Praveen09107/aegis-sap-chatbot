import { describe, it, expect, vi } from "vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"
import { ConfigFormFields } from "./ConfigFormFields"
import type { ConfigFormData } from "@/types"

const apiGetMock = vi.fn()
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGetMock(...args) },
}))

function renderFields(data: Partial<ConfigFormData>, onChange = vi.fn()) {
  const { Wrapper } = createQueryWrapper()
  return render(<ConfigFormFields data={data} onChange={onChange} entryId={null} screenshots={[]} isReadOnly={false} />, { wrapper: Wrapper })
}

function ControlledConfigFields({ initial }: { initial: Partial<ConfigFormData> }) {
  const [data, setData] = useState(initial)
  return <ConfigFormFields data={data} onChange={setData} entryId={null} screenshots={[]} isReadOnly={false} />
}

function renderControlled(initial: Partial<ConfigFormData>) {
  const { Wrapper } = createQueryWrapper()
  return render(<ControlledConfigFields initial={initial} />, { wrapper: Wrapper })
}

describe("ConfigFormFields", () => {
  it("defaults to structured mode with one group", () => {
    renderFields({ current_values_structured: [{ group_name: "", parameters: [{ name: "", value: "" }] }] })
    expect(screen.getByText("Structured")).toHaveClass("bg-accent")
  })

  it("switches to free-text mode", async () => {
    const user = userEvent.setup()
    renderControlled({ current_values_mode: "structured", current_values_structured: [] })
    await user.click(screen.getByText("Free text"))
    expect(screen.getByPlaceholderText(/List the real production values/)).toBeInTheDocument()
  })

  it("adds a parameter group in structured mode", async () => {
    const user = userEvent.setup()
    renderControlled({ current_values_structured: [{ group_name: "Group A", parameters: [{ name: "", value: "" }] }] })
    await user.click(screen.getByText("Add group"))
    expect(screen.getAllByPlaceholderText(/Group name/)).toHaveLength(2)
  })

  it("toggling 'No related errors' collapses to a single NONE entry", async () => {
    const user = userEvent.setup()
    renderControlled({ related_errors: [{ error_code: "VL150", misconfiguration_cause: "", see_document_id: "", reference_validated: false }] })
    await user.click(screen.getByLabelText("No related errors from misconfiguring this"))
    expect(screen.queryByPlaceholderText("Error code (e.g. VL150)")).not.toBeInTheDocument()
  })

  it("checks a cross-referenced document ID via validateReference", async () => {
    apiGetMock.mockResolvedValue({ exists: true, title: "Config doc title", source_type: "document" })
    const user = userEvent.setup()
    renderControlled({ related_errors: [{ error_code: "VL150", misconfiguration_cause: "", see_document_id: "", reference_validated: false }] })

    await user.type(screen.getByPlaceholderText("Cross-reference document ID (optional)"), "SD-CFG-001")
    expect(await screen.findByText(/Found: Config doc title/, {}, { timeout: 3000 })).toBeInTheDocument()
  })
})
