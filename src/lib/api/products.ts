import { request } from './request'
import type { Category } from './categories'

export interface ProductBarcode {
  id: string
  barcode: string
}

export interface Product {
  id: string
  name: string
  barcode: string | null // Primary barcode (first one) for backward compatibility
  barcodes?: ProductBarcode[] // All barcodes for this product
  categoryId: string
  category?: Category
  unit: string
  lowStockThreshold: number
  isActive: boolean
  totalStock?: number // For units: sum of remaining, for others: lot count
  totalRemaining?: number // Actual sum of remaining quantities
  lotCount?: number // Number of lots with remaining stock
  currentCost?: number | null
  createdAt: string
  updatedAt: string
}

export const products = {
  list: (categoryId?: string) =>
    request<Product[]>(`/products${categoryId ? `?categoryId=${categoryId}` : ''}`),
  get: (id: string) => request<Product>(`/products/${id}`),
  getByBarcode: (barcode: string) => request<Product>(`/products/barcode/${barcode}`),
  create: (data: {
    name: string
    barcode?: string
    categoryId: string
    unit?: string
    lowStockThreshold?: number
  }) => request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (
    id: string,
    data: Partial<{ name: string; categoryId: string; unit: string; lowStockThreshold: number }>
  ) => request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  // Barcode management
  addBarcode: (productId: string, barcode: string) =>
    request<ProductBarcode>(`/products/${productId}/barcodes`, {
      method: 'POST',
      body: JSON.stringify({ barcode }),
    }),
  removeBarcode: (productId: string, barcodeId: string) =>
    request<void>(`/products/${productId}/barcodes/${barcodeId}`, { method: 'DELETE' }),
}

