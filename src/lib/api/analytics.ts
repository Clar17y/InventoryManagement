import { request } from './request'
import type { ExpenseCategory } from './expenses'
import type { SaleChannel } from './sales'

export interface AnalyticsPeriodParams {
  startDate?: string
  endDate?: string
  days?: number
}

function buildPeriodQuery(params?: AnalyticsPeriodParams) {
  const query = new URLSearchParams()
  if (params?.startDate) query.set('startDate', params.startDate)
  if (params?.endDate) query.set('endDate', params.endDate)
  if (params?.days) query.set('days', String(params.days))
  return query.toString()
}

export interface AnalyticsOverviewResponse {
  period: {
    startDate: string
    endDate: string
    previousStartDate: string
    previousEndDate: string
    days: number
  }
  kpis: {
    totalRevenue: number
    totalProfit: number
    avgMarginPercent: number
    totalExpenses: number
    netProfit: number
    salesCount: number
    avgOrderValue: number
  }
  change: Record<keyof AnalyticsOverviewResponse['kpis'], number | null>
}

export interface AnalyticsProfitResponse {
  dailyTrend: { date: string; revenue: number; profit: number; marginPercent: number }[]
  feeBreakdown: {
    transaction: number
    processing: number
    regulatory: number
    listing: number
    postage: number
    stock: number
    packaging: number
  }
  marginByHamper: { name: string; revenue: number; profit: number; marginPercent: number }[]
}

export interface AnalyticsSalesResponse {
  volumeTrend: { date: string; count: number; revenue: number }[]
  bestSellers: { name: string; unitsSold: number; revenue: number }[]
  byChannel: { channel: SaleChannel; count: number; revenue: number; profit: number }[]
}

export interface AnalyticsExpensesResponse {
  categoryTrend: ({ month: string } & Record<ExpenseCategory, number>)[]
  categoryBreakdown: { category: ExpenseCategory; total: number }[]
}

export interface AnalyticsInventoryResponse {
  currentStockValue: number
  cogsTrend: { date: string; cogs: number }[]
  costByHamper: { name: string; unitsSold: number; avgCost: number }[]
}

export const analytics = {
  overview: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return request<AnalyticsOverviewResponse>(`/analytics/overview${query ? `?${query}` : ''}`)
  },
  profit: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return request<AnalyticsProfitResponse>(`/analytics/profit${query ? `?${query}` : ''}`)
  },
  sales: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return request<AnalyticsSalesResponse>(`/analytics/sales${query ? `?${query}` : ''}`)
  },
  expenses: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return request<AnalyticsExpensesResponse>(`/analytics/expenses${query ? `?${query}` : ''}`)
  },
  inventory: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return request<AnalyticsInventoryResponse>(`/analytics/inventory${query ? `?${query}` : ''}`)
  },
}

