import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncExistingHamperFromListing } from '../../lib/etsy/importListings'

const prisma = {
  hamper: { update: vi.fn() },
  hamperVariant: {
    findMany: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}

describe('syncExistingHamperFromListing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates non-variant hamper price when Etsy price differs', async () => {
    const existing = {
      id: 'hamper-1',
      name: 'Luxury Hamper',
      sellingPrice: 35,
      hasVariants: false,
    }

    const result = await syncExistingHamperFromListing({
      prisma: prisma as any,
      existing,
      listingIdStr: '123',
      listingPrice: 42,
      hasVariants: false,
      variants: [],
      inventoryLoaded: false,
    })

    expect(prisma.hamper.update).toHaveBeenCalledWith({
      where: { id: 'hamper-1' },
      data: { sellingPrice: 42 },
    })
    expect(result.details).toContainEqual({
      hamper: 'Luxury Hamper',
      action: 'set_price',
      info: 'hamper',
    })
  })

  it('updates variant prices when linked Etsy variant prices differ', async () => {
    prisma.hamperVariant.findMany.mockResolvedValue([
      {
        id: 'variant-1',
        name: 'Blue',
        etsySku: 'BLUE-1',
        etsyProductId: '9001',
        sellingPrice: 40,
      },
    ])

    await syncExistingHamperFromListing({
      prisma: prisma as any,
      existing: {
        id: 'hamper-1',
        name: 'Baby Hamper',
        sellingPrice: 40,
        hasVariants: true,
      },
      listingIdStr: '123',
      listingPrice: 40,
      hasVariants: true,
      inventoryLoaded: true,
      variants: [
        { name: 'Blue', sku: 'BLUE-1', productId: '9001', sellingPrice: 45 },
      ],
    })

    expect(prisma.hamperVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { sellingPrice: 45 },
    })
  })
})
