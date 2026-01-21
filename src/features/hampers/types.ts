export type HamperSortOption =
  | 'canmake-desc' | 'canmake-asc'
  | 'name-asc' | 'name-desc'
  | 'price-asc' | 'price-desc'
  | 'reqs-asc' | 'reqs-desc'
  | 'date-desc' | 'date-asc'

export interface RequirementInput {
  categoryId: string
  quantity: number
  isOptional: boolean
}

export interface HamperFormData {
  name: string
  sellingPrice: string
  etsyListingId: string
  hasVariants: boolean
  requirements: RequirementInput[]
}

