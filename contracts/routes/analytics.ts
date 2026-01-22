import { z } from 'zod'
import { isoDateSchema, isoDateTimeSchema } from '../http/primitives'
import { expenseCategorySchema } from '../domain/expense'
import { saleChannelSchema } from '../domain/sale'

export const analyticsPeriodQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  days: z.coerce.number().int().positive().max(366).optional(),
})

const overviewPeriodSchema = z.object({
  startDate: isoDateTimeSchema,
  endDate: isoDateTimeSchema,
  previousStartDate: isoDateTimeSchema,
  previousEndDate: isoDateTimeSchema,
  days: z.number().int().positive(),
})

const overviewKpisSchema = z.object({
  totalRevenue: z.number().finite(),
  totalProfit: z.number().finite(),
  avgMarginPercent: z.number().finite(),
  totalExpenses: z.number().finite(),
  netProfit: z.number().finite(),
  salesCount: z.number().int().nonnegative(),
  avgOrderValue: z.number().finite(),
})

const overviewChangeSchema = z.object({
  totalRevenue: z.number().finite().nullable(),
  totalProfit: z.number().finite().nullable(),
  avgMarginPercent: z.number().finite().nullable(),
  totalExpenses: z.number().finite().nullable(),
  netProfit: z.number().finite().nullable(),
  salesCount: z.number().finite().nullable(),
  avgOrderValue: z.number().finite().nullable(),
})

export const analyticsOverviewResponseSchema = z.object({
  period: overviewPeriodSchema,
  kpis: overviewKpisSchema,
  change: overviewChangeSchema,
})

export const analyticsProfitResponseSchema = z.object({
  dailyTrend: z.array(
    z.object({
      date: isoDateSchema,
      revenue: z.number().finite(),
      profit: z.number().finite(),
      expenses: z.number().finite().optional(),
      netProfit: z.number().finite().optional(),
      marginPercent: z.number().finite(),
    })
  ),
  feeBreakdown: z.object({
    transaction: z.number().finite().nonnegative(),
    processing: z.number().finite().nonnegative(),
    regulatory: z.number().finite().nonnegative(),
    listing: z.number().finite().nonnegative(),
    postage: z.number().finite().nonnegative(),
    stock: z.number().finite().nonnegative(),
    packaging: z.number().finite().nonnegative(),
  }),
  marginByHamper: z.array(
    z.object({
      name: z.string(),
      revenue: z.number().finite(),
      profit: z.number().finite(),
      marginPercent: z.number().finite(),
    })
  ),
})

export const analyticsSalesResponseSchema = z.object({
  volumeTrend: z.array(
    z.object({
      date: isoDateSchema,
      count: z.number().int().nonnegative(),
      revenue: z.number().finite(),
    })
  ),
  bestSellers: z.array(
    z.object({
      name: z.string(),
      unitsSold: z.number().int().nonnegative(),
      revenue: z.number().finite(),
    })
  ),
  byChannel: z.array(
    z.object({
      channel: saleChannelSchema,
      count: z.number().int().nonnegative(),
      revenue: z.number().finite(),
      profit: z.number().finite(),
    })
  ),
})

const expenseCategoryTrendPointSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  ADVERTISING: z.number().finite().nonnegative(),
  LISTING_FEE: z.number().finite().nonnegative(),
  POSTAGE: z.number().finite().nonnegative(),
  PACKAGING: z.number().finite().nonnegative(),
  STOCK: z.number().finite().nonnegative(),
  OTHER: z.number().finite().nonnegative(),
})

export const analyticsExpensesResponseSchema = z.object({
  categoryTrend: z.array(expenseCategoryTrendPointSchema),
  categoryBreakdown: z.array(
    z.object({
      category: expenseCategorySchema,
      total: z.number().finite().nonnegative(),
    })
  ),
})

export const analyticsInventoryResponseSchema = z.object({
  currentStockValue: z.number().finite().nonnegative(),
  cogsTrend: z.array(
    z.object({
      date: isoDateSchema,
      cogs: z.number().finite().nonnegative(),
    })
  ),
  costByHamper: z.array(
    z.object({
      name: z.string(),
      unitsSold: z.number().int().nonnegative(),
      avgCost: z.number().finite().nonnegative(),
    })
  ),
})

export type AnalyticsPeriodQuery = z.input<typeof analyticsPeriodQuerySchema>
export type AnalyticsOverviewResponse = z.infer<typeof analyticsOverviewResponseSchema>
export type AnalyticsProfitResponse = z.infer<typeof analyticsProfitResponseSchema>
export type AnalyticsSalesResponse = z.infer<typeof analyticsSalesResponseSchema>
export type AnalyticsExpensesResponse = z.infer<typeof analyticsExpensesResponseSchema>
export type AnalyticsInventoryResponse = z.infer<typeof analyticsInventoryResponseSchema>
