import { request } from './request'

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

export interface HamperVariantMapping {
  categoryId: string
  productId: string
  product?: { id: string; name: string }
}

export interface HamperVariantAvailability {
  variantId: string
  name: string
  etsySku: string | null
  canMake: number
  mappings?: HamperVariantMapping[]
}

export interface HamperVariant {
  id: string
  hamperId: string
  name: string
  etsySku: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  canMake?: number
  mappings?: (HamperVariantMapping & {
    category: { id: string; name: string }
  })[]
}

export interface Hamper {
  id: string
  name: string
  sellingPrice: number
  etsyListingId: string | null
  hasVariants: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  requirements: HamperRequirement[]
  canMake: number
  variantAvailability?: HamperVariantAvailability[]
}

export interface HamperDetail extends Omit<Hamper, 'requirements'> {
  requirements: HamperRequirementDetail[]
  estimatedCost: number
  estimatedMargin: number
  variantAvailability?: HamperVariantAvailability[]
  variants?: HamperVariant[]
}

export interface HamperCreateData {
  name: string
  sellingPrice: number
  etsyListingId?: string
  hasVariants?: boolean
  requirements: { categoryId: string; quantity: number; isOptional?: boolean }[]
}

export interface HamperVariantCreateData {
  name: string
  etsySku?: string
  mappings: { categoryId: string; productId: string }[]
}

export const hampers = {
  list: () => request<Hamper[]>('/hampers'),
  get: (id: string) => request<HamperDetail>(`/hampers/${id}`),
  create: (data: HamperCreateData) => request<Hamper>('/hampers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<HamperCreateData>) =>
    request<Hamper>(`/hampers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/hampers/${id}`, { method: 'DELETE' }),
}

export const hamperVariants = {
  list: (hamperId: string) => request<HamperVariant[]>(`/hampers/${hamperId}/variants`),
  create: (hamperId: string, data: HamperVariantCreateData) =>
    request<HamperVariant>(`/hampers/${hamperId}/variants`, { method: 'POST', body: JSON.stringify(data) }),
  update: (hamperId: string, variantId: string, data: Partial<HamperVariantCreateData>) =>
    request<HamperVariant>(`/hampers/${hamperId}/variants/${variantId}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (hamperId: string, variantId: string) =>
    request<void>(`/hampers/${hamperId}/variants/${variantId}`, { method: 'DELETE' }),
}

