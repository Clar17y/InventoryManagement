import { requestWithSchema } from './request'
import type {
  EtsyAccount as ContractEtsyAccount,
  EtsyImportResult as ContractEtsyImportResult,
  EtsyInventory as ContractEtsyInventory,
  EtsyListing as ContractEtsyListing,
  EtsyListingMoney as ContractEtsyListingMoney,
  EtsyOrderImportResult as ContractEtsyOrderImportResult,
  EtsyOrdersBulkImportResult as ContractEtsyOrdersBulkImportResult,
  EtsyPendingOrder as ContractEtsyPendingOrder,
  EtsyPendingOrderItem as ContractEtsyPendingOrderItem,
  EtsyPendingPriceUpdate as ContractEtsyPendingPriceUpdate,
  EtsyPendingSku as ContractEtsyPendingSku,
  EtsyPricePullResult as ContractEtsyPricePullResult,
  EtsyProduct as ContractEtsyProduct,
  EtsyProductOffering as ContractEtsyProductOffering,
  EtsyProvisionalUser as ContractEtsyProvisionalUser,
  EtsySkuPushResult as ContractEtsySkuPushResult,
  EtsyStatus as ContractEtsyStatus,
  EtsySyncComparison as ContractEtsySyncComparison,
  EtsySyncPushResult as ContractEtsySyncPushResult,
} from '#contracts/domain/etsy'
import {
  etsyAccountActionResponseSchema,
  etsyAccountsResponseSchema,
  etsyAuthResponseSchema,
  etsyDisconnectResponseSchema,
  etsyImportResponseSchema,
  etsyListingsResponseSchema,
  etsyProvisionalUsersResponseSchema,
  etsyStatusResponseSchema,
  type EtsyAuthResponse as ContractEtsyAuthResponse,
} from '#contracts/routes/etsy'
import {
  etsyOrderImportResponseSchema,
  etsyOrdersBulkImportResponseSchema,
  etsyPendingOrdersResponseSchema,
  etsyPricesPendingResponseSchema,
  etsyPricesPullResponseSchema,
  etsyPricesPushResponseSchema,
  etsySkusPendingResponseSchema,
  etsySkusPushResponseSchema,
  etsySkuGenerateResponseSchema,
  etsySyncComparisonResponseSchema,
  etsySyncPushResponseSchema,
  type EtsyOrderImportBody,
  type EtsyOrdersBulkImportBody,
  type EtsyPricesPullBody,
  type EtsyPricesPushBody,
  type EtsySyncPushBody,
} from '#contracts/routes/etsySync'

export type EtsyStatus = ContractEtsyStatus
type EtsyAuthSuccessResponse = Extract<ContractEtsyAuthResponse, { authUrl: string }>
export type EtsyAuthResponse = EtsyAuthSuccessResponse

export type EtsyListingMoney = ContractEtsyListingMoney
export type EtsyProductOffering = ContractEtsyProductOffering
export type EtsyProduct = ContractEtsyProduct
export type EtsyInventory = ContractEtsyInventory
export type EtsyListing = ContractEtsyListing

export type EtsyImportResult = ContractEtsyImportResult

export type EtsySyncComparison = ContractEtsySyncComparison
export type EtsySyncPushRequest = EtsySyncPushBody
export type EtsySyncPushResult = ContractEtsySyncPushResult

export type EtsyPendingOrderItem = ContractEtsyPendingOrderItem
export type EtsyPendingOrder = ContractEtsyPendingOrder
export type EtsyOrderImportRequest = EtsyOrderImportBody
export type EtsyOrderImportResult = ContractEtsyOrderImportResult
export type EtsyBulkImportRequest = EtsyOrdersBulkImportBody
export type EtsyBulkImportResult = ContractEtsyOrdersBulkImportResult

export type EtsyPendingSku = ContractEtsyPendingSku
export type EtsySkuPushResult = ContractEtsySkuPushResult

export type EtsyPendingPriceUpdate = ContractEtsyPendingPriceUpdate
export type EtsyPricePullResult = ContractEtsyPricePullResult

export type EtsyAccount = ContractEtsyAccount
export type EtsyProvisionalUser = ContractEtsyProvisionalUser

export const etsy = {
  getStatus: () => requestWithSchema('/etsy/status', etsyStatusResponseSchema),
  initiateAuth: async (): Promise<EtsyAuthResponse> => {
    const result = await requestWithSchema('/etsy/auth', etsyAuthResponseSchema)
    if ('authUrl' in result) {
      return result
    }
    throw new Error(result.message)
  },
  disconnect: () =>
    requestWithSchema('/etsy/disconnect', etsyDisconnectResponseSchema, { method: 'POST' }),
  getListings: () => requestWithSchema('/etsy/listings', etsyListingsResponseSchema),
  importListings: () => requestWithSchema('/etsy/import', etsyImportResponseSchema, { method: 'POST' }),

  getComparison: () => requestWithSchema('/etsy/sync/comparison', etsySyncComparisonResponseSchema),
  pushUpdates: (data: EtsySyncPushRequest) =>
    requestWithSchema('/etsy/sync/push', etsySyncPushResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPendingOrders: () => requestWithSchema('/etsy/sync/orders/pending', etsyPendingOrdersResponseSchema),
  importOrder: (data: EtsyOrderImportRequest) =>
    requestWithSchema('/etsy/sync/orders/import', etsyOrderImportResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  importOrdersBulk: (data: EtsyBulkImportRequest) =>
    requestWithSchema('/etsy/sync/orders/import-bulk', etsyOrdersBulkImportResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateSkus: () =>
    requestWithSchema('/etsy/sync/skus/generate', etsySkuGenerateResponseSchema, { method: 'POST' }),
  getPendingSkus: (listingIds?: string[]) =>
    requestWithSchema(
      listingIds && listingIds.length > 0
        ? `/etsy/sync/skus/pending?listingIds=${listingIds.join(',')}`
        : '/etsy/sync/skus/pending',
      etsySkusPendingResponseSchema,
    ),
  pushSkus: (listingIds?: string[]) =>
    requestWithSchema('/etsy/sync/skus/push', etsySkusPushResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ listingIds }),
    }),

  getPendingPriceUpdates: (listingIds?: string[]) =>
    requestWithSchema(
      listingIds && listingIds.length > 0
        ? `/etsy/sync/prices/pending?listingIds=${listingIds.join(',')}`
        : '/etsy/sync/prices/pending',
      etsyPricesPendingResponseSchema,
    ),
  pushPrices: (updates: EtsyPricesPushBody['updates']) =>
    requestWithSchema('/etsy/sync/prices/push', etsyPricesPushResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),
  pullPrices: (updates: EtsyPricesPullBody['updates']) =>
    requestWithSchema('/etsy/sync/prices/pull', etsyPricesPullResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),

  getAccounts: () => requestWithSchema('/etsy/accounts', etsyAccountsResponseSchema),
  setDefaultAccount: (userId: string) =>
    requestWithSchema(`/etsy/accounts/${userId}/set-default`, etsyAccountActionResponseSchema, {
      method: 'POST',
    }),
  removeAccount: (userId: string) =>
    requestWithSchema(`/etsy/accounts/${userId}`, etsyAccountActionResponseSchema, {
      method: 'DELETE',
    }),

  getProvisionalUsers: () => requestWithSchema('/etsy/provisional-users', etsyProvisionalUsersResponseSchema),
  addProvisionalUser: (loginName: string) =>
    requestWithSchema('/etsy/provisional-users', etsyAccountActionResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ loginName }),
    }),
  removeProvisionalUser: (userId: string) =>
    requestWithSchema(`/etsy/provisional-users/${userId}`, etsyAccountActionResponseSchema, {
      method: 'DELETE',
    }),
}
