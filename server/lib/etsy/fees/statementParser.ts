import { createHash } from 'node:crypto'
import * as XLSX from 'xlsx'
import type { NormalizedOrderEvidence } from './types'

const ORDER_ID_PATTERN = /Order\s*#\s*([0-9]+)/i

export interface ParseEtsyStatementInput {
  csv: string
  statementMonth: string
}

export interface ParsedEtsyStatement {
  statementMonth: string
  currency: 'GBP'
  /** SHA-256 of the line-ending/trailing-whitespace-normalized source file. */
  checksum: string
  /** Alias retained for callers that use the persisted import field name. */
  statementChecksum: string
  coveredReceiptIds: string[]
  evidenceByReceipt: Map<string, NormalizedOrderEvidence>
}

interface StatementRow {
  description: string
  info: string
  currency: string
  amount: number | null
  feesAndTaxes: number | null
  net: number | null
  type: string
}

interface ReceiptEvidence {
  covered: boolean
  attributed: boolean
  offsiteAdsFeePence: number
  vatOnOffsiteAdsFeePence: number
  hasOffsiteFeeRow: boolean
  hasVatRow: boolean
}

/** Normalize only line endings and trailing file whitespace for file identity. */
export function normalizeStatementCsvForChecksum(csv: string): string {
  return csv.replace(/\r\n?/g, '\n').replace(/\s+$/u, '')
}

/** Return a stable SHA-256 checksum for an Etsy statement upload. */
export function checksumEtsyStatement(csv: string): string {
  return createHash('sha256').update(normalizeStatementCsvForChecksum(csv), 'utf8').digest('hex')
}

function validateStatementMonth(statementMonth: string): void {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(statementMonth)) {
    throw new RangeError(`Invalid statement month: ${statementMonth}`)
  }
}

/** Etsy exports vary in spacing and punctuation; compare lowercase alphanumeric keys. */
function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findColumn(headers: readonly string[], aliases: readonly string[], label: string): string {
  const aliasSet = new Set(aliases.map(normalizeHeader))
  const header = headers.find((candidate) => aliasSet.has(normalizeHeader(candidate)))
  if (!header) {
    throw new Error(`Statement is missing required ${label} column`)
  }
  return header
}

function optionalColumn(headers: readonly string[], aliases: readonly string[]): string | null {
  const aliasSet = new Set(aliases.map(normalizeHeader))
  return headers.find((candidate) => aliasSet.has(normalizeHeader(candidate))) ?? null
}

function rowValue(row: Record<string, unknown>, column: string | null): string {
  if (!column) return ''
  const value = row[column]
  return value === null || value === undefined ? '' : String(value).trim()
}

/** Parse a decimal statement value into absolute integer pence. */
function parsePence(value: string, label: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null

  // Etsy's CSV uses a decimal point. Commas are accepted as thousands separators
  // because quoted statement exports can contain them in numeric cells.
  const normalized = trimmed.replace(/,/g, '')
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`${label} must be a finite number`)
  }

  const pence = Math.round(Math.abs(numeric) * 100)
  if (!Number.isSafeInteger(pence)) {
    throw new RangeError(`${label} exceeds the safe integer pence range`)
  }
  return pence
}

function parseRows(csv: string): StatementRow[] {
  const workbook = XLSX.read(normalizeStatementCsvForChecksum(csv), { type: 'string', raw: true })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new Error('Statement CSV has no worksheet')
  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) throw new Error('Statement CSV has no worksheet')

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : []
  const descriptionColumn = findColumn(headers, ['description'], 'description')
  const currencyColumn = findColumn(headers, ['currency'], 'currency')
  const amountColumn = findColumn(headers, ['amount'], 'amount')
  const feesColumn = findColumn(headers, ['fees & taxes', 'fees and taxes', 'feesandtaxes'], 'Fees & Taxes')
  const netColumn = findColumn(headers, ['net'], 'net')
  const infoColumn = optionalColumn(headers, ['info', 'information'])
  const typeColumn = optionalColumn(headers, ['type', 'transaction type'])

  return rows.map((row, index) => {
    const rowNumber = index + 2
    const currency = rowValue(row, currencyColumn).toUpperCase()
    if (currency !== 'GBP') {
      throw new Error(`Statement row ${rowNumber} must use GBP currency`)
    }
    return {
      description: rowValue(row, descriptionColumn),
      info: rowValue(row, infoColumn),
      currency,
      amount: parsePence(rowValue(row, amountColumn), `Amount on statement row ${rowNumber}`),
      feesAndTaxes: parsePence(rowValue(row, feesColumn), `Fees & Taxes on statement row ${rowNumber}`),
      net: parsePence(rowValue(row, netColumn), `Net on statement row ${rowNumber}`),
      type: rowValue(row, typeColumn),
    }
  })
}

function selectChargePence(row: StatementRow, receiptId: string, kind: string): number {
  if (row.feesAndTaxes === null && row.amount === null) {
    throw new Error(`${kind} row for order ${receiptId} has blank money cells`)
  }
  return row.feesAndTaxes !== null && row.feesAndTaxes !== 0
    ? row.feesAndTaxes
    : (row.amount ?? 0)
}

function isSaleCoverageRow(row: StatementRow, combinedText: string): boolean {
  return row.type.trim().toLowerCase() === 'sale' || /payment\s+for\s+order\b/i.test(combinedText)
}

function conflict(receiptId: string, kind: string): never {
  throw new Error(`Conflicting duplicate ${kind} rows for order ${receiptId}`)
}

/**
 * Parse an Etsy monthly statement into explicit order-level attribution evidence.
 * Statement evidence is always GBP and never claims Payment API values.
 */
export function parseEtsyStatement(input: ParseEtsyStatementInput): ParsedEtsyStatement {
  validateStatementMonth(input.statementMonth)
  const checksum = checksumEtsyStatement(input.csv)
  const rows = parseRows(input.csv)
  const receipts = new Map<string, ReceiptEvidence>()

  for (const row of rows) {
    const combinedText = `${row.description} ${row.info}`.trim()
    const orderMatch = combinedText.match(ORDER_ID_PATTERN)
    const isOffsiteRow = /offsite\s+ads/i.test(combinedText)
    const isVatRow = isOffsiteRow && /\bvat\b/i.test(combinedText)
    const isCoverageRow = isSaleCoverageRow(row, combinedText)

    if (isOffsiteRow && !orderMatch) {
      throw new Error('Offsite Ads statement row is missing an order ID')
    }

    if (!orderMatch) continue
    const receiptId = orderMatch[1]!
    const existing = receipts.get(receiptId) ?? {
      covered: false,
      attributed: false,
      offsiteAdsFeePence: 0,
      vatOnOffsiteAdsFeePence: 0,
      hasOffsiteFeeRow: false,
      hasVatRow: false,
    }
    existing.covered ||= isCoverageRow

    if (isVatRow) {
      const vat = selectChargePence(row, receiptId, 'VAT on Offsite Ads fee')
      if (existing.hasVatRow && existing.vatOnOffsiteAdsFeePence !== vat) {
        conflict(receiptId, 'VAT')
      }
      existing.hasVatRow = true
      existing.vatOnOffsiteAdsFeePence = vat
    } else if (isOffsiteRow) {
      const fee = selectChargePence(row, receiptId, 'Offsite Ads fee')
      if (existing.hasOffsiteFeeRow && existing.offsiteAdsFeePence !== fee) {
        conflict(receiptId, 'Offsite Ads fee')
      }
      existing.hasOffsiteFeeRow = true
      existing.attributed = true
      existing.offsiteAdsFeePence = fee
    }

    receipts.set(receiptId, existing)
  }

  const coveredReceiptIds = [...receipts.entries()]
    .filter(([, receipt]) => receipt.covered)
    .map(([receiptId]) => receiptId)
    .sort()
  const evidenceByReceipt = new Map<string, NormalizedOrderEvidence>()
  for (const receiptId of coveredReceiptIds) {
    const receipt = receipts.get(receiptId)!
    if (receipt.hasVatRow && receipt.vatOnOffsiteAdsFeePence > 0 && receipt.offsiteAdsFeePence <= 0) {
      throw new Error(`VAT on Offsite Ads fee has no matching fee for order ${receiptId}`)
    }
    evidenceByReceipt.set(receiptId, {
      receiptId,
      currency: 'GBP',
      attributed: receipt.attributed,
      offsiteAdsFeePence: receipt.attributed ? receipt.offsiteAdsFeePence : 0,
      vatOnOffsiteAdsFeePence: receipt.attributed ? receipt.vatOnOffsiteAdsFeePence : 0,
      paymentGrossPence: null,
      paymentFeesPence: null,
      paymentNetPence: null,
      source: 'ETSY_STATEMENT',
    })
  }

  return {
    statementMonth: input.statementMonth,
    currency: 'GBP',
    checksum,
    statementChecksum: checksum,
    coveredReceiptIds,
    evidenceByReceipt,
  }
}
