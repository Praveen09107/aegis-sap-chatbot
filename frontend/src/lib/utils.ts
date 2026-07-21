import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merges Tailwind CSS classes with conflict resolution.
 * Always use cn() instead of string concatenation for Tailwind classes.
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-accent', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Format date to human-readable relative time.
 * Used in session sidebar cards.
 */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

/**
 * Group sessions by relative date.
 * Returns an ordered array of [label, sessions[]] tuples.
 */
export function groupSessionsByDate<T extends { updated_at: string }>(
  sessions: T[]
): Array<[string, T[]]> {
  const groups: Record<string, T[]> = {}
  const labelOrder: string[] = []

  for (const session of sessions) {
    const label = formatRelativeDate(session.updated_at)
    if (!groups[label]) {
      groups[label] = []
      labelOrder.push(label)
    }
    groups[label].push(session)
  }

  return labelOrder.map((label) => [label, groups[label]])
}

/**
 * Format validation score as percentage string.
 * @example formatScore(0.847) → "84.7%"
 */
export function formatScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`
}

/**
 * Format bytes to human-readable file size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

/**
 * Truncate a string to a maximum length with ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + "..."
}

/**
 * Debounce a function call.
 * Used for search inputs and other high-frequency events.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Check if a string contains a SAP error code pattern.
 */
export function hasSAPEntities(text: string): boolean {
  const patterns = [
    /\b[A-Z]{1,2}\d{4}[A-Z]?\b/, // Error codes: VL150, F5201
    /\b[A-Z]{2,6}\d{0,3}[A-Z]?\b/, // T-codes: VL01N, MM02
    /\b\d{10,12}\b/, // Document numbers
  ]
  return patterns.some((p) => p.test(text))
}

/**
 * Sleep for a given number of milliseconds.
 * Used in retry logic.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Deployment-aware date formatting (AMENDMENT_GENERALIZATION_FRONTEND FILE 10) ──
//
// The original spec (FRONTEND_SUPPLEMENT_01) hardcoded 'en-IN'/'Asia/Kolkata'
// for the original India-based deployment. Generalized here from the start —
// a deployment outside India overrides these two env vars; the defaults
// preserve the original Chennai behavior exactly.
const DEPLOY_LOCALE = process.env.NEXT_PUBLIC_DEPLOY_LOCALE || "en-IN"
const DEPLOY_TIMEZONE = process.env.NEXT_PUBLIC_DEPLOY_TIMEZONE || "Asia/Kolkata"

/**
 * Format a date string or Date object for display, using the deployment's
 * configured locale and timezone.
 *
 * @example
 * formatDateLocalized(new Date())  → "28 Mar 2024, 02:30 PM" (default en-IN/Asia-Kolkata deploy)
 */
export function formatDateLocalized(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString(DEPLOY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEPLOY_TIMEZONE,
  })
}
/** @deprecated Use formatDateLocalized — kept so existing call sites aren't all broken at once. */
export const formatDateIST = formatDateLocalized

/**
 * Convert a Date to a deployment-timezone date string (YYYY-MM-DD).
 * Used for date_from/date_to filter params sent to the backend.
 *
 * @example
 * toLocalizedDateString(new Date())  → "2024-03-28"
 */
export function toLocalizedDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: DEPLOY_TIMEZONE }) // en-CA gives YYYY-MM-DD
}
/** @deprecated Use toLocalizedDateString — kept so existing call sites aren't all broken at once. */
export const toISTDateString = toLocalizedDateString

/**
 * Returns the start of "today" in the deployment timezone, as a UTC Date object.
 * Used for "Today" date range filters.
 */
export function startOfTodayLocalized(): Date {
  const now = new Date()
  const localDateString = now.toLocaleDateString("en-CA", { timeZone: DEPLOY_TIMEZONE })
  const [y, m, d] = localDateString.split("-").map(Number)

  // Compute the deployment timezone's UTC offset (in minutes) at this date
  // via Intl — works for any IANA zone, not just a hardcoded +5:30.
  const offsetMinutes = getTimezoneOffsetMinutes(DEPLOY_TIMEZONE, new Date(Date.UTC(y, m - 1, d)))
  return new Date(Date.UTC(y, m - 1, d) - offsetMinutes * 60 * 1000)
}
/** @deprecated Use startOfTodayLocalized — kept so existing call sites aren't all broken at once. */
export const startOfTodayIST = startOfTodayLocalized

/** Returns the UTC offset (in minutes, positive = ahead of UTC) of an IANA timezone at a given instant. */
function getTimezoneOffsetMinutes(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts = dtf.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return Math.round((asUTC - at.getTime()) / 60_000)
}
