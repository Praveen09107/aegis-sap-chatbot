/**
 * AEGIS Type-Safe API Client
 *
 * All calls route through /api/proxy/[...path] which:
 * 1. Reads the HttpOnly access_token cookie
 * 2. Forwards the request to FastAPI with an Authorization header
 * 3. Streams the response back
 *
 * Usage:
 *   const docs = await api.get<DocumentRecord[]>('admin/documents')
 *   const result = await api.post('admin/registry/abc/approve')
 *   await api.upload<IngestResult>('document', formData)
 */

import { toast } from "sonner"
import { getHttpErrorMessage } from "@/lib/errorCodes"

export class APIError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly body?: unknown
  ) {
    super(detail)
    this.name = "APIError"
  }
}

/**
 * Type guard for a specific HTTP status on a caught error. Works off the
 * real APIError class already thrown by every request path here — this
 * project uses one error class with a `.status` field (0 = network
 * failure) rather than FRONTEND_26's proposed separate NetworkError/
 * AuthError/ServerError/ClientError hierarchy, so classification is done
 * this way instead of `instanceof` on multiple classes.
 *
 * @example
 * onError: (err) => {
 *   if (isApiStatus(err, 409)) toastError('This entry already exists')
 * }
 */
export function isApiStatus(err: unknown, status: number): boolean {
  return err instanceof APIError && err.status === status
}

/** True for a network-layer failure (offline, DNS, fetch throw) — status 0. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof APIError && err.status === 0
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  /**
   * Suppress automatic toast notifications on error.
   * Use when you want to handle errors manually in the component.
   */
  silent?: boolean
}

interface DeleteOptions extends RequestOptions {
  /** Optional JSON body — most DELETE endpoints don't need one, but a few require a confirmation payload. */
  body?: unknown
}

interface UploadOptions {
  silent?: boolean
  /**
   * Called with 0–100 as the request body uploads. Fetch (used by every
   * other method here) has no upload-progress API at all — when this is
   * provided, upload() switches to XMLHttpRequest instead, which does.
   */
  onProgress?: (percent: number) => void
}

/**
 * XHR-based upload, used only when the caller wants real progress events
 * (fetch cannot report upload progress). Mirrors execute()'s error handling
 * (toast on non-2xx, APIError thrown) so callers see identical behavior
 * regardless of which transport actually ran.
 */
function uploadWithProgress<T>(url: string, formData: FormData, onProgress: (percent: number) => void, silent: boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      let body: unknown = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = xhr.responseText
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
        return
      }

      const detail =
        typeof body === "object" && body !== null && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : `Request failed with status ${xhr.status}`

      if (!silent) toast.error(detail)
      reject(new APIError(xhr.status, detail, body))
    }

    xhr.onerror = () => {
      if (!silent) toast.error("Network error — check your connection and try again.")
      reject(new APIError(0, "Network error"))
    }

    xhr.send(formData)
  })
}

async function execute<T>(
  url: string,
  options: RequestOptions & { body?: unknown } = {}
): Promise<T> {
  const { silent = false, body, headers: customHeaders, ...restOptions } = options

  const headers: HeadersInit = {
    ...customHeaders,
  }

  if (body !== undefined && !(body instanceof FormData)) {
    ;(headers as Record<string, string>)["Content-Type"] = "application/json"
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...restOptions,
      headers,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (networkError) {
    if (!silent) {
      toast.error("Network error — check your connection and try again.")
    }
    throw new APIError(0, "Network error", networkError)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get("content-type") ?? ""
  let responseBody: unknown
  if (contentType.includes("application/json")) {
    responseBody = await response.json().catch(() => null)
  } else {
    responseBody = await response.text().catch(() => null)
  }

  if (!response.ok) {
    const detail =
      typeof responseBody === "object" && responseBody !== null && "detail" in responseBody
        ? String((responseBody as { detail: unknown }).detail)
        : `Request failed with status ${response.status}`

    if (!silent) {
      switch (response.status) {
        case 401:
          toast.error(getHttpErrorMessage(401))
          // Preserves the intended destination via `redirect` — the same
          // query param name proxy.ts's own middleware-level 401 already
          // uses (fixed 2026-07-22: this previously always sent the user to
          // a bare /login, silently dropping wherever they were, and the
          // login page didn't read the param either — see login/page.tsx).
          setTimeout(() => {
            const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
            window.location.href = `/login?redirect=${returnTo}`
          }, 1500)
          break
        case 403:
        case 404:
        case 429:
          toast.error(getHttpErrorMessage(response.status))
          break
        case 422:
          toast.error(`Validation error: ${detail}`)
          break
        default:
          if (response.status >= 500) {
            toast.error(getHttpErrorMessage(response.status))
          } else {
            toast.error(detail)
          }
      }
    }

    throw new APIError(response.status, detail, responseBody)
  }

  return responseBody as T
}

function proxyUrl(path: string): string {
  return `/api/proxy/${path.replace(/^\//, "")}`
}

function request<T>(path: string, options: RequestOptions & { body?: unknown } = {}): Promise<T> {
  return execute<T>(proxyUrl(path), options)
}

// ── Typed API methods ──

export const api = {
  /** HTTP GET */
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "GET" })
  },

  /** HTTP POST with JSON body */
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "POST", body })
  },

  /** HTTP PUT with JSON body */
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "PUT", body })
  },

  /** HTTP PATCH with JSON body */
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "PATCH", body })
  },

  /**
   * HTTP DELETE. A JSON body is optional and rare — the real
   * DELETE /api/admin/knowledge-entries/:id endpoint requires one, carrying
   * `confirmed_document_id`. Passed inside `options.body` (a `DeleteOptions`
   * field, not part of the shared `RequestOptions` GET/POST/etc. use) rather
   * than as its own positional param, so existing two-arg callers like
   * `api.delete(path, { silent: true })` keep working unchanged.
   */
  delete<T = void>(path: string, options?: DeleteOptions): Promise<T> {
    const { body, ...rest } = options ?? {}
    return request<T>(path, { ...rest, method: "DELETE", body })
  },

  /**
   * Multipart file upload. Goes through the dedicated /api/upload/<kind>
   * route (not /api/proxy/*) — those routes stream the request body
   * straight to the backend instead of buffering it first, which the
   * catch-all proxy deliberately does not do (see FRONTEND_SUPPLEMENT_02
   * Part 1). Does NOT set Content-Type — the browser sets it with the
   * multipart boundary automatically.
   */
  upload<T>(kind: "document" | "screenshot", formData: FormData, options?: UploadOptions): Promise<T> {
    if (options?.onProgress) {
      return uploadWithProgress<T>(`/api/upload/${kind}`, formData, options.onProgress, options.silent ?? false)
    }
    return execute<T>(`/api/upload/${kind}`, {
      method: "POST",
      body: formData,
      silent: options?.silent,
    })
  },
}
