import type { HamperFormData, HamperSortOption } from './types'

export const HAMPER_SORT_OPTIONS: { value: HamperSortOption; label: string }[] = [
  { value: 'canmake-desc', label: 'Can Make (high→low)' },
  { value: 'canmake-asc', label: 'Can Make (low→high)' },
  { value: 'name-asc', label: 'Name (A→Z)' },
  { value: 'name-desc', label: 'Name (Z→A)' },
  { value: 'price-asc', label: 'Price (low→high)' },
  { value: 'price-desc', label: 'Price (high→low)' },
  { value: 'reqs-asc', label: 'Fewest requirements' },
  { value: 'reqs-desc', label: 'Most requirements' },
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
]

export const DEFAULT_HAMPERS_SORT: HamperSortOption = 'canmake-desc'

export const emptyHamperForm: HamperFormData = {
  name: '',
  sellingPrice: '',
  etsyListingId: '',
  hasVariants: false,
  requirements: [],
}
