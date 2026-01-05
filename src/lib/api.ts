const API_BASE = '/api'

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

// Categories
export interface Category {
  id: string
  name: string
  description: string | null
  pickRule: 'FIFO' | 'FEFO' | 'CHEAPEST' | 'MANUAL'
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count?: { products: number }
}

export const categories = {
  list: () => request<Category[]>('/categories'),
  get: (id: string) => request<Category>(`/categories/${id}`),
  create: (data: { name: string; description?: string; pickRule?: string }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; description: string; pickRule: string }>) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE' }),
}

// Products
export interface Product {
  id: string
  name: string
  barcode: string | null
  categoryId: string
  category?: Category
  unit: string
  isActive: boolean
  totalStock?: number
  currentCost?: number | null
  createdAt: string
  updatedAt: string
}

export const products = {
  list: (categoryId?: string) =>
    request<Product[]>(`/products${categoryId ? `?categoryId=${categoryId}` : ''}`),
  get: (id: string) => request<Product>(`/products/${id}`),
  getByBarcode: (barcode: string) => request<Product>(`/products/barcode/${barcode}`),
  create: (data: { name: string; barcode?: string; categoryId: string; unit?: string }) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; barcode: string; categoryId: string; unit: string }>) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }),
}

// Inventory
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

export const inventory = {
  byCategory: () => request<{ id: string; name: string; productCount: number; totalStock: number }[]>(
    '/inventory/by-category'
  ),
  lots: (productId: string) => request<InventoryLot[]>(`/inventory/lots/${productId}`),
  addLot: (data: { productId: string; quantity: number; unitCost: number; expiresAt?: string }) =>
    request<InventoryLot>('/inventory/lots', { method: 'POST', body: JSON.stringify(data) }),
  updateLot: (id: string, data: { quantity?: number; remaining?: number; unitCost?: number; expiresAt?: string | null }) =>
    request<InventoryLot>(`/inventory/lots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLot: (id: string) =>
    request<void>(`/inventory/lots/${id}`, { method: 'DELETE' }),
  lowStock: (threshold?: number) =>
    request<Product[]>(`/inventory/alerts/low-stock${threshold ? `?threshold=${threshold}` : ''}`),
  expiring: (days?: number) =>
    request<InventoryLot[]>(`/inventory/alerts/expiring${days ? `?days=${days}` : ''}`),
}

// Dashboard
export interface DashboardStats {
  products: number
  categories: number
  hampers: number
  lowStockProducts: number
  today: { salesCount: number; revenue: number; margin: number }
  thisWeek: { salesCount: number; revenue: number; margin: number }
}

export const settings = {
  dashboardStats: () => request<DashboardStats>('/settings/dashboard-stats'),
}
