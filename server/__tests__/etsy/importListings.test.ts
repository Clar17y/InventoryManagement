import { Prisma } from '@prisma/client'
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

  it('does not update non-variant hamper price when Decimal local price matches Etsy price', async () => {
    const result = await syncExistingHamperFromListing({
      prisma: prisma as any,
      existing: {
        id: 'hamper-1',
        name: 'Luxury Hamper',
        sellingPrice: new Prisma.Decimal('42.00') as any,
        hasVariants: false,
      },
      listingIdStr: '123',
      listingPrice: 42,
      hasVariants: false,
      variants: [],
      inventoryLoaded: false,
    })

    expect(prisma.hamper.update).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      didUpdate: false,
      details: [],
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

  it('does not update variant price when Decimal local price matches Etsy price', async () => {
    prisma.hamperVariant.findMany.mockResolvedValue([
      {
        id: 'variant-1',
        name: 'Blue',
        etsySku: 'BLUE-1',
        etsyProductId: '9001',
        sellingPrice: new Prisma.Decimal('45.00'),
      },
    ])

    const result = await syncExistingHamperFromListing({
      prisma: prisma as any,
      existing: {
        id: 'hamper-1',
        name: 'Baby Hamper',
        sellingPrice: new Prisma.Decimal('40.00') as any,
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

    expect(prisma.hamperVariant.update).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      didUpdate: false,
      details: [],
    })
  })
})
