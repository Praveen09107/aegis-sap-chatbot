"use client"

import { useMemo } from "react"
import { useDebounce } from "@/hooks/useDebounce"

// Matches backend/app/services/query_intelligence.py's real PATTERN_TCODE /
// PATTERN_ERROR_CODE exactly (confirmed 2026-07-23, F19) rather than
// FRONTEND_38's own spec'd regex, which never matches its own canonical
// example T-code: /\b([A-Z]{2,4}\d{0,2})\b/ requires the pattern to END
// right after the digits, so "VL01N" (letters+digits+trailing letter, a
// completely standard SAP T-code shape) can never match — the trailing "N"
// breaks the required word boundary immediately after the digits. Using the
// real backend pattern here means this "live preview" panel genuinely
// previews what the server will detect, not a broken approximation of it.
// Source patterns only — a fresh RegExp (with its own mutable lastIndex) is
// constructed per scan below, rather than mutating a shared module-level
// regex's lastIndex across renders.
const T_CODE_PATTERN = "\\b([A-Z]{2,5}\\d{1,4}[A-Z]?)\\b"
const ERROR_CODE_PATTERN = "\\b([A-Z]{1,4}\\d{2,6})\\b"

// Common false positives to exclude — words that happen to match the
// letters+digits shape but aren't real SAP codes.
const EXCLUDED_PATTERNS = new Set([
  "NONE", "SAP", "IBM", "YES", "THE", "AND", "FOR", "NOT", "BUT",
  "ALL", "ARE", "WITH", "FROM", "HAS", "HAVE", "THIS", "THAT",
  "WILL", "CAN", "ONLY", "ALSO", "INTO", "OVER", "WHEN",
])

interface DetectedEntities {
  t_codes: string[]
  error_codes: string[]
}

/**
 * Live-scans the Quick Entry form's text for SAP T-codes and error codes,
 * giving the admin real-time feedback (SapEntityPanel) on what AEGIS will
 * detect once the entry is indexed. Debounced against the live-typing form
 * data string — this is a client-side hint, not required to match the
 * backend's own extractor byte-for-byte.
 */
export function useEntityDetector(formDataStr: string, options: { debounceMs: number; enabled: boolean }) {
  const debouncedStr = useDebounce(formDataStr, options.debounceMs)

  const entities = useMemo<DetectedEntities>(() => {
    if (!options.enabled || !debouncedStr) return { t_codes: [], error_codes: [] }

    const tCodes = new Set<string>()
    const errorCodes = new Set<string>()

    const tCodeRegex = new RegExp(T_CODE_PATTERN, "g")
    const errorCodeRegex = new RegExp(ERROR_CODE_PATTERN, "g")

    let match: RegExpExecArray | null
    while ((match = tCodeRegex.exec(debouncedStr)) !== null) {
      const code = match[1]
      if (!EXCLUDED_PATTERNS.has(code) && code.length >= 2) {
        tCodes.add(code)
      }
    }

    while ((match = errorCodeRegex.exec(debouncedStr)) !== null) {
      const code = match[1]
      if (!EXCLUDED_PATTERNS.has(code)) {
        errorCodes.add(code)
      }
    }

    return {
      t_codes: Array.from(tCodes).sort(),
      error_codes: Array.from(errorCodes).sort(),
    }
  }, [debouncedStr, options.enabled])

  return { entities }
}
