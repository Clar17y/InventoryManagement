import * as XLSX from 'xlsx'

export function exportToXlsx(rows: Record<string, unknown>[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

export function isoDatePrefix(): string {
  return new Date().toISOString().slice(0, 10)
}
