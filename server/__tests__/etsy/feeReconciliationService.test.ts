import { describe, expect, it } from 'vitest'
import {
  applyStatementReconciliation,
  previewStatementReconciliation,
  reconcileImportedPaymentEvidence,
  StatementReconciliationConflictError,
} from '../../lib/etsy/fees/reconciliationService'
import type { NormalizedOrderEvidence } from '../../lib/etsy/fees/types'
import {
  attributedCsv,
  createFeeDbFixture,
  sale,
} from './feeTestHelpers'

const noOffsiteCsv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.00,35.99`

const changedOffsiteCsv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,-4.00,-4.00
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.80,-0.80`

function input(csv: string, allowStatementRevision = false) {
  return {
    csv,
    statementMonth: '2025-07',
    fileName: 'etsy-statement-2025-07.csv',
    ...(allowStatementRevision ? { allowStatementRevision: true } : {}),
  }
}

describe('Etsy statement reconciliation service', () => {
  it('previews a statement without writing and shows exact profit deltas', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 400,
        netRevenuePence: 3600,
        marginPence: 2200,
      })],
    })

    const preview = await previewStatementReconciliation(input(attributedCsv), db)

    expect(preview.changes[0]).toMatchObject({
      receiptId: '4137418052',
      oldFeesPence: 400,
      newFeesPence: 976,
      marginDeltaPence: -576,
    })
    expect(db.writeCount).toBe(0)
  })

  it('verifies a covered order with no Offsite Ads as an exact zero', async () => {
    const db = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    })

    const preview = await previewStatementReconciliation(input(noOffsiteCsv), db)

    expect(preview.changes[0]).toMatchObject({
      attributed: false,
      offsiteAdsFeePence: 0,
      vatOnOffsiteAdsFeePence: 0,
      newFeesPence: 400,
      newStatus: 'STATEMENT_VERIFIED',
    })
    expect(preview.summary).toMatchObject({ matched: 1, notAttributed: 1, attributed: 0 })
    expect(db.writeCount).toBe(0)
  })

  it('retains a validated Payment aggregate without double-counting statement itemization', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 976,
        netRevenuePence: 3023,
        marginPence: 1623,
        status: 'PAYMENT_SYNCED',
        etsyPaymentGrossPence: 3999,
        etsyPaymentFeesPence: 976,
        etsyPaymentNetPence: 3023,
      })],
    })

    const preview = await previewStatementReconciliation(input(attributedCsv), db)

    expect(preview.changes[0]).toMatchObject({
      oldFeesPence: 976,
      newFeesPence: 976,
      feeDeltaPence: 0,
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: 96,
      newStatus: 'STATEMENT_VERIFIED',
    })
  })

  it('replaces previously stored Offsite values before applying a statement delta', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 976,
        netRevenuePence: 3023,
        marginPence: 1623,
        previousOffsiteAdsFeePence: 480,
        previousVatOnOffsiteAdsFeePence: 96,
        status: 'STATEMENT_VERIFIED',
      })],
    })

    const preview = await previewStatementReconciliation(input(changedOffsiteCsv, true), db)

    expect(preview.changes[0]).toMatchObject({
      oldFeesPence: 976,
      newFeesPence: 880,
      feeDeltaPence: -96,
      marginDeltaPence: 96,
      offsiteAdsFeePence: 400,
      vatOnOffsiteAdsFeePence: 80,
    })
  })

  it('accepts a one-penny contradiction against a Payment aggregate', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 976,
        netRevenuePence: 3023,
        marginPence: 1623,
        previousOffsiteAdsFeePence: 480,
        previousVatOnOffsiteAdsFeePence: 96,
        status: 'PAYMENT_SYNCED',
        etsyPaymentGrossPence: 3999,
        etsyPaymentFeesPence: 975,
        etsyPaymentNetPence: 3024,
      })],
    })

    const preview = await previewStatementReconciliation(input(attributedCsv), db)

    expect(preview.changes[0]).toMatchObject({
      oldFeesPence: 976,
      newFeesPence: 975,
      feeDeltaPence: -1,
      marginDeltaPence: 1,
      newStatus: 'STATEMENT_VERIFIED',
    })
    expect(preview.summary.manualReview).toBe(0)
  })

  it('marks a two-penny contradiction for manual review without changing money', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 976,
        netRevenuePence: 3023,
        marginPence: 1623,
        previousOffsiteAdsFeePence: 480,
        previousVatOnOffsiteAdsFeePence: 96,
        status: 'PAYMENT_SYNCED',
        etsyPaymentGrossPence: 3999,
        etsyPaymentFeesPence: 974,
        etsyPaymentNetPence: 3025,
      })],
    })

    const preview = await previewStatementReconciliation(input(attributedCsv), db)

    expect(preview.changes[0]).toMatchObject({
      oldFeesPence: 976,
      newFeesPence: 976,
      feeDeltaPence: 0,
      marginDeltaPence: 0,
      newStatus: 'MANUAL_REVIEW',
      outcome: 'manual_review',
    })
    expect(preview.summary.manualReview).toBe(1)
  })

  it('allocates statement Offsite fees and VAT across numeric historical suffixes', async () => {
    const db = createFeeDbFixture({
      sales: [
        sale({ id: 's1', etsyOrderId: '4137418052', grossRevenuePence: 2999 }),
        sale({ id: 's2', etsyOrderId: '4137418052-1', grossRevenuePence: 1000 }),
      ],
    })

    const preview = await previewStatementReconciliation(input(attributedCsv), db)

    expect(preview.changes[0]).toMatchObject({
      receiptId: '4137418052',
      saleIds: ['s1', 's2'],
      offsiteAdsFeePence: 480,
      vatOnOffsiteAdsFeePence: 96,
      newFeesPence: 1376,
    })
    expect(preview.changes[0]?.allocations).toEqual([
      expect.objectContaining({ saleId: 's1', offsiteAdsFeePence: 360, vatOnOffsiteAdsFeePence: 72 }),
      expect.objectContaining({ saleId: 's2', offsiteAdsFeePence: 120, vatOnOffsiteAdsFeePence: 24 }),
    ])
  })

  it('reports statement order IDs that do not match local sales', async () => {
    const db = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418999' })],
    })
    const unmatchedCsv = attributedCsv.replaceAll('4137418052', '4137418000')

    const preview = await previewStatementReconciliation(input(unmatchedCsv), db)

    expect(preview.changes[0]).toMatchObject({
      receiptId: '4137418000',
      saleIds: [],
      outcome: 'unmatched',
    })
    expect(preview.summary).toMatchObject({ matched: 0, unmatched: 1 })
    expect(db.writeCount).toBe(0)
  })

  it('leaves local rows without Etsy receipt IDs unmatched and pending', async () => {
    const db = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: null })],
    })

    const preview = await previewStatementReconciliation(input(attributedCsv), db)

    expect(preview.summary.unmatched).toBe(1)
    expect(preview.changes[0]?.saleIds).toEqual([])
    expect(db.writeCount).toBe(0)
  })

  it('returns a same-checksum apply as a no-op', async () => {
    const db = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    })
    const statement = input(attributedCsv)
    const preview = await previewStatementReconciliation(statement, db)
    const first = await applyStatementReconciliation({ ...statement, fingerprint: preview.fingerprint }, db)
    const writesAfterFirstApply = db.writeCount

    const duplicate = await applyStatementReconciliation({ ...statement, fingerprint: preview.fingerprint }, db)

    expect(first).toMatchObject({ applied: true, duplicate: false })
    expect(duplicate).toMatchObject({
      applied: false,
      duplicate: true,
      statementImportId: first.statementImportId,
      summary: first.summary,
    })
    expect(db.writeCount).toBe(writesAfterFirstApply)
  })

  it('rejects an apply when the current sale state makes the preview stale', async () => {
    const db = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    })
    const statement = input(attributedCsv)
    const preview = await previewStatementReconciliation(statement, db)
    db.sales[0]!.marginPence += 1

    await expect(applyStatementReconciliation({ ...statement, fingerprint: preview.fingerprint }, db))
      .rejects.toBeInstanceOf(StatementReconciliationConflictError)
    expect(db.writeCount).toBe(0)
  })

  it('requires explicit permission before revising statement-verified evidence', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        status: 'STATEMENT_VERIFIED',
        previousOffsiteAdsFeePence: 480,
        previousVatOnOffsiteAdsFeePence: 96,
        etsyFeesPence: 976,
      })],
    })

    await expect(previewStatementReconciliation(input(changedOffsiteCsv), db))
      .rejects.toBeInstanceOf(StatementReconciliationConflictError)
    expect(db.writeCount).toBe(0)
  })

  it('reconciles imported Payment evidence without downgrading a statement-verified sale', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 976,
        netRevenuePence: 3023,
        marginPence: 1623,
        previousOffsiteAdsFeePence: 480,
        previousVatOnOffsiteAdsFeePence: 96,
        status: 'STATEMENT_VERIFIED',
      })],
    })
    const evidence: NormalizedOrderEvidence = {
      receiptId: '4137418052',
      currency: 'GBP',
      attributed: null,
      offsiteAdsFeePence: null,
      vatOnOffsiteAdsFeePence: null,
      paymentGrossPence: 3999,
      paymentFeesPence: 976,
      paymentNetPence: 3023,
      source: 'ETSY_PAYMENT_API',
    }

    const result = await reconcileImportedPaymentEvidence(evidence, db)

    expect(result.changes[0]).toMatchObject({
      receiptId: '4137418052',
      outcome: 'unchanged',
      newStatus: 'STATEMENT_VERIFIED',
    })
    expect(db.writeCount).toBe(0)
  })
})
