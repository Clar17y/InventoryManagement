import { createServer, type Server } from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    hamper: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    hamperRequirement: { findMany: vi.fn() },
    hamperVariant: { findMany: vi.fn() },
    hamperVariantMapping: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    inventoryLot: { groupBy: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '../../lib/prisma'
import hampersRouter from '../../features/hampers/router'
import { buildAvailabilitySortSql, listHampers } from '../../lib/hampers/list'

const mockPrisma = prisma as unknown as {
  hamper: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
  }
  hamperRequirement: { findMany: ReturnType<typeof vi.fn> }
  hamperVariant: { findMany: ReturnType<typeof vi.fn> }
  hamperVariantMapping: { findMany: ReturnType<typeof vi.fn> }
  product: { findMany: ReturnType<typeof vi.fn> }
  inventoryLot: { groupBy: ReturnType<typeof vi.fn> }
  $queryRaw: ReturnType<typeof vi.fn>
}

const hamper = {
  id: 'hamper-1', name: 'Chocolate Hamper', sellingPrice: 30, etsyListingId: null,
  etsyIsEnabled: true, indicativeQuantity: null, hasVariants: true, isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  requirements: [],
}
let activeServer: Server | null = null

function toParameterizedSql(statement: { strings: readonly string[]; values: readonly unknown[] }) {
  return statement.strings.reduce(
    (sql, chunk, index) => sql + chunk + (index < statement.values.length ? `$${index + 1}` : ''),
    '',
  )
}

async function startServer(): Promise<string> {
  const app = express()
  app.use(express.json())
  app.use('/api/hampers', hampersRouter)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not start')
  activeServer = server
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  if (!activeServer) return
  await new Promise<void>((resolve, reject) => activeServer!.close((error) => error ? reject(error) : resolve()))
  activeServer = null
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.hamper.findMany.mockResolvedValue([hamper])
  mockPrisma.hamper.count.mockResolvedValue(51)
  mockPrisma.$queryRaw.mockResolvedValue([{ id: hamper.id, totalItems: 51 }])
  mockPrisma.hamperRequirement.findMany.mockResolvedValue([])
  mockPrisma.hamperVariant.findMany.mockResolvedValue([])
  mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([])
  mockPrisma.product.findMany.mockResolvedValue([])
  mockPrisma.inventoryLot.groupBy.mockResolvedValue([])
})

describe('hampers pagination router', () => {
  it('keeps list and availability query counts fixed when the page grows', async () => {
    const fixture = Array.from({ length: 100 }, (_, index) => ({
      ...hamper,
      id: `hamper-${index + 1}`,
      name: `Hamper ${index + 1}`,
      hasVariants: false,
    }))

    const run = async (pageSize: 25 | 100) => {
      vi.clearAllMocks()
      mockPrisma.hamper.findMany.mockImplementation(async (args: { skip?: number; take?: number; where?: { id?: { in?: string[] } } }) => {
        if (args.skip !== undefined) return fixture.slice(args.skip, args.skip + (args.take ?? 0))
        const ids = args.where?.id?.in
        return ids ? fixture.filter((row) => ids.includes(row.id)) : fixture
      })
      mockPrisma.hamper.count.mockResolvedValue(fixture.length)
      mockPrisma.hamperRequirement.findMany.mockResolvedValue([])
      mockPrisma.hamperVariant.findMany.mockResolvedValue([])
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([])
      mockPrisma.product.findMany.mockResolvedValue([])
      mockPrisma.inventoryLot.groupBy.mockResolvedValue([])

      const result = await listHampers({
        page: 1,
        pageSize,
        hideEtsyHidden: false,
        sort: 'name-asc',
      })

      return {
        itemCount: result.items.length,
        totalItems: result.totalItems,
        calls: {
          hamperFindMany: mockPrisma.hamper.findMany.mock.calls.length,
          count: mockPrisma.hamper.count.mock.calls.length,
          requirements: mockPrisma.hamperRequirement.findMany.mock.calls.length,
          variants: mockPrisma.hamperVariant.findMany.mock.calls.length,
          mappings: mockPrisma.hamperVariantMapping.findMany.mock.calls.length,
          products: mockPrisma.product.findMany.mock.calls.length,
          lots: mockPrisma.inventoryLot.groupBy.mock.calls.length,
          availabilityAggregates: mockPrisma.$queryRaw.mock.calls.length,
        },
      }
    }

    await expect(run(25)).resolves.toEqual({
      itemCount: 25,
      totalItems: 100,
      calls: {
        hamperFindMany: 1,
        count: 1,
        requirements: 1,
        variants: 1,
        mappings: 1,
        products: 0,
        lots: 0,
        availabilityAggregates: 0,
      },
    })
    await expect(run(100)).resolves.toEqual({
      itemCount: 100,
      totalItems: 100,
      calls: {
        hamperFindMany: 1,
        count: 1,
        requirements: 1,
        variants: 1,
        mappings: 1,
        products: 0,
        lots: 0,
        availabilityAggregates: 0,
      },
    })
  })

  it('executes the computed availability CTE with global ordering, visibility, and total metadata', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Hamper" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL,
          "etsyIsEnabled" BOOLEAN NOT NULL,
          "hasVariants" BOOLEAN NOT NULL
        );
        CREATE TABLE "HamperVariant" (
          "id" TEXT PRIMARY KEY,
          "hamperId" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL,
          "etsyIsEnabled" BOOLEAN NOT NULL
        );
        CREATE TABLE "HamperRequirement" (
          "id" TEXT PRIMARY KEY,
          "hamperId" TEXT NOT NULL,
          "categoryId" TEXT NOT NULL,
          "quantity" NUMERIC NOT NULL,
          "isOptional" BOOLEAN NOT NULL
        );
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
        INSERT INTO "Hamper" ("id", "name", "isActive", "etsyIsEnabled", "hasVariants") VALUES
          ('h1', 'Tea Ordinary', TRUE, TRUE, FALSE),
          ('h2', 'Tea Disabled', TRUE, FALSE, FALSE),
          ('h3', 'Tea Variant', TRUE, TRUE, TRUE),
          ('h4', 'Tea Hidden Variant', TRUE, TRUE, TRUE),
          ('h5', 'Tea Secondary', TRUE, TRUE, FALSE);
        INSERT INTO "HamperVariant" ("id", "hamperId", "isActive", "etsyIsEnabled") VALUES
          ('v3', 'h3', TRUE, TRUE),
          ('v4', 'h4', TRUE, FALSE);
        INSERT INTO "HamperRequirement" ("id", "hamperId", "categoryId", "quantity", "isOptional") VALUES
          ('r1', 'h1', 'category-a', 2, FALSE),
          ('r3', 'h3', 'category-b', 1, FALSE),
          ('r4', 'h4', 'category-c', 1, FALSE),
          ('r5', 'h5', 'category-a', 3, FALSE);
        INSERT INTO "Product" ("id", "categoryId", "isActive") VALUES
          ('p1', 'category-a', TRUE),
          ('p2', 'category-b', TRUE),
          ('p3', 'category-c', TRUE);
        INSERT INTO "InventoryLot" ("id", "productId", "remaining") VALUES
          ('l1', 'p1', 8),
          ('l2', 'p2', 6),
          ('l3', 'p3', 100);
      `)

      const execute = async (offset: number) => {
        const statement = buildAvailabilitySortSql({
          page: 1,
          pageSize: 25,
          search: 'Tea',
          hideEtsyHidden: true,
          sort: 'canmake-desc',
        }, offset, 1)
        const result = await db.query<{ id: string; totalItems: number | string }>(
          toParameterizedSql(statement),
          statement.values as unknown[],
        )
        return result.rows
      }

      await expect(execute(0)).resolves.toEqual([{ id: 'h3', totalItems: 3 }])
      await expect(execute(1)).resolves.toEqual([{ id: 'h1', totalItems: 3 }])
      await expect(execute(2)).resolves.toEqual([{ id: 'h5', totalItems: 3 }])
    } finally {
      await db.close()
    }
  })

  const prismaSorts = [
    ['name-asc', [{ name: 'asc' }, { id: 'asc' }]],
    ['name-desc', [{ name: 'desc' }, { id: 'desc' }]],
    ['price-asc', [{ sellingPrice: 'asc' }, { id: 'asc' }]],
    ['price-desc', [{ sellingPrice: 'desc' }, { id: 'desc' }]],
    ['reqs-asc', [{ requirements: { _count: 'asc' } }, { id: 'asc' }]],
    ['reqs-desc', [{ requirements: { _count: 'desc' } }, { id: 'desc' }]],
    ['date-desc', [{ createdAt: 'desc' }, { id: 'desc' }]],
    ['date-asc', [{ createdAt: 'asc' }, { id: 'asc' }]],
  ] as const

  it.each(prismaSorts)('uses a bounded deterministic page for %s', async (sort, orderBy) => {
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/hampers?page=2&pageSize=25&sort=${sort}`)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, totalItems: 51, totalPages: 3 })
    expect(mockPrisma.hamper.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 25, take: 25, orderBy })
    expect(mockPrisma.hamper.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamper.count).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperRequirement.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperVariant.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperVariantMapping.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.inventoryLot.groupBy).not.toHaveBeenCalled()
  })

  it.each(['canmake-desc', 'canmake-asc'] as const)(
    'selects the global %s page in parameterized SQL before bounded hydration',
    async (sort) => {
      const baseUrl = await startServer()
      const response = await fetch(`${baseUrl}/api/hampers?page=3&pageSize=25&search=tea&hideEtsyHidden=false&sort=${sort}`)
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(1)
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1)
      const sql = mockPrisma.$queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] }
      expect(sql.strings.join(' ')).toContain('ORDER BY "canMake"')
      expect(sql.strings.join(' ')).toContain('LIMIT')
      expect(sql.strings.join(' ')).toContain('GROUP BY r."id"')
      expect(sql.values).toEqual(expect.arrayContaining(['%tea%', 25, 50]))
      expect(mockPrisma.hamper.findMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.hamper.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: [hamper.id] }, isActive: true },
      }))
    },
  )

  it('uses the availability window total without a redundant count on a non-empty page', async () => {
    mockPrisma.hamper.count.mockResolvedValue(999)
    mockPrisma.$queryRaw.mockResolvedValue([{ id: hamper.id, totalItems: 51 }])

    const result = await listHampers({
      page: 1,
      pageSize: 25,
      hideEtsyHidden: false,
      sort: 'canmake-desc',
    })

    expect(result.items).toHaveLength(1)
    expect(result.totalItems).toBe(51)
    expect(mockPrisma.hamper.count).not.toHaveBeenCalled()
  })

  it('falls back to a count when an availability page is empty', async () => {
    mockPrisma.hamper.count.mockResolvedValue(51)
    mockPrisma.$queryRaw.mockResolvedValue([])

    const result = await listHampers({
      page: 3,
      pageSize: 25,
      hideEtsyHidden: false,
      sort: 'canmake-desc',
    })

    expect(result.items).toEqual([])
    expect(result.totalItems).toBe(51)
    expect(mockPrisma.hamper.count).toHaveBeenCalledTimes(1)
  })

  it('applies search and exact Etsy visibility semantics to totals and variant summaries', async () => {
    mockPrisma.hamperVariant.findMany.mockResolvedValue([
      { id: 'visible', hamperId: hamper.id, name: 'Visible', etsySku: null, sellingPrice: null, etsyIsEnabled: true, indicativeQuantity: null },
      { id: 'hidden', hamperId: hamper.id, name: 'Hidden', etsySku: null, sellingPrice: null, etsyIsEnabled: false, indicativeQuantity: null },
    ])
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/hampers?page=1&pageSize=25&search=choc&hideEtsyHidden=true&sort=name-asc`)
    const body = await response.json()
    const expectedWhere = {
      isActive: true,
      etsyIsEnabled: true,
      name: { contains: 'choc', mode: 'insensitive' },
      OR: [
        { hasVariants: false },
        { variants: { some: { isActive: true, etsyIsEnabled: true } } },
      ],
    }
    expect(mockPrisma.hamper.count).toHaveBeenCalledWith({ where: expectedWhere })
    expect(mockPrisma.hamper.findMany.mock.calls[0]?.[0]).toMatchObject({ where: expectedWhere })
    expect(body.items[0].variantAvailability).toEqual([
      expect.objectContaining({ variantId: 'visible', etsyIsEnabled: true }),
    ])
  })

  it('reuses the rich Hamper graph for shared ordinary and variant availability', async () => {
    mockPrisma.hamper.findUnique.mockResolvedValue({
      ...hamper,
      requirements: [
        {
          id: 'requirement-1',
          hamperId: hamper.id,
          categoryId: 'category-1',
          quantity: 2,
          isOptional: false,
          category: {
            id: 'category-1',
            name: 'Chocolate',
            products: [{ id: 'product-1', lots: [{ remaining: 5, unitCost: 1 }] }],
          },
        },
        {
          id: 'requirement-2',
          hamperId: hamper.id,
          categoryId: 'category-2',
          quantity: 1,
          isOptional: true,
          category: {
            id: 'category-2',
            name: 'Tea',
            products: [{ id: 'product-2', lots: [{ remaining: 3, unitCost: 2 }] }],
          },
        },
      ],
      variants: [
        {
          id: 'variant-1', hamperId: hamper.id, name: 'Mapped', etsySku: null,
          sellingPrice: null, etsyIsEnabled: true, indicativeQuantity: null,
          mappings: [{
            categoryId: 'category-2', productId: 'product-2', priority: 0,
            category: { id: 'category-2', name: 'Tea' },
            product: { id: 'product-2', name: 'Tea Product', lots: [{ remaining: 3 }] },
          }],
        },
        {
          id: 'variant-2', hamperId: hamper.id, name: 'Fallback', etsySku: null,
          sellingPrice: null, etsyIsEnabled: true, indicativeQuantity: null, mappings: [],
        },
      ],
    })
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/hampers/${hamper.id}`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.canMake).toBe(2)
    expect(body.variantAvailability).toEqual([
      expect.objectContaining({ variantId: 'variant-1', canMake: 2 }),
      expect.objectContaining({ variantId: 'variant-2', canMake: 2 }),
    ])
    expect(mockPrisma.hamper.findUnique).toHaveBeenCalledTimes(1)
    expect(mockPrisma.hamperRequirement.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.hamperVariant.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.hamperVariantMapping.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.inventoryLot.groupBy).not.toHaveBeenCalled()
  })

  it('rejects unsupported page sizes before loading data', async () => {
    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/api/hampers?page=1&pageSize=101`)
    expect(response.status).toBe(400)
    expect(mockPrisma.hamper.findMany).not.toHaveBeenCalled()
  })
})
