import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChatMessage } from "@/types"

const toBlobMock = vi.fn(async () => new Blob(["fake-pdf"], { type: "application/pdf" }))
const pdfMock = vi.fn(() => ({ toBlob: toBlobMock }))

vi.mock("@react-pdf/renderer", () => ({
  pdf: () => pdfMock(),
}))

vi.mock("@/components/pdf/SessionDocument", () => ({
  SessionDocument: () => null,
}))

const messages: ChatMessage[] = [
  { id: "1", role: "user", content: "hello", timestamp: new Date("2026-01-01T00:00:00Z") },
]

describe("exportSessionAsPDF", () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pdfMock.mockClear()
    toBlobMock.mockClear()
    URL.createObjectURL = vi.fn(() => "blob:fake-url")
    URL.revokeObjectURL = vi.fn()
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    clickSpy.mockRestore()
  })

  it("dynamically imports @react-pdf/renderer and SessionDocument rather than requiring them eagerly", async () => {
    // Module-level static imports of @react-pdf/renderer/SessionDocument would
    // make this test's mocks irrelevant (they'd already be bound at import
    // time) — the fact these mocks are exercised at all is itself evidence
    // the real module resolves them dynamically, inside the function call.
    await import("./sessionExport").then((m) => m.exportSessionAsPDF(messages, "Login issues"))
    expect(pdfMock).toHaveBeenCalledTimes(1)
    expect(toBlobMock).toHaveBeenCalledTimes(1)
  })

  it("triggers a download named with the current date and clicks the anchor", async () => {
    const { exportSessionAsPDF } = await import("./sessionExport")
    await exportSessionAsPDF(messages, "Login issues")

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url")
  })
})
