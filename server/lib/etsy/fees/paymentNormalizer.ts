import type { EtsyPayment, EtsyMoney } from '../types'
import type { NormalizedOrderEvidence } from './types'

export type PaymentNormalizationStatus = 'PENDING' | 'PAYMENT_SYNCED' | 'MANUAL_REVIEW'

export interface NormalizedReceiptPayments {
  receiptId: string
  evidence: NormalizedOrderEvidence
  status: PaymentNormalizationStatus
  canApplyCanonicalFees: boolean
  paymentCount: number
  reason?: string
}

const PAYMENT_SOURCE = 'ETSY_PAYMENT_API' as const

export function isPaymentFeeValidationEnabled(): boolean {
  return process.env.ETSY_PAYMENT_FEES_VALIDATED === 'true'
}

function emptyEvidence(receiptId: string): NormalizedOrderEvidence {
  return {
    receiptId,
    currency: 'GBP',
    attributed: null,
    offsiteAdsFeePence: null,
    vatOnOffsiteAdsFeePence: null,
    paymentGrossPence: null,
    paymentFeesPence: null,
    paymentNetPence: null,
    source: PAYMENT_SOURCE,
  }
}

function safeReceiptId(receiptId: string | number): string {
  return String(receiptId)
}

function moneyPence(value: unknown, label: string): number {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${label} is not a money value`)
  }
  const money = value as Partial<EtsyMoney>
  const amount = money.amount
  const divisor = money.divisor
  if (typeof amount !== 'number' || typeof divisor !== 'number'
    || !Number.isSafeInteger(amount) || !Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new TypeError(`${label} has an invalid amount or divisor`)
  }
  const numerator = BigInt(amount) * 100n
  const denominator = BigInt(divisor)
  if (numerator % denominator !== 0n) {
    throw new TypeError(`${label} is not an exact number of pence`)
  }
  const pence = numerator / denominator
  if (pence < BigInt(Number.MIN_SAFE_INTEGER) || pence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the safe integer pence range`)
  }
  return Number(pence)
}

function sumPence(values: readonly number[], label: string): number {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n)
  if (total < BigInt(Number.MIN_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the safe integer pence range`)
  }
  return Number(total)
}

function paymentCurrencies(payment: EtsyPayment): string[] {
  if (typeof payment.currency !== 'string' || payment.currency.length === 0) {
    throw new TypeError('Payment currency is missing')
  }
  const currencies: string[] = [payment.currency]
  const moneyValues = [
    ['gross', payment.amount_gross],
    ['fees', payment.amount_fees],
    ['net', payment.amount_net],
  ] as const
  for (const [label, value] of moneyValues) {
    if (typeof value !== 'object' || value === null || typeof value.currency_code !== 'string' || value.currency_code.length === 0) {
      throw new TypeError(`Payment ${label} currency is missing`)
    }
    currencies.push(value.currency_code)
  }
  return currencies
}

function hasNonZeroAdjustment(payment: EtsyPayment): boolean {
  return [payment.adjusted_gross, payment.adjusted_fees, payment.adjusted_net]
    .some((value) => moneyPence(value, 'adjusted payment value') !== 0)
}

function manualResult(
  receiptId: string,
  paymentCount: number,
  reason: string,
): NormalizedReceiptPayments {
  return {
    receiptId,
    evidence: emptyEvidence(receiptId),
    status: 'MANUAL_REVIEW',
    canApplyCanonicalFees: false,
    paymentCount,
    reason,
  }
}

/** Convert Etsy Payment API aggregates into the shared integer-pence evidence shape. */
export function normalizeReceiptPayments(
  receiptIdInput: string | number,
  payments: readonly EtsyPayment[],
): NormalizedReceiptPayments {
  const receiptId = safeReceiptId(receiptIdInput)
  const canApplyCanonicalFees = isPaymentFeeValidationEnabled()

  if (payments.length === 0) {
    return {
      receiptId,
      evidence: emptyEvidence(receiptId),
      status: 'PENDING',
      canApplyCanonicalFees: false,
      paymentCount: 0,
      reason: 'No Payment record returned',
    }
  }

  const expectedReceiptId = Number(receiptId)
  const currencies = new Set<string>()
  try {
    for (const payment of payments) {
      if (!Number.isSafeInteger(payment.payment_id) || payment.receipt_id !== expectedReceiptId) {
        return manualResult(receiptId, payments.length, 'Payment receipt ID does not match the requested receipt')
      }
      for (const currency of paymentCurrencies(payment)) currencies.add(currency)
      if (hasNonZeroAdjustment(payment)) {
        return manualResult(receiptId, payments.length, 'Payment adjustment values require manual review')
      }
    }
  } catch (error) {
    return manualResult(receiptId, payments.length, error instanceof Error ? error.message : 'Invalid Payment money value')
  }

  if (currencies.size !== 1 || !currencies.has('GBP')) {
    const reason = currencies.size > 1
      ? 'Payment records contain mixed currencies'
      : 'Payment records use an unsupported currency'
    return manualResult(receiptId, payments.length, reason)
  }

  try {
    const gross = payments.map((payment) => moneyPence(payment.amount_gross, 'gross payment value'))
    const fees = payments.map((payment) => moneyPence(payment.amount_fees, 'fee payment value'))
    const net = payments.map((payment) => moneyPence(payment.amount_net, 'net payment value'))
    const grossPence = sumPence(gross, 'Payment gross')
    const feesPence = sumPence(fees, 'Payment fees')
    const netPence = sumPence(net, 'Payment net')
    // Gross less fees must equal net within the documented one-penny rounding
    // tolerance. An aggregate that fails this is not trustworthy evidence, so it
    // never reaches the canonical fee write.
    if (Math.abs(grossPence - feesPence - netPence) > 1) {
      return manualResult(
        receiptId,
        payments.length,
        'Payment gross, fees, and net do not reconcile within one penny',
      )
    }
    const evidence: NormalizedOrderEvidence = {
      receiptId,
      currency: 'GBP',
      attributed: null,
      offsiteAdsFeePence: null,
      vatOnOffsiteAdsFeePence: null,
      paymentGrossPence: grossPence,
      paymentFeesPence: feesPence,
      paymentNetPence: netPence,
      source: PAYMENT_SOURCE,
    }
    return {
      receiptId,
      evidence,
      status: canApplyCanonicalFees ? 'PAYMENT_SYNCED' : 'PENDING',
      canApplyCanonicalFees,
      paymentCount: payments.length,
      ...(canApplyCanonicalFees
        ? {}
        : { reason: 'Payment aggregate validation gate is disabled' }),
    }
  } catch (error) {
    return manualResult(receiptId, payments.length, error instanceof Error ? error.message : 'Invalid Payment money value')
  }
}
