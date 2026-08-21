import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSalesSummary } from '../../lib/sales/summary'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    sale: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    saleLine: { groupBy: vi.fn() },
    hamper: { findMany: vi.fn() },
  },
}))

import { prisma } from '../../lib/prisma'

const mockPrisma = prisma as unknown as {
  sale: {
    aggregate: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  saleLine: { groupBy: ReturnType<typeof vi.fn> }
  hamper: { findMany: ReturnType<typeof vi.fn> }
}

describe('sales summary aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.sale.aggregate.mockResolvedValue({
      _count: { _all: 4 },
      _sum: {
        grossRevenue: new Prisma.Decimal('123.45'),
        postageCharged: new Prisma.Decimal('10.00'),
        postageCost: new Prisma.Decimal('8.25'),
        etsyFees: new Prisma.Decimal('12.34'),
        totalCost: new Prisma.Decimal('50.00'),
        margin: new Prisma.Decimal('61.11'),
      },
    })
    mockPrisma.sale.groupBy.mockResolvedValue([
      {
        saleChannel: 'fair',
        _count: { _all: 1 },
        _sum: {
          grossRevenue: new Prisma.Decimal('15.00'),
          etsyFees: new Prisma.Decimal('0.00'),
          margin: new Prisma.Decimal('7.00'),
        },
      },
      {
        saleChannel: 'etsy',
        _count: { _all: 2 },
        _sum: {
          grossRevenue: new Prisma.Decimal('80.00'),
          etsyFees: new Prisma.Decimal('12.34'),
          margin: new Prisma.Decimal('40.00'),
        },
      },
      {
        saleChannel: 'direct',
        _count: { _all: 1 },
        _sum: {
          grossRevenue: new Prisma.Decimal('28.45'),
          etsyFees: new Prisma.Decimal('0.00'),
          margin: new Prisma.Decimal('14.11'),
        },
      },
    ])
    mockPrisma.saleLine.groupBy.mockResolvedValue([
      {
        hamperId: 'hamper-1',
        description: null,
        unitPrice: new Prisma.Decimal('20.00'),
        _sum: { quantity: 2 },
      },
      {
        hamperId: 'hamper-1',
        description: null,
        unitPrice: new Prisma.Decimal('25.00'),
        _sum: { quantity: 1 },
      },
      {
        hamperId: null,
        description: 'Custom basket',
        unitPrice: new Prisma.Decimal('7.50'),
        _sum: { quantity: 2 },
      },
    ])
    mockPrisma.sale.count.mockResolvedValue(2)
    mockPrisma.hamper.findMany.mockResolvedValue([{ id: 'hamper-1', name: 'Gift Hamper' }])
  })

  it('maps aggregate and grouped rows without loading matching sales', async () => {
    const where = { saleDate: { gte: new Date('2026-01-01T00:00:00.000Z') } }

    const result = await getSalesSummary(where)

    expect(result).toEqual({
      unverifiedEtsySales: 2,
      totals: {
        salesCount: 4,
        totalRevenue: 123.45,
        totalPostageCharged: 10,
        totalPostageCost: 8.25,
        totalFees: 12.34,
        totalCost: 50,
        totalMargin: 61.11,
      },
      byChannel: [
        { channel: 'etsy', count: 2, revenue: 80, fees: 12.34, margin: 40 },
        { channel: 'direct', count: 1, revenue: 28.45, fees: 0, margin: 14.11 },
        { channel: 'fair', count: 1, revenue: 15, fees: 0, margin: 7 },
      ],
      byHamper: [
        { name: 'Gift Hamper', count: 3, revenue: 65 },
        { name: 'Custom basket', count: 2, revenue: 15 },
      ],
    })

    expect(mockPrisma.sale.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(mockPrisma.sale.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(mockPrisma.saleLine.groupBy).toHaveBeenCalledWith({
      by: ['hamperId', 'description', 'unitPrice'],
      where: { sale: where },
      _sum: { quantity: true },
    })
    expect(mockPrisma.hamper.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['hamper-1'] } },
      select: { id: true, name: true },
    })
    expect(mockPrisma.sale.count).toHaveBeenCalledWith({
      where: {
        AND: [
          where,
          { saleChannel: 'etsy' },
          { etsyFeeReconciliationStatus: { notIn: ['STATEMENT_VERIFIED', 'NOT_APPLICABLE'] } },
        ],
      },
    })
    expect(mockPrisma.sale.findMany).not.toHaveBeenCalled()
  })

  it('does not query Hampers when the summary has no Hamper-backed lines', async () => {
    mockPrisma.saleLine.groupBy.mockResolvedValue([
      {
        hamperId: null,
        description: 'Custom basket',
        unitPrice: new Prisma.Decimal('7.50'),
        _sum: { quantity: 2 },
      },
    ])

    const result = await getSalesSummary({})

    expect(result.byHamper).toEqual([{ name: 'Custom basket', count: 2, revenue: 15 }])
    expect(mockPrisma.hamper.findMany).not.toHaveBeenCalled()
  })

  it('keeps distinct Hampers separate when they share a display name', async () => {
    mockPrisma.saleLine.groupBy.mockResolvedValue([
      {
        hamperId: 'hamper-1',
        description: null,
        unitPrice: new Prisma.Decimal('20.00'),
        _sum: { quantity: 1 },
      },
      {
        hamperId: 'hamper-2',
        description: null,
        unitPrice: new Prisma.Decimal('25.00'),
        _sum: { quantity: 2 },
      },
    ])
    mockPrisma.hamper.findMany.mockResolvedValue([
      { id: 'hamper-1', name: 'Gift Hamper' },
      { id: 'hamper-2', name: 'Gift Hamper' },
    ])

    const result = await getSalesSummary({})

    expect(result.byHamper).toEqual([
      { name: 'Gift Hamper', count: 2, revenue: 50 },
      { name: 'Gift Hamper', count: 1, revenue: 20 },
    ])
  })

  it('sorts hamper summaries by quantity count before revenue', async () => {
    mockPrisma.saleLine.groupBy.mockResolvedValue([
      {
        hamperId: 'high-value',
        description: null,
        unitPrice: new Prisma.Decimal('100.00'),
        _sum: { quantity: 1 },
      },
      {
        hamperId: 'high-volume',
        description: null,
        unitPrice: new Prisma.Decimal('10.00'),
        _sum: { quantity: 3 },
      },
    ])
    mockPrisma.hamper.findMany.mockResolvedValue([
      { id: 'high-value', name: 'High Value' },
      { id: 'high-volume', name: 'High Volume' },
    ])

    const result = await getSalesSummary({})

    expect(result.byHamper).toEqual([
      { name: 'High Volume', count: 3, revenue: 30 },
      { name: 'High Value', count: 1, revenue: 100 },
    ])
  })
})
