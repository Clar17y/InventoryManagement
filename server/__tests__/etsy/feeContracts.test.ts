import { describe, expect, it } from 'vitest'
import { etsyFeeReconciliationStatusSchema } from '#contracts/domain/etsyFees'
import { saleSchema } from '#contracts/domain/sale'

const completeSaleFixture = {
  id: 'clx0q2p1w0000s1l1n4m9n9n9',
  saleDate: '2025-07-31T12:00:00.000Z',
  saleChannel: 'etsy',
  etsyOrderId: '4137418052',
  grossRevenue: '39.99',
  postageCharged: '0.00',
  postageCost: '0.00',
  etsyFees: '4.00',
  transactionFee: '2.60',
  postageTransactionFee: '0.00',
  regulatoryFee: '0.13',
  processingFee: '1.02',
  vatOnProcessingFee: '0.20',
  listingFee: '0.05',
  packagingOverhead: '0.00',
  netRevenue: '35.99',
  totalCost: '20.00',
  margin: '15.99',
  notes: null,
  isHistorical: false,
  createdAt: '2025-07-31T12:00:00.000Z',
  updatedAt: '2025-07-31T12:00:00.000Z',
  lines: [],
}

describe('Etsy fee reconciliation contracts', () => {
  it('distinguishes unknown Offsite attribution from verified zero', () => {
    expect(etsyFeeReconciliationStatusSchema.parse('PENDING')).toBe('PENDING')
    const parsed = saleSchema.parse({
      ...completeSaleFixture,
      offsiteAdsAttributed: null,
      offsiteAdsFee: null,
      vatOnOffsiteAdsFee: null,
      etsyPaymentGross: null,
      etsyPaymentFees: null,
      etsyPaymentNet: null,
      etsyFeeReconciliationStatus: 'PENDING',
      etsyFeeReconciliationSource: null,
      etsyManualResolutionNote: null,
      etsyFeeReconciledAt: null,
      etsyStatementImportId: null,
    })
    expect(parsed.offsiteAdsFee).toBeNull()
  })
})
