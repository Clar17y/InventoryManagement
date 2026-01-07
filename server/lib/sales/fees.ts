type FeeConfig = {
  transactionFee: unknown
  regulatoryFee: unknown
  paymentFeePercent: unknown
  paymentFeeFixed: unknown
  vatRate: unknown
  listingFee: unknown
}

export type SaleChannel = 'etsy' | 'direct' | 'fair'

export interface EtsyFeesBreakdown {
  transactionFee: number
  postageTransactionFee: number
  regulatoryFee: number
  processingFee: number
  vatOnProcessingFee: number
  listingFee: number
  etsyFees: number
}

export function calculateEtsyFees(params: {
  grossRevenue: number
  postageCharged: number
  saleChannel: SaleChannel
  feeConfig: FeeConfig | null
}): EtsyFeesBreakdown {
  if (params.saleChannel !== 'etsy' || !params.feeConfig) {
    return {
      transactionFee: 0,
      postageTransactionFee: 0,
      regulatoryFee: 0,
      processingFee: 0,
      vatOnProcessingFee: 0,
      listingFee: 0,
      etsyFees: 0,
    }
  }

  const total = params.grossRevenue + params.postageCharged
  const transactionFee = params.grossRevenue * Number(params.feeConfig.transactionFee)
  const postageTransactionFee = params.postageCharged * Number(params.feeConfig.transactionFee)
  const regulatoryFee = total * Number(params.feeConfig.regulatoryFee)
  const processingFee = total * Number(params.feeConfig.paymentFeePercent) + Number(params.feeConfig.paymentFeeFixed)
  const vatOnProcessingFee = processingFee * Number(params.feeConfig.vatRate)
  const listingFee = Number(params.feeConfig.listingFee)
  const etsyFees = transactionFee + postageTransactionFee + regulatoryFee + processingFee + vatOnProcessingFee + listingFee

  return {
    transactionFee,
    postageTransactionFee,
    regulatoryFee,
    processingFee,
    vatOnProcessingFee,
    listingFee,
    etsyFees,
  }
}

export function calculatePackagingOverhead(overheads: Array<{ costPerOrder: unknown }>): number {
  return overheads.reduce((sum, o) => sum + Number(o.costPerOrder), 0)
}

