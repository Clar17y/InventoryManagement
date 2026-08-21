import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  InventoryProduct,
  InventoryProductsResponse,
  InventorySort,
  ParsedInventoryProductsQuery,
} from '#contracts/routes/inventory'
import { buildPaginationMeta, toPrismaPagination } from '../pagination'

const inventoryProductSelect = {
  id: true,
  name: true,
  categoryId: true,
  unit: true,
  lowStockThreshold: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      description: true,
      pickRule: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.ProductSelect

type InventoryProductHydration = Prisma.ProductGetPayload<{
  select: typeof inventoryProductSelect
}>

type InventoryProductListDb = Pick<PrismaClient, '$queryRaw'> & {
  product: Pick<PrismaClient['product'], 'findMany'>
}

type PageRow = {
  id: string
  remaining: Prisma.Decimal | number | string
  lotCount: number | bigint
  currentCost: Prisma.Decimal | number | string | null
  totalItems: number | bigint
  totalUnitItems: Prisma.Decimal | number | string
  totalLots: number | bigint
}
type CountRow = {
  totalItems: number | bigint
  totalUnitItems: Prisma.Decimal | number | string | null
  totalLots: number | bigint | null
}

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

function mapInventoryProduct(product: InventoryProductHydration, pageRow: PageRow): InventoryProduct {
  const totalRemaining = Number(pageRow.remaining)
  const lotCount = Number(pageRow.lotCount)

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
    currentCost: pageRow.currentCost === null || pageRow.currentCost === undefined
      ? null
      : Number(pageRow.currentCost),
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
    SELECT
      stock.id,
      stock.remaining,
      stock."lotCount",
      stock."currentCost",
      COUNT(*) OVER()::integer AS "totalItems",
      SUM(CASE WHEN stock.unit = 'units' THEN stock.remaining ELSE 0 END) OVER() AS "totalUnitItems",
      SUM(CASE WHEN stock.unit = 'units' THEN 0 ELSE stock."lotCount" END) OVER()::integer AS "totalLots"
    FROM filtered stock
    JOIN "ComponentCategory" c ON c.id = stock."categoryId"
    ORDER BY ${orderBy}
    LIMIT ${take}
    OFFSET ${skip}
  `)

  if (pageRows.length === 0) {
    const countRows = await db.$queryRaw<CountRow[]>(Prisma.sql`
      ${cte}
      SELECT
        COUNT(*)::integer AS "totalItems",
        COALESCE(SUM(CASE WHEN unit = 'units' THEN remaining ELSE 0 END), 0) AS "totalUnitItems",
        COALESCE(SUM(CASE WHEN unit = 'units' THEN 0 ELSE "lotCount" END), 0)::integer AS "totalLots"
      FROM filtered
    `)
    const countRow = countRows[0]
    const totalItems = Number(countRow?.totalItems ?? 0)
    return {
      items: [],
      pagination: buildPaginationMeta(query, totalItems),
      totals: {
        totalUnitItems: Number(countRow?.totalUnitItems ?? 0),
        totalLots: Number(countRow?.totalLots ?? 0),
      },
    }
  }

  const ids = pageRows.map((row) => row.id)
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: inventoryProductSelect,
  }) as InventoryProductHydration[]
  const productsById = new Map(products.map((product) => [product.id, product]))
  const pageRowsById = new Map(pageRows.map((row) => [row.id, row]))
  const items = ids.flatMap((id) => {
    const product = productsById.get(id)
    const pageRow = pageRowsById.get(id)
    return product && pageRow ? [mapInventoryProduct(product, pageRow)] : []
  })
  const totalItems = Number(pageRows[0]!.totalItems)
  const totalUnitItems = Number(pageRows[0]!.totalUnitItems ?? 0)
  const totalLots = Number(pageRows[0]!.totalLots ?? 0)

  return {
    items,
    pagination: buildPaginationMeta(query, totalItems),
    totals: { totalUnitItems, totalLots },
  }
}
