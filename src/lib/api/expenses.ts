import { request, requestWithSchema } from './request'
import type { ExpenseCategory as ContractExpenseCategory } from '#contracts/domain/expense'
import {
  expenseResponseSchema,
  expensesCreateBodySchema,
  expensesListResponseSchema,
  expensesSummaryResponseSchema,
  expensesUpdateBodySchema,
  type ExpenseResponse,
  type ExpensesCreateBody,
  type ExpensesListResponse,
  type ExpensesSummaryResponse,
  type ExpensesUpdateBody,
} from '#contracts/routes/expenses'

export type ExpenseCategory = ContractExpenseCategory

export type BusinessExpense = ExpenseResponse

export type ExpenseCreateData = ExpensesCreateBody

export type ExpenseListResponse = ExpensesListResponse

export type ExpenseSummary = ExpensesSummaryResponse

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
    return requestWithSchema(`/expenses?${query.toString()}`, expensesListResponseSchema)
  },
  get: (id: string) => requestWithSchema(`/expenses/${id}`, expenseResponseSchema),
  summary: (params?: { startDate?: string; endDate?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    return requestWithSchema(`/expenses/summary?${query.toString()}`, expensesSummaryResponseSchema)
  },
  create: (data: ExpenseCreateData) =>
    requestWithSchema('/expenses', expenseResponseSchema, {
      method: 'POST',
      body: JSON.stringify(expensesCreateBodySchema.parse(data)),
    }),
  update: (id: string, data: ExpensesUpdateBody) =>
    requestWithSchema(`/expenses/${id}`, expenseResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(expensesUpdateBodySchema.parse(data)),
    }),
  delete: (id: string) => request<void>(`/expenses/${id}`, { method: 'DELETE' }),
}
