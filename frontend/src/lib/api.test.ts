import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { api, APIError } from "./api"

// ── Mock XMLHttpRequest ──────────────────────────────────────────
//
// api.upload()'s onProgress path uses XMLHttpRequest directly (fetch has no
// upload-progress API at all) — this mock gives full manual control over
// the request lifecycle so upload/error/progress events can be simulated
// directly, matching the pattern already established for WebSocket testing
// in useWebSocket.test.tsx.
class MockXHR {
  static instances: MockXHR[] = []
  status = 0
  responseText = ""
  upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private method = ""
  private url = ""
  sentBody: unknown

  constructor() {
    MockXHR.instances.push(this)
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  send(body: unknown) {
    this.sentBody = body
  }

  // ── Test helpers ──────────────────────────────────────────
  simulateProgress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }

  simulateSuccess(status: number, body: unknown) {
    this.status = status
    this.responseText = JSON.stringify(body)
    this.onload?.()
  }

  simulateHttpError(status: number, body: unknown) {
    this.status = status
    this.responseText = JSON.stringify(body)
    this.onload?.()
  }

  simulateNetworkError() {
    this.onerror?.()
  }

  get requestedMethod() {
    return this.method
  }
  get requestedUrl() {
    return this.url
  }
}

function latestXHR(): MockXHR {
  const xhr = MockXHR.instances.at(-1)
  if (!xhr) throw new Error("No MockXHR instance was created")
  return xhr
}

describe("api.upload — onProgress (XHR) path", () => {
  beforeEach(() => {
    MockXHR.instances = []
    vi.stubGlobal("XMLHttpRequest", MockXHR)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses XMLHttpRequest (not fetch) when onProgress is provided, POSTing to the right URL", () => {
    const formData = new FormData()
    api.upload("document", formData, { onProgress: vi.fn() })

    const xhr = latestXHR()
    expect(xhr.requestedMethod).toBe("POST")
    expect(xhr.requestedUrl).toBe("/api/upload/document")
    expect(xhr.sentBody).toBe(formData)
  })

  it("reports upload progress as a 0-100 percentage via onProgress", () => {
    const onProgress = vi.fn()
    api.upload("document", new FormData(), { onProgress })

    latestXHR().simulateProgress(50, 200)
    expect(onProgress).toHaveBeenCalledWith(25)

    latestXHR().simulateProgress(200, 200)
    expect(onProgress).toHaveBeenCalledWith(100)
  })

  it("does not call onProgress when the event isn't lengthComputable", () => {
    const onProgress = vi.fn()
    api.upload("document", new FormData(), { onProgress })

    latestXHR().upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 })
    expect(onProgress).not.toHaveBeenCalled()
  })

  it("resolves with the parsed JSON body on a 2xx response", async () => {
    const promise = api.upload<{ status: string; document_id: string }>("document", new FormData(), { onProgress: vi.fn() })
    latestXHR().simulateSuccess(200, { status: "complete", document_id: "d1" })

    await expect(promise).resolves.toEqual({ status: "complete", document_id: "d1" })
  })

  it("rejects with an APIError carrying the response detail on a non-2xx response", async () => {
    const promise = api.upload("document", new FormData(), { onProgress: vi.fn(), silent: true })
    latestXHR().simulateHttpError(422, { detail: "File too large" })

    await expect(promise).rejects.toMatchObject({ status: 422, detail: "File too large" })
    await expect(promise).rejects.toBeInstanceOf(APIError)
  })

  it("rejects with a network-error APIError on xhr.onerror", async () => {
    const promise = api.upload("document", new FormData(), { onProgress: vi.fn(), silent: true })
    latestXHR().simulateNetworkError()

    await expect(promise).rejects.toMatchObject({ status: 0, detail: "Network error" })
  })

  it("falls back gracefully when the response body isn't valid JSON", async () => {
    const promise = api.upload("document", new FormData(), { onProgress: vi.fn(), silent: true })
    const xhr = latestXHR()
    xhr.status = 500
    xhr.responseText = "<html>Internal Server Error</html>"
    xhr.onload?.()

    await expect(promise).rejects.toMatchObject({ status: 500 })
  })
})

describe("api.upload — without onProgress (fetch path, unchanged)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "processing", task_id: "t1" }), { status: 200, headers: { "content-type": "application/json" } }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("still uses fetch when no onProgress callback is given", async () => {
    const result = await api.upload("screenshot", new FormData())
    expect(result).toEqual({ status: "processing", task_id: "t1" })
    expect(fetch).toHaveBeenCalledWith(
      "/api/upload/screenshot",
      expect.objectContaining({ method: "POST" })
    )
  })
})
