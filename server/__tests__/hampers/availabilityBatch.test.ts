import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    hamperRequirement: { findMany: vi.fn() },
    hamperVariant: { findMany: vi.fn() },
    hamperVariantMapping: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    inventoryLot: { groupBy: vi.fn() },
    $queryRaw: vi.fn(),
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
  $queryRaw: ReturnType<typeof vi.fn>
}

const decimal = (value: string) => ({ toString: () => value })

function toParameterizedSql(statement: { strings: readonly string[]; values: readonly unknown[] }) {
  return statement.strings.reduce(
    (sql, chunk, index) => sql + chunk + (index < statement.values.length ? `$${index + 1}` : ''),
    '',
  )
}

describe('hamper availability batching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates ordinary category stock in SQL and only loads mapped variant products', async () => {
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
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Product" (
          "id" TEXT PRIMARY KEY,
          "categoryId" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL
        );
        CREATE TABLE "InventoryLot" (
          "id" TEXT PRIMARY KEY,
          "productId" TEXT NOT NULL,
          "remaining" NUMERIC NOT NULL
        );
        INSERT INTO "Product" ("id", "categoryId", "isActive") VALUES
          ('product-1', 'category-a', TRUE),
          ('product-2', 'category-a', TRUE),
          ('product-3', 'category-a', TRUE),
          ('product-4', 'category-b', TRUE),
          ('inactive-product', 'category-a', FALSE);
        INSERT INTO "InventoryLot" ("id", "productId", "remaining") VALUES
          ('lot-1', 'product-1', 5),
          ('lot-2', 'product-2', 3),
          ('lot-3', 'product-3', 1),
          ('lot-4', 'product-4', 8),
          ('lot-inactive', 'inactive-product', 100);
      `)
      mockPrisma.$queryRaw.mockImplementation(async (statement: { strings: readonly string[]; values: readonly unknown[] }) => {
        const result = await db.query(
          toParameterizedSql(statement),
          statement.values as unknown[],
        )
        return result.rows
      })

      const inputs = await loadAvailabilityInputs(['hamper-1', 'hamper-2'])

      expect(mockPrisma.hamperRequirement.findMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.hamperVariant.findMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.hamperVariantMapping.findMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.product.findMany).not.toHaveBeenCalled()
      expect(mockPrisma.inventoryLot.groupBy).not.toHaveBeenCalled()
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2)

      const [categoryStockQuery, mappedStockQuery] = mockPrisma.$queryRaw.mock.calls.map(
        ([statement]) => statement as { strings: readonly string[]; values: readonly unknown[] },
      )
      expect(categoryStockQuery.strings.join(' ')).toContain('GROUP BY p."categoryId"')
      expect(categoryStockQuery.strings.join(' ')).toContain('p."categoryId" IN')
      expect(categoryStockQuery.values).toEqual(expect.arrayContaining(['category-a', 'category-b']))
      expect(mappedStockQuery.strings.join(' ')).toContain('GROUP BY p."id"')
      expect(mappedStockQuery.strings.join(' ')).toContain('p."id" IN')
      expect(mappedStockQuery.values).toEqual(expect.arrayContaining(['product-2', 'product-3']))
      expect(mappedStockQuery.values).not.toEqual(expect.arrayContaining(['product-1', 'product-4']))

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
    } finally {
      await db.close()
    }
  })
})
