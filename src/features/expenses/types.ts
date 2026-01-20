import type { ExpenseCategory } from '../../lib/api'

export interface ExpenseFormData {
  date: string
  category: ExpenseCategory
  supplier: string
  description: string
  amountIncVat: string
  amountExcVat: string
}

