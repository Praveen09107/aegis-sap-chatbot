import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ChunkPreviewDrawer } from "./ChunkPreviewDrawer"
import type { ErrorGuideFormData } from "@/types"

const validFormData: Partial<ErrorGuideFormData> = {
  issue_description: "Tax condition not capturing",
  error_code: "NONE",
  error_message: "NONE",
  description: "A description that is long enough to pass validation checks here.",
  when_this_occurs: "During sale order creation with a specific customer group assigned.",
  causes: [
    {
      cause_number: 1,
      priority: "common",
      cause_description: "Missing condition record for the tax code",
      how_to_identify: "Check VK13 for the relevant condition type",
      resolution_steps: "In VK11, create the missing condition record",
      resolution_requires_admin: false,
      cause_obsolete: false,
      obsolete_reason: "",
      screenshot_ids: [],
      specificity_acknowledged: false,
    },
  ],
  success_indicator: "Tax now appears in the order",
  escalation_criteria: "If VK11 shows no valid combination",
  admin_steps: "NONE",
  notes: "",
}

describe("ChunkPreviewDrawer", () => {
  it("shows the assembled chunk count and chunk_type labels", () => {
    render(
      <ChunkPreviewDrawer
        contentType="error_guide"
        documentId="SD-ERR-001"
        module="SD"
        transactions={["VK11"]}
        verifiedByName="Jane Doe"
        verifiedDate="2026-06-01"
        formData={validFormData}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText("Chunk Preview — 2 chunks")).toBeInTheDocument()
    expect(screen.getByText("error_overview")).toBeInTheDocument()
    expect(screen.getByText("cause_1")).toBeInTheDocument()
  })

  it("shows the empty-preview placeholder when assembly throws (e.g. an unrecognized content_type)", () => {
    render(
      <ChunkPreviewDrawer
        // @ts-expect-error — intentionally invalid, to exercise assembleChunksClient's real thrown-error path
        contentType="not_a_real_type"
        documentId=""
        module=""
        transactions={[]}
        verifiedByName=""
        verifiedDate=""
        formData={{}}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText("Fill in more fields to preview chunks")).toBeInTheDocument()
  })

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ChunkPreviewDrawer
        contentType="error_guide"
        documentId="SD-ERR-001"
        module="SD"
        transactions={[]}
        verifiedByName="Jane"
        verifiedDate="2026-06-01"
        formData={validFormData}
        onClose={onClose}
      />
    )
    await user.click(screen.getByLabelText("Close chunk preview"))
    expect(onClose).toHaveBeenCalled()
  })
})
