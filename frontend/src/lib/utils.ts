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
