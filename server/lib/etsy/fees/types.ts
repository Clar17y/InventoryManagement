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
  status: EtsyFeeReconciliationStatus
  updatedAt: string
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
