import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    hamperRequirement: { findMany: vi.fn() },
    hamperVariant: { findMany: vi.fn() },
    hamperVariantMapping: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    inventoryLot: { groupBy: vi.fn() },
  },
}))

import { prisma } from '../../lib/prisma'
import {
  calculateAvailabilityMap,
  calculateVariantAvailabilityMap,
  loadAvailabilityInputs,
} from '../../lib/hampers/availabilityBatch'

const mockPrisma = prisma as unknown as {
  hamperRequirement: { findMany: ReturnType<typeof vi.fn> }
  hamperVariant: { findMany: ReturnType<typeof vi.fn> }
  hamperVariantMapping: { findMany: ReturnType<typeof vi.fn> }
  product: { findMany: ReturnType<typeof vi.fn> }
  inventoryLot: { groupBy: ReturnType<typeof vi.fn> }
}

const decimal = (value: string) => ({ toString: () => value })

describe('hamper availability batching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads shared availability inputs in five bounded queries and preserves ordinary and variant availability', async () => {
    mockPrisma.hamperRequirement.findMany.mockResolvedValue([
      { hamperId: 'hamper-1', categoryId: 'category-a', quantity: decimal('2'), isOptional: false },
      { hamperId: 'hamper-1', categoryId: 'category-b', quantity: decimal('1'), isOptional: true },
      { hamperId: 'hamper-2', categoryId: 'category-a', quantity: decimal('1'), isOptional: false },
    ])
    mockPrisma.hamperVariant.findMany.mockResolvedValue([
      {
        id: 'variant-2',
        hamperId: 'hamper-1',
        name: 'Variant B',
        etsySku: null,
        sellingPrice: decimal('12.50'),
        etsyIsEnabled: true,
        indicativeQuantity: null,
      },
      {
        id: 'variant-1',
        hamperId: 'hamper-1',
        name: 'Variant A',
        etsySku: 'A-1',
        sellingPrice: null,
        etsyIsEnabled: false,
        indicativeQuantity: 3,
      },
    ])
    mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([
      { variantId: 'variant-2', categoryId: 'category-a', productId: 'product-2' },
      { variantId: 'variant-2', categoryId: 'category-a', productId: 'product-3' },
    ])
    mockPrisma.product.findMany.mockResolvedValue([
      { id: 'product-1', categoryId: 'category-a' },
      { id: 'product-2', categoryId: 'category-a' },
      { id: 'product-3', categoryId: 'category-a' },
      { id: 'product-4', categoryId: 'category-b' },
    ])
    mockPrisma.inventoryLot.groupBy.mockResolvedValue([
      { productId: 'product-1', _sum: { remaining: decimal('5') } },
      { productId: 'product-2', _sum: { remaining: decimal('3') } },
      { productId: 'product-3', _sum: { remaining: decimal('1') } },
      { productId: 'product-4', _sum: { remaining: decimal('8') } },
    ])

    const inputs = await loadAvailabilityInputs(['hamper-1', 'hamper-2'])

    expect(mockPrisma.hamperRequirement.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperVariant.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperVariantMapping.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.inventoryLot.groupBy).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperRequirement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { hamperId: { in: ['hamper-1', 'hamper-2'] } },
    }))
    expect(mockPrisma.hamperVariant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { hamperId: { in: ['hamper-1', 'hamper-2'] }, isActive: true },
    }))
    expect(mockPrisma.hamperVariantMapping.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { variantId: { in: ['variant-2', 'variant-1'] } },
    }))
    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, categoryId: { in: ['category-a', 'category-b'] } },
    }))
    expect(mockPrisma.inventoryLot.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { productId: { in: ['product-1', 'product-2', 'product-3', 'product-4'] }, remaining: { gt: 0 } },
    }))

    expect(inputs.variants[0]).toMatchObject({ sellingPrice: 12.5 })
    expect(inputs.remainingByProductId.get('product-2')).toBe(3)

    expect(calculateAvailabilityMap(inputs)).toEqual(new Map([
      ['hamper-1', 4],
      ['hamper-2', 9],
    ]))
    expect(calculateVariantAvailabilityMap(inputs)).toEqual(new Map([
      ['hamper-1', [
        {
          variantId: 'variant-1',
          name: 'Variant A',
          etsySku: 'A-1',
          sellingPrice: null,
          etsyIsEnabled: false,
          indicativeQuantity: 3,
          canMake: 4,
        },
        {
          variantId: 'variant-2',
          name: 'Variant B',
          etsySku: null,
          sellingPrice: 12.5,
          etsyIsEnabled: true,
          indicativeQuantity: null,
          canMake: 2,
        },
      ]],
    ]))
  })
})
