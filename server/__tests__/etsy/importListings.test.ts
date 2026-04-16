import { Prisma } from '@prisma/client'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncExistingHamperFromListing, type SyncExistingHamperArgs } from '../../lib/etsy/importListings'

const prisma = {
  hamper: { update: vi.fn() },
  hamperVariant: {
    findMany: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}
const prismaClient = prisma as unknown as SyncExistingHamperArgs['prisma']

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
      prisma: prismaClient,
      existing,
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
      prisma: prismaClient,
      existing: {
        id: 'hamper-1',
        name: 'Luxury Hamper',
        sellingPrice: new Prisma.Decimal('42.00') as any,
        hasVariants: false,
      },
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
      prisma: prismaClient,
      existing: {
        id: 'hamper-1',
        name: 'Baby Hamper',
        sellingPrice: 40,
        hasVariants: true,
      },
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
      prisma: prismaClient,
      existing: {
        id: 'hamper-1',
        name: 'Baby Hamper',
        sellingPrice: new Prisma.Decimal('40.00') as any,
        hasVariants: true,
      },
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

  it('refreshes Etsy-linked fields when relinking an existing variant after create conflict', async () => {
    prisma.hamperVariant.findMany.mockResolvedValue([])
    prisma.hamperVariant.create.mockRejectedValue(new Error('Unique constraint failed'))
    prisma.hamperVariant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'variant-2',
        hamperId: 'old-hamper',
        name: 'Old Name',
        sellingPrice: 30,
        etsySku: 'OLD-SKU',
        etsyProductId: 'OLD-PRODUCT',
        isActive: false,
      })

    const result = await syncExistingHamperFromListing({
      prisma: prismaClient,
      existing: {
        id: 'hamper-1',
        name: 'Baby Hamper',
        sellingPrice: 40,
        hasVariants: true,
      },
      listingPrice: 40,
      hasVariants: true,
      inventoryLoaded: true,
      variants: [
        {
          name: 'Fresh Name',
          sku: 'FRESH-SKU',
          productId: '9002',
          sellingPrice: 55,
        },
      ],
    })

    expect(prisma.hamperVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-2' },
      data: {
        hamperId: 'hamper-1',
        name: 'Fresh Name',
        sellingPrice: 55,
        etsySku: 'FRESH-SKU',
        etsyProductId: '9002',
        isActive: true,
      },
    })
    expect(result).toMatchObject({
      didUpdate: true,
      details: [
        {
          hamper: 'Baby Hamper',
          action: 'relinked_variant',
          variant: 'Fresh Name',
        },
      ],
    })
  })

  it('retires orphaned Etsy-linked variants before refreshing the matched local variant', async () => {
    prisma.hamperVariant.findMany.mockResolvedValue([
      {
        id: 'variant-1',
        name: 'Blue',
        etsySku: null,
        etsyProductId: null,
        sellingPrice: 40,
      },
    ])
    prisma.hamperVariant.findFirst.mockImplementation(async ({ where }: { where?: { etsySku?: string; etsyProductId?: string } }) => {
      if (where?.etsyProductId === '9001' || where?.etsySku === 'BLUE-1') {
        return {
          id: 'variant-2',
          hamperId: 'old-hamper',
          name: 'Blue',
          etsySku: 'BLUE-1',
          etsyProductId: '9001',
          sellingPrice: 30,
          isActive: true,
        }
      }

      return null
    })

    const result = await syncExistingHamperFromListing({
      prisma: prismaClient,
      existing: {
        id: 'hamper-1',
        name: 'Baby Hamper',
        sellingPrice: 40,
        hasVariants: true,
      },
      listingPrice: 40,
      hasVariants: true,
      inventoryLoaded: true,
      variants: [
        {
          name: 'Blue',
          sku: 'BLUE-1',
          productId: '9001',
          sellingPrice: 45,
        },
      ],
    })

    expect(prisma.hamperVariant.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'variant-2' },
      data: {
        etsySku: null,
        etsyProductId: null,
        isActive: false,
      },
    })
    expect(prisma.hamperVariant.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'variant-1' },
      data: {
        etsySku: 'BLUE-1',
        etsyProductId: '9001',
        sellingPrice: 45,
      },
    })
    expect(result.didUpdate).toBe(true)
    expect(result.details).toEqual(expect.arrayContaining([
      {
        hamper: 'Baby Hamper',
        action: 'relinked_variant',
        variant: 'Blue',
      },
    ]))
  })
})
