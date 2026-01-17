import { request } from './request'

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
  variantId?: string // Optional: specific variant of the hamper
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
  isHistorical?: boolean // Skip inventory allocation for historical imports
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
  create: (data: SaleCreateData) => request<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  summary: (params?: { startDate?: string; endDate?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    return request<SalesSummary>(`/sales/summary?${query.toString()}`)
  },
  analytics: (days = 30) => request<MarginAnalytics>(`/sales/analytics/margins?days=${days}`),
}

