import { describe, expect, it } from 'vitest'
import type { NormalizedOrderEvidence, SaleFeeSnapshot } from '../../lib/etsy/fees/types'
import { fingerprintReconciliationInput } from '../../lib/etsy/fees/fingerprint'
import { parseEtsyStatement } from '../../lib/etsy/fees/statementParser'

const attributedCsv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.93,35.06
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052 12% of order total,,GBP,0,-4.80,-4.80
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.96,-0.96
31 Jul 2025,Sale,Payment for Order #4137418999,,GBP,20.00,-2.10,17.90`

const realEtsyCsv = `\uFEFFDate,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details
"31 July, 2026",Sale,Payment for Order #4137418052,,GBP,£29.99,-£1.44,£28.55,--
"31 July, 2026",Marketing,Fee for sale made through Offsite Ads,Order #4137418052,GBP,--,-£4.80,-£4.80,--
"31 July, 2026",VAT,VAT: Offsite Ads fee,Order #4137418052,GBP,--,-£0.96,-£0.96,--`

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
  it('parses a genuine Etsy monthly export with Title, pound values, and -- cells', () => {
    const result = parseEtsyStatement({ csv: realEtsyCsv, statementMonth: '2026-07' })

    expect(result.coveredReceiptIds).toEqual(['4137418052'])
    expect(result.evidenceByReceipt.get('4137418052')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: 96,
    })
  })

  it('accepts the genuine VAT credit order label used by the March export', () => {
    const csv = `Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details
31 March 2023,Marketing,Fee for sale made through Offsite Ads,Order #2842479918,GBP,--,-£3.84,-£3.84,--
31 March 2023,VAT,VAT: Offsite Ads fee,Order #2842479918,GBP,--,-£0.77,-£0.77,--
31 March 2023,Marketing,Credit for Offsite Ads fee,Order #2842479918,GBP,--,£3.84,£3.84,--
31 March 2023,VAT,VAT: Offsite Ads fee credit,order: 2842479918,GBP,--,£0.77,£0.77,--`

    expect(parseEtsyStatement({ csv, statementMonth: '2023-03' }).evidenceByReceipt.get('2842479918')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 0,
      vatOnOffsiteAdsFeePence: 0,
    })
  })

  it('rejects pound-prefixed values with fractional pennies', () => {
    expect(() => parseEtsyStatement({
      statementMonth: '2026-07',
      csv: realEtsyCsv.replace('-£4.80', '-£4.805'),
    })).toThrow(/at most two decimal places/i)
  })

  it('rejects a positive pound-prefixed Offsite value as a credit or reversal', () => {
    expect(() => parseEtsyStatement({
      statementMonth: '2026-07',
      csv: realEtsyCsv.replace('-£4.80', '+£4.80'),
    })).toThrow(/credit or reversal/i)
  })

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

  it('parses a quoted grouped-comma money value exactly', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,"-1,234.50","-1,234.50"`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418123')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 123450,
    })
  })

  it('rejects malformed thousands grouping in a money value', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,"12,34.50","12,34.50"`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/decimal|number/i)
  })

  it('accepts the exact safe integer pence maximum', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,"-90071992547409.91","-90071992547409.91"`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418123')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: Number.MAX_SAFE_INTEGER,
    })
  })

  it('rejects one penny above the safe integer pence maximum', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,"-90071992547409.92","-90071992547409.92"`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/safe integer|range/i)
  })

  it('accepts an Offsite fee when no VAT row is present', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418123,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418123,,GBP,0,-4.80,-4.80`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418123')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: null,
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

  it('rejects an embedded PreOrder label as a missing order ID', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads PreOrder: 2842479918,,GBP,0,-4.80,-4.80`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' }))
      .toThrow(/missing an order ID/i)
  })

  it.each(['Pre-Order: 2842479918', 'Pre Order: 2842479918'])(
    'rejects a prefixed order label as a missing order ID (%s)',
    (label) => {
      const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads ${label},,GBP,0,-4.80,-4.80`

      expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' }))
        .toThrow(/missing an order ID/i)
    },
  )

  it('rejects an order label with a continued numeric token', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #2842479918continued,,GBP,0,-4.80,-4.80`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' }))
      .toThrow(/missing an order ID/i)
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

  it('rejects an Offsite Ads fee reversal instead of reading it as another charge', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-4.80,-4.80
31 Jul 2025,Refund,Refund of Offsite Ads fee Order #4137418052,,GBP,0,4.80,4.80`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' }))
      .toThrow(/credit or reversal/i)
  })

  it('nets full explicit Offsite fee and VAT credits to zero while preserving attribution', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.93,35.06
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-3.84,-3.84
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,3.84,3.84
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.77,-0.77
31 Jul 2025,Tax,Credit for VAT on Offsite Ads fee Order #4137418052,,GBP,0,0.77,0.77`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418052')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 0,
      vatOnOffsiteAdsFeePence: 0,
    })
  })

  it('nets partial explicit Offsite fee and VAT credits', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.93,35.06
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-3.84,-3.84
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,1.00,1.00
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.77,-0.77
31 Jul 2025,Tax,Credit for VAT on Offsite Ads fee Order #4137418052,,GBP,0,0.20,0.20`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418052')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 284,
      vatOnOffsiteAdsFeePence: 57,
    })
  })

  it('accumulates distinct partial Offsite fee and VAT credits', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-3.84,-3.84
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,1.00,1.00
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,0.50,0.50
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.77,-0.77
31 Jul 2025,Tax,Credit for VAT on Offsite Ads fee Order #4137418052,,GBP,0,0.20,0.20
31 Jul 2025,Tax,Credit for VAT on Offsite Ads fee Order #4137418052,,GBP,0,0.10,0.10`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418052')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 234,
      vatOnOffsiteAdsFeePence: 47,
    })
  })

  it('treats an identical repeated credit row as idempotent', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-3.84,-3.84
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,1.00,1.00
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,1.00,1.00`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418052')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 284,
    })
  })

  it('accumulates same-value credits from distinct statement rows', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
30 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-3.84,-3.84
30 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,1.00,1.00
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,1.00,1.00`

    expect(parseEtsyStatement({ csv, statementMonth: '2025-07' }).evidenceByReceipt.get('4137418052')).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 184,
    })
  })

  it('rejects distinct partial credits whose combined value exceeds the charge', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-3.84,-3.84
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,3.00,3.00
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,1.00,1.00`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' }))
      .toThrow(/greater than its charge/i)
  })

  it('preserves a fee and VAT credit-only receipt as component adjustments', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
2 Dec 2023,Marketing,Credit for Offsite Ads fee,Order #3102744549,GBP,0,1.53,1.53
2 Dec 2023,Tax,Credit for VAT on Offsite Ads fee,Order #3102744549,GBP,0,0.31,0.31`

    const evidence = parseEtsyStatement({ csv, statementMonth: '2023-12' })
      .evidenceByReceipt.get('3102744549')

    expect(evidence).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: null,
      vatOnOffsiteAdsFeePence: null,
      statement: {
        offsiteAdsFee: { operation: 'credit_adjustment', absolutePence: null, creditPence: 153 },
        vatOnOffsiteAdsFee: { operation: 'credit_adjustment', absolutePence: null, creditPence: 31 },
      },
    })
  })

  it('rejects an explicit Offsite credit greater than its charge', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.93,35.06
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-3.84,-3.84
31 Jul 2025,Marketing,Credit for Offsite Ads fee Order #4137418052,,GBP,0,4.00,4.00`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/credit.*charge|charge.*credit|greater|exceed/i)
  })

  it('keeps a VAT-only credit receipt covered', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
2 Dec 2023,Tax,Credit for VAT on Offsite Ads fee,Order #3102744549,GBP,0,0.31,0.31`

    const result = parseEtsyStatement({ csv, statementMonth: '2023-12' })
    expect(result.coveredReceiptIds).toEqual(['3102744549'])
    expect(result.evidenceByReceipt.get('3102744549')?.statement).toMatchObject({
      offsiteAdsFee: { operation: 'none', creditPence: 0 },
      vatOnOffsiteAdsFee: { operation: 'credit_adjustment', creditPence: 31 },
    })
  })

  it('preserves mixed fee charge and VAT adjustment evidence for manual routing', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
2 Dec 2023,Marketing,Fee for sale through Offsite Ads,Order #3102744549,GBP,0,-7.23,-7.23
2 Dec 2023,Tax,Credit for VAT on Offsite Ads fee,Order #3102744549,GBP,0,0.31,0.31`

    expect(parseEtsyStatement({ csv, statementMonth: '2023-12' })
      .evidenceByReceipt.get('3102744549')?.statement).toMatchObject({
      offsiteAdsFee: { operation: 'absolute', absolutePence: 723, creditPence: 0 },
      vatOnOffsiteAdsFee: { operation: 'credit_adjustment', absolutePence: null, creditPence: 31 },
    })
  })

  it('rejects positive remaining VAT without a matching Offsite fee charge', () => {
    const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.93,35.06
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.77,-0.77`

    expect(() => parseEtsyStatement({ csv, statementMonth: '2025-07' })).toThrow(/VAT.*fee|fee.*VAT/i)
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
    const changedSource = fingerprintReconciliationInput(evidence, [saleSnapshot({
      etsyFeeReconciliationSource: 'ETSY_STATEMENT',
    })])

    expect(changed).not.toBe(base)
    expect(changedOffsite).not.toBe(base)
    expect(changedSource).not.toBe(base)
  })

  it('changes when the uploaded statement month changes', () => {
    const snapshots = [saleSnapshot()]

    expect(fingerprintReconciliationInput(evidence, snapshots, { statementMonth: '2023-12' }))
      .not.toBe(fingerprintReconciliationInput(evidence, snapshots, { statementMonth: '2023-11' }))
  })

  it('changes when a snapshot has different prior statement provenance', () => {
    expect(fingerprintReconciliationInput(evidence, [saleSnapshot({
      etsyStatementImportId: 'november-import',
      etsyStatementMonth: '2023-11',
      etsyFeeReconciliationSource: 'ETSY_STATEMENT',
    })], { statementMonth: '2023-12' })).not.toBe(
      fingerprintReconciliationInput(evidence, [saleSnapshot({
        etsyStatementImportId: 'october-import',
        etsyStatementMonth: '2023-10',
        etsyFeeReconciliationSource: 'ETSY_STATEMENT',
      })], { statementMonth: '2023-12' }),
    )
  })

  it('changes when component-level statement evidence changes', () => {
    const statementEvidence: NormalizedOrderEvidence[] = [{
      ...evidence[1]!,
      statement: {
        offsiteAdsFee: { operation: 'credit_adjustment', absolutePence: null, creditPence: 480 },
        vatOnOffsiteAdsFee: { operation: 'none', absolutePence: null, creditPence: 0 },
      },
    }]
    const changedStatementEvidence: NormalizedOrderEvidence[] = [{
      ...statementEvidence[0]!,
      statement: {
        offsiteAdsFee: { operation: 'credit_adjustment', absolutePence: null, creditPence: 479 },
        vatOnOffsiteAdsFee: { operation: 'none', absolutePence: null, creditPence: 0 },
      },
    }]

    expect(fingerprintReconciliationInput(statementEvidence, [saleSnapshot()], { statementMonth: '2023-12' }))
      .not.toBe(fingerprintReconciliationInput(changedStatementEvidence, [saleSnapshot()], { statementMonth: '2023-12' }))
  })
})
