import { describe, expect, it } from 'vitest'
import type { NormalizedOrderEvidence, SaleFeeSnapshot } from '../../lib/etsy/fees/types'
import { fingerprintReconciliationInput } from '../../lib/etsy/fees/fingerprint'
import { parseEtsyStatement } from '../../lib/etsy/fees/statementParser'

const attributedCsv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.93,35.06
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052 12% of order total,,GBP,0,-4.80,-4.80
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.96,-0.96
31 Jul 2025,Sale,Payment for Order #4137418999,,GBP,20.00,-2.10,17.90`

const saleSnapshot = (overrides: Partial<SaleFeeSnapshot> = {}): SaleFeeSnapshot => ({
  id: 'sale-1',
  etsyOrderId: '4137418052',
  grossRevenuePence: 3999,
  etsyFeesPence: 493,
  netRevenuePence: 3506,
  marginPence: 2000,
  previousOffsiteAdsFeePence: null,
  previousVatOnOffsiteAdsFeePence: null,
  status: 'PENDING',
  updatedAt: '2025-07-31T12:00:00.000Z',
  ...overrides,
})

describe('Etsy statement parser', () => {
  it('parses attributed and covered non-attributed orders into GBP evidence', () => {
    const result = parseEtsyStatement({ csv: attributedCsv, statementMonth: '2025-07' })

    expect(result.currency).toBe('GBP')
    expect(result.coveredReceiptIds).toEqual(['4137418052', '4137418999'])
    expect(result.evidenceByReceipt.get('4137418052')).toMatchObject({
      receiptId: '4137418052',
      attributed: true,
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: 96,
      paymentGrossPence: null,
      paymentFeesPence: null,
      paymentNetPence: null,
      source: 'ETSY_STATEMENT',
    })
    expect(result.evidenceByReceipt.get('4137418999')).toMatchObject({
      receiptId: '4137418999',
      attributed: false,
      offsiteAdsFeePence: 0,
      vatOnOffsiteAdsFeePence: 0,
    })
  })

  it('leaves an absent order unknown instead of inventing a false attribution', () => {
    const result = parseEtsyStatement({ csv: attributedCsv, statementMonth: '2025-07' })

    expect(result.evidenceByReceipt.has('4137418000')).toBe(false)
    expect(result.coveredReceiptIds).not.toContain('4137418000')
  })

  it('uses the same checksum for LF and CRLF input', () => {
    const lf = parseEtsyStatement({ csv: attributedCsv, statementMonth: '2025-07' })
    const crlf = parseEtsyStatement({ csv: attributedCsv.replaceAll('\n', '\r\n'), statementMonth: '2025-07' })

    expect(crlf.checksum).toBe(lf.checksum)
    expect(crlf.statementChecksum).toBe(lf.statementChecksum)
  })

  it('parses quoted commas in the description and info fields', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,"Payment for Order #4137418123, customer note",,"GBP",39.99,-4.00,35.99`

    const result = parseEtsyStatement({ csv, statementMonth: '2025-07' })

    expect(result.coveredReceiptIds).toEqual(['4137418123'])
    expect(result.evidenceByReceipt.get('4137418123')).toMatchObject({ attributed: false })
  })

  it('accepts an Offsite fee when no VAT row is present', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,-4.80,-4.80`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418123')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: 0,
    })
  })

  it('covers an attributed Offsite order even when the statement has no Sale row', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,-4.80,-4.80
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418123,,GBP,0,-0.96,-0.96`

    const result = parseEtsyStatement({ csv, statementMonth: '2025-07' })

    expect(result.coveredReceiptIds).toEqual(['4137418123'])
    expect(result.evidenceByReceipt.get('4137418123')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: 96,
    })
  })

  it('rejects VAT evidence when no Offsite fee exists for that order', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,39.99,-4.00,35.99
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418123,,GBP,0,-0.96,-0.96`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/VAT.*fee|fee.*VAT/i)
  })

  it('rejects VAT-only evidence without an Offsite fee even when no Sale row exists', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418123,,GBP,0,-0.96,-0.96`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/VAT.*fee|fee.*VAT/i)
  })

  it('rejects statements missing a required column', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,39.99,35.99`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/fees.*taxes/i)
  })

  it('rejects an invalid statement month', () => {
    expect(() => parseEtsyStatement({ csv: attributedCsv, statementMonth: '2025-13' })).toThrow(/statement month/i)
    expect(() => parseEtsyStatement({ csv: attributedCsv, statementMonth: 'July 2025' })).toThrow(/statement month/i)
  })

  it('rejects mixed currencies', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,39.99,-4.00,35.99
31 Jul 2025,Sale,Payment for Order #4137418124,,USD,39.99,-4.00,35.99`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/GBP|currenc/i)
  })

  it('rejects an unparseable amount', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,not-a-number,-4.00,35.99`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/amount|finite|number/i)
  })

  it.each(['-4.805', '0.009'])('rejects statement amounts with more than two decimal places (%s)', (amount) => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,${amount},-4.00,35.99`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/decimal|fraction|number/i)
  })

  it('rejects an Offsite row without an order ID', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads,,GBP,0,-4.80,-4.80`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/order/i)
  })

  it('rejects conflicting duplicate Offsite rows', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,-4.80,-4.80
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,-4.70,-4.70`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/conflict|duplicate/i)
  })

  it('does not treat refund or adjustment rows as proof of no Offsite attribution', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Refund,Refund for Order #4137418123,,GBP,-39.99,4.00,-35.99
31 Jul 2025,Adjustment,Adjustment for Order #4137418124,,GBP,0,0,0`

    const result = parseEtsyStatement({ csv, statementMonth: '2025-07' })

    expect(result.coveredReceiptIds).toEqual([])
    expect(result.evidenceByReceipt.get('4137418123')).toBeUndefined()
    expect(result.evidenceByReceipt.get('4137418124')).toBeUndefined()
  })

  it('requires a Sale or payment-for-order row to establish coverage', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Adjustment,Adjustment for Order #4137418123,,GBP,0,0,0
31 Jul 2025,,Payment for Order #4137418124,,GBP,39.99,-4.00,35.99`

    const result = parseEtsyStatement({ csv, statementMonth: '2025-07' })

    expect(result.coveredReceiptIds).toEqual(['4137418124'])
    expect(result.evidenceByReceipt.get('4137418124')).toMatchObject({ attributed: false })
    expect(result.evidenceByReceipt.get('4137418123')).toBeUndefined()
  })

  it('rejects zero Offsite fees with positive VAT regardless of row order', () => {
    const sale = '31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,39.99,-4.00,35.99'
    const fee = '31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,0,0'
    const vat = '31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418123,,GBP,0,-0.96,-0.96'

    for (const rows of [[sale, fee, vat], [sale, vat, fee]]) {
      const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net\n${rows.join('\n')}`
      expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/VAT.*fee|fee.*VAT/i)
    }
  })

  it('rejects an Offsite charge row with blank money cells', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,,,`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/amount|fees|money|blank/i)
  })
})

describe('Etsy reconciliation input fingerprint', () => {
  const evidence: NormalizedOrderEvidence[] = [
    {
      receiptId: '4137418999',
      currency: 'GBP',
      attributed: false,
      offsiteAdsFeePence: 0,
      vatOnOffsiteAdsFeePence: 0,
      paymentGrossPence: null,
      paymentFeesPence: null,
      paymentNetPence: null,
      source: 'ETSY_STATEMENT',
    },
    {
      receiptId: '4137418052',
      currency: 'GBP',
      attributed: true,
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: 96,
      paymentGrossPence: null,
      paymentFeesPence: null,
      paymentNetPence: null,
      source: 'ETSY_STATEMENT',
    },
  ]

  it('is deterministic when evidence and sale snapshots arrive in different orders', () => {
    const snapshots = [
      saleSnapshot({ id: 'sale-2', etsyOrderId: '4137418999', grossRevenuePence: 2000 }),
      saleSnapshot(),
    ]

    expect(fingerprintReconciliationInput(evidence, snapshots)).toBe(
      fingerprintReconciliationInput([...evidence].reverse(), [...snapshots].reverse()),
    )
  })

  it('changes when current sale financial or reconciliation state changes', () => {
    const base = fingerprintReconciliationInput(evidence, [saleSnapshot()])
    const changed = fingerprintReconciliationInput(evidence, [saleSnapshot({ marginPence: 1999 })])
    const changedOffsite = fingerprintReconciliationInput(evidence, [saleSnapshot({ previousOffsiteAdsFeePence: 480 })])

    expect(changed).not.toBe(base)
    expect(changedOffsite).not.toBe(base)
  })
})
