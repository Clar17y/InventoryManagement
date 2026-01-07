import { request } from './request'

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

