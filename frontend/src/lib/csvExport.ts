/**
 * CSV export utility for admin data tables. Downloads a CSV file with the
 * given column definitions and data.
 */

export interface CSVColumn<T> {
  header: string
  accessor: (row: T) => string | number
}

/**
 * Generate and trigger a CSV file download.
 *
 * @example
 * exportToCSV({
 *   filename: 'aegis-audit-trail',
 *   columns: [
 *     { header: 'Query', accessor: (r) => r.query_text },
 *     { header: 'Badge', accessor: (r) => r.confidence_badge ?? 'none' },
 *     { header: 'Date', accessor: (r) => r.created_at },
 *   ],
 *   data: auditTrailData,
 * })
 */
export function exportToCSV<T>({ filename, columns, data }: { filename: string; columns: CSVColumn<T>[]; data: T[] }): void {
  const headerRow = columns.map((col) => escapeCSVCell(col.header)).join(",")

  const dataRows = data.map((row) => columns.map((col) => escapeCSVCell(String(col.accessor(row)))).join(","))

  const csvContent = [headerRow, ...dataRows].join("\n")
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeCSVCell(value: string): string {
  // Wrap in quotes if it contains a comma, newline, or quote
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
