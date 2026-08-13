import type {
  EtsyFeeReconciliationSource,
  EtsyFeeReconciliationStatus,
} from '#contracts/domain/etsyFees'

/** A persisted Etsy sale represented entirely in integer pence. */
export interface SaleFeeSnapshot {
  id: string
  etsyOrderId: string | null
  grossRevenuePence: number
  etsyFeesPence: number
  netRevenuePence: number
  marginPence: number
  previousOffsiteAdsFeePence: number | null
  previousVatOnOffsiteAdsFeePence: number | null
  /** Payment API aggregate fields are absent on pre-Payment snapshots. */
  etsyPaymentGrossPence?: number | null
  etsyPaymentFeesPence?: number | null
  etsyPaymentNetPence?: number | null
  /** Persisted attribution flag, omitted by older in-memory snapshots. */
  offsiteAdsAttributed?: boolean | null
  /** Persisted evidence source, omitted by older in-memory snapshots. */
  etsyFeeReconciliationSource?: EtsyFeeReconciliationSource | null
  /** Persisted statement provenance, omitted by older in-memory snapshots. */
  etsyStatementImportId?: string | null
  /** Normalized statement month for the persisted statement provenance. */
  etsyStatementMonth?: string | null
  status: EtsyFeeReconciliationStatus
  updatedAt: string
}

export type StatementComponentOperation = 'absolute' | 'credit_adjustment' | 'none'

export interface StatementComponentEvidence {
  operation: StatementComponentOperation
  /** Netted value for absolute evidence; null for adjustments/absence. */
  absolutePence: number | null
  /** Positive total of exact, deduplicated statement credit rows. */
  creditPence: number
}

export interface StatementAdjustmentEvidence {
  offsiteAdsFee: StatementComponentEvidence
  vatOnOffsiteAdsFee: StatementComponentEvidence
}

/** Normalized evidence from an Etsy statement or Payment API response. */
export interface NormalizedOrderEvidence {
  receiptId: string
  currency: 'GBP'
  attributed: boolean | null
  offsiteAdsFeePence: number | null
  vatOnOffsiteAdsFeePence: number | null
  paymentGrossPence: number | null
  paymentFeesPence: number | null
  paymentNetPence: number | null
  source: EtsyFeeReconciliationSource
  /** Present only for component-level evidence parsed from an Etsy statement. */
  statement?: StatementAdjustmentEvidence
}

/** Proposed persisted values for a sale after fee reconciliation. */
export interface SaleFeeProposal {
  saleId: string
  feeDeltaPence: number
  etsyFeesPence: number
  netRevenuePence: number
  marginPence: number
  offsiteAdsAttributed: boolean | null
  offsiteAdsFeePence: number | null
  vatOnOffsiteAdsFeePence: number | null
  etsyPaymentGrossPence: number | null
  etsyPaymentFeesPence: number | null
  etsyPaymentNetPence: number | null
  status: EtsyFeeReconciliationStatus
  source: EtsyFeeReconciliationSource
}
