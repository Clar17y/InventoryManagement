import { request, requestWithSchema } from './request'
import {
  dashboardStatsResponseSchema,
  etsyFeeConfigResponseSchema,
  etsyFeeConfigsResponseSchema,
  packagingOverheadItemResponseSchema,
  packagingOverheadResponseSchema,
  type DashboardStatsResponse,
  type EtsyFeeConfigResponse,
  type EtsyFeeCreateBody,
  type PackagingOverheadCreateBody,
  type PackagingOverheadItemResponse,
  type PackagingOverheadResponse as ContractPackagingOverheadResponse,
  type PackagingOverheadUpdateBody,
} from '#contracts/routes/settings'

// Dashboard
export type DashboardStats = DashboardStatsResponse

// Etsy Fees
export type EtsyFeeConfig = EtsyFeeConfigResponse
export type EtsyFeeCreateData = EtsyFeeCreateBody

// Packaging Overhead
export type PackagingOverhead = PackagingOverheadItemResponse
export type PackagingOverheadResponse = ContractPackagingOverheadResponse

export const settings = {
  dashboardStats: () => requestWithSchema('/settings/dashboard-stats', dashboardStatsResponseSchema),
  // Etsy Fees
  getEtsyFees: () => requestWithSchema('/settings/etsy-fees', etsyFeeConfigsResponseSchema),
  createEtsyFees: (data: EtsyFeeCreateData) =>
    requestWithSchema('/settings/etsy-fees', etsyFeeConfigResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // Packaging Overhead
  getPackagingOverhead: () =>
    requestWithSchema('/settings/packaging-overhead', packagingOverheadResponseSchema),
  createPackagingOverhead: (data: PackagingOverheadCreateBody) =>
    requestWithSchema('/settings/packaging-overhead', packagingOverheadItemResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePackagingOverhead: (id: string, data: PackagingOverheadUpdateBody) =>
    requestWithSchema(`/settings/packaging-overhead/${id}`, packagingOverheadItemResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deletePackagingOverhead: (id: string) =>
    request<void>(`/settings/packaging-overhead/${id}`, { method: 'DELETE' }),
}
