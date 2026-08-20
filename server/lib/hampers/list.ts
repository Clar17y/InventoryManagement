import { Prisma } from '@prisma/client'
import type { HampersListQuery, HamperSort } from '#contracts/routes/hampers'
import { prisma } from '../prisma'
import { buildPaginationMeta, toPrismaPagination } from '../pagination'
import {
  calculateAvailabilityMap,
  calculateVariantAvailabilityMap,
  loadAvailabilityInputs,
} from './availabilityBatch'

const hamperInclude = {
  requirements: {
    include: { category: true },
  },
} as const

type ListQuery = {
  page: number
  pageSize: 25 | 50 | 100
  search?: string
  hideEtsyHidden: boolean
  sort: HamperSort
}

type HamperListRow = Prisma.HamperGetPayload<{ include: typeof hamperInclude }>

export type HampersListResult = {
  items: unknown[]
  totalItems: number
}

function normalizeQuery(query: HampersListQuery): ListQuery {
  const pageSize = Number(query.pageSize ?? 25)
  return {
    page: Number(query.page ?? 1),
    pageSize: (pageSize === 50 || pageSize === 100 ? pageSize : 25) as ListQuery['pageSize'],
    search: typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined,
    hideEtsyHidden: query.hideEtsyHidden !== false && query.hideEtsyHidden !== 'false',
    sort: (query.sort ?? 'canmake-desc') as HamperSort,
  }
}

export function buildHampersWhere(query: HampersListQuery): Prisma.HamperWhereInput {
  const normalized = normalizeQuery(query)
  const where: Prisma.HamperWhereInput = { isActive: true }

  if (normalized.hideEtsyHidden) {
    where.etsyIsEnabled = true
    where.OR = [
      { hasVariants: false },
      { variants: { some: { isActive: true, etsyIsEnabled: true } } },
    ]
  }
  if (normalized.search) {
    where.name = { contains: normalized.search, mode: 'insensitive' }
  }

  return where
}

function isAvailabilitySort(sort: HamperSort): boolean {
  return sort === 'canmake-asc' || sort === 'canmake-desc'
}

function getDirection(sort: HamperSort): Prisma.SortOrder {
  return sort.endsWith('-asc') ? 'asc' : 'desc'
}

function getOrderBy(sort: HamperSort): Prisma.HamperOrderByWithRelationInput[] {
  const direction = getDirection(sort)
  switch (sort) {
    case 'name-asc':
    case 'name-desc':
      return [{ name: direction }, { id: direction }]
    case 'price-asc':
    case 'price-desc':
      return [{ sellingPrice: direction }, { id: direction }]
    case 'reqs-asc':
    case 'reqs-desc':
      return [{ requirements: { _count: direction } }, { id: direction }]
    case 'date-asc':
    case 'date-desc':
      return [{ createdAt: direction }, { id: direction }]
    default:
      return [{ id: direction }]
  }
}

function availabilitySortSql(query: ListQuery, skip: number, take: number): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`h."isActive" = TRUE`]
  if (query.hideEtsyHidden) {
    clauses.push(Prisma.sql`h."etsyIsEnabled" = TRUE`)
    clauses.push(Prisma.sql`(
      h."hasVariants" = FALSE
      OR EXISTS (
        SELECT 1 FROM "HamperVariant" v
        WHERE v."hamperId" = h."id"
          AND v."isActive" = TRUE
          AND v."etsyIsEnabled" = TRUE
      )
    )`)
  }
  if (query.search) {
    clauses.push(Prisma.sql`h."name" ILIKE ${`%${query.search}%`}`)
  }

  const direction = query.sort === 'canmake-asc'
    ? Prisma.sql`ASC`
    : Prisma.sql`DESC`
  const whereSql = Prisma.join(clauses, ' AND ')

  return Prisma.sql`
    WITH requirement_stock AS (
      SELECT r."hamperId",
             r."categoryId",
             FLOOR(COALESCE(SUM(l."remaining"), 0) / r."quantity") AS "canMake"
      FROM "HamperRequirement" r
      LEFT JOIN "Product" p
        ON p."categoryId" = r."categoryId"
       AND p."isActive" = TRUE
      LEFT JOIN "InventoryLot" l
        ON l."productId" = p."id"
       AND l."remaining" > 0
      WHERE r."isOptional" = FALSE
      GROUP BY r."id", r."hamperId", r."categoryId", r."quantity"
    ),
    hamper_availability AS (
      SELECT h."id",
             COALESCE(MIN(rs."canMake"), 0) AS "canMake"
      FROM "Hamper" h
      LEFT JOIN requirement_stock rs ON rs."hamperId" = h."id"
      WHERE ${whereSql}
      GROUP BY h."id"
    )
    SELECT "id", COUNT(*) OVER() AS "totalItems"
    FROM hamper_availability
    ORDER BY "canMake" ${direction}, "id" ${direction}
    LIMIT ${take} OFFSET ${skip}
  `
}

export function buildAvailabilitySortSql(
  query: HampersListQuery,
  skip: number,
  take: number,
): Prisma.Sql {
  return availabilitySortSql(normalizeQuery(query), skip, take)
}

async function hydrateHampers(
  ids: string[],
  hideEtsyHidden: boolean,
  loadedRows?: HamperListRow[],
): Promise<unknown[]> {
  if (ids.length === 0) return []

  const [rows, inputs] = await Promise.all([
    loadedRows ?? prisma.hamper.findMany({
      where: { id: { in: ids }, isActive: true },
      include: hamperInclude,
    }),
    loadAvailabilityInputs(ids),
  ])
  const availabilityByHamper = calculateAvailabilityMap(inputs)
  const variantAvailabilityByHamper = calculateVariantAvailabilityMap(inputs)
  const rowById = new Map(rows.map((row) => [row.id, row]))

  return ids.flatMap((id) => {
    const hamper = rowById.get(id)
    if (!hamper) return []
    return [{
      ...hamper,
      canMake: availabilityByHamper.get(id) ?? 0,
      ...(hamper.hasVariants
        ? {
            variantAvailability: (variantAvailabilityByHamper.get(id) ?? []).filter(
              (variant) => !hideEtsyHidden || variant.etsyIsEnabled,
            ),
          }
        : {}),
    }]
  })
}

export async function listHampers(query: HampersListQuery): Promise<HampersListResult> {
  const normalized = normalizeQuery(query)
  const { skip, take } = toPrismaPagination(normalized)
  const where = buildHampersWhere(normalized)

  if (isAvailabilitySort(normalized.sort)) {
    const [selected, totalItems] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>(availabilitySortSql(normalized, skip, take)),
      prisma.hamper.count({ where }),
    ])
    const items = await hydrateHampers(
      selected.map((row) => row.id),
      normalized.hideEtsyHidden,
    )
    return { items, totalItems }
  }

  const [rows, totalItems] = await Promise.all([
    prisma.hamper.findMany({
      where,
      include: hamperInclude,
      orderBy: getOrderBy(normalized.sort),
      ...{ skip, take },
    }),
    prisma.hamper.count({ where }),
  ])

  const ids = rows.map((row) => row.id)
  const items = await hydrateHampers(ids, normalized.hideEtsyHidden, rows)
  return { items, totalItems }
}

export function buildHampersPagination(
  query: HampersListQuery,
  totalItems: number,
) {
  const normalized = normalizeQuery(query)
  return buildPaginationMeta(normalized, totalItems)
}
