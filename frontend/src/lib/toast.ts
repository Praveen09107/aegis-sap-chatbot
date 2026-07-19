/**
 * AEGIS Typed Toast Helpers
 *
 * Wraps Sonner's toast functions with consistent AEGIS styling and
 * messages. Always use these helpers instead of calling sonner's toast
 * directly.
 *
 * @example
 * toastSuccess('Document deprecated successfully')
 * toastError('Failed to upload file — check file size and try again')
 * toastLoading('Uploading document...')
 * toastPromise(uploadDoc(), { loading: 'Uploading...', success: 'Uploaded!', error: 'Failed' })
 */

import { toast } from "sonner"

// ── Core helpers ──────────────────────────────────────────────

export function toastSuccess(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 4000,
  })
}

export function toastError(message: string, description?: string) {
  toast.error(message, {
    description,
    duration: 6000, // Errors stay longer
  })
}

export function toastWarning(message: string, description?: string) {
  toast.warning(message, {
    description,
    duration: 5000,
  })
}

export function toastInfo(message: string, description?: string) {
  toast.info(message, {
    description,
    duration: 4000,
  })
}

/**
 * Dismissible loading toast — returns toast ID for dismissal. Must call
 * toast.dismiss(id) when the operation completes.
 *
 * @example
 * const id = toastLoading('Generating PDF...')
 * await generatePDF()
 * toast.dismiss(id)
 * toastSuccess('PDF downloaded')
 */
export function toastLoading(message: string): string | number {
  return toast.loading(message, { duration: Infinity })
}

/**
 * Promise-based toast — automatically transitions between loading/success/
 * error. The cleanest pattern for async operations.
 *
 * @example
 * toastPromise(api.post('admin/registry/abc/approve'), {
 *   loading: 'Approving entry...',
 *   success: 'Registry entry approved',
 *   error: 'Failed to approve entry',
 * })
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((error: unknown) => string)
  }
): Promise<T> {
  toast.promise(promise, messages)
  return promise
}

// ── AEGIS-specific toast messages ────────────────────────────

export const TOAST = {
  // Document operations
  documentUploaded: () => toastSuccess("Document uploaded", "Ingestion started in background"),
  documentDeprecated: (id: string) => toastSuccess(`${id} deprecated`),
  documentsFailed: () => toastError("Upload failed", "Check file size (max 50MB) and format"),

  // Registry operations
  registryApproved: () => toastSuccess("Registry entry approved"),
  registryRejected: () => toastSuccess("Registry entry rejected"),

  // Config operations
  configSaved: (key: string) => toastSuccess(`${key} saved`),
  configSaveFailed: () => toastError("Save failed", "Check your connection and retry"),

  // Review queue
  correctionSubmitted: () => toastSuccess("Correction submitted to knowledge base"),
  correctionSkipped: () => toastInfo("Item skipped — moved to end of queue"),

  // Ticket operations
  ticketUpdated: () => toastSuccess("Ticket updated"),
  ticketMoved: (status: string) => toastSuccess(`Ticket moved to ${status}`),

  // Session operations
  sessionPinned: () => toastSuccess("Session pinned"),
  sessionUnpinned: () => toastInfo("Session unpinned"),
  sessionRenamed: () => toastSuccess("Session renamed"),
  sessionDeleted: () => toastSuccess("Session deleted"),
  sessionExported: () => toastSuccess("PDF downloaded"),

  // Auth
  sessionExpired: () => toastError("Session expired", "Redirecting to login..."),
  networkError: () => toastError("Network error", "Check your connection and try again"),

  // Feedback
  feedbackPositive: () => toastSuccess("Thanks! Positive feedback recorded"),
  feedbackNegative: () => toastInfo("Feedback recorded — question flagged for review"),
} as const
