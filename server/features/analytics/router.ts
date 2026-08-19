import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ExpenseCategory } from '@prisma/client'
import { analyticsPeriodQuerySchema } from '#contracts/routes/analytics'
import { NEEDS_VERIFICATION_STATUSES } from '../../lib/sales/filters'

const router = Router()

const msPerDay = 24 * 60 * 60 * 1000

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toNumber(value: unknown) {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') return Number(value)
  return Number(value)
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null
  }
  return ((current - previous) / previous) * 100
}

type PeriodQuery = z.infer<typeof analyticsPeriodQuerySchema>

function getPeriod(query: PeriodQuery) {
  const now = new Date()

  const startDateProvided = query.startDate !== undefined
  const endDateProvided = query.endDate !== undefined
  const defaultDays = query.days ?? 30

  const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

  if (startDateProvided && !query.startDate) throw new Error('Invalid startDate')
  if (endDateProvided && !query.endDate) throw new Error('Invalid endDate')

  const parseOrThrow = (value: string, label: string) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}`)
    return d
  }

  const startInput = query.startDate ? parseOrThrow(query.startDate, 'startDate') : null
  const endInput = query.endDate ? parseOrThrow(query.endDate, 'endDate') : null

  let start: Date
  let end: Date

  if (startDateProvided || endDateProvided) {
    if (endInput) {
      end = endInput
      if (query.endDate && isDateOnly(query.endDate)) end = endOfDay(end)
    } else {
      end = endOfDay(now)
    }

    if (startInput) {
      start = startInput
      if (query.startDate && isDateOnly(query.startDate)) start = startOfDay(start)
    } else {
      start = startOfDay(addDays(end, -(defaultDays - 1)))
    }
  } else {
    end = endOfDay(now)
    start = startOfDay(addDays(end, -(defaultDays - 1)))
  }

  if (start.getTime() > end.getTime()) {
    throw new Error('startDate must be <= endDate')
  }

  const rangeDays =
    Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / msPerDay) + 1

  if (rangeDays > 366) {
    throw new Error('Date range too large (max 366 days)')
  }

  const durationMs = end.getTime() - start.getTime()
  const previousEnd = new Date(start.getTime() - 1)
  const previousStart = new Date(previousEnd.getTime() - durationMs)

  return {
    start,
    end,
    rangeDays,
    previousStart,
    previousEnd,
  }
}

async function getSalesTotals(start: Date, end: Date) {
  const salesAgg = await prisma.sale.aggregate({
    where: { saleDate: { gte: start, lte: end } },
    _sum: { grossRevenue: true, margin: true },
    _count: true,
  })

  const totalRevenue = Number(salesAgg._sum.grossRevenue) || 0
  const totalProfit = Number(salesAgg._sum.margin) || 0
  const salesCount = salesAgg._count
  const avgOrderValue = salesCount > 0 ? totalRevenue / salesCount : 0
  const avgMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  return { totalRevenue, totalProfit, salesCount, avgOrderValue, avgMarginPercent }
}

async function getExpenseTotals(start: Date, end: Date) {
  const expensesAgg = await prisma.businessExpense.aggregate({
    where: { isActive: true, date: { gte: start, lte: end } },
    _sum: { amountIncVat: true },
  })
  const totalExpenses = Number(expensesAgg._sum.amountIncVat) || 0
  return { totalExpenses }
}

// GET /analytics/overview
router.get('/overview', async (req, res) => {
  try {
    const query = analyticsPeriodQuerySchema.parse(req.query)
    const period = getPeriod(query)

    const [currentSales, currentExpenses, previousSales, previousExpenses] = await Promise.all([
      getSalesTotals(period.start, period.end),
      getExpenseTotals(period.start, period.end),
      getSalesTotals(period.previousStart, period.previousEnd),
      getExpenseTotals(period.previousStart, period.previousEnd),
    ])

    const currentNetProfit = currentSales.totalProfit - currentExpenses.totalExpenses
    const previousNetProfit = previousSales.totalProfit - previousExpenses.totalExpenses

    res.json({
      period: {
        startDate: period.start.toISOString(),
        endDate: period.end.toISOString(),
        previousStartDate: period.previousStart.toISOString(),
        previousEndDate: period.previousEnd.toISOString(),
        days: period.rangeDays,
      },
      kpis: {
        totalRevenue: currentSales.totalRevenue,
        totalProfit: currentSales.totalProfit,
        avgMarginPercent: currentSales.avgMarginPercent,
        totalExpenses: currentExpenses.totalExpenses,
        netProfit: currentNetProfit,
        salesCount: currentSales.salesCount,
        avgOrderValue: currentSales.avgOrderValue,
      },
      change: {
        totalRevenue: percentChange(currentSales.totalRevenue, previousSales.totalRevenue),
        totalProfit: percentChange(currentSales.totalProfit, previousSales.totalProfit),
        avgMarginPercent: percentChange(currentSales.avgMarginPercent, previousSales.avgMarginPercent),
        totalExpenses: percentChange(currentExpenses.totalExpenses, previousExpenses.totalExpenses),
        netProfit: percentChange(currentNetProfit, previousNetProfit),
        salesCount: percentChange(currentSales.salesCount, previousSales.salesCount),
        avgOrderValue: percentChange(currentSales.avgOrderValue, previousSales.avgOrderValue),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch overview'
    if (message.startsWith('Invalid') || message.includes('startDate') || message.includes('Date range')) {
      return res.status(400).json({ error: message })
    }
    console.error('Error fetching analytics overview:', error)
    res.status(500).json({ error: 'Failed to fetch overview' })
  }
})

// GET /analytics/profit
router.get('/profit', async (req, res) => {
  try {
    const query = analyticsPeriodQuerySchema.parse(req.query)
    const period = getPeriod(query)

    const [dailyRows, expenseRows, feesAgg, marginByHamperRows] = await Promise.all([
      prisma.$queryRaw<Array<{ date: string | Date; revenue: unknown; profit: unknown }>>`
        SELECT DATE("saleDate") as date,
               SUM("grossRevenue") as revenue,
               SUM("margin") as profit
        FROM "Sale"
        WHERE "saleDate" BETWEEN ${period.start} AND ${period.end}
        GROUP BY DATE("saleDate")
        ORDER BY date ASC
      `,
      prisma.$queryRaw<Array<{ date: string | Date; expenses: unknown }>>`
        SELECT DATE("date") as date,
               SUM("amountIncVat") as expenses
        FROM "BusinessExpense"
        WHERE "isActive" = true
          AND "date" BETWEEN ${period.start} AND ${period.end}
        GROUP BY DATE("date")
        ORDER BY date ASC
      `,
      prisma.sale.aggregate({
        where: { saleDate: { gte: period.start, lte: period.end } },
        _sum: {
          transactionFee: true,
          postageTransactionFee: true,
          regulatoryFee: true,
          processingFee: true,
          vatOnProcessingFee: true,
          listingFee: true,
          offsiteAdsFee: true,
          vatOnOffsiteAdsFee: true,
          postageCost: true,
          totalCost: true,
          packagingOverhead: true,
        },
      }),
      prisma.$queryRaw<
        Array<{
          name: string | null
          revenue: unknown
          cost: unknown
        }>
      >`
        SELECT h."name" as name,
               SUM(sl."unitPrice" * sl.quantity) as revenue,
               SUM(sl."lineCost") as cost
        FROM "SaleLine" sl
        JOIN "Sale" s ON s.id = sl."saleId"
        LEFT JOIN "Hamper" h ON h.id = sl."hamperId"
        WHERE sl."hamperId" IS NOT NULL
          AND s."saleDate" BETWEEN ${period.start} AND ${period.end}
        GROUP BY sl."hamperId", h."name"
        HAVING SUM(sl."unitPrice" * sl.quantity) > 0
        ORDER BY (SUM(sl."unitPrice" * sl.quantity) - SUM(sl."lineCost")) / SUM(sl."unitPrice" * sl.quantity) DESC
        LIMIT 10
      `,
    ])

    const dailyByDate = new Map<string, { revenue: number; profit: number }>()
    for (const row of dailyRows) {
      const dateKey =
        typeof row.date === 'string'
          ? row.date
          : row.date instanceof Date
            ? toDateKey(row.date)
            : String(row.date)
      dailyByDate.set(dateKey, {
        revenue: toNumber(row.revenue),
        profit: toNumber(row.profit),
      })
    }

    const expensesByDate = new Map<string, number>()
    for (const row of expenseRows) {
      const dateKey =
        typeof row.date === 'string'
          ? row.date
          : row.date instanceof Date
            ? toDateKey(row.date)
            : String(row.date)
      expensesByDate.set(dateKey, toNumber(row.expenses))
    }

    const dailyTrend: Array<{
      date: string
      revenue: number
      profit: number
      expenses: number
      netProfit: number
      marginPercent: number
    }> = []
    for (let cursor = startOfDay(period.start); cursor <= startOfDay(period.end); cursor = addDays(cursor, 1)) {
      const key = toDateKey(cursor)
      const point = dailyByDate.get(key) ?? { revenue: 0, profit: 0 }
      const expenses = expensesByDate.get(key) ?? 0
      dailyTrend.push({
        date: key,
        revenue: point.revenue,
        profit: point.profit,
        expenses,
        netProfit: point.profit - expenses,
        marginPercent: point.revenue > 0 ? (point.profit / point.revenue) * 100 : 0,
      })
    }

    const transaction = (Number(feesAgg._sum.transactionFee) || 0) + (Number(feesAgg._sum.postageTransactionFee) || 0)
    const processing = (Number(feesAgg._sum.processingFee) || 0) + (Number(feesAgg._sum.vatOnProcessingFee) || 0)
    const regulatory = Number(feesAgg._sum.regulatoryFee) || 0
    const listing = Number(feesAgg._sum.listingFee) || 0
    const postage = Number(feesAgg._sum.postageCost) || 0
    const stock = Number(feesAgg._sum.totalCost) || 0
    const packaging = Number(feesAgg._sum.packagingOverhead) || 0
    const offsiteAds = Number(feesAgg._sum.offsiteAdsFee) || 0
    const offsiteAdsVat = Number(feesAgg._sum.vatOnOffsiteAdsFee) || 0

    const marginByHamper = marginByHamperRows.map((r) => {
      const revenue = toNumber(r.revenue)
      const cost = toNumber(r.cost)
      const profit = revenue - cost
      return {
        name: r.name ?? 'Unknown',
        revenue,
        profit,
        marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
      }
    })

    res.json({
      dailyTrend,
      feeBreakdown: {
        transaction,
        processing,
        regulatory,
        listing,
        postage,
        stock,
        packaging,
        offsiteAds,
        offsiteAdsVat,
      },
      marginByHamper,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch profit analytics'
    if (message.startsWith('Invalid') || message.includes('startDate') || message.includes('Date range')) {
      return res.status(400).json({ error: message })
    }
    console.error('Error fetching profit analytics:', error)
    res.status(500).json({ error: 'Failed to fetch profit analytics' })
  }
})

// GET /analytics/sales
router.get('/sales', async (req, res) => {
  try {
    const query = analyticsPeriodQuerySchema.parse(req.query)
    const period = getPeriod(query)

    const [volumeRows, bestSellerRows, byChannelRows, unverifiedEtsySales] = await Promise.all([
      prisma.$queryRaw<Array<{ date: string | Date; count: unknown; revenue: unknown }>>`
        SELECT DATE("saleDate") as date,
               COUNT(*) as count,
               SUM("grossRevenue") as revenue
        FROM "Sale"
        WHERE "saleDate" BETWEEN ${period.start} AND ${period.end}
        GROUP BY DATE("saleDate")
        ORDER BY date ASC
      `,
      prisma.$queryRaw<
        Array<{
          name: string | null
          unitsSold: unknown
          revenue: unknown
        }>
      >`
        SELECT h."name" as name,
               SUM(sl.quantity) as "unitsSold",
               SUM(sl."unitPrice" * sl.quantity) as revenue
        FROM "SaleLine" sl
        JOIN "Sale" s ON s.id = sl."saleId"
        LEFT JOIN "Hamper" h ON h.id = sl."hamperId"
        WHERE sl."hamperId" IS NOT NULL
          AND s."saleDate" BETWEEN ${period.start} AND ${period.end}
        GROUP BY sl."hamperId", h."name"
        ORDER BY SUM(sl.quantity) DESC
        LIMIT 10
      `,
      prisma.sale.groupBy({
        by: ['saleChannel'],
        where: { saleDate: { gte: period.start, lte: period.end } },
        _sum: { grossRevenue: true, margin: true },
        _count: true,
      }),
      prisma.sale.count({
        where: {
          saleChannel: 'etsy',
          saleDate: { gte: period.start, lte: period.end },
          etsyFeeReconciliationStatus: { in: NEEDS_VERIFICATION_STATUSES },
        },
      }),
    ])

    const volumeByDate = new Map<string, { count: number; revenue: number }>()
    for (const row of volumeRows) {
      const dateKey =
        typeof row.date === 'string'
          ? row.date
          : row.date instanceof Date
            ? toDateKey(row.date)
            : String(row.date)
      volumeByDate.set(dateKey, { count: toNumber(row.count), revenue: toNumber(row.revenue) })
    }

    const volumeTrend: Array<{ date: string; count: number; revenue: number }> = []
    for (let cursor = startOfDay(period.start); cursor <= startOfDay(period.end); cursor = addDays(cursor, 1)) {
      const key = toDateKey(cursor)
      const point = volumeByDate.get(key) ?? { count: 0, revenue: 0 }
      volumeTrend.push({ date: key, count: point.count, revenue: point.revenue })
    }

    res.json({
      unverifiedEtsySales,
      volumeTrend,
      bestSellers: bestSellerRows.map((r) => ({
        name: r.name ?? 'Unknown',
        unitsSold: Math.trunc(toNumber(r.unitsSold)),
        revenue: toNumber(r.revenue),
      })),
      byChannel: byChannelRows.map((c) => ({
        channel: c.saleChannel,
        count: c._count,
        revenue: Number(c._sum.grossRevenue) || 0,
        profit: Number(c._sum.margin) || 0,
      })),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch sales analytics'
    if (message.startsWith('Invalid') || message.includes('startDate') || message.includes('Date range')) {
      return res.status(400).json({ error: message })
    }
    console.error('Error fetching sales analytics:', error)
    res.status(500).json({ error: 'Failed to fetch sales analytics' })
  }
})

// GET /analytics/expenses
router.get('/expenses', async (req, res) => {
  try {
    const query = analyticsPeriodQuerySchema.parse(req.query)
    const period = getPeriod(query)

    const [breakdownRows, trendRows] = await Promise.all([
      prisma.businessExpense.groupBy({
        by: ['category'],
        where: { isActive: true, date: { gte: period.start, lte: period.end } },
        _sum: { amountIncVat: true },
      }),
      prisma.$queryRaw<
        Array<{
          month: string
          category: ExpenseCategory
          total: unknown
        }>
      >`
        SELECT TO_CHAR(DATE_TRUNC('month', "date"), 'YYYY-MM') as month,
               "category" as category,
               SUM("amountIncVat") as total
        FROM "BusinessExpense"
        WHERE "isActive" = true
          AND "date" BETWEEN ${period.start} AND ${period.end}
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `,
    ])

    // Fill all months/categories with zeros for stacked charts
    type CategoryTrendPoint = { month: string } & Record<ExpenseCategory, number>
    const categories = Object.values(ExpenseCategory) as ExpenseCategory[]

    const monthKeys: string[] = []
    const startMonth = new Date(period.start.getFullYear(), period.start.getMonth(), 1)
    const endMonth = new Date(period.end.getFullYear(), period.end.getMonth(), 1)

    for (let cursor = startMonth; cursor <= endMonth; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      monthKeys.push(key)
    }

    const trendByMonth = new Map<string, CategoryTrendPoint>()
    for (const month of monthKeys) {
      const base = { month } as CategoryTrendPoint
      for (const c of categories) base[c] = 0
      trendByMonth.set(month, base)
    }

    for (const row of trendRows) {
      const bucket = trendByMonth.get(row.month)
      if (!bucket) continue
      bucket[row.category] = toNumber(row.total)
    }

    res.json({
      categoryTrend: monthKeys.map((m) => trendByMonth.get(m)!),
      categoryBreakdown: breakdownRows.map((r) => ({
        category: r.category,
        total: Number(r._sum.amountIncVat) || 0,
      })),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch expense analytics'
    if (message.startsWith('Invalid') || message.includes('startDate') || message.includes('Date range')) {
      return res.status(400).json({ error: message })
    }
    console.error('Error fetching expense analytics:', error)
    res.status(500).json({ error: 'Failed to fetch expense analytics' })
  }
})

// GET /analytics/inventory
router.get('/inventory', async (req, res) => {
  try {
    const query = analyticsPeriodQuerySchema.parse(req.query)
    const period = getPeriod(query)

    const [stockValueRows, cogsRows, costByHamperRows] = await Promise.all([
      prisma.$queryRaw<Array<{ total: unknown }>>`
        SELECT COALESCE(SUM("remaining" * "unitCost"), 0) as total
        FROM "InventoryLot"
        WHERE "remaining" > 0
      `,
      prisma.$queryRaw<Array<{ date: string | Date; cogs: unknown }>>`
        SELECT DATE("saleDate") as date,
               SUM("totalCost") as cogs
        FROM "Sale"
        WHERE "saleDate" BETWEEN ${period.start} AND ${period.end}
        GROUP BY DATE("saleDate")
        ORDER BY date ASC
      `,
      prisma.$queryRaw<
        Array<{
          name: string | null
          totalCost: unknown
          unitsSold: unknown
        }>
      >`
        SELECT h."name" as name,
               SUM(sl."lineCost") as "totalCost",
               SUM(sl.quantity) as "unitsSold"
        FROM "SaleLine" sl
        JOIN "Sale" s ON s.id = sl."saleId"
        LEFT JOIN "Hamper" h ON h.id = sl."hamperId"
        WHERE sl."hamperId" IS NOT NULL
          AND s."saleDate" BETWEEN ${period.start} AND ${period.end}
        GROUP BY sl."hamperId", h."name"
        HAVING SUM(sl.quantity) > 0
        ORDER BY SUM(sl."lineCost") DESC
        LIMIT 10
      `,
    ])

    const currentStockValue = toNumber(stockValueRows[0]?.total)

    const cogsByDate = new Map<string, number>()
    for (const row of cogsRows) {
      const dateKey =
        typeof row.date === 'string'
          ? row.date
          : row.date instanceof Date
            ? toDateKey(row.date)
            : String(row.date)
      cogsByDate.set(dateKey, toNumber(row.cogs))
    }

    const cogsTrend: Array<{ date: string; cogs: number }> = []
    for (let cursor = startOfDay(period.start); cursor <= startOfDay(period.end); cursor = addDays(cursor, 1)) {
      const key = toDateKey(cursor)
      cogsTrend.push({ date: key, cogs: cogsByDate.get(key) ?? 0 })
    }

    res.json({
      currentStockValue,
      cogsTrend,
      costByHamper: costByHamperRows.map((r) => {
        const totalCost = toNumber(r.totalCost)
        const unitsSold = Math.trunc(toNumber(r.unitsSold))
        return {
          name: r.name ?? 'Unknown',
          unitsSold,
          avgCost: unitsSold > 0 ? totalCost / unitsSold : 0,
        }
      }),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch inventory analytics'
    if (message.startsWith('Invalid') || message.includes('startDate') || message.includes('Date range')) {
      return res.status(400).json({ error: message })
    }
    console.error('Error fetching inventory analytics:', error)
    res.status(500).json({ error: 'Failed to fetch inventory analytics' })
  }
})

export default router
