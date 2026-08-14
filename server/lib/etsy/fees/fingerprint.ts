import { createHash } from 'node:crypto'
import type { NormalizedOrderEvidence, SaleFeeSnapshot } from './types'

type EvidenceInput =
  | readonly NormalizedOrderEvidence[]
  | ReadonlyMap<string, NormalizedOrderEvidence>

export interface ReconciliationFingerprintContext {
  statementMonth?: string | null
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function evidenceValues(input: EvidenceInput): NormalizedOrderEvidence[] {
  return Array.isArray(input) ? [...input] : [...input.values()]
}

/**
 * Hash the normalized evidence and current sale state used for a reconciliation
 * preview. Sorting means the same logical input has one fingerprint regardless
 * of database or statement row ordering.
 */
export function fingerprintReconciliationInput(
  evidence: EvidenceInput,
  snapshots: readonly SaleFeeSnapshot[],
  context?: ReconciliationFingerprintContext,
): string {
  const normalizedEvidence = evidenceValues(evidence)
    .map((item) => ({
      receiptId: item.receiptId,
      currency: item.currency,
      attributed: item.attributed,
      offsiteAdsFeePence: item.offsiteAdsFeePence,
      vatOnOffsiteAdsFeePence: item.vatOnOffsiteAdsFeePence,
      paymentGrossPence: item.paymentGrossPence,
      paymentFeesPence: item.paymentFeesPence,
      paymentNetPence: item.paymentNetPence,
      source: item.source,
      statement: item.statement === undefined
        ? null
        : {
          offsiteAdsFee: {
            operation: item.statement.offsiteAdsFee.operation,
            absolutePence: item.statement.offsiteAdsFee.absolutePence,
            creditPence: item.statement.offsiteAdsFee.creditPence,
          },
          vatOnOffsiteAdsFee: {
            operation: item.statement.vatOnOffsiteAdsFee.operation,
            absolutePence: item.statement.vatOnOffsiteAdsFee.absolutePence,
            creditPence: item.statement.vatOnOffsiteAdsFee.creditPence,
          },
        },
    }))
    .sort((a, b) => {
      const byReceipt = compareStrings(a.receiptId, b.receiptId)
      if (byReceipt !== 0) return byReceipt
      return compareStrings(JSON.stringify(a), JSON.stringify(b))
    })

  const normalizedSnapshots = [...snapshots]
    .map((snapshot) => ({
      id: snapshot.id,
      etsyOrderId: snapshot.etsyOrderId,
      grossRevenuePence: snapshot.grossRevenuePence,
      etsyFeesPence: snapshot.etsyFeesPence,
      netRevenuePence: snapshot.netRevenuePence,
      marginPence: snapshot.marginPence,
      previousOffsiteAdsFeePence: snapshot.previousOffsiteAdsFeePence,
      previousVatOnOffsiteAdsFeePence: snapshot.previousVatOnOffsiteAdsFeePence,
      etsyPaymentGrossPence: snapshot.etsyPaymentGrossPence ?? null,
      etsyPaymentFeesPence: snapshot.etsyPaymentFeesPence ?? null,
      etsyPaymentNetPence: snapshot.etsyPaymentNetPence ?? null,
      offsiteAdsAttributed: snapshot.offsiteAdsAttributed ?? null,
      etsyFeeReconciliationSource: snapshot.etsyFeeReconciliationSource ?? null,
      etsyStatementImportId: snapshot.etsyStatementImportId ?? null,
      etsyStatementMonth: snapshot.etsyStatementMonth ?? null,
      etsyManualResolutionNote: snapshot.etsyManualResolutionNote ?? null,
      status: snapshot.status,
      updatedAt: snapshot.updatedAt,
    }))
    .sort((a, b) => compareStrings(a.id, b.id))

  const canonical = JSON.stringify({
    statementMonth: context?.statementMonth ?? null,
    evidence: normalizedEvidence,
    snapshots: normalizedSnapshots,
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}
