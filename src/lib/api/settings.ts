import { request, requestWithSchema } from './request'
import {
  dashboardStatsResponseSchema,
  etsyFeeConfigResponseSchema,
  etsyFeeConfigsResponseSchema,
  packagingOverheadItemResponseSchema,
  packagingOverheadResponseSchema,
  postageTierResponseSchema,
  postageTiersResponseSchema,
  type DashboardStatsResponse,
  type EtsyFeeConfigResponse,
  type EtsyFeeCreateBody,
  type PackagingOverheadCreateBody,
  type PackagingOverheadItemResponse,
  type PackagingOverheadResponse as ContractPackagingOverheadResponse,
  type PackagingOverheadUpdateBody,
  type PostageTierCreateBody,
  type PostageTierResponse,
  type PostageTierUpdateBody,
} from '#contracts/routes/settings'

// Dashboard
export type DashboardStats = DashboardStatsResponse

// Etsy Fees
export type EtsyFeeConfig = EtsyFeeConfigResponse
export type EtsyFeeCreateData = EtsyFeeCreateBody

// Packaging Overhead
export type PackagingOverhead = PackagingOverheadItemResponse
export type PackagingOverheadResponse = ContractPackagingOverheadResponse

// Postage Tiers
export type PostageTier = PostageTierResponse

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
  // Postage Tiers
  getPostageTiers: () =>
    requestWithSchema('/settings/postage-tiers', postageTiersResponseSchema),
  createPostageTier: (data: PostageTierCreateBody) =>
    requestWithSchema('/settings/postage-tiers', postageTierResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePostageTier: (id: string, data: PostageTierUpdateBody) =>
    requestWithSchema(`/settings/postage-tiers/${id}`, postageTierResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deletePostageTier: (id: string) =>
    request<void>(`/settings/postage-tiers/${id}`, { method: 'DELETE' }),
}
