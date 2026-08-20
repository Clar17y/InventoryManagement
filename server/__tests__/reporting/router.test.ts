import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    sale: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    saleLine: { groupBy: vi.fn() },
    hamper: { findMany: vi.fn() },
    etsyFeeConfig: { findFirst: vi.fn() },
    packagingOverhead: { findMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '../../lib/prisma'
import analyticsRouter from '../../features/analytics/router'
import salesRouter from '../../features/sales/router'

const mockPrisma = prisma as unknown as {
  sale: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    aggregate: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
  }
  saleLine: { groupBy: ReturnType<typeof vi.fn> }
  hamper: { findMany: ReturnType<typeof vi.fn> }
  etsyFeeConfig: { findFirst: ReturnType<typeof vi.fn> }
  packagingOverhead: { findMany: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
  $queryRaw: ReturnType<typeof vi.fn>
}

let activeServer: Server | null = null

async function startServer(): Promise<string> {
  const app = express()
  app.use(express.json())
  app.use('/api/sales', salesRouter)
  app.use('/api/analytics', analyticsRouter)

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not start')
  activeServer = server
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  if (!activeServer) return
  await new Promise<void>((resolve, reject) => {
    activeServer!.close((error) => (error ? reject(error) : resolve()))
  })
  activeServer = null
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sales and analytics reporting routers', () => {
  it('counts unverified Etsy sales with the summary period/search filters', async () => {
    mockPrisma.sale.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: {
        grossRevenue: null,
        postageCharged: null,
        postageCost: null,
        etsyFees: null,
        totalCost: null,
        margin: null,
      },
    })
    mockPrisma.sale.groupBy.mockResolvedValue([])
    mockPrisma.saleLine.groupBy.mockResolvedValue([])
    mockPrisma.hamper.findMany.mockResolvedValue([])
    mockPrisma.sale.count.mockResolvedValue(4)
    const baseUrl = await startServer()

    const response = await fetch(
      `${baseUrl}/api/sales/summary?startDate=2026-08-01&endDate=2026-08-03&search=gift`,
    )
    const body = await response.json() as { unverifiedEtsySales: number }

    expect(response.status).toBe(200)
    expect(body.unverifiedEtsySales).toBe(4)

    const expectedWhere = expect.objectContaining({
      saleDate: {
        gte: new Date('2026-07-31T23:00:00.000Z'),
        lt: new Date('2026-08-03T23:00:00.000Z'),
      },
      OR: expect.any(Array),
    })
    expect(mockPrisma.sale.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }))
    expect(mockPrisma.sale.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }))
    expect(mockPrisma.saleLine.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { sale: expectedWhere } }))
    expect(mockPrisma.sale.count).toHaveBeenCalledWith({
      where: {
        AND: [
          expectedWhere,
          { saleChannel: 'etsy' },
          { etsyFeeReconciliationStatus: { notIn: ['STATEMENT_VERIFIED', 'NOT_APPLICABLE'] } },
        ],
      },
    })
    expect(mockPrisma.sale.findMany).not.toHaveBeenCalled()
  })

  it('rejects an invalid date-only summary filter before querying Prisma', async () => {
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/api/sales/summary?startDate=2026-02-30`)

    expect(response.status).toBe(400)
    expect(mockPrisma.sale.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.sale.aggregate).not.toHaveBeenCalled()
    expect(mockPrisma.sale.groupBy).not.toHaveBeenCalled()
    expect(mockPrisma.saleLine.groupBy).not.toHaveBeenCalled()
    expect(mockPrisma.hamper.findMany).not.toHaveBeenCalled()
  })

  it('maps Decimal and null Offsite Ads sums without changing existing profit totals', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        { date: '2026-08-01', revenue: new Prisma.Decimal('100.00'), profit: new Prisma.Decimal('40.00') },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { name: 'Gift Hamper', revenue: new Prisma.Decimal('100.00'), cost: new Prisma.Decimal('60.00') },
      ])
    mockPrisma.sale.aggregate.mockResolvedValue({
      _sum: {
        transactionFee: new Prisma.Decimal('1.25'),
        postageTransactionFee: new Prisma.Decimal('0.25'),
        regulatoryFee: new Prisma.Decimal('0.30'),
        processingFee: new Prisma.Decimal('2.00'),
        vatOnProcessingFee: new Prisma.Decimal('0.40'),
        listingFee: new Prisma.Decimal('0.20'),
        offsiteAdsFee: new Prisma.Decimal('4.80'),
        vatOnOffsiteAdsFee: null,
        postageCost: new Prisma.Decimal('1.10'),
        totalCost: new Prisma.Decimal('10.00'),
        packagingOverhead: new Prisma.Decimal('0.50'),
      },
    })
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/api/analytics/profit?startDate=2026-08-01&endDate=2026-08-01`)
    const body = await response.json() as {
      dailyTrend: Array<{ revenue: number; profit: number; netProfit: number }>
      feeBreakdown: Record<string, number>
      marginByHamper: Array<{ revenue: number; profit: number; marginPercent: number }>
    }

    expect(response.status).toBe(200)
    expect(body.dailyTrend).toEqual([{
      date: '2026-08-01',
      revenue: 100,
      profit: 40,
      expenses: 0,
      netProfit: 40,
      marginPercent: 40,
    }])
    expect(body.feeBreakdown).toEqual({
      transaction: 1.5,
      processing: 2.4,
      regulatory: 0.3,
      listing: 0.2,
      postage: 1.1,
      stock: 10,
      packaging: 0.5,
      offsiteAds: 4.8,
      offsiteAdsVat: 0,
    })
    expect(body.marginByHamper).toEqual([{
      name: 'Gift Hamper',
      revenue: 100,
      profit: 40,
      marginPercent: 40,
    }])

    expect(mockPrisma.sale.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      _sum: expect.objectContaining({
        offsiteAdsFee: true,
        vatOnOffsiteAdsFee: true,
      }),
    }))
  })

  it('trims a valid Etsy order ID at the sales create boundary without changing notes', async () => {
    let createdSaleData: Record<string, unknown> | undefined
    mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue(null)
    mockPrisma.packagingOverhead.findMany.mockResolvedValue([])
    mockPrisma.$transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
      sale: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          createdSaleData = data
          return { id: 'sale-1', ...data, lines: [] }
        }),
      },
    }))
    const baseUrl = await startServer()

    const response = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grossRevenue: 10,
        saleChannel: 'etsy',
        etsyOrderId: ' 12345 ',
        notes: '  preserve this note  ',
        lines: [{ description: 'Manual item', quantity: 1, unitPrice: 10 }],
      }),
    })

    expect(response.status).toBe(201)
    expect(createdSaleData?.etsyOrderId).toBe('12345')
    expect(createdSaleData?.notes).toBe('  preserve this note  ')
  })
})
