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
  totalStock?: number       // For units: sum of remaining, for others: lot count
  totalRemaining?: number   // Actual sum of remaining quantities
  lotCount?: number         // Number of lots with remaining stock
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

// Etsy Fees
export interface EtsyFeeConfig {
  id: string
  name: string
  transactionFee: number // 0.065 = 6.5%
  regulatoryFee: number // 0.0032 = 0.32%
  paymentFeePercent: number // 0.04 = 4%
  paymentFeeFixed: number // £0.20
  vatRate: number // 0.20 = 20%
  listingFee: number // £0.15
  effectiveFrom: string
  effectiveTo: string | null
  isActive: boolean
  createdAt: string
}

export interface EtsyFeeCreateData {
  name: string
  transactionFee: number
  regulatoryFee: number
  paymentFeePercent: number
  paymentFeeFixed: number
  vatRate: number
  listingFee: number
}

// Packaging Overhead
export interface PackagingOverhead {
  id: string
  name: string
  costPerOrder: number
  effectiveFrom: string
  effectiveTo: string | null
  isActive: boolean
  createdAt: string
}

export interface PackagingOverheadResponse {
  overheads: PackagingOverhead[]
  totalPerOrder: number
}

export const settings = {
  dashboardStats: () => request<DashboardStats>('/settings/dashboard-stats'),
  // Etsy Fees
  getEtsyFees: () => request<EtsyFeeConfig[]>('/settings/etsy-fees'),
  createEtsyFees: (data: EtsyFeeCreateData) =>
    request<EtsyFeeConfig>('/settings/etsy-fees', { method: 'POST', body: JSON.stringify(data) }),
  // Packaging Overhead
  getPackagingOverhead: () => request<PackagingOverheadResponse>('/settings/packaging-overhead'),
  createPackagingOverhead: (data: { name: string; costPerOrder: number }) =>
    request<PackagingOverhead>('/settings/packaging-overhead', { method: 'POST', body: JSON.stringify(data) }),
  updatePackagingOverhead: (id: string, data: { name?: string; costPerOrder?: number }) =>
    request<PackagingOverhead>(`/settings/packaging-overhead/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePackagingOverhead: (id: string) =>
    request<void>(`/settings/packaging-overhead/${id}`, { method: 'DELETE' }),
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
  hamperId: string | null
  hamperName: string
  description?: string
  quantity: number
  unitPrice: number
  requirements: RequirementAllocation[]
  totalCost: number
  canFulfill: boolean
  isBespoke?: boolean
}

export interface SalePreview {
  lines: SaleLinePreview[]
  summary: {
    totalGross: number
    postageCharged: number
    totalCost: number
    estimatedFees: number
    packagingOverhead: number
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
  hamperId: string | null
  hamper: { id: string; name: string; sellingPrice: number } | null
  description: string | null
  quantity: number
  unitPrice: number
  lineCost: number
  consumptions: SaleConsumption[]
}

export type SaleChannel = 'etsy' | 'direct' | 'fair'

export interface Sale {
  id: string
  saleDate: string
  saleChannel: SaleChannel
  etsyOrderId: string | null
  grossRevenue: number
  postageCharged: number
  postageCost: number
  etsyFees: number
  transactionFee: number
  postageTransactionFee: number
  regulatoryFee: number
  processingFee: number
  vatOnProcessingFee: number
  listingFee: number
  packagingOverhead: number
  netRevenue: number
  totalCost: number
  margin: number
  notes: string | null
  isHistorical: boolean
  createdAt: string
  lines: SaleLine[]
}

export interface SaleLineInput {
  hamperId?: string // Optional for bespoke items
  description?: string // For bespoke items
  quantity: number
  unitPrice?: number // Required for bespoke items
}

export interface SaleCreateData {
  grossRevenue: number
  postageCharged?: number
  postageCost?: number
  saleChannel?: SaleChannel
  saleDate?: string // ISO date string for backdated sales
  etsyOrderId?: string
  notes?: string
  lines: SaleLineInput[]
  allocationOverrides?: Record<string, { lotId: string; quantity: number }[]>
}

export interface MarginAnalytics {
  period: { days: number; startDate: string; endDate: string }
  summary: {
    salesCount: number
    totalRevenue: number
    totalPostageCharged: number
    totalPostageCost: number
    postageProfit: number
    totalFees: number
    totalOverhead: number
    totalCost: number
    totalMargin: number
    marginPercent: number
  }
  byHamper: { name: string; count: number; revenue: number }[]
  byChannel: { channel: string; count: number; revenue: number; fees: number; margin: number }[]
}

export interface SalesListResponse {
  sales: Sale[]
  total: number
}

export interface SalesSummary {
  totals: {
    salesCount: number
    totalRevenue: number
    totalPostageCharged: number
    totalPostageCost: number
    totalFees: number
    totalCost: number
    totalMargin: number
  }
  byChannel: { channel: string; count: number; revenue: number; fees: number; margin: number }[]
  byHamper: { name: string; count: number; revenue: number }[]
}

export const sales = {
  list: (params?: { limit?: number; offset?: number; startDate?: string; endDate?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    return request<SalesListResponse>(`/sales?${query.toString()}`)
  },
  get: (id: string) => request<Sale>(`/sales/${id}`),
  preview: (data: { lines: SaleLineInput[]; postageCharged?: number; saleChannel?: SaleChannel }) =>
    request<SalePreview>('/sales/preview', { method: 'POST', body: JSON.stringify(data) }),
  create: (data: SaleCreateData) =>
    request<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  summary: (params?: { startDate?: string; endDate?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    return request<SalesSummary>(`/sales/summary?${query.toString()}`)
  },
  analytics: (days = 30) =>
    request<MarginAnalytics>(`/sales/analytics/margins?days=${days}`),
}

// Business Expenses
export type ExpenseCategory = 'ADVERTISING' | 'LISTING_FEE' | 'POSTAGE' | 'PACKAGING' | 'STOCK' | 'OTHER'

export interface BusinessExpense {
  id: string
  date: string
  category: ExpenseCategory
  supplier: string | null
  description: string
  amountIncVat: number
  amountExcVat: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ExpenseCreateData {
  date?: string
  category: ExpenseCategory
  supplier?: string
  description: string
  amountIncVat: number
  amountExcVat: number
}

export interface ExpenseListResponse {
  expenses: BusinessExpense[]
  total: number
  limit: number
  offset: number
}

export interface ExpenseSummary {
  byCategory: { category: ExpenseCategory; totalIncVat: number; totalExcVat: number; count: number }[]
  byMonth: { month: string; totalIncVat: number; totalExcVat: number; count: number }[]
  totals: { totalIncVat: number; totalExcVat: number; count: number }
}

export const expenses = {
  list: (params?: { category?: ExpenseCategory; startDate?: string; endDate?: string; search?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.category) query.set('category', params.category)
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    return request<ExpenseListResponse>(`/expenses?${query.toString()}`)
  },
  get: (id: string) => request<BusinessExpense>(`/expenses/${id}`),
  summary: (params?: { startDate?: string; endDate?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    return request<ExpenseSummary>(`/expenses/summary?${query.toString()}`)
  },
  create: (data: ExpenseCreateData) =>
    request<BusinessExpense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ExpenseCreateData>) =>
    request<BusinessExpense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/expenses/${id}`, { method: 'DELETE' }),
}
