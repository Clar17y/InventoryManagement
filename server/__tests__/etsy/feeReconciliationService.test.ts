import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyStatementReconciliation,
  createPrismaFeeReconciliationRepository,
  previewStatementReconciliation,
  reconcileImportedPaymentEvidence,
  StatementReconciliationConflictError,
} from '../../lib/etsy/fees/reconciliationService'
import type { NormalizedOrderEvidence } from '../../lib/etsy/fees/types'
import type { FeeReconciliationRepository } from '../../lib/etsy/fees/reconciliationService'
import type { PrismaClient } from '@prisma/client'
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

const zeroFeeAttributedCsv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052,,GBP,0,0,0`

function input(csv: string, allowStatementRevision = false) {
  return {
    csv,
    statementMonth: '2025-07',
    fileName: 'etsy-statement-2025-07.csv',
    ...(allowStatementRevision ? { allowStatementRevision: true } : {}),
  }
}

describe('Etsy statement reconciliation service', () => {
  beforeEach(() => {
    delete process.env.ETSY_PAYMENT_FEES_VALIDATED
  })

  afterEach(() => {
    delete process.env.ETSY_PAYMENT_FEES_VALIDATED
  })

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

  it('writes a zero-fee attribution revision for a statement-verified sale', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 400,
        netRevenuePence: 3599,
        marginPence: 2199,
        previousOffsiteAdsFeePence: 0,
        previousVatOnOffsiteAdsFeePence: 0,
        offsiteAdsAttributed: false,
        status: 'STATEMENT_VERIFIED',
      })],
    })
    const statement = input(zeroFeeAttributedCsv, true)

    const preview = await previewStatementReconciliation(statement, db)

    expect(preview.changes[0]).toMatchObject({
      attributed: true,
      offsiteAdsFeePence: 0,
      vatOnOffsiteAdsFeePence: 0,
      outcome: 'changed',
    })
    expect(preview.summary.changed).toBe(1)

    const result = await applyStatementReconciliation({
      ...statement,
      fingerprint: preview.fingerprint,
    }, db)

    expect(result.applied).toBe(true)
    expect(db.sales[0]?.offsiteAdsAttributed).toBe(true)
    expect(db.writeCount).toBe(3)
  })

  it('classifies a persisted reconciliation source change as changed', async () => {
    const snapshot = {
      ...sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 976,
        netRevenuePence: 3023,
        marginPence: 1623,
        previousOffsiteAdsFeePence: 480,
        previousVatOnOffsiteAdsFeePence: 96,
        offsiteAdsAttributed: true,
        status: 'STATEMENT_VERIFIED',
      }),
      etsyFeeReconciliationSource: 'ETSY_PAYMENT_API' as const,
    }
    const db = createFeeDbFixture({ sales: [snapshot] })

    const preview = await previewStatementReconciliation(input(attributedCsv), db)

    expect(preview.changes[0]).toMatchObject({
      source: 'ETSY_STATEMENT',
      outcome: 'changed',
    })
    expect(preview.summary.changed).toBe(1)
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

  it('keeps a verified attribution flag when a contradicting statement is applied', async () => {
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 976,
        netRevenuePence: 3023,
        marginPence: 1623,
        previousOffsiteAdsFeePence: 480,
        previousVatOnOffsiteAdsFeePence: 96,
        offsiteAdsAttributed: true,
        status: 'PAYMENT_SYNCED',
        etsyPaymentGrossPence: 3999,
        etsyPaymentFeesPence: 974,
        etsyPaymentNetPence: 3025,
      })],
    })
    const statement = input(attributedCsv)
    const preview = await previewStatementReconciliation(statement, db)

    await applyStatementReconciliation({ ...statement, fingerprint: preview.fingerprint }, db)

    expect(db.sales[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      offsiteAdsAttributed: true,
      etsyFeesPence: 976,
      previousOffsiteAdsFeePence: 480,
      previousVatOnOffsiteAdsFeePence: 96,
    })
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
    expect(db.imports).toEqual([
      expect.objectContaining({ statementMonth: '2025-07' }),
    ])
    expect(db.sales[0]).toMatchObject({
      etsyStatementImportId: first.statementImportId,
      etsyStatementMonth: '2025-07',
    })
    expect(db.writeCount).toBe(writesAfterFirstApply)
  })

  it('rejects a same-checksum apply submitted for a different month', async () => {
    const db = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    })
    const julyStatement = input(attributedCsv)
    const julyPreview = await previewStatementReconciliation(julyStatement, db)
    await applyStatementReconciliation({ ...julyStatement, fingerprint: julyPreview.fingerprint }, db)
    const writesAfterJulyApply = db.writeCount
    const augustStatement = {
      ...input(attributedCsv),
      statementMonth: '2025-08',
      fileName: 'etsy-statement-2025-08.csv',
      fingerprint: julyPreview.fingerprint,
    }

    const conflictingApply = applyStatementReconciliation(augustStatement, db)

    await expect(conflictingApply).rejects.toBeInstanceOf(StatementReconciliationConflictError)
    await expect(conflictingApply).rejects.toThrow(
      'This statement file was already imported for 2025-07; it cannot be applied as 2025-08',
    )
    expect(db.writeCount).toBe(writesAfterJulyApply)
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

  it('allocates Payment gross, fees, and net exactly across historical suffix rows', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true'
    const db = createFeeDbFixture({
      sales: [
        sale({
          id: 's1',
          etsyOrderId: '4137418052',
          grossRevenuePence: 2999,
          etsyFeesPence: 100,
          netRevenuePence: 2899,
          marginPence: 1899,
        }),
        sale({
          id: 's2',
          etsyOrderId: '4137418052-1',
          grossRevenuePence: 1000,
          etsyFeesPence: 50,
          netRevenuePence: 950,
          marginPence: 450,
        }),
      ],
    })
    const evidence: NormalizedOrderEvidence = {
      receiptId: '4137418052',
      currency: 'GBP',
      attributed: null,
      offsiteAdsFeePence: null,
      vatOnOffsiteAdsFeePence: null,
      paymentGrossPence: 3999,
      paymentFeesPence: 600,
      paymentNetPence: 3399,
      source: 'ETSY_PAYMENT_API',
    }

    const result = await reconcileImportedPaymentEvidence(evidence, db)

    expect(result.changes[0]).toMatchObject({
      receiptId: '4137418052',
      saleIds: ['s1', 's2'],
      oldFeesPence: 150,
      newFeesPence: 600,
    })
    expect(db.sales.map((snapshot) => ({
      id: snapshot.id,
      etsyPaymentGrossPence: snapshot.etsyPaymentGrossPence,
      etsyPaymentFeesPence: snapshot.etsyPaymentFeesPence,
      etsyPaymentNetPence: snapshot.etsyPaymentNetPence,
      etsyFeesPence: snapshot.etsyFeesPence,
      netRevenuePence: snapshot.netRevenuePence,
    }))).toEqual([
      {
        id: 's1',
        etsyPaymentGrossPence: 2999,
        etsyPaymentFeesPence: 450,
        etsyPaymentNetPence: 2549,
        etsyFeesPence: 450,
        netRevenuePence: 2549,
      },
      {
        id: 's2',
        etsyPaymentGrossPence: 1000,
        etsyPaymentFeesPence: 150,
        etsyPaymentNetPence: 850,
        etsyFeesPence: 150,
        netRevenuePence: 850,
      },
    ])
    expect(db.sales.reduce((sum, snapshot) => sum + (snapshot.etsyPaymentFeesPence ?? 0), 0)).toBe(600)
    expect(db.sales.reduce((sum, snapshot) => sum + (snapshot.etsyPaymentNetPence ?? 0), 0)).toBe(3399)
  })

  it('rewrites copied full Payment aggregates on already-synced suffix rows', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true'
    const db = createFeeDbFixture({
      sales: [
        sale({
          id: 's1',
          etsyOrderId: '4137418052',
          grossRevenuePence: 2999,
          etsyFeesPence: 450,
          netRevenuePence: 2549,
          marginPence: 1549,
          status: 'PAYMENT_SYNCED',
          etsyPaymentGrossPence: 3999,
          etsyPaymentFeesPence: 600,
          etsyPaymentNetPence: 3399,
        }),
        sale({
          id: 's2',
          etsyOrderId: '4137418052-1',
          grossRevenuePence: 1000,
          etsyFeesPence: 150,
          netRevenuePence: 850,
          marginPence: 350,
          status: 'PAYMENT_SYNCED',
          etsyPaymentGrossPence: 3999,
          etsyPaymentFeesPence: 600,
          etsyPaymentNetPence: 3399,
        }),
      ],
    })
    const evidence: NormalizedOrderEvidence = {
      receiptId: '4137418052',
      currency: 'GBP',
      attributed: null,
      offsiteAdsFeePence: null,
      vatOnOffsiteAdsFeePence: null,
      paymentGrossPence: 3999,
      paymentFeesPence: 600,
      paymentNetPence: 3399,
      source: 'ETSY_PAYMENT_API',
    }

    const result = await reconcileImportedPaymentEvidence(evidence, db)

    expect(result).toMatchObject({ applied: true })
    expect(db.writeCount).toBe(2)
    expect(db.sales.map((snapshot) => ({
      id: snapshot.id,
      etsyPaymentGrossPence: snapshot.etsyPaymentGrossPence,
      etsyPaymentFeesPence: snapshot.etsyPaymentFeesPence,
      etsyPaymentNetPence: snapshot.etsyPaymentNetPence,
    }))).toEqual([
      { id: 's1', etsyPaymentGrossPence: 2999, etsyPaymentFeesPence: 450, etsyPaymentNetPence: 2549 },
      { id: 's2', etsyPaymentGrossPence: 1000, etsyPaymentFeesPence: 150, etsyPaymentNetPence: 850 },
    ])
  })

  it('round-trips the complete persisted summary through the Prisma adapter', async () => {
    const summary = {
      matched: 2,
      changed: 1,
      unchanged: 1,
      unmatched: 3,
      manualReview: 1,
      attributed: 1,
      notAttributed: 1,
      oldFeesPence: 1400,
      newFeesPence: 1976,
      marginDeltaPence: -576,
    }
    let statementImportSelect: unknown
    const fakePrisma = {
      etsyStatementImport: {
        findUnique: async ({ select }: { select: unknown }) => {
          statementImportSelect = select
          return {
            id: 'statement-import-1',
            checksum: 'checksum-1',
            statementMonth: new Date('2023-11-01T00:00:00.000Z'),
            ...summary,
          }
        },
      },
    } as unknown as PrismaClient
    const repository = createPrismaFeeReconciliationRepository(fakePrisma)

    await expect(repository.findStatementImportByChecksum('checksum-1')).resolves.toEqual({
      id: 'statement-import-1',
      checksum: 'checksum-1',
      statementMonth: '2023-11',
      summary,
    })
    expect(statementImportSelect).toMatchObject({ statementMonth: true })
  })

  it('maps prior statement provenance from the Prisma sale adapter', async () => {
    const money = (value: number) => ({ toNumber: () => value })
    let saleSelect: unknown
    const fakePrisma = {
      sale: {
        findMany: async ({ select }: { select: unknown }) => {
          saleSelect = select
          return [{
            id: 's1',
            etsyOrderId: '4137418052',
            grossRevenue: money(39.99),
            etsyFees: money(9.76),
            netRevenue: money(30.23),
            margin: money(16.23),
            offsiteAdsFee: money(4.8),
            vatOnOffsiteAdsFee: money(0.96),
            etsyPaymentGross: null,
            etsyPaymentFees: null,
            etsyPaymentNet: null,
            offsiteAdsAttributed: true,
            etsyFeeReconciliationSource: 'ETSY_STATEMENT',
            etsyFeeReconciliationStatus: 'STATEMENT_VERIFIED',
            etsyStatementImportId: 'statement-import-2023-11',
            etsyStatementImport: { statementMonth: new Date('2023-11-01T00:00:00.000Z') },
            updatedAt: new Date('2023-12-01T00:00:00.000Z'),
          }]
        },
      },
    } as unknown as PrismaClient
    const repository = createPrismaFeeReconciliationRepository(fakePrisma)

    await expect(repository.listEtsySaleSnapshots()).resolves.toEqual([
      expect.objectContaining({
        id: 's1',
        etsyStatementImportId: 'statement-import-2023-11',
        etsyStatementMonth: '2023-11',
      }),
    ])
    expect(saleSelect).toMatchObject({
      etsyStatementImportId: true,
      etsyStatementImport: { select: { statementMonth: true } },
    })
  })

  it('returns duplicate semantics when concurrent apply loses a checksum race', async () => {
    const base = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    })
    const initialSales = await base.listEtsySaleSnapshots()
    let preflightFinds = 0
    let transactionCalls = 0
    let resolveCommitted!: () => void
    const committed = new Promise<void>((resolve) => { resolveCommitted = resolve })
    const raceDb: FeeReconciliationRepository = {
      async listEtsySaleSnapshots() {
        return initialSales.map((snapshot) => ({ ...snapshot }))
      },
      async findStatementImportByChecksum(checksum) {
        preflightFinds += 1
        if (preflightFinds <= 2) return null
        await committed
        return base.findStatementImportByChecksum(checksum)
      },
      async transaction(work) {
        transactionCalls += 1
        if (transactionCalls === 1) {
          const result = await base.transaction(work)
          resolveCommitted()
          return result
        }
        const error = Object.assign(new Error('checksum already exists'), {
          code: 'P2002',
          meta: { target: ['checksum'] },
        })
        throw error
      },
    }
    const statement = input(attributedCsv)
    const preview = await previewStatementReconciliation(statement, base)

    const results = await Promise.all([
      applyStatementReconciliation({ ...statement, fingerprint: preview.fingerprint }, raceDb),
      applyStatementReconciliation({ ...statement, fingerprint: preview.fingerprint }, raceDb),
    ])

    expect(results.filter((result) => result.applied)).toHaveLength(1)
    expect(results.filter((result) => result.duplicate)).toHaveLength(1)
    expect(base.imports).toHaveLength(1)
    expect(base.writeCount).toBe(3)
  })

  it('rejects a race-losing checksum apply submitted for a different month', async () => {
    const base = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    })
    const initialSales = await base.listEtsySaleSnapshots()
    let preflightFinds = 0
    let transactionCalls = 0
    let resolveFirstTransactionStarted!: () => void
    const firstTransactionStarted = new Promise<void>((resolve) => { resolveFirstTransactionStarted = resolve })
    let releaseFirstTransaction!: () => void
    const firstTransactionCanCommit = new Promise<void>((resolve) => { releaseFirstTransaction = resolve })
    let resolveSecondTransactionAttempted!: () => void
    const secondTransactionAttempted = new Promise<void>((resolve) => { resolveSecondTransactionAttempted = resolve })
    let resolveCommitted!: () => void
    const committed = new Promise<void>((resolve) => { resolveCommitted = resolve })
    const raceDb: FeeReconciliationRepository = {
      async listEtsySaleSnapshots() {
        return initialSales.map((snapshot) => ({ ...snapshot }))
      },
      async findStatementImportByChecksum(checksum) {
        preflightFinds += 1
        if (preflightFinds <= 2) return null
        await committed
        return base.findStatementImportByChecksum(checksum)
      },
      async transaction(work) {
        transactionCalls += 1
        if (transactionCalls === 1) {
          resolveFirstTransactionStarted()
          await firstTransactionCanCommit
          const result = await base.transaction(work)
          resolveCommitted()
          return result
        }
        resolveSecondTransactionAttempted()
        throw Object.assign(new Error('checksum already exists'), {
          code: 'P2002',
          meta: { target: ['checksum'] },
        })
      },
    }
    const julyStatement = input(attributedCsv)
    const augustStatement = {
      ...input(attributedCsv),
      statementMonth: '2025-08',
      fileName: 'etsy-statement-2025-08.csv',
    }
    const julyPreview = await previewStatementReconciliation(julyStatement, base)
    const augustPreview = await previewStatementReconciliation(augustStatement, base)

    const julyApply = applyStatementReconciliation({ ...julyStatement, fingerprint: julyPreview.fingerprint }, raceDb)
    await firstTransactionStarted
    const augustApply = applyStatementReconciliation({ ...augustStatement, fingerprint: augustPreview.fingerprint }, raceDb)
    await secondTransactionAttempted
    releaseFirstTransaction()

    await expect(julyApply).resolves.toMatchObject({ applied: true, duplicate: false })
    await expect(augustApply).rejects.toBeInstanceOf(StatementReconciliationConflictError)
    await expect(augustApply).rejects.toThrow(
      'This statement file was already imported for 2025-07; it cannot be applied as 2025-08',
    )
    expect(base.imports).toHaveLength(1)
    expect(base.writeCount).toBe(3)
  })
})
