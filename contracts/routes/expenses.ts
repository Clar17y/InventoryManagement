import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'
import { businessExpenseSchema, expenseCategorySchema } from '../domain/expense'
import { paginatedResponseSchema, paginationQuerySchema } from '../http/pagination'

export const expenseIdParamSchema = cuidSchema

export const expenseSortSchema = z.enum(['date', 'amountIncVat'])
export const expenseSortDirectionSchema = z.enum(['asc', 'desc'])

export const expensesListQuerySchema = paginationQuerySchema.extend({
  category: expenseCategorySchema.optional(),
  startDate: isoDateTimeSchema.optional(),
  endDate: isoDateTimeSchema.optional(),
  search: z.string().trim().max(200).optional(),
  sort: expenseSortSchema.default('date'),
  direction: expenseSortDirectionSchema.default('desc'),
})

export const expensesSummaryQuerySchema = z.object({
  startDate: isoDateTimeSchema.optional(),
  endDate: isoDateTimeSchema.optional(),
  search: z.string().trim().max(200).optional(),
})

export const expenseResponseSchema = businessExpenseSchema

export const expensesListResponseSchema = paginatedResponseSchema(businessExpenseSchema)

export const expensesCreateBodySchema = z.object({
  date: isoDateTimeSchema.optional(),
  category: expenseCategorySchema,
  supplier: z.string().max(100).optional(),
  description: z.string().min(1).max(500),
  amountIncVat: z.number().nonnegative(),
  amountExcVat: z.number().nonnegative(),
})

export const expensesUpdateBodySchema = expensesCreateBodySchema.partial()

export const expensesSummaryResponseSchema = z.object({
  byCategory: z.array(
    z.object({
      category: expenseCategorySchema,
      totalIncVat: z.number().finite().nonnegative(),
      totalExcVat: z.number().finite().nonnegative(),
      count: z.number().int().nonnegative(),
    })
  ),
  byMonth: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      totalIncVat: z.number().finite().nonnegative(),
      totalExcVat: z.number().finite().nonnegative(),
      count: z.number().int().nonnegative(),
    })
  ),
  totals: z.object({
    totalIncVat: z.number().finite().nonnegative(),
    totalExcVat: z.number().finite().nonnegative(),
    count: z.number().int().nonnegative(),
  }),
})

export type ExpenseIdParam = z.infer<typeof expenseIdParamSchema>
export type ExpensesListQuery = z.input<typeof expensesListQuerySchema>
export type ExpensesSummaryQuery = z.input<typeof expensesSummaryQuerySchema>
export type ExpenseSort = z.infer<typeof expenseSortSchema>
export type ExpenseSortDirection = z.infer<typeof expenseSortDirectionSchema>
export type ExpenseResponse = z.infer<typeof expenseResponseSchema>
export type ExpensesListResponse = z.infer<typeof expensesListResponseSchema>
export type ExpensesCreateBody = z.input<typeof expensesCreateBodySchema>
export type ExpensesUpdateBody = z.input<typeof expensesUpdateBodySchema>
export type ExpensesSummaryResponse = z.infer<typeof expensesSummaryResponseSchema>
