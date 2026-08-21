import { requestWithSchema } from './request'
import type { SaleChannel as ContractSaleChannel } from '#contracts/domain/sale'
import {
  salePreviewResponseSchema,
  saleResponseSchema,
  salesListResponseSchema,
  salesMarginAnalyticsResponseSchema,
  salesSummaryResponseSchema,
  etsySaleResolutionApplyResultSchema,
  etsySaleResolutionPreviewSchema,
  type EtsySaleResolutionApplyBody as ContractEtsySaleResolutionApplyBody,
  type EtsySaleResolutionApplyResult as ContractEtsySaleResolutionApplyResult,
  type EtsySaleResolutionPreview as ContractEtsySaleResolutionPreview,
  type EtsySaleResolutionPreviewBody as ContractEtsySaleResolutionPreviewBody,
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
import type { SalesVerificationFilter as ContractSalesVerificationFilter } from '#contracts/routes/sales'

export type SalesVerificationFilter = ContractSalesVerificationFilter

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
export type EtsySaleResolutionPreview = ContractEtsySaleResolutionPreview
export type EtsySaleResolutionApplyResult = ContractEtsySaleResolutionApplyResult
export type EtsySaleResolutionPreviewBody = ContractEtsySaleResolutionPreviewBody
export type EtsySaleResolutionApplyBody = ContractEtsySaleResolutionApplyBody

export const sales = {
  list: (params: SalesListQuery = {}, options?: Pick<RequestInit, 'signal'>) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value))
    }
    const path = `/sales?${query.toString()}`
    return options
      ? requestWithSchema(path, salesListResponseSchema, options)
      : requestWithSchema(path, salesListResponseSchema)
  },
  get: (id: string) => requestWithSchema(`/sales/${id}`, saleResponseSchema),
  previewEtsyResolution: (saleId: string, body: EtsySaleResolutionPreviewBody) =>
    requestWithSchema(`/sales/${saleId}/etsy-resolution/preview`, etsySaleResolutionPreviewSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  applyEtsyResolution: (saleId: string, body: EtsySaleResolutionApplyBody) =>
    requestWithSchema(`/sales/${saleId}/etsy-resolution/apply`, etsySaleResolutionApplyResultSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
  summary: (
    params?: {
      startDate?: string
      endDate?: string
      search?: string
      verificationStatus?: SalesVerificationFilter
    },
    options?: Pick<RequestInit, 'signal'>,
  ) => {
    const query = new URLSearchParams()
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    if (params?.verificationStatus) query.set('verificationStatus', params.verificationStatus)
    const path = `/sales/summary?${query.toString()}`
    return options
      ? requestWithSchema(path, salesSummaryResponseSchema, options)
      : requestWithSchema(path, salesSummaryResponseSchema)
  },
  analytics: (days = 30) =>
    requestWithSchema(`/sales/analytics/margins?days=${days}`, salesMarginAnalyticsResponseSchema),
}

