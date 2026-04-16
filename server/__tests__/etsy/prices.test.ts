import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    hamper: { update: vi.fn() },
    hamperVariant: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

import { prisma } from '../../lib/prisma'
import { pullPriceUpdates } from '../../lib/etsy/sync/prices'

const mockPrisma = prisma as unknown as {
  hamper: { update: ReturnType<typeof vi.fn> }
  hamperVariant: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

describe('Price Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the hamper price for default rows', async () => {
    mockPrisma.hamper.update.mockResolvedValue({})

    const result = await pullPriceUpdates([
      { hamperId: 'hamper-1', variantId: 'default:hamper-1', etsyPrice: 42 },
    ])

    expect(mockPrisma.hamper.update).toHaveBeenCalledWith({
      where: { id: 'hamper-1' },
      data: { sellingPrice: 42 },
    })
    expect(result).toMatchObject({ success: true, updated: 1, errors: 0 })
  })

  it('updates the variant price for linked variants', async () => {
    mockPrisma.hamperVariant.findFirst.mockResolvedValue({ id: 'variant-1' })
    mockPrisma.hamperVariant.update.mockResolvedValue({})

    const result = await pullPriceUpdates([
      { hamperId: 'hamper-1', variantId: 'variant-1', etsyPrice: 55 },
    ])

    expect(mockPrisma.hamperVariant.findFirst).toHaveBeenCalledWith({
      where: { id: 'variant-1', hamperId: 'hamper-1' },
      select: { id: true },
    })
    expect(mockPrisma.hamperVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { sellingPrice: 55 },
    })
    expect(result).toMatchObject({ success: true, updated: 1, errors: 0 })
  })
})
