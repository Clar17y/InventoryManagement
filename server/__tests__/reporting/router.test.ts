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
    },
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
  }
  $queryRaw: ReturnType<typeof vi.fn>
}

let activeServer: Server | null = null

async function startServer(): Promise<string> {
  const app = express()
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
    mockPrisma.sale.findMany.mockResolvedValue([])
    mockPrisma.sale.count.mockResolvedValue(4)
    const baseUrl = await startServer()

    const response = await fetch(
      `${baseUrl}/api/sales/summary?startDate=2026-08-01&endDate=2026-08-03&search=gift`,
    )
    const body = await response.json() as { unverifiedEtsySales: number }

    expect(response.status).toBe(200)
    expect(body.unverifiedEtsySales).toBe(4)

    const findManyWhere = mockPrisma.sale.findMany.mock.calls[0][0].where
    expect(mockPrisma.sale.count).toHaveBeenCalledWith({
      where: {
        ...findManyWhere,
        saleChannel: 'etsy',
        etsyFeeReconciliationStatus: { not: 'STATEMENT_VERIFIED' },
      },
    })
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
})
