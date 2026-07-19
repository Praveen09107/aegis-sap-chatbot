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

interface RequestOptions extends Omit<RequestInit, "body"> {
  /**
   * Suppress automatic toast notifications on error.
   * Use when you want to handle errors manually in the component.
   */
  silent?: boolean
}

interface UploadOptions {
  silent?: boolean
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
          toast.error("Session expired. Redirecting to login...")
          setTimeout(() => {
            window.location.href = "/login"
          }, 1500)
          break
        case 403:
          toast.error("You do not have permission to perform this action.")
          break
        case 404:
          toast.error("The requested resource was not found.")
          break
        case 422:
          toast.error(`Validation error: ${detail}`)
          break
        case 429:
          toast.error("Too many requests. Please wait a moment.")
          break
        default:
          if (response.status >= 500) {
            toast.error("Server error. Please try again or contact IT support.")
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

  /** HTTP DELETE */
  delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: "DELETE" })
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
    return execute<T>(`/api/upload/${kind}`, {
      method: "POST",
      body: formData,
      silent: options?.silent,
    })
  },
}
