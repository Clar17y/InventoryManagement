import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expensesSummaryQuerySchema } from '#contracts/routes/expenses'
import { getExpensesSummary } from '../../lib/expenses/summary'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    businessExpense: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '../../lib/prisma'

const mockPrisma = prisma as unknown as {
  businessExpense: {
    aggregate: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  $queryRaw: ReturnType<typeof vi.fn>
}

describe('expenses summary aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.businessExpense.groupBy.mockResolvedValue([
      {
        category: 'STOCK',
        _sum: {
          amountIncVat: new Prisma.Decimal('120.00'),
          amountExcVat: new Prisma.Decimal('100.00'),
        },
        _count: 2,
      },
    ])
    mockPrisma.businessExpense.aggregate.mockResolvedValue({
      _sum: {
        amountIncVat: new Prisma.Decimal('120.00'),
        amountExcVat: new Prisma.Decimal('100.00'),
      },
      _count: 2,
    })
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        month: '2026-08',
        totalIncVat: new Prisma.Decimal('120.00'),
        totalExcVat: new Prisma.Decimal('100.00'),
        count: BigInt(2),
      },
    ])
  })

  it('aggregates monthly rows in SQL without loading matching expenses', async () => {
    const query = expensesSummaryQuerySchema.parse({
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-20T23:59:59.999Z',
      search: 'chocolate',
    })

    const result = await getExpensesSummary(query)

    expect(result).toEqual({
      byCategory: [
        { category: 'STOCK', totalIncVat: 120, totalExcVat: 100, count: 2 },
      ],
      byMonth: [
        { month: '2026-08', totalIncVat: 120, totalExcVat: 100, count: 2 },
      ],
      totals: { totalIncVat: 120, totalExcVat: 100, count: 2 },
    })
    expect(mockPrisma.businessExpense.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isActive: true }),
    }))
    expect(mockPrisma.businessExpense.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isActive: true }),
    }))
    expect(mockPrisma.$queryRaw).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.arrayContaining([
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-20T23:59:59.999Z'),
        '%chocolate%',
      ]),
    }))
    expect(mockPrisma.businessExpense.findMany).not.toHaveBeenCalled()
  })
})
