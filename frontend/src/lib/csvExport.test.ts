import { describe, it, expect, vi, afterEach } from "vitest"
import { exportToCSV } from "./csvExport"

interface Row {
  name: string
  note: string
}

describe("exportToCSV", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("builds a UTF-8 BOM-prefixed CSV blob with header + escaped rows and triggers a download", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] })
    vi.setSystemTime(new Date("2026-07-19T00:00:00Z"))

    let capturedBlob: Blob | undefined
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob
      return "blob:mock-url"
    })
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === "a") el.click = clickSpy
      return el
    })

    const data: Row[] = [
      { name: "Simple", note: "no special chars" },
      { name: 'Has "quotes"', note: "has, a comma" },
    ]

    exportToCSV({
      filename: "aegis-audit-trail",
      columns: [
        { header: "Name", accessor: (r) => r.name },
        { header: "Note", accessor: (r) => r.note },
      ],
      data,
    })

    expect(capturedBlob).toBeDefined()
    expect(capturedBlob!.type).toBe("text/csv;charset=utf-8;")
    expect(clickSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url")
  })

  it("quotes cells containing commas, quotes, or newlines; leaves plain cells unquoted", async () => {
    let capturedBlob: Blob | undefined
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob
      return "blob:mock-url"
    })
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === "a") el.click = vi.fn()
      return el
    })

    exportToCSV({
      filename: "test",
      columns: [{ header: "Value", accessor: (r: { v: string }) => r.v }],
      data: [{ v: 'has, comma and "quote"' }, { v: "plain" }],
    })

    const content = await capturedBlob!.text()
    expect(content).toContain('"has, comma and ""quote"""')
    expect(content).toContain("\nplain")
  })
})
