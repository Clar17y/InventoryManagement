import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import type {
  EtsySaleResolution,
} from '#contracts/routes/sales'
import {
  EtsySaleResolutionConflictError,
  createPrismaEtsySaleResolutionRepository,
  type EtsySaleResolutionRepository,
  applyEtsySaleResolution,
  previewEtsySaleResolution,
} from '../../lib/sales/etsyResolutionService'
import type {
  EtsySaleResolutionProposal,
  EtsySaleResolutionSnapshot,
} from '../../lib/sales/etsyResolutionCalculations'

const UPDATED_AT = '2026-08-14T12:00:00.000Z'
const MAX_DATABASE_PENCE = 9_999_999_999
const MIN_DATABASE_PENCE = -MAX_DATABASE_PENCE

function snapshot(overrides: Partial<EtsySaleResolutionSnapshot> = {}): EtsySaleResolutionSnapshot {
  return {
    id: 'sale-1',
    saleChannel: 'etsy',
    etsyOrderId: '4137418052',
    grossRevenuePence: 3_000,
    postageChargedPence: 500,
    postageCostPence: 250,
    transactionFeePence: 60,
    postageTransactionFeePence: 10,
    regulatoryFeePence: 25,
    processingFeePence: 40,
    vatOnProcessingFeePence: 8,
    listingFeePence: 20,
    offsiteAdsAttributed: true,
    offsiteAdsFeePence: 100,
    vatOnOffsiteAdsFeePence: 20,
    etsyFeesPence: 283,
    packagingOverheadPence: 30,
    netRevenuePence: 3_187,
    totalCostPence: 1_100,
    marginPence: 1_837,
    etsyPaymentGrossPence: null,
    etsyPaymentFeesPence: null,
    etsyPaymentNetPence: null,
    status: 'PENDING',
    source: null,
    reconciledAt: null,
    statementImportId: null,
    manualResolutionNote: null,
    updatedAt: UPDATED_AT,
    ...overrides,
  }
}

function reclassify(note?: string): EtsySaleResolution {
  return { type: 'reclassify', channel: 'direct', ...(note === undefined ? {} : { note }) }
}

class MemoryRepository implements EtsySaleResolutionRepository {
  rows: EtsySaleResolutionSnapshot[]
  applyCalls: Array<{ count: number; appliedAt: Date }> = []
  failAtIndex: number | null = null

  constructor(rows: EtsySaleResolutionSnapshot[]) {
    this.rows = rows.map((row) => ({ ...row }))
  }

  async loadGroupBySaleId(saleId: string): Promise<EtsySaleResolutionSnapshot[]> {
    const target = this.rows.find((row) => row.id === saleId)
    if (!target) return []
    const base = target.etsyOrderId?.match(/^(\d+)(?:-\d+)?$/u)?.[1]
    if (!base) return [{ ...target }]
    return this.rows
      .filter((row) => row.etsyOrderId?.match(/^(\d+)(?:-\d+)?$/u)?.[1] === base)
      .map((row) => ({ ...row }))
  }

  async loadGroupByBaseReceiptId(baseReceiptId: string): Promise<EtsySaleResolutionSnapshot[]> {
    return this.rows
      .filter((row) => row.etsyOrderId?.match(/^(\d+)(?:-\d+)?$/u)?.[1] === baseReceiptId)
      .map((row) => ({ ...row }))
  }

  async applyProposals(
    proposals: readonly EtsySaleResolutionProposal[],
    appliedAt: Date,
  ): Promise<void> {
    this.applyCalls.push({ count: proposals.length, appliedAt })
    const before = this.rows.map((row) => ({ ...row }))
    try {
      for (const [index, proposal] of proposals.entries()) {
        if (this.failAtIndex === index) throw new EtsySaleResolutionConflictError('simulated row conflict')
        const row = this.rows.find((candidate) => candidate.id === proposal.saleId)
        if (!row || row.updatedAt !== proposal.expectedUpdatedAt) {
          throw new EtsySaleResolutionConflictError('stale row')
        }
        Object.assign(row, proposal.data, { updatedAt: appliedAt.toISOString() })
      }
    } catch (error) {
      this.rows = before
      throw error
    }
  }
}

describe('manual Etsy sale resolution service', () => {
  let db: MemoryRepository

  beforeEach(() => {
    db = new MemoryRepository([snapshot()])
  })

  it('previews normalized input and complete financial effects without writing', async () => {
    const result = await previewEtsySaleResolution(
      { saleId: 'sale-1', resolution: reclassify('  In person  ') },
      { db },
    )

    expect(result.resolution).toEqual({ type: 'reclassify', channel: 'direct', note: 'In person' })
    expect(result.baseReceiptId).toBe('4137418052')
    expect(result.saleIds).toEqual(['sale-1'])
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.summary).toEqual({
      oldFeesPence: 283,
      newFeesPence: 0,
      feeDeltaPence: -283,
      oldNetRevenuePence: 3_187,
      newNetRevenuePence: 3_470,
      netRevenueDeltaPence: 283,
      oldMarginPence: 1_837,
      newMarginPence: 2_120,
      marginDeltaPence: 283,
    })
    expect(result.rows).toEqual([{
      saleId: 'sale-1',
      before: expect.objectContaining({
        saleChannel: 'etsy',
        etsyOrderId: '4137418052',
        status: 'PENDING',
        etsyFeesPence: 283,
        netRevenuePence: 3_187,
        marginPence: 1_837,
      }),
      after: expect.objectContaining({
        saleChannel: 'direct',
        etsyOrderId: null,
        status: 'NOT_APPLICABLE',
        source: 'MANUAL',
        etsyFeesPence: 0,
        netRevenuePence: 3_470,
        marginPence: 2_120,
      }),
    }])
    expect(result.warnings.join(' ')).toMatch(/clears Etsy fees/i)
    expect(db.applyCalls).toHaveLength(0)
  })

  it('rebuilds the preview and delegates one proposal batch with one applied timestamp', async () => {
    const input = { saleId: 'sale-1', resolution: reclassify() }
    const preview = await previewEtsySaleResolution(input, { db })
    const appliedAt = new Date('2026-08-14T12:34:56.000Z')

    const result = await applyEtsySaleResolution(
      { ...input, fingerprint: preview.fingerprint },
      { db, now: () => appliedAt },
    )

    expect(result).toMatchObject({ fingerprint: preview.fingerprint, applied: true })
    expect(db.applyCalls).toEqual([{ count: 1, appliedAt }])
    expect(db.rows[0]).toMatchObject({
      saleChannel: 'direct',
      etsyOrderId: null,
      etsyFeesPence: 0,
      updatedAt: appliedAt.toISOString(),
    })
  })

  it('rejects a stale fingerprint without calling the repository write', async () => {
    await expect(applyEtsySaleResolution(
      { saleId: 'sale-1', resolution: reclassify(), fingerprint: '0'.repeat(64) },
      { db },
    )).rejects.toBeInstanceOf(EtsySaleResolutionConflictError)
    expect(db.applyCalls).toHaveLength(0)
  })

  it('keeps earlier rows unchanged when the repository reports a later-row conflict', async () => {
    const rows = [
      snapshot({ id: 'sale-a', etsyOrderId: '1' }),
      snapshot({ id: 'sale-b', etsyOrderId: '1-1' }),
    ]
    db = new MemoryRepository(rows)
    db.failAtIndex = 1
    const input = { saleId: 'sale-a', resolution: reclassify() }
    const preview = await previewEtsySaleResolution(input, { db })

    await expect(applyEtsySaleResolution(
      { ...input, fingerprint: preview.fingerprint },
      { db },
    )).rejects.toBeInstanceOf(EtsySaleResolutionConflictError)
    expect(db.applyCalls).toHaveLength(1)
    expect(db.rows).toEqual(rows)
  })

  it('returns a typed conflict when a statement-verified row appears after preview', async () => {
    const input = { saleId: 'sale-1', resolution: reclassify() }
    const preview = await previewEtsySaleResolution(input, { db })
    db.rows[0]!.status = 'STATEMENT_VERIFIED'

    await expect(applyEtsySaleResolution(
      { ...input, fingerprint: preview.fingerprint },
      { db },
    )).rejects.toBeInstanceOf(EtsySaleResolutionConflictError)
    expect(db.applyCalls).toHaveLength(0)
  })

  it('rejects a repeated apply with the old fingerprint instead of duplicating the change', async () => {
    const input = { saleId: 'sale-1', resolution: reclassify() }
    const preview = await previewEtsySaleResolution(input, { db })
    await applyEtsySaleResolution({ ...input, fingerprint: preview.fingerprint }, { db })

    await expect(applyEtsySaleResolution(
      { ...input, fingerprint: preview.fingerprint },
      { db },
    )).rejects.toBeInstanceOf(EtsySaleResolutionConflictError)
    expect(db.applyCalls).toHaveLength(1)
  })

  it.each([
    ['exact', '4137418052'],
    ['immediate suffix', '4137418052-1'],
  ])('rejects a corrected ID collision with an existing %s group', async (_label, conflictingOrderId) => {
    db = new MemoryRepository([
      snapshot({ etsyOrderId: '1' }),
      snapshot({ id: 'conflict', etsyOrderId: conflictingOrderId }),
    ])

    await expect(previewEtsySaleResolution({
      saleId: 'sale-1',
      resolution: { type: 'correct_receipt_id', etsyOrderId: '4137418052' },
    }, { db })).rejects.toBeInstanceOf(EtsySaleResolutionConflictError)
    expect(db.applyCalls).toHaveLength(0)
  })
})

function prismaSale(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    saleChannel: 'etsy',
    etsyOrderId: '4137418052',
    grossRevenue: new Prisma.Decimal('99999999.99'),
    postageCharged: new Prisma.Decimal('0.00'),
    postageCost: new Prisma.Decimal('0.00'),
    transactionFee: new Prisma.Decimal('99999999.99'),
    postageTransactionFee: new Prisma.Decimal('-99999999.99'),
    regulatoryFee: new Prisma.Decimal('0.00'),
    processingFee: new Prisma.Decimal('0.00'),
    vatOnProcessingFee: new Prisma.Decimal('0.00'),
    listingFee: new Prisma.Decimal('0.00'),
    offsiteAdsAttributed: true,
    offsiteAdsFee: new Prisma.Decimal('99999999.99'),
    vatOnOffsiteAdsFee: new Prisma.Decimal('0.00'),
    etsyFees: new Prisma.Decimal('99999999.99'),
    packagingOverhead: new Prisma.Decimal('0.00'),
    netRevenue: new Prisma.Decimal('-99999999.99'),
    totalCost: new Prisma.Decimal('0.00'),
    margin: new Prisma.Decimal('-99999999.99'),
    etsyPaymentGross: new Prisma.Decimal('99999999.99'),
    etsyPaymentFees: new Prisma.Decimal('-99999999.99'),
    etsyPaymentNet: new Prisma.Decimal('0.00'),
    etsyFeeReconciliationStatus: 'PENDING',
    etsyFeeReconciliationSource: null,
    etsyFeeReconciledAt: null,
    etsyStatementImportId: null,
    etsyManualResolutionNote: null,
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  }
}

function proposalFor(
  saleId: string,
  expectedUpdatedAt = UPDATED_AT,
  overrides: Partial<EtsySaleResolutionProposal['data']> = {},
): EtsySaleResolutionProposal {
  return {
    saleId,
    expectedUpdatedAt,
    data: {
      saleChannel: 'etsy',
      etsyOrderId: '4137418052',
      transactionFeePence: MAX_DATABASE_PENCE,
      postageTransactionFeePence: MIN_DATABASE_PENCE,
      regulatoryFeePence: MAX_DATABASE_PENCE,
      processingFeePence: MIN_DATABASE_PENCE,
      vatOnProcessingFeePence: MAX_DATABASE_PENCE,
      listingFeePence: MIN_DATABASE_PENCE,
      offsiteAdsAttributed: true,
      offsiteAdsFeePence: MAX_DATABASE_PENCE,
      vatOnOffsiteAdsFeePence: MIN_DATABASE_PENCE,
      etsyFeesPence: MAX_DATABASE_PENCE,
      netRevenuePence: MIN_DATABASE_PENCE,
      marginPence: MAX_DATABASE_PENCE,
      etsyPaymentGrossPence: MAX_DATABASE_PENCE,
      etsyPaymentFeesPence: MIN_DATABASE_PENCE,
      etsyPaymentNetPence: MAX_DATABASE_PENCE,
      status: 'PENDING',
      source: null,
      reconciledAt: null,
      statementImportId: null,
      manualResolutionNote: null,
      ...overrides,
    },
  }
}

describe('Prisma Etsy Sale resolution repository', () => {
  it('revalidates exact/immediate group membership inside a serializable transaction', async () => {
    const first = prismaSale()
    const second = prismaSale({ id: 'sale-2', etsyOrderId: '4137418052-1' })
    const phantom = prismaSale({ id: 'sale-3', etsyOrderId: '4137418052-2' })
    const txFindMany = vi.fn()
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([first, second, phantom])
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    let transactionOptions: unknown
    const prisma = {
      sale: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (
        work: (tx: unknown) => Promise<unknown>,
        options: unknown,
      ) => {
        transactionOptions = options
        return work({ sale: { findMany: txFindMany, updateMany: txUpdateMany } })
      }),
    }

    const repository = createPrismaEtsySaleResolutionRepository(prisma as never)

    await expect(repository.applyProposals([
      proposalFor('sale-1'),
      proposalFor('sale-2'),
    ], new Date('2026-08-14T12:34:56.000Z'))).rejects.toBeInstanceOf(EtsySaleResolutionConflictError)
    expect(transactionOptions).toMatchObject({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
    expect(txFindMany).toHaveBeenCalledTimes(2)
    expect(txFindMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        OR: [
          { etsyOrderId: '4137418052' },
          { etsyOrderId: { startsWith: '4137418052-' } },
        ],
      },
    })
    expect(txUpdateMany).not.toHaveBeenCalled()
  })

  it('revalidates a corrected receipt destination group inside the transaction', async () => {
    const current = prismaSale()
    const destinationPhantom = prismaSale({ id: 'sale-2', etsyOrderId: '9876543210-1' })
    const txFindMany = vi.fn()
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([destinationPhantom])
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const transaction = vi.fn().mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
      sale: { findMany: txFindMany, updateMany: txUpdateMany },
    }))
    const prisma = {
      sale: { findUnique: vi.fn(), findMany: vi.fn() },
      $transaction: transaction,
    }
    const repository = createPrismaEtsySaleResolutionRepository(prisma as never)

    await expect(repository.applyProposals([
      proposalFor(current.id, UPDATED_AT, { etsyOrderId: '9876543210' }),
    ], new Date('2026-08-14T12:34:56.000Z'))).rejects.toBeInstanceOf(EtsySaleResolutionConflictError)
    expect(txUpdateMany).not.toHaveBeenCalled()
  })

  it('round-trips Decimal(10,2) boundary values exactly in both directions', async () => {
    const row = prismaSale({
      postageCharged: new Prisma.Decimal('-99999999.99'),
      postageCost: new Prisma.Decimal('99999999.99'),
      regulatoryFee: new Prisma.Decimal('99999999.99'),
      processingFee: new Prisma.Decimal('-99999999.99'),
      vatOnProcessingFee: new Prisma.Decimal('99999999.99'),
      listingFee: new Prisma.Decimal('-99999999.99'),
      vatOnOffsiteAdsFee: new Prisma.Decimal('-99999999.99'),
      packagingOverhead: new Prisma.Decimal('-99999999.99'),
      totalCost: new Prisma.Decimal('99999999.99'),
      etsyPaymentNet: new Prisma.Decimal('99999999.99'),
    })
    const transaction = vi.fn().mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
      sale: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ id: row.id, etsyOrderId: row.etsyOrderId, updatedAt: row.updatedAt }])
          .mockResolvedValueOnce([{ id: row.id, etsyOrderId: row.etsyOrderId, updatedAt: row.updatedAt }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }))
    const prisma = {
      sale: {
        findUnique: vi.fn().mockResolvedValue(row),
        findMany: vi.fn().mockResolvedValue([row]),
      },
      $transaction: transaction,
    }
    const repository = createPrismaEtsySaleResolutionRepository(prisma as never)
    const loaded = await repository.loadGroupBySaleId(row.id)

    expect(loaded[0]).toMatchObject({
      grossRevenuePence: MAX_DATABASE_PENCE,
      postageChargedPence: MIN_DATABASE_PENCE,
      postageCostPence: MAX_DATABASE_PENCE,
      transactionFeePence: MAX_DATABASE_PENCE,
      postageTransactionFeePence: MIN_DATABASE_PENCE,
      regulatoryFeePence: MAX_DATABASE_PENCE,
      processingFeePence: MIN_DATABASE_PENCE,
      vatOnProcessingFeePence: MAX_DATABASE_PENCE,
      listingFeePence: MIN_DATABASE_PENCE,
      offsiteAdsFeePence: MAX_DATABASE_PENCE,
      vatOnOffsiteAdsFeePence: MIN_DATABASE_PENCE,
      etsyFeesPence: MAX_DATABASE_PENCE,
      packagingOverheadPence: MIN_DATABASE_PENCE,
      netRevenuePence: MIN_DATABASE_PENCE,
      totalCostPence: MAX_DATABASE_PENCE,
      marginPence: MIN_DATABASE_PENCE,
      etsyPaymentGrossPence: MAX_DATABASE_PENCE,
      etsyPaymentFeesPence: MIN_DATABASE_PENCE,
      etsyPaymentNetPence: MAX_DATABASE_PENCE,
    })

    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const txFindMany = vi.fn()
      .mockResolvedValueOnce([{ id: row.id, etsyOrderId: row.etsyOrderId, updatedAt: row.updatedAt }])
      .mockResolvedValueOnce([{ id: row.id, etsyOrderId: row.etsyOrderId, updatedAt: row.updatedAt }])
    transaction.mockImplementationOnce(async (work: (tx: unknown) => Promise<unknown>) => work({
      sale: { findMany: txFindMany, updateMany },
    }))
    await repository.applyProposals([proposalFor(row.id)], new Date('2026-08-14T12:34:56.000Z'))

    const data = updateMany.mock.calls[0]?.[0].data as Record<string, Prisma.Decimal>
    expect(data.transactionFee.toFixed(2)).toBe('99999999.99')
    expect(data.postageTransactionFee.toFixed(2)).toBe('-99999999.99')
    expect(data.regulatoryFee.toFixed(2)).toBe('99999999.99')
    expect(data.processingFee.toFixed(2)).toBe('-99999999.99')
    expect(data.vatOnProcessingFee.toFixed(2)).toBe('99999999.99')
    expect(data.listingFee.toFixed(2)).toBe('-99999999.99')
    expect(data.etsyFees.toFixed(2)).toBe('99999999.99')
    expect(data.netRevenue.toFixed(2)).toBe('-99999999.99')
    expect(data.margin.toFixed(2)).toBe('99999999.99')
    expect(data.offsiteAdsFee.toFixed(2)).toBe('99999999.99')
    expect(data.vatOnOffsiteAdsFee.toFixed(2)).toBe('-99999999.99')
    expect(data.etsyPaymentGross.toFixed(2)).toBe('99999999.99')
    expect(data.etsyPaymentFees.toFixed(2)).toBe('-99999999.99')
    expect(data.etsyPaymentNet.toFixed(2)).toBe('99999999.99')
  })

  it('rolls back a first row when a later row fails its updatedAt compare-and-set', async () => {
    const first = prismaSale()
    const second = prismaSale({ id: 'sale-2', etsyOrderId: '4137418052-1' })
    const state = new Map([[first.id, 'before-1'], [second.id, 'before-2']])
    const txFindMany = vi.fn()
      .mockResolvedValueOnce([
        { id: first.id, etsyOrderId: first.etsyOrderId, updatedAt: first.updatedAt },
        { id: second.id, etsyOrderId: second.etsyOrderId, updatedAt: second.updatedAt },
      ])
      .mockResolvedValueOnce([first, second])
    const updateMany = vi.fn()
      .mockImplementationOnce(async () => {
        state.set(first.id, 'after-1')
        return { count: 1 }
      })
      .mockResolvedValueOnce({ count: 0 })
    const transaction = vi.fn().mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
      const before = new Map(state)
      try {
        return await work({ sale: { findMany: txFindMany, updateMany } })
      } catch (error) {
        state.clear()
        for (const [id, value] of before) state.set(id, value)
        throw error
      }
    })
    const prisma = {
      sale: { findUnique: vi.fn(), findMany: vi.fn() },
      $transaction: transaction,
    } as never
    const repository = createPrismaEtsySaleResolutionRepository(prisma)

    await expect(repository.applyProposals([
      proposalFor(first.id),
      proposalFor(second.id),
    ], new Date('2026-08-14T12:34:56.000Z'))).rejects.toBeInstanceOf(EtsySaleResolutionConflictError)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0]?.[1]).toMatchObject({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
    expect(updateMany).toHaveBeenCalledTimes(2)
    expect(state).toEqual(new Map([[first.id, 'before-1'], [second.id, 'before-2']]))
  })
})
