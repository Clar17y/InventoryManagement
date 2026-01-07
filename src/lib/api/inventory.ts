import { request } from './request'
import type { Product } from './products'

export interface InventoryLot {
  id: string
  productId: string
  product?: Product
  quantity: number
  remaining: number
  unitCost: number
  receivedAt: string
  expiresAt: string | null
}

export interface CategoryLot extends InventoryLot {
  productName: string
}

export const inventory = {
  byCategory: () =>
    request<{ id: string; name: string; productCount: number; totalStock: number }[]>(
      '/inventory/by-category'
    ),
  lots: (productId: string) => request<InventoryLot[]>(`/inventory/lots/${productId}`),
  lotsByCategory: (categoryId: string) => request<CategoryLot[]>(`/inventory/lots-by-category/${categoryId}`),
  addLot: (data: { productId: string; quantity: number; unitCost: number; expiresAt?: string }) =>
    request<InventoryLot>('/inventory/lots', { method: 'POST', body: JSON.stringify(data) }),
  updateLot: (
    id: string,
    data: { quantity?: number; remaining?: number; unitCost?: number; expiresAt?: string | null }
  ) => request<InventoryLot>(`/inventory/lots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLot: (id: string) => request<void>(`/inventory/lots/${id}`, { method: 'DELETE' }),
  lowStock: () => request<Product[]>('/inventory/alerts/low-stock'),
  expiring: (days?: number) =>
    request<InventoryLot[]>(`/inventory/alerts/expiring${days ? `?days=${days}` : ''}`),
}

