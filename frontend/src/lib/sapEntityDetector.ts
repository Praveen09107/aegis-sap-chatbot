/**
 * AEGIS SAP Entity Detector
 *
 * Detects SAP-specific identifiers in text and returns their positions.
 * Used by SAPEntityHighlighter to render colored EntityChip components.
 *
 * Entity types:
 * - error_code: VL150, F5201, BA114, ME001 (1-2 letters + 3-4 digits)
 * - tcode: VL01N, MM02, MMBE, VA31, FB50 (transaction codes)
 * - doc_number: 4500012345 (10-12 digit document numbers)
 */

import type { SAPEntity } from "@/types"

// ── Detection patterns ──

// Error codes: 1-2 uppercase letters followed by 3-4 digits, optional trailing letter
const ERROR_CODE_REGEX = /\b([A-Z]{1,2}\d{3,4}[A-Z]?)\b/g

// Transaction codes: 2-6 uppercase letters optionally followed by digits/letters
// Also handles codes like F-03 (with hyphen) and ME21N (letter suffix)
const TCODE_REGEX = /\b([A-Z]{2,6}(?:\d{0,4}[A-Z]?|[-]\d{2}))\b/g

// SAP document numbers: exactly 10 digits (purchase orders, sales orders, etc.)
const DOC_NUMBER_REGEX = /\b(\d{10})\b/g

// ── Exclusion sets (common English words that match patterns) ──

const TCODE_EXCLUSIONS = new Set([
  // Common English words that look like T-codes
  "AND", "THE", "FOR", "ARE", "WAS", "CAN", "NOT", "BUT", "ALL", "ANY",
  "YOU", "HAS", "HAD", "ITS", "OUR", "OUT", "YES", "FROM", "ALSO", "THEN",
  "THEM", "THEY", "THIS", "WITH", "THAT", "INTO", "WHEN", "BEEN", "HAVE",
  // Tech acronyms
  "API", "URL", "PDF", "XML", "CSV", "SQL", "JIT", "KPI", "ERR", "MSG",
  // SAP itself
  "SAP", "ERP", "RFC",
  // Short words
  "IT", "AT", "IN", "IS", "AS", "BE", "BY", "DO", "GO", "IF", "ME",
  "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "US",
])

// Known SAP module prefixes for error codes (increases precision)
const ERROR_PREFIXES = [
  "VL", "VA", "VF", "VK", "ME", "MB", "MM", "MR", "ML",
  "FI", "FB", "FF", "FT", "CO", "CJ", "KS", "KA", "KE",
  "BA", "CA", "PA", "PY", "HR", "PT", "PP", "QM",
  "F", // Single-letter FI codes: F5201
  "M", // Single-letter MM codes: M0001
]

// Known SAP transaction code prefixes (increases precision)
const TCODE_PREFIXES = [
  "VL", "VA", "VF", "VK", "VD", "VN", // SD
  "ME", "MB", "MM", "MR", "ML", "MN", // MM
  "FB", "FF", "FT", "FV", "FK", "FD", // FI
  "KB", "KE", "KP", "KS", "KA", "CO", // CO
  "PA", "PY", "HR", "PE", "PT",       // HR
  "CA", "CS", "PP", "PI",             // PP
  "MMBE", "XK", "XD",                 // Common cross-module
]

/**
 * Detect all SAP entities in a text string.
 * Returns entities sorted by position (start index).
 */
export function detectSAPEntities(text: string): SAPEntity[] {
  const entities: SAPEntity[] = []

  // Track covered ranges to prevent overlapping entities
  const covered = new Set<number>()

  function isCovered(start: number, end: number): boolean {
    for (let i = start; i < end; i++) {
      if (covered.has(i)) return true
    }
    return false
  }

  function markCovered(start: number, end: number): void {
    for (let i = start; i < end; i++) covered.add(i)
  }

  // 1. Detect document numbers (most specific — pure digits)
  DOC_NUMBER_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = DOC_NUMBER_REGEX.exec(text)) !== null) {
    const [full, value] = match
    const start = match.index
    const end = start + full.length
    if (!isCovered(start, end)) {
      entities.push({ type: "doc_number", value, start, end })
      markCovered(start, end)
    }
  }

  // 2. Detect error codes (medium specificity)
  ERROR_CODE_REGEX.lastIndex = 0
  while ((match = ERROR_CODE_REGEX.exec(text)) !== null) {
    const [full, value] = match
    const start = match.index
    const end = start + full.length
    if (!isCovered(start, end) && isLikelyErrorCode(value)) {
      entities.push({ type: "error_code", value, start, end })
      markCovered(start, end)
    }
  }

  // 3. Detect T-codes (broadest pattern — applied last)
  TCODE_REGEX.lastIndex = 0
  while ((match = TCODE_REGEX.exec(text)) !== null) {
    const [full, value] = match
    const start = match.index
    const end = start + full.length
    if (!isCovered(start, end) && isLikelyTCode(value)) {
      entities.push({ type: "tcode", value, start, end })
      markCovered(start, end)
    }
  }

  return entities.sort((a, b) => a.start - b.start)
}

function isLikelyErrorCode(value: string): boolean {
  if (value.length < 4 || value.length > 7) return false
  return ERROR_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function isLikelyTCode(value: string): boolean {
  if (TCODE_EXCLUSIONS.has(value)) return false
  if (value.length < 3 || value.length > 8) return false
  return TCODE_PREFIXES.some((prefix) => value.startsWith(prefix))
}

/**
 * Split text into segments for rendering by SAPEntityHighlighter.
 */
export interface TextSegment {
  type: "text" | "entity"
  content: string
  entity?: SAPEntity
}

export function splitTextByEntities(text: string, entities: SAPEntity[]): TextSegment[] {
  if (entities.length === 0) {
    return [{ type: "text", content: text }]
  }

  const segments: TextSegment[] = []
  let cursor = 0

  for (const entity of entities) {
    if (cursor < entity.start) {
      segments.push({ type: "text", content: text.slice(cursor, entity.start) })
    }
    segments.push({ type: "entity", content: entity.value, entity })
    cursor = entity.end
  }

  if (cursor < text.length) {
    segments.push({ type: "text", content: text.slice(cursor) })
  }

  return segments
}
