import { z } from 'zod'
import { cuidSchema, decimalSchema, isoDateTimeSchema } from '../http/primitives'

export const expenseCategorySchema = z.enum([
  'ADVERTISING',
  'LISTING_FEE',
  'POSTAGE',
  'PACKAGING',
  'STOCK',
  'OTHER',
])

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>

export const businessExpenseSchema = z.object({
  id: cuidSchema,
  date: isoDateTimeSchema,
  category: expenseCategorySchema,
  supplier: z.string().max(100).nullable(),
  description: z.string().min(1).max(500),
  amountIncVat: decimalSchema,
  amountExcVat: decimalSchema,
  isActive: z.boolean(),
  isHistorical: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type BusinessExpense = z.infer<typeof businessExpenseSchema>
