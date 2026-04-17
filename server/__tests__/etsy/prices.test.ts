import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    hamper: { findUnique: vi.fn(), update: vi.fn() },
    hamperVariant: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('../../lib/etsy/inventoryCache', () => ({
  getListingInventoriesBatched: vi.fn(),
  invalidateListingInventory: vi.fn(),
}))

import { prisma } from '../../lib/prisma'
import { getListingInventoriesBatched, invalidateListingInventory } from '../../lib/etsy/inventoryCache'
import { pullPriceUpdates } from '../../lib/etsy/sync/prices'

const mockPrisma = prisma as unknown as {
  hamper: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  hamperVariant: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}
const mockGetListingInventoriesBatched = vi.mocked(getListingInventoriesBatched)
const mockInvalidateListingInventory = vi.mocked(invalidateListingInventory)

describe('Price Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the hamper price for default rows using the current Etsy inventory price', async () => {
    mockPrisma.hamper.findUnique.mockResolvedValue({ id: 'hamper-1', etsyListingId: '123' })
    mockPrisma.hamper.update.mockResolvedValue({})
    mockGetListingInventoriesBatched.mockResolvedValue(
      new Map([
        [123, {
          listing_id: 123,
          products: [
            {
              product_id: 9001,
              sku: '',
              is_deleted: false,
              offerings: [
                {
                  offering_id: 1,
                  quantity: 1,
                  price: { amount: 4200, divisor: 100, currency_code: 'GBP' },
                  is_enabled: true,
                },
              ],
              property_values: [],
            },
          ],
          price_on_property: [],
          quantity_on_property: [],
          sku_on_property: [],
        }],
      ])
    )

    const result = await pullPriceUpdates([
      { hamperId: 'hamper-1', variantId: 'default:hamper-1' },
    ])

    expect(mockPrisma.hamper.findUnique).toHaveBeenCalledWith({
      where: { id: 'hamper-1' },
      select: { id: true, etsyListingId: true },
    })
    expect(mockInvalidateListingInventory).toHaveBeenCalledWith(123)
    expect(mockPrisma.hamper.update).toHaveBeenCalledWith({
      where: { id: 'hamper-1' },
      data: { sellingPrice: 42 },
    })
    expect(result).toMatchObject({ success: true, updated: 1, errors: 0 })
  })

  it('updates the variant price for linked variants using the current Etsy inventory price', async () => {
    mockPrisma.hamperVariant.findFirst.mockResolvedValue({
      id: 'variant-1',
      etsySku: 'BLUE-1',
      etsyProductId: '9001',
      hamper: { etsyListingId: '123' },
    })
    mockPrisma.hamperVariant.update.mockResolvedValue({})
    mockGetListingInventoriesBatched.mockResolvedValue(
      new Map([
        [123, {
          listing_id: 123,
          products: [
            {
              product_id: 9001,
              sku: 'BLUE-1',
              is_deleted: false,
              offerings: [
                {
                  offering_id: 1,
                  quantity: 1,
                  price: { amount: 5500, divisor: 100, currency_code: 'GBP' },
                  is_enabled: true,
                },
              ],
              property_values: [],
            },
          ],
          price_on_property: [],
          quantity_on_property: [],
          sku_on_property: [],
        }],
      ])
    )

    const result = await pullPriceUpdates([
      { hamperId: 'hamper-1', variantId: 'variant-1' },
    ])

    expect(mockPrisma.hamperVariant.findFirst).toHaveBeenCalledWith({
      where: { id: 'variant-1', hamperId: 'hamper-1' },
      select: {
        id: true,
        etsySku: true,
        etsyProductId: true,
        hamper: {
          select: { etsyListingId: true },
        },
      },
    })
    expect(mockPrisma.hamperVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { sellingPrice: 55 },
    })
    expect(result).toMatchObject({ success: true, updated: 1, errors: 0 })
  })
})
