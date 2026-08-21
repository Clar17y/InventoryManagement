import { Prisma } from '@prisma/client'
import type {
  ExpensesSummaryQuery,
  ExpensesSummaryResponse,
} from '#contracts/routes/expenses'
import { prisma } from '../prisma'

type SummaryDecimal = Prisma.Decimal | number | null

type MonthlyExpenseRow = {
  month: string
  totalIncVat: SummaryDecimal
  totalExcVat: SummaryDecimal
  count: bigint | number
}

function asNumber(value: SummaryDecimal): number {
  return Number(value ?? 0)
}

function buildSummaryWhere(query: ExpensesSummaryQuery): Prisma.BusinessExpenseWhereInput {
  const where: Prisma.BusinessExpenseWhereInput = { isActive: true }

  if (query.startDate || query.endDate) {
    const date: Prisma.DateTimeFilter = {}
    if (query.startDate) date.gte = new Date(query.startDate)
    if (query.endDate) date.lte = new Date(query.endDate)
    where.date = date
  }

  if (query.search?.trim()) {
    const searchTerm = query.search.trim()
    where.OR = [
      { description: { contains: searchTerm, mode: 'insensitive' } },
      { supplier: { contains: searchTerm, mode: 'insensitive' } },
    ]
  }

  return where
}

export async function getExpensesSummary(
  query: ExpensesSummaryQuery,
): Promise<ExpensesSummaryResponse> {
  const where = buildSummaryWhere(query)
  const clauses: Prisma.Sql[] = [Prisma.sql`TRUE`, Prisma.sql`e."isActive" = TRUE`]

  if (query.startDate) {
    clauses.push(Prisma.sql`e."date" >= ${new Date(query.startDate)}`)
  }
  if (query.endDate) {
    clauses.push(Prisma.sql`e."date" <= ${new Date(query.endDate)}`)
  }
  if (query.search?.trim()) {
    const pattern = `%${query.search.trim()}%`
    clauses.push(Prisma.sql`(
      e."description" ILIKE ${pattern}
      OR e."supplier" ILIKE ${pattern}
    )`)
  }

  const whereSql = Prisma.join(clauses, ' AND ')
  const [byCategory, totals, byMonth] = await Promise.all([
    prisma.businessExpense.groupBy({
      by: ['category'],
      where,
      _sum: {
        amountIncVat: true,
        amountExcVat: true,
      },
      _count: true,
    }),
    prisma.businessExpense.aggregate({
      where,
      _sum: {
        amountIncVat: true,
        amountExcVat: true,
      },
      _count: true,
    }),
    prisma.$queryRaw<MonthlyExpenseRow[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', e."date" AT TIME ZONE 'Europe/London'), 'YYYY-MM') AS month,
             SUM(e."amountIncVat") AS "totalIncVat",
             SUM(e."amountExcVat") AS "totalExcVat",
             COUNT(*) AS count
      FROM "BusinessExpense" e
      WHERE ${whereSql}
      GROUP BY 1
      ORDER BY 1 DESC
    `),
  ])

  return {
    byCategory: byCategory.map((category) => ({
      category: category.category,
      totalIncVat: asNumber(category._sum.amountIncVat),
      totalExcVat: asNumber(category._sum.amountExcVat),
      count: Number(category._count),
    })),
    byMonth: byMonth.map((month) => ({
      month: month.month,
      totalIncVat: asNumber(month.totalIncVat),
      totalExcVat: asNumber(month.totalExcVat),
      count: Number(month.count),
    })),
    totals: {
      totalIncVat: asNumber(totals._sum.amountIncVat),
      totalExcVat: asNumber(totals._sum.amountExcVat),
      count: Number(totals._count),
    },
  }
}
