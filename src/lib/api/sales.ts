import { requestWithSchema } from './request'
import type { SaleChannel as ContractSaleChannel } from '#contracts/domain/sale'
import {
  salePreviewResponseSchema,
  saleResponseSchema,
  salesListResponseSchema,
  salesMarginAnalyticsResponseSchema,
  salesSummaryResponseSchema,
  type SalePreviewResponse,
  type SaleResponse,
  type SalesCreateBody,
  type SalesListQuery,
  type SalesSort as ContractSalesSort,
  type SalesMarginAnalyticsResponse,
  type SalesPreviewBody,
  type SalesSummaryResponse,
  type SortDirection as ContractSortDirection,
} from '#contracts/routes/sales'

export type SaleChannel = ContractSaleChannel

export type SalePreview = SalePreviewResponse
export type SaleLinePreview = SalePreviewResponse['lines'][number]
export type RequirementAllocation = SaleLinePreview['requirements'][number]
export type AllocationLine = RequirementAllocation['allocations'][number]

export type Sale = SaleResponse
export type SaleLine = SaleResponse['lines'][number]
export type SaleConsumption = SaleLine['consumptions'][number]

export type SaleLineInput = SalesPreviewBody['lines'][number]
export type SaleCreateData = SalesCreateBody

export type MarginAnalytics = SalesMarginAnalyticsResponse
export type SalesSummary = SalesSummaryResponse
export type SalesSort = ContractSalesSort
export type SortDirection = ContractSortDirection

export const sales = {
  list: (params: SalesListQuery = {}, options?: Pick<RequestInit, 'signal'>) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value))
    }
    return requestWithSchema(`/sales?${query}`, salesListResponseSchema, options)
  },
  get: (id: string) => requestWithSchema(`/sales/${id}`, saleResponseSchema),
  preview: (data: SalesPreviewBody) =>
    requestWithSchema('/sales/preview', salePreviewResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  create: (data: SaleCreateData) =>
    requestWithSchema('/sales', saleResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  summary: (params?: { startDate?: string; endDate?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    return requestWithSchema(`/sales/summary?${query.toString()}`, salesSummaryResponseSchema)
  },
  analytics: (days = 30) =>
    requestWithSchema(`/sales/analytics/margins?days=${days}`, salesMarginAnalyticsResponseSchema),
}

