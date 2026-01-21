import type { ExpenseCategory } from '../../lib/api'
import type { ExpenseFormData } from './types'

export const PAGE_SIZE = 20

export const emptyForm: ExpenseFormData = {
  date: new Date().toISOString().split('T')[0] ?? '',
  category: 'OTHER',
  supplier: '',
  description: '',
  amountIncVat: '',
  amountExcVat: '',
}

export const categoryLabels: Record<ExpenseCategory, string> = {
  ADVERTISING: 'Advertising',
  LISTING_FEE: 'Listing Fee',
  POSTAGE: 'Postage',
  PACKAGING: 'Packaging',
  STOCK: 'Stock/Contents',
  OTHER: 'Other',
}

export const categoryColors: Record<ExpenseCategory, string> = {
  ADVERTISING: 'bg-accent-100 text-accent-800',
  LISTING_FEE: 'bg-info-100 text-info-800',
  POSTAGE: 'bg-orange-100 text-orange-800',
  PACKAGING: 'bg-green-100 text-green-800',
  STOCK: 'bg-amber-100 text-amber-800',
  OTHER: 'bg-gray-100 text-gray-800',
}

