import { request, requestWithSchema } from './request'
import {
  dashboardStatsResponseSchema,
  etsyFeeConfigResponseSchema,
  etsyFeeConfigsResponseSchema,
  packagingOverheadItemResponseSchema,
  packagingOverheadResponseSchema,
  postageTierMutationResponseSchema,
  postageTierResponseSchema,
  postageTiersResponseSchema,
  settingsAuditEntriesResponseSchema,
  type DashboardStatsResponse,
  type EtsyFeeConfigResponse,
  type EtsyFeeCreateBody,
  type PackagingOverheadCreateBody,
  type PackagingOverheadItemResponse,
  type PackagingOverheadResponse as ContractPackagingOverheadResponse,
  type PackagingOverheadUpdateBody,
  type PostageTierCreateBody,
  type PostageTierMutationResponse,
  type PostageTierResponse,
  type PostageTierUpdateBody,
} from '#contracts/routes/settings'
import type { SettingsAuditEntry } from '#contracts/domain/settings'

function withArchived(path: string, options?: { includeArchived?: boolean }) {
  return options?.includeArchived ? `${path}?includeArchived=true` : path
}

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
  getPackagingOverhead: (options?: { includeArchived?: boolean }) =>
    requestWithSchema(
      withArchived('/settings/packaging-overhead', options),
      packagingOverheadResponseSchema,
    ),
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
  restorePackagingOverhead: (id: string) =>
    requestWithSchema(`/settings/packaging-overhead/${id}/restore`, packagingOverheadItemResponseSchema, {
      method: 'POST',
    }),
  // Postage Tiers
  getPostageTiers: (options?: { includeArchived?: boolean }) =>
    requestWithSchema(withArchived('/settings/postage-tiers', options), postageTiersResponseSchema),
  createPostageTier: (data: PostageTierCreateBody) =>
    requestWithSchema('/settings/postage-tiers', postageTierMutationResponseSchema, {
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
  restorePostageTier: (id: string) =>
    requestWithSchema(`/settings/postage-tiers/${id}/restore`, postageTierResponseSchema, {
      method: 'POST',
    }),
  getAuditHistory: () =>
    requestWithSchema('/settings/audit', settingsAuditEntriesResponseSchema),
}

export type { PostageTierMutationResponse, SettingsAuditEntry }
