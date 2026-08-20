import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  InventoryProduct,
  InventoryProductsResponse,
  InventorySort,
  ParsedInventoryProductsQuery,
} from '#contracts/routes/inventory'
import { buildPaginationMeta, toPrismaPagination } from '../pagination'

const inventoryProductInclude = {
  category: true,
  lots: {
    where: { remaining: { gt: 0 } },
    select: { remaining: true },
  },
  costs: {
    where: {
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
    take: 1,
    orderBy: { effectiveFrom: 'desc' as const },
  },
} satisfies Prisma.ProductInclude

type InventoryProductHydration = Prisma.ProductGetPayload<{
  include: typeof inventoryProductInclude
}>

type InventoryProductListDb = Pick<PrismaClient, '$queryRaw'> & {
  product: Pick<PrismaClient['product'], 'findMany'>
}

type PageRow = { id: string; totalItems: number | bigint }
type CountRow = { totalItems: number | bigint }

// ComponentCategory has no sortOrder column, so category order starts with its
// stable name and then uses product name/id tie-breakers.
const inventoryOrderBy = {
  category: Prisma.sql`c."name" ASC, stock.name ASC, stock.id ASC`,
  'stock-desc': Prisma.sql`stock.remaining DESC, stock.id DESC`,
  'stock-asc': Prisma.sql`stock.remaining ASC, stock.id ASC`,
  'name-asc': Prisma.sql`stock.name ASC, stock.id ASC`,
  'name-desc': Prisma.sql`stock.name DESC, stock.id DESC`,
  'cost-asc': Prisma.sql`stock."currentCost" ASC NULLS LAST, stock.id ASC`,
  'cost-desc': Prisma.sql`stock."currentCost" DESC NULLS LAST, stock.id DESC`,
  newest: Prisma.sql`stock."createdAt" DESC, stock.id DESC`,
  oldest: Prisma.sql`stock."createdAt" ASC, stock.id ASC`,
} satisfies Record<InventorySort, Prisma.Sql>

function stockCte(query: ParsedInventoryProductsQuery): Prisma.Sql {
  const conditions = [Prisma.sql`p."isActive" = true`, Prisma.sql`c."isActive" = true`]
  if (query.categoryId) conditions.push(Prisma.sql`p."categoryId" = ${query.categoryId}`)
  if (query.search) {
    const search = `%${query.search}%`
    conditions.push(Prisma.sql`(p.name ILIKE ${search} OR c.name ILIKE ${search})`)
  }

  const lowStockPredicate = query.lowStockOnly
    ? Prisma.sql`
        WHERE stock."lowStockThreshold" > 0
          AND CASE
            WHEN stock.unit = 'units' THEN stock.remaining
            ELSE stock."lotCount"
          END <= stock."lowStockThreshold"
      `
    : Prisma.empty

  return Prisma.sql`
    WITH stock AS (
      SELECT
        p.id,
        p.name,
        p.unit,
        p."categoryId",
        p."lowStockThreshold",
        p."createdAt",
        c.name AS "categoryName",
        COALESCE(SUM(l.remaining), 0) AS remaining,
        COUNT(l.id)::integer AS "lotCount",
        current_cost."unitCost" AS "currentCost"
      FROM "Product" p
      JOIN "ComponentCategory" c ON c.id = p."categoryId"
      LEFT JOIN "InventoryLot" l ON l."productId" = p.id AND l.remaining > 0
      LEFT JOIN LATERAL (
        SELECT pc."unitCost"
        FROM "ProductCost" pc
        WHERE pc."productId" = p.id
          AND pc."effectiveFrom" <= NOW()
          AND (pc."effectiveTo" IS NULL OR pc."effectiveTo" > NOW())
        ORDER BY pc."effectiveFrom" DESC
        LIMIT 1
      ) current_cost ON true
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY
        p.id,
        p.name,
        p.unit,
        p."categoryId",
        p."lowStockThreshold",
        p."createdAt",
        c.name,
        current_cost."unitCost"
    ), filtered AS (
      SELECT *
      FROM stock
      ${lowStockPredicate}
    )
  `
}

function mapInventoryProduct(product: InventoryProductHydration): InventoryProduct {
  const totalRemaining = product.lots.reduce((sum, lot) => sum + Number(lot.remaining), 0)
  const lotCount = product.lots.length

  return {
    id: product.id,
    name: product.name,
    categoryId: product.categoryId,
    unit: product.unit,
    lowStockThreshold: product.lowStockThreshold,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    category: {
      ...product.category,
      createdAt: product.category.createdAt.toISOString(),
      updatedAt: product.category.updatedAt.toISOString(),
    },
    totalStock: product.unit === 'units' ? totalRemaining : lotCount,
    totalRemaining,
    lotCount,
    currentCost: product.costs[0] ? Number(product.costs[0].unitCost) : null,
  }
}

export async function listInventoryProducts(
  db: InventoryProductListDb,
  query: ParsedInventoryProductsQuery,
): Promise<InventoryProductsResponse> {
  const { skip, take } = toPrismaPagination(query)
  const cte = stockCte(query)
  const orderBy = inventoryOrderBy[query.sort ?? 'category']
  const pageRows = await db.$queryRaw<PageRow[]>(Prisma.sql`
    ${cte}
    SELECT stock.id, COUNT(*) OVER()::integer AS "totalItems"
    FROM filtered stock
    JOIN "ComponentCategory" c ON c.id = stock."categoryId"
    ORDER BY ${orderBy}
    LIMIT ${take}
    OFFSET ${skip}
  `)

  if (pageRows.length === 0) {
    const countRows = await db.$queryRaw<CountRow[]>(Prisma.sql`
      ${cte}
      SELECT COUNT(*)::integer AS "totalItems"
      FROM filtered
    `)
    const totalItems = Number(countRows[0]?.totalItems ?? 0)
    return { items: [], pagination: buildPaginationMeta(query, totalItems) }
  }

  const ids = pageRows.map((row) => row.id)
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    include: inventoryProductInclude,
  }) as InventoryProductHydration[]
  const productsById = new Map(products.map((product) => [product.id, product]))
  const items = ids.flatMap((id) => {
    const product = productsById.get(id)
    return product ? [mapInventoryProduct(product)] : []
  })
  const totalItems = Number(pageRows[0]!.totalItems)

  return { items, pagination: buildPaginationMeta(query, totalItems) }
}
