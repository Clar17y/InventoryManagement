import { Prisma } from '@prisma/client'
import { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listInventoryProducts } from '../../lib/inventory/productList'
import type { InventoryProductsQuery } from '#contracts/routes/inventory'

const categoryId = `c${'1'.repeat(24)}`

function product(id: string, name: string, unit = 'units') {
  return {
    id,
    name,
    categoryId,
    unit,
    lowStockThreshold: 5,
    isActive: true,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    category: {
      id: categoryId,
      name: 'Chocolate',
      description: null,
      pickRule: 'FIFO',
      isActive: true,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    },
    lots: [{ remaining: new Prisma.Decimal(3) }],
    costs: [{ unitCost: new Prisma.Decimal(1.25) }],
  }
}

function sqlText(query: Prisma.Sql): string {
  return query.sql.replace(/\s+/g, ' ').trim()
}

function toParameterizedSql(statement: { strings: readonly string[]; values: readonly unknown[] }) {
  return statement.strings.reduce(
    (sql, chunk, index) => sql + chunk + (index < statement.values.length ? `$${index + 1}` : ''),
    '',
  )
}

describe('listInventoryProducts', () => {
  const queryRaw = vi.fn()
  const findMany = vi.fn()
  const db = {
    $queryRaw: queryRaw,
    product: { findMany },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['category', 'c."name" ASC, stock.name ASC, stock.id ASC'],
    ['stock-desc', 'stock.remaining DESC, stock.id DESC'],
    ['stock-asc', 'stock.remaining ASC, stock.id ASC'],
    ['name-asc', 'stock.name ASC, stock.id ASC'],
    ['name-desc', 'stock.name DESC, stock.id DESC'],
    ['cost-asc', 'stock."currentCost" ASC NULLS LAST, stock.id ASC'],
    ['cost-desc', 'stock."currentCost" DESC NULLS LAST, stock.id DESC'],
    ['newest', 'stock."createdAt" DESC, stock.id DESC'],
    ['oldest', 'stock."createdAt" ASC, stock.id ASC'],
  ] satisfies Array<[InventoryProductsQuery['sort'], string]>)('uses the fixed %s ordering fragment', async (sort, expectedOrder) => {
    queryRaw.mockResolvedValue([])
    await listInventoryProducts(db, { page: 1, pageSize: 25, lowStockOnly: false, sort })

    const pageQuery = queryRaw.mock.calls[0]![0] as Prisma.Sql
    expect(sqlText(pageQuery)).toContain(`ORDER BY ${expectedOrder}`)
  })

  it('applies search, category, and low-stock predicates before page limit and count', async () => {
    queryRaw.mockResolvedValue([])

    await listInventoryProducts(db, {
      page: 2,
      pageSize: 25,
      categoryId,
      search: 'dark',
      lowStockOnly: true,
      sort: 'category',
    })

    expect(queryRaw).toHaveBeenCalledTimes(2)
    for (const [rawQuery] of queryRaw.mock.calls) {
      const query = rawQuery as Prisma.Sql
      const text = sqlText(query)
      expect(text).toContain('p."categoryId" =')
      expect(text).toContain('p.name ILIKE')
      expect(text).toContain('c.name ILIKE')
      expect(text).toContain('stock."lowStockThreshold" > 0')
      if (text.includes('SELECT stock.id')) {
        expect(text.indexOf('stock."lowStockThreshold" > 0')).toBeLessThan(text.lastIndexOf('LIMIT'))
      } else {
        expect(text).not.toContain('OFFSET')
      }
      expect(query.values).toContain(categoryId)
      expect(query.values).toContain('%dark%')
    }
  })

  it('hydrates one page in one query and restores the SQL-selected ID order', async () => {
    const firstId = `c${'2'.repeat(24)}`
    const secondId = `c${'3'.repeat(24)}`
    queryRaw.mockResolvedValue([
      { id: firstId, remaining: 3, lotCount: 1, currentCost: 1.25, totalItems: 52 },
      { id: secondId, remaining: 3, lotCount: 1, currentCost: 1.25, totalItems: 52 },
    ])
    findMany.mockResolvedValue([
      product(secondId, 'Second'),
      product(firstId, 'First'),
    ])

    const response = await listInventoryProducts(db, {
      page: 2,
      pageSize: 25,
      lowStockOnly: false,
      sort: 'stock-desc',
    })

    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [firstId, secondId] } },
    }))
    expect(response.items.map((item) => item.id)).toEqual([firstId, secondId])
    expect(response.items[0]).toMatchObject({
      totalStock: 3,
      totalRemaining: 3,
      lotCount: 1,
      currentCost: 1.25,
    })
    expect(response.pagination).toEqual({
      page: 2,
      pageSize: 25,
      totalItems: 52,
      totalPages: 3,
    })
  })

  it('returns full filtered-result stock totals instead of the current page subtotal', async () => {
    const firstId = `c${'2'.repeat(24)}`
    const secondId = `c${'3'.repeat(24)}`
    queryRaw.mockResolvedValue([
      {
        id: firstId,
        remaining: 4,
        lotCount: 2,
        currentCost: 1.25,
        totalItems: 52,
        totalUnitItems: 17,
        totalLots: 9,
      },
      {
        id: secondId,
        remaining: 3,
        lotCount: 1,
        currentCost: 2.5,
        totalItems: 52,
        totalUnitItems: 17,
        totalLots: 9,
      },
    ])
    findMany.mockResolvedValue([
      product(firstId, 'Units'),
      product(secondId, 'Bulk', 'boxes'),
    ])

    const response = await listInventoryProducts(db, {
      page: 2,
      pageSize: 25,
      lowStockOnly: false,
      sort: 'category',
    })

    expect(response.items.map((item) => item.totalRemaining)).toEqual([4, 3])
    expect(response).toMatchObject({
      totals: { totalUnitItems: 17, totalLots: 9 },
    })
  })

  it('returns aggregate totals produced by the active filter', async () => {
    const productId = `c${'4'.repeat(24)}`
    queryRaw.mockImplementation(async (statement: Prisma.Sql) => {
      const text = sqlText(statement)
      if (text.includes('SELECT stock.id')) {
        const lowStockOnly = text.includes('stock."lowStockThreshold" > 0')
        return [{
          id: productId,
          remaining: lowStockOnly ? 2 : 20,
          lotCount: 1,
          currentCost: 1.25,
          totalItems: lowStockOnly ? 1 : 2,
          totalUnitItems: lowStockOnly ? 2 : 25,
          totalLots: lowStockOnly ? 1 : 4,
        }]
      }
      return []
    })
    findMany.mockResolvedValue([product(productId, 'Filtered')])

    const unfiltered = await listInventoryProducts(db, {
      page: 1,
      pageSize: 25,
      lowStockOnly: false,
      sort: 'stock-desc',
    })
    const lowStock = await listInventoryProducts(db, {
      page: 1,
      pageSize: 25,
      lowStockOnly: true,
      sort: 'stock-desc',
    })

    expect(unfiltered).toMatchObject({ totals: { totalUnitItems: 25, totalLots: 4 } })
    expect(lowStock).toMatchObject({ totals: { totalUnitItems: 2, totalLots: 1 } })
  })

  it('uses a count-only query for an empty out-of-range page with a fixed Prisma call count', async () => {
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      totalItems: 51,
      totalUnitItems: 0,
      totalLots: 0,
    }])

    const response = await listInventoryProducts(db, {
      page: 99,
      pageSize: 100,
      lowStockOnly: false,
      sort: 'oldest',
    })

    expect(queryRaw).toHaveBeenCalledTimes(2)
    expect(findMany).not.toHaveBeenCalled()
    expect(sqlText(queryRaw.mock.calls[1]![0] as Prisma.Sql)).not.toContain('OFFSET')
    expect(response).toEqual({
      items: [],
      pagination: { page: 99, pageSize: 100, totalItems: 51, totalPages: 1 },
      totals: { totalUnitItems: 0, totalLots: 0 },
    })
  })

  it('includes active products with no positive lots in both unfiltered and low-stock pages', async () => {
    const pglite = new PGlite()
    try {
      await pglite.exec(`
        CREATE TABLE "ComponentCategory" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "pickRule" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL,
          "createdAt" TIMESTAMP NOT NULL,
          "updatedAt" TIMESTAMP NOT NULL
        );
        CREATE TABLE "Product" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "unit" TEXT NOT NULL,
          "categoryId" TEXT NOT NULL,
          "lowStockThreshold" INTEGER NOT NULL,
          "isActive" BOOLEAN NOT NULL,
          "createdAt" TIMESTAMP NOT NULL,
          "updatedAt" TIMESTAMP NOT NULL
        );
        CREATE TABLE "InventoryLot" (
          "id" TEXT PRIMARY KEY,
          "productId" TEXT NOT NULL,
          "remaining" NUMERIC NOT NULL
        );
        CREATE TABLE "ProductCost" (
          "id" TEXT PRIMARY KEY,
          "productId" TEXT NOT NULL,
          "unitCost" NUMERIC NOT NULL,
          "effectiveFrom" TIMESTAMP NOT NULL,
          "effectiveTo" TIMESTAMP
        );
        INSERT INTO "ComponentCategory" ("id", "name", "description", "pickRule", "isActive", "createdAt", "updatedAt")
        VALUES ('${categoryId}', 'Chocolate', NULL, 'FIFO', TRUE, '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z');
        INSERT INTO "Product" ("id", "name", "unit", "categoryId", "lowStockThreshold", "isActive", "createdAt", "updatedAt")
        VALUES ('zero-stock', 'No stock', 'units', '${categoryId}', 5, TRUE, '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z');
      `)

      const emptyProduct = { ...product('zero-stock', 'No stock'), lots: [], costs: [] }
      const queryRaw = vi.fn(async (statement: Prisma.Sql) => {
        const result = await pglite.query(
          toParameterizedSql(statement),
          statement.values as unknown[],
        )
        return result.rows
      })
      const findMany = vi.fn().mockResolvedValue([emptyProduct])
      const db = { $queryRaw: queryRaw, product: { findMany } } as Parameters<typeof listInventoryProducts>[0]

      const unfiltered = await listInventoryProducts(db, {
        page: 1,
        pageSize: 25,
        lowStockOnly: false,
        sort: 'stock-asc',
      })
      const lowStock = await listInventoryProducts(db, {
        page: 1,
        pageSize: 25,
        lowStockOnly: true,
        sort: 'stock-asc',
      })

      for (const response of [unfiltered, lowStock]) {
        expect(response.items).toHaveLength(1)
        expect(response.items[0]).toMatchObject({
          id: 'zero-stock',
          totalStock: 0,
          totalRemaining: 0,
          lotCount: 0,
          currentCost: null,
        })
        expect(response.pagination).toMatchObject({ totalItems: 1, totalPages: 1 })
        expect(response).toMatchObject({ totals: { totalUnitItems: 0, totalLots: 0 } })
      }
      expect(queryRaw).toHaveBeenCalledTimes(2)
      expect(findMany).toHaveBeenCalledTimes(2)
    } finally {
      await pglite.close()
    }
  })

  it('uses CTE stock projections and scalar-only hydration for a 100-product page', async () => {
    const pglite = new PGlite()
    try {
      const productRows = Array.from({ length: 100 }, (_, index) => {
        const id = `p${String(index + 1).padStart(24, '0')}`
        return `('${id}', 'Product ${index + 1}', 'units', '${categoryId}', 5, TRUE, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z')`
      }).join(',\n')
      const lotRows = Array.from({ length: 100 }, (_, index) => {
        const productId = `p${String(index + 1).padStart(24, '0')}`
        return `('lot-a-${index}', '${productId}', 1), ('lot-b-${index}', '${productId}', 2)`
      }).join(',\n')
      const costRows = Array.from({ length: 100 }, (_, index) => {
        const productId = `p${String(index + 1).padStart(24, '0')}`
        return `('cost-${index}', '${productId}', 4.5, '2000-01-01T00:00:00Z', NULL)`
      }).join(',\n')

      await pglite.exec(`
        CREATE TABLE "ComponentCategory" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "pickRule" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL,
          "createdAt" TIMESTAMP NOT NULL,
          "updatedAt" TIMESTAMP NOT NULL
        );
        CREATE TABLE "Product" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "unit" TEXT NOT NULL,
          "categoryId" TEXT NOT NULL,
          "lowStockThreshold" INTEGER NOT NULL,
          "isActive" BOOLEAN NOT NULL,
          "createdAt" TIMESTAMP NOT NULL,
          "updatedAt" TIMESTAMP NOT NULL
        );
        CREATE TABLE "InventoryLot" (
          "id" TEXT PRIMARY KEY,
          "productId" TEXT NOT NULL,
          "remaining" NUMERIC NOT NULL
        );
        CREATE TABLE "ProductCost" (
          "id" TEXT PRIMARY KEY,
          "productId" TEXT NOT NULL,
          "unitCost" NUMERIC NOT NULL,
          "effectiveFrom" TIMESTAMP NOT NULL,
          "effectiveTo" TIMESTAMP
        );
        INSERT INTO "ComponentCategory" ("id", "name", "description", "pickRule", "isActive", "createdAt", "updatedAt")
        VALUES ('${categoryId}', 'Chocolate', NULL, 'FIFO', TRUE, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z');
        INSERT INTO "Product" ("id", "name", "unit", "categoryId", "lowStockThreshold", "isActive", "createdAt", "updatedAt")
        VALUES ${productRows};
        INSERT INTO "InventoryLot" ("id", "productId", "remaining")
        VALUES ${lotRows};
        INSERT INTO "ProductCost" ("id", "productId", "unitCost", "effectiveFrom", "effectiveTo")
        VALUES ${costRows};
      `)

      const hydratedProducts = Array.from({ length: 100 }, (_, index) => {
        const id = `p${String(index + 1).padStart(24, '0')}`
        return {
          ...product(id, `Product ${index + 1}`),
          lots: [{ remaining: new Prisma.Decimal(999) }],
          costs: [{ unitCost: new Prisma.Decimal(999) }],
        }
      }).reverse()
      const queryRaw = vi.fn(async (statement: Prisma.Sql) => {
        const result = await pglite.query(
          toParameterizedSql(statement),
          statement.values as unknown[],
        )
        return result.rows
      })
      const findMany = vi.fn().mockResolvedValue(hydratedProducts)
      const db = { $queryRaw: queryRaw, product: { findMany } } as Parameters<typeof listInventoryProducts>[0]

      const response = await listInventoryProducts(db, {
        page: 1,
        pageSize: 100,
        lowStockOnly: false,
        sort: 'name-asc',
      })

      expect(findMany).toHaveBeenCalledTimes(1)
      const findManyArgs = findMany.mock.calls[0]![0]
      expect(findManyArgs).not.toHaveProperty('include')
      expect(findManyArgs).toHaveProperty('select')
      expect(findManyArgs.select).not.toHaveProperty('lots')
      expect(findManyArgs.select).not.toHaveProperty('costs')
      expect(findManyArgs.select).toHaveProperty('category')
      expect(findManyArgs.where.id.in).toHaveLength(100)

      expect(response.items).toHaveLength(100)
      expect(response.items.every((item) => (
        item.totalRemaining === 3
        && item.totalStock === 3
        && item.lotCount === 2
        && item.currentCost === 4.5
      ))).toBe(true)
      expect(response.totals).toEqual({ totalUnitItems: 300, totalLots: 0 })
    } finally {
      await pglite.close()
    }
  })

  it('keeps filtered stock totals global across pages and empty pages', async () => {
    const pglite = new PGlite()
    try {
      const keptProducts = Array.from({ length: 26 }, (_, index) => ({
        id: `keep-${index + 1}`,
        name: `Keep ${index % 2 === 0 ? 'Units' : 'Bulk'} ${index + 1}`,
        unit: index % 2 === 0 ? 'units' : 'boxes',
      }))
      const ignoredProduct = { id: 'ignore-1', name: 'Ignore Product', unit: 'units' }
      const products = [...keptProducts, ignoredProduct]
      const productRows = products.map((item) => (
        `('${item.id}', '${item.name}', '${item.unit}', '${categoryId}', 5, TRUE, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z')`
      )).join(',\n')
      const lotRows = keptProducts.flatMap((item, index) => (
        item.unit === 'units'
          ? [`('lot-${index}-a', '${item.id}', 2)`]
          : [
              `('lot-${index}-a', '${item.id}', 4)`,
              `('lot-${index}-b', '${item.id}', 9)`,
            ]
      ))
      lotRows.push(`('ignored-lot', '${ignoredProduct.id}', 100)`)

      await pglite.exec(`
        CREATE TABLE "ComponentCategory" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "pickRule" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL,
          "createdAt" TIMESTAMP NOT NULL,
          "updatedAt" TIMESTAMP NOT NULL
        );
        CREATE TABLE "Product" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "unit" TEXT NOT NULL,
          "categoryId" TEXT NOT NULL,
          "lowStockThreshold" INTEGER NOT NULL,
          "isActive" BOOLEAN NOT NULL,
          "createdAt" TIMESTAMP NOT NULL,
          "updatedAt" TIMESTAMP NOT NULL
        );
        CREATE TABLE "InventoryLot" (
          "id" TEXT PRIMARY KEY,
          "productId" TEXT NOT NULL,
          "remaining" NUMERIC NOT NULL
        );
        CREATE TABLE "ProductCost" (
          "id" TEXT PRIMARY KEY,
          "productId" TEXT NOT NULL,
          "unitCost" NUMERIC NOT NULL,
          "effectiveFrom" TIMESTAMP NOT NULL,
          "effectiveTo" TIMESTAMP
        );
        INSERT INTO "ComponentCategory" ("id", "name", "description", "pickRule", "isActive", "createdAt", "updatedAt")
        VALUES ('${categoryId}', 'Chocolate', NULL, 'FIFO', TRUE, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z');
        INSERT INTO "Product" ("id", "name", "unit", "categoryId", "lowStockThreshold", "isActive", "createdAt", "updatedAt")
        VALUES ${productRows};
        INSERT INTO "InventoryLot" ("id", "productId", "remaining")
        VALUES ${lotRows.join(',\n')};
      `)

      const hydratedProducts = new Map(products.map((item) => [item.id, product(item.id, item.name, item.unit)]))
      const queryRaw = vi.fn(async (statement: Prisma.Sql) => {
        const result = await pglite.query(
          toParameterizedSql(statement),
          statement.values as unknown[],
        )
        return result.rows
      })
      const findMany = vi.fn(async (args: { where: { id: { in: string[] } } }) => (
        args.where.id.in.flatMap((id) => {
          const hydrated = hydratedProducts.get(id)
          return hydrated ? [hydrated] : []
        })
      ))
      const db = { $queryRaw: queryRaw, product: { findMany } } as Parameters<typeof listInventoryProducts>[0]
      const query = {
        pageSize: 25 as const,
        search: 'Keep',
        lowStockOnly: false,
        sort: 'name-asc' as const,
      }

      const firstPage = await listInventoryProducts(db, { ...query, page: 1 })
      const secondPage = await listInventoryProducts(db, { ...query, page: 2 })
      const emptyPage = await listInventoryProducts(db, { ...query, page: 3 })

      expect(firstPage.items).toHaveLength(25)
      expect(secondPage.items).toHaveLength(1)
      expect(firstPage.totals).toEqual({ totalUnitItems: 26, totalLots: 26 })
      expect(secondPage.totals).toEqual(firstPage.totals)
      expect(emptyPage).toMatchObject({
        items: [],
        pagination: { page: 3, pageSize: 25, totalItems: 26, totalPages: 2 },
        totals: { totalUnitItems: 26, totalLots: 26 },
      })
      expect(queryRaw.mock.calls).toHaveLength(4)
      expect(queryRaw.mock.calls.every(([statement]) => (
        (statement as Prisma.Sql).values.includes('%Keep%')
      ))).toBe(true)
    } finally {
      await pglite.close()
    }
  })
})
