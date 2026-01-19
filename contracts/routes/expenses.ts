import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'
import { businessExpenseSchema, expenseCategorySchema } from '../domain/expense'

export const expenseIdParamSchema = cuidSchema

export const expensesListQuerySchema = z.object({
  category: expenseCategorySchema.optional(),
  startDate: isoDateTimeSchema.optional(),
  endDate: isoDateTimeSchema.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export const expensesSummaryQuerySchema = z.object({
  startDate: isoDateTimeSchema.optional(),
  endDate: isoDateTimeSchema.optional(),
  search: z.string().optional(),
})

export const expenseResponseSchema = businessExpenseSchema

export const expensesListResponseSchema = z.object({
  expenses: z.array(businessExpenseSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
})

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
export type ExpenseResponse = z.infer<typeof expenseResponseSchema>
export type ExpensesListResponse = z.infer<typeof expensesListResponseSchema>
export type ExpensesCreateBody = z.input<typeof expensesCreateBodySchema>
export type ExpensesUpdateBody = z.input<typeof expensesUpdateBodySchema>
export type ExpensesSummaryResponse = z.infer<typeof expensesSummaryResponseSchema>
