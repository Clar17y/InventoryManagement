import type { IEtsyClient } from '../types'
import { fingerprintReconciliationInput } from './fingerprint'
import {
  reconcileImportedPaymentEvidence,
  type FeeOrderChange,
  type FeeReconciliationRepository,
  type FeeReconciliationSummary,
  type FeeReconciliationTransaction,
  type PaymentReconciliationResult,
  StatementReconciliationConflictError,
} from './reconciliationService'
import { groupSalesByReceipt } from './grouping'
import {
  normalizeReceiptPayments,
  type NormalizedReceiptPayments,
} from './paymentNormalizer'
import type { NormalizedOrderEvidence, SaleFeeSnapshot } from './types'

export interface PaymentReconciliationDependencies {
  client: Pick<IEtsyClient, 'getPaymentsForReceipt'>
  db: FeeReconciliationRepository
}

export interface PaymentReconciliationInput {
  receiptIds?: string[]
  limit?: number
}

export interface PaymentReconciliationApplyInput {
  receiptIds: string[]
  fingerprint: string
}

export interface PaymentReconciliationFailure {
  receiptId: string
  status: 'PENDING' | 'MANUAL_REVIEW'
  message: string
}

export interface PaymentReconciliationPreview extends Omit<PaymentReconciliationResult, 'applied'> {
  canApplyCanonicalFees: boolean
  failures: PaymentReconciliationFailure[]
}

export interface PaymentReconciliationApplyResult extends PaymentReconciliationPreview {
  applied: boolean
}

export class PaymentReconciliationConflictError extends Error {
  readonly code = 'PAYMENT_RECONCILIATION_CONFLICT'

  constructor(message = 'Payment preview is stale; reload sale state and preview again before applying') {
    super(message)
    this.name = 'PaymentReconciliationConflictError'
  }
}

const EMPTY_SUMMARY: FeeReconciliationSummary = {
  matched: 0,
  changed: 0,
  unchanged: 0,
  unmatched: 0,
  manualReview: 0,
  attributed: 0,
  notAttributed: 0,
  oldFeesPence: 0,
  newFeesPence: 0,
  marginDeltaPence: 0,
}

function cloneSummary(): FeeReconciliationSummary {
  return { ...EMPTY_SUMMARY }
}

function addSummary(target: FeeReconciliationSummary, source: FeeReconciliationSummary): void {
  target.matched += source.matched
  target.changed += source.changed
  target.unchanged += source.unchanged
  target.unmatched += source.unmatched
  target.manualReview += source.manualReview
  target.attributed += source.attributed
  target.notAttributed += source.notAttributed
  target.oldFeesPence += source.oldFeesPence
  target.newFeesPence += source.newFeesPence
  target.marginDeltaPence += source.marginDeltaPence
}

function baseReceiptId(etsyOrderId: string): string | null {
  const match = /^(\d+)(?:-\d+)?$/.exec(etsyOrderId)
  return match?.[1] ?? null
}

function receiptIdNumber(receiptId: string): number {
  const number = Number(receiptId)
  if (!/^\d+$/.test(receiptId) || !Number.isSafeInteger(number)) {
    throw new RangeError(`Invalid Etsy receipt ID: ${receiptId}`)
  }
  return number
}

function selectReceiptIds(
  snapshots: readonly SaleFeeSnapshot[],
  input: PaymentReconciliationInput,
): string[] {
  if (input.receiptIds !== undefined) {
    const unique = new Set<string>()
    for (const value of input.receiptIds) {
      const base = baseReceiptId(value)
      if (base) unique.add(base)
    }
    return [...unique].slice(0, 100)
  }

  const oldestByReceipt = new Map<string, string>()
  for (const snapshot of snapshots) {
    if (snapshot.status !== 'PENDING' || snapshot.etsyOrderId === null) continue
    const base = baseReceiptId(snapshot.etsyOrderId)
    if (!base) continue
    const oldest = oldestByReceipt.get(base)
    if (!oldest || snapshot.updatedAt < oldest) oldestByReceipt.set(base, snapshot.updatedAt)
  }
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  return [...oldestByReceipt.entries()]
    .sort(([leftId, leftDate], [rightId, rightDate]) => leftDate.localeCompare(rightDate) || leftId.localeCompare(rightId))
    .slice(0, limit)
    .map(([receiptId]) => receiptId)
}

function readOnlyRepository(
  snapshots: readonly SaleFeeSnapshot[],
): FeeReconciliationRepository {
  return {
    async listEtsySaleSnapshots() {
      return snapshots.map((snapshot) => ({ ...snapshot }))
    },
    async findStatementImportByChecksum() {
      return null
    },
    async transaction<T>(work: (tx: FeeReconciliationTransaction) => Promise<T>): Promise<T> {
      const tx: FeeReconciliationTransaction = {
        async createStatementImport() {
          return { id: 'payment-preview' }
        },
        async updateSale() {
          // Preview calculations must never persist canonical money.
        },
        async finishStatementImport() {
          // Payment previews do not create statement imports.
        },
      }
      return work(tx)
    },
  }
}

function penceTotal(snapshots: readonly SaleFeeSnapshot[], field: 'etsyFeesPence' | 'netRevenuePence'): number {
  return snapshots.reduce((total, snapshot) => total + snapshot[field], 0)
}

function statusWithoutPayment(snapshots: readonly SaleFeeSnapshot[], manual: boolean): 'PENDING' | 'PAYMENT_SYNCED' | 'MANUAL_REVIEW' | 'STATEMENT_VERIFIED' | null {
  if (snapshots.some((snapshot) => snapshot.status === 'STATEMENT_VERIFIED')) return 'STATEMENT_VERIFIED'
  if (manual) return 'MANUAL_REVIEW'
  if (snapshots.some((snapshot) => snapshot.status === 'MANUAL_REVIEW')) return 'MANUAL_REVIEW'
  if (snapshots.some((snapshot) => snapshot.status === 'PAYMENT_SYNCED')) return 'PAYMENT_SYNCED'
  if (snapshots.length === 0) return null
  return 'PENDING'
}

function noOpChange(
  receiptId: string,
  snapshots: readonly SaleFeeSnapshot[],
  result: NormalizedReceiptPayments,
  message?: string,
): FeeOrderChange {
  if (snapshots.length === 0) {
    return {
      receiptId,
      saleIds: [],
      oldStatus: null,
      newStatus: null,
      attributed: null,
      oldFeesPence: null,
      newFeesPence: null,
      feeDeltaPence: 0,
      oldNetRevenuePence: null,
      newNetRevenuePence: null,
      marginDeltaPence: 0,
      offsiteAdsFeePence: null,
      vatOnOffsiteAdsFeePence: null,
      source: 'ETSY_PAYMENT_API',
      outcome: 'unmatched',
      ...(message ? { message } : {}),
      allocations: [],
    }
  }

  const manual = result.status === 'MANUAL_REVIEW'
  return {
    receiptId,
    saleIds: snapshots.map((snapshot) => snapshot.id),
    oldStatus: snapshots[0]?.status ?? null,
    newStatus: statusWithoutPayment(snapshots, manual),
    attributed: null,
    oldFeesPence: penceTotal(snapshots, 'etsyFeesPence'),
    newFeesPence: penceTotal(snapshots, 'etsyFeesPence'),
    feeDeltaPence: 0,
    oldNetRevenuePence: penceTotal(snapshots, 'netRevenuePence'),
    newNetRevenuePence: penceTotal(snapshots, 'netRevenuePence'),
    marginDeltaPence: 0,
    offsiteAdsFeePence: null,
    vatOnOffsiteAdsFeePence: null,
    source: 'ETSY_PAYMENT_API',
    outcome: manual ? 'manual_review' : 'unchanged',
    ...(message ? { message } : {}),
    allocations: [],
  }
}

function noOpSummary(change: FeeOrderChange, manual: boolean): FeeReconciliationSummary {
  if (change.saleIds.length === 0) {
    return { ...EMPTY_SUMMARY, unmatched: 1 }
  }
  return {
    ...EMPTY_SUMMARY,
    matched: 1,
    changed: 0,
    unchanged: manual ? 0 : change.saleIds.length,
    manualReview: manual ? change.saleIds.length : 0,
    oldFeesPence: change.oldFeesPence ?? 0,
    newFeesPence: change.newFeesPence ?? 0,
    marginDeltaPence: 0,
  }
}

function validEvidence(result: NormalizedReceiptPayments): boolean {
  return result.status === 'PAYMENT_SYNCED' && result.canApplyCanonicalFees
}

interface BatchBuild {
  preview: PaymentReconciliationPreview
  evidenceToApply: NormalizedOrderEvidence[]
  writeFingerprint: string
}

async function buildBatch(
  input: PaymentReconciliationInput,
  deps: PaymentReconciliationDependencies,
): Promise<BatchBuild> {
  const snapshots = await deps.db.listEtsySaleSnapshots()
  const receiptIds = selectReceiptIds(snapshots, input)
  const summary = cloneSummary()
  const changes: FeeOrderChange[] = []
  const failures: PaymentReconciliationFailure[] = []
  const evidence: NormalizedOrderEvidence[] = []
  const previewDb = readOnlyRepository(snapshots)

  for (const receiptId of receiptIds) {
    const grouped = groupSalesByReceipt(receiptId, snapshots)
    let normalized: NormalizedReceiptPayments
    try {
      const payments = await deps.client.getPaymentsForReceipt(receiptIdNumber(receiptId))
      normalized = normalizeReceiptPayments(receiptId, payments)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment API unavailable'
      normalized = normalizeReceiptPayments(receiptId, [])
      normalized = { ...normalized, reason: message }
    }
    evidence.push(normalized.evidence)

    if (validEvidence(normalized)) {
      const result = await reconcileImportedPaymentEvidence(normalized.evidence, previewDb)
      addSummary(summary, result.summary)
      changes.push(...result.changes)
      if (result.changes[0]?.saleIds.length) {
        // Keep only fully validated Payment evidence for the eventual apply.
        evidence[evidence.length - 1] = normalized.evidence
      }
      continue
    }

    const change = noOpChange(receiptId, grouped, normalized, normalized.reason)
    changes.push(change)
    addSummary(summary, noOpSummary(change, normalized.status === 'MANUAL_REVIEW'))
    if (normalized.reason) {
      failures.push({
        receiptId,
        status: normalized.status === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : 'PENDING',
        message: normalized.reason,
      })
    }
  }

  const evidenceToApply = evidence.filter((item) => item.paymentFeesPence !== null && item.paymentGrossPence !== null && item.paymentNetPence !== null)
  return {
    preview: {
      fingerprint: fingerprintReconciliationInput(evidence, snapshots),
      statementChecksum: null,
      receiptIds,
      summary,
      changes,
      canApplyCanonicalFees: process.env.ETSY_PAYMENT_FEES_VALIDATED === 'true',
      failures,
    },
    evidenceToApply,
    writeFingerprint: fingerprintReconciliationInput(evidenceToApply, snapshots),
  }
}

export async function previewPaymentReconciliation(
  input: PaymentReconciliationInput,
  deps: PaymentReconciliationDependencies,
): Promise<PaymentReconciliationPreview> {
  return (await buildBatch(input, deps)).preview
}

export async function applyPaymentReconciliation(
  input: PaymentReconciliationApplyInput,
  deps: PaymentReconciliationDependencies,
): Promise<PaymentReconciliationApplyResult> {
  const built = await buildBatch({ receiptIds: input.receiptIds }, deps)
  if (built.preview.fingerprint !== input.fingerprint) {
    throw new PaymentReconciliationConflictError()
  }

  if (process.env.ETSY_PAYMENT_FEES_VALIDATED !== 'true' || built.evidenceToApply.length === 0) {
    return { ...built.preview, applied: false }
  }

  let appliedResult: PaymentReconciliationResult
  try {
    appliedResult = await reconcileImportedPaymentEvidence(
      built.evidenceToApply,
      deps.db,
      built.writeFingerprint,
    )
  } catch (error) {
    if (error instanceof StatementReconciliationConflictError) {
      throw new PaymentReconciliationConflictError(error.message)
    }
    throw error
  }
  return {
    ...built.preview,
    applied: appliedResult.applied,
  }
}

// Names used by the future HTTP adapter are kept as aliases so callers can
// describe the operation as either a reconciliation or a fee check.
export const previewPaymentFees = previewPaymentReconciliation
export const applyPaymentFees = applyPaymentReconciliation
