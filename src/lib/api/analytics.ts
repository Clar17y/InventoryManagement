import { requestWithSchema } from './request'
import {
  analyticsExpensesResponseSchema,
  analyticsInventoryResponseSchema,
  analyticsOverviewResponseSchema,
  analyticsProfitResponseSchema,
  analyticsSalesResponseSchema,
  type AnalyticsExpensesResponse as ContractAnalyticsExpensesResponse,
  type AnalyticsInventoryResponse as ContractAnalyticsInventoryResponse,
  type AnalyticsOverviewResponse as ContractAnalyticsOverviewResponse,
  type AnalyticsProfitResponse as ContractAnalyticsProfitResponse,
  type AnalyticsSalesResponse as ContractAnalyticsSalesResponse,
} from '#contracts/routes/analytics'

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

export type AnalyticsOverviewResponse = ContractAnalyticsOverviewResponse

export type AnalyticsProfitResponse = ContractAnalyticsProfitResponse

export type AnalyticsSalesResponse = ContractAnalyticsSalesResponse

export type AnalyticsExpensesResponse = ContractAnalyticsExpensesResponse

export type AnalyticsInventoryResponse = ContractAnalyticsInventoryResponse

export const analytics = {
  overview: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return requestWithSchema(
      `/analytics/overview${query ? `?${query}` : ''}`,
      analyticsOverviewResponseSchema,
    )
  },
  profit: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return requestWithSchema(
      `/analytics/profit${query ? `?${query}` : ''}`,
      analyticsProfitResponseSchema,
    )
  },
  sales: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return requestWithSchema(
      `/analytics/sales${query ? `?${query}` : ''}`,
      analyticsSalesResponseSchema,
    )
  },
  expenses: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return requestWithSchema(
      `/analytics/expenses${query ? `?${query}` : ''}`,
      analyticsExpensesResponseSchema,
    )
  },
  inventory: (params?: AnalyticsPeriodParams) => {
    const query = buildPeriodQuery(params)
    return requestWithSchema(
      `/analytics/inventory${query ? `?${query}` : ''}`,
      analyticsInventoryResponseSchema,
    )
  },
}

