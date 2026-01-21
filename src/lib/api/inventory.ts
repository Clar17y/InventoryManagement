import { request, requestWithSchema } from './request'
import {
  inventoryByCategoryResponseSchema,
  inventoryExpiringResponseSchema,
  inventoryLotsByCategoryResponseSchema,
  inventoryLotsResponseSchema,
  inventoryLotResponseSchema,
  inventoryLowStockResponseSchema,
  type InventoryAddLotBody,
  type InventoryByCategoryResponse,
  type InventoryExpiringResponse,
  type InventoryLotResponse,
  type InventoryLotsByCategoryResponse,
  type InventoryLowStockProduct,
  type InventoryUpdateLotBody,
} from '#contracts/routes/inventory'

export type InventoryCategorySummary = InventoryByCategoryResponse[number]
export type InventoryLot = InventoryLotResponse
export type CategoryLot = InventoryLotsByCategoryResponse[number]
export type LowStockProduct = InventoryLowStockProduct
export type ExpiringLot = InventoryExpiringResponse[number]

export const inventory = {
  byCategory: () => requestWithSchema('/inventory/by-category', inventoryByCategoryResponseSchema),
  lots: (productId: string) =>
    requestWithSchema(`/inventory/lots/${productId}`, inventoryLotsResponseSchema),
  lotsByCategory: (categoryId: string) =>
    requestWithSchema(`/inventory/lots-by-category/${categoryId}`, inventoryLotsByCategoryResponseSchema),
  addLot: (data: InventoryAddLotBody) =>
    requestWithSchema('/inventory/lots', inventoryLotResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateLot: (id: string, data: InventoryUpdateLotBody) =>
    requestWithSchema(`/inventory/lots/${id}`, inventoryLotResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteLot: (id: string) => request<void>(`/inventory/lots/${id}`, { method: 'DELETE' }),
  lowStock: () => requestWithSchema('/inventory/alerts/low-stock', inventoryLowStockResponseSchema),
  expiring: (days?: number) =>
    requestWithSchema(
      `/inventory/alerts/expiring${days ? `?days=${days}` : ''}`,
      inventoryExpiringResponseSchema
    ),
}

