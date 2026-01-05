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

export interface CategoryLot extends InventoryLot {
  productName: string
}

export const inventory = {
  byCategory: () => request<{ id: string; name: string; productCount: number; totalStock: number }[]>(
    '/inventory/by-category'
  ),
  lots: (productId: string) => request<InventoryLot[]>(`/inventory/lots/${productId}`),
  lotsByCategory: (categoryId: string) => request<CategoryLot[]>(`/inventory/lots-by-category/${categoryId}`),
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

// Hampers
export interface HamperRequirement {
  id: string
  categoryId: string
  category: { id: string; name: string }
  quantity: number
  isOptional: boolean
}

export interface HamperRequirementDetail extends HamperRequirement {
  quantityRequired: number
  availableStock: number
  canFulfill: number
  estimatedCost: number
}

export interface Hamper {
  id: string
  name: string
  sellingPrice: number
  etsyListingId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  requirements: HamperRequirement[]
  canMake: number
}

export interface HamperDetail extends Omit<Hamper, 'requirements'> {
  requirements: HamperRequirementDetail[]
  estimatedCost: number
  estimatedMargin: number
}

export interface HamperCreateData {
  name: string
  sellingPrice: number
  etsyListingId?: string
  requirements: { categoryId: string; quantity: number; isOptional?: boolean }[]
}

export const hampers = {
  list: () => request<Hamper[]>('/hampers'),
  get: (id: string) => request<HamperDetail>(`/hampers/${id}`),
  create: (data: HamperCreateData) =>
    request<Hamper>('/hampers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<HamperCreateData>) =>
    request<Hamper>(`/hampers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/hampers/${id}`, { method: 'DELETE' }),
}

// Sales
export interface AllocationLine {
  lotId: string
  productId: string
  productName: string
  quantity: number
  unitCost: number
}

export interface RequirementAllocation {
  categoryId: string
  categoryName: string
  quantityRequired: number
  allocations: AllocationLine[]
  totalCost: number
  fulfilled: boolean
}

export interface SaleLinePreview {
  hamperId: string
  hamperName: string
  quantity: number
  unitPrice: number
  requirements: RequirementAllocation[]
  totalCost: number
  canFulfill: boolean
}

export interface SalePreview {
  lines: SaleLinePreview[]
  summary: {
    totalGross: number
    totalCost: number
    estimatedMargin: number
  }
}

export interface SaleConsumption {
  id: string
  lotId: string
  quantity: number
  unitCost: number
  lot: { id: string; product: { id: string; name: string } }
}

export interface SaleLine {
  id: string
  hamperId: string
  hamper: { id: string; name: string; sellingPrice: number }
  quantity: number
  unitPrice: number
  lineCost: number
  consumptions: SaleConsumption[]
}

export interface Sale {
  id: string
  saleDate: string
  etsyOrderId: string | null
  grossRevenue: number
  etsyFees: number
  packagingOverhead: number
  netRevenue: number
  totalCost: number
  margin: number
  notes: string | null
  createdAt: string
  lines: SaleLine[]
}

export interface SaleCreateData {
  grossRevenue: number
  etsyOrderId?: string
  notes?: string
  lines: { hamperId: string; quantity: number }[]
  allocationOverrides?: Record<string, { lotId: string; quantity: number }[]>
}

export interface MarginAnalytics {
  period: { days: number; startDate: string; endDate: string }
  summary: {
    salesCount: number
    totalRevenue: number
    totalFees: number
    totalOverhead: number
    totalCost: number
    totalMargin: number
    marginPercent: number
  }
  byHamper: { name: string; count: number; revenue: number; margin: number }[]
}

export const sales = {
  list: (limit = 50, offset = 0) =>
    request<Sale[]>(`/sales?limit=${limit}&offset=${offset}`),
  get: (id: string) => request<Sale>(`/sales/${id}`),
  preview: (lines: { hamperId: string; quantity: number }[]) =>
    request<SalePreview>('/sales/preview', { method: 'POST', body: JSON.stringify({ lines }) }),
  create: (data: SaleCreateData) =>
    request<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  analytics: (days = 30) =>
    request<MarginAnalytics>(`/sales/analytics/margins?days=${days}`),
}
