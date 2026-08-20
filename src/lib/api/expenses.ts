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
  type ExpensesListQuery,
  type ExpenseSort as ContractExpenseSort,
  type ExpenseSortDirection as ContractExpenseSortDirection,
  type ExpensesSummaryResponse,
  type ExpensesUpdateBody,
} from '#contracts/routes/expenses'

export type ExpenseCategory = ContractExpenseCategory

export type BusinessExpense = ExpenseResponse

export type ExpenseCreateData = ExpensesCreateBody

export type ExpenseListResponse = ExpensesListResponse
export type ExpenseListQuery = ExpensesListQuery
export type ExpenseSort = ContractExpenseSort
export type ExpenseSortDirection = ContractExpenseSortDirection

export type ExpenseSummary = ExpensesSummaryResponse

export const expenses = {
  list: (params: ExpenseListQuery = {}, options?: Pick<RequestInit, 'signal'>) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value))
    }
    const path = `/expenses?${query}`
    return options
      ? requestWithSchema(path, expensesListResponseSchema, options)
      : requestWithSchema(path, expensesListResponseSchema)
  },
  get: (id: string) => requestWithSchema(`/expenses/${id}`, expenseResponseSchema),
  summary: (
    params?: { startDate?: string; endDate?: string; search?: string },
    options?: Pick<RequestInit, 'signal'>,
  ) => {
    const query = new URLSearchParams()
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.search) query.set('search', params.search)
    const path = `/expenses/summary?${query.toString()}`
    return options
      ? requestWithSchema(path, expensesSummaryResponseSchema, options)
      : requestWithSchema(path, expensesSummaryResponseSchema)
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
