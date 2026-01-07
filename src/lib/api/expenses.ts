import { request } from './request'

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
  list: (params?: {
    category?: ExpenseCategory
    startDate?: string
    endDate?: string
    search?: string
    limit?: number
    offset?: number
  }) => {
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
  delete: (id: string) => request<void>(`/expenses/${id}`, { method: 'DELETE' }),
}

