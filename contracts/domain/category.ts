import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'
import { pickRuleSchema } from './enums'

export const categoryCountSchema = z.object({
  products: z.number().int().nonnegative(),
})

export const categorySchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  pickRule: pickRuleSchema,
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  _count: categoryCountSchema.optional(),
})

export type Category = z.infer<typeof categorySchema>

export const categoryListItemSchema = categorySchema.extend({
  _count: categoryCountSchema,
})

export type CategoryListItem = z.infer<typeof categoryListItemSchema>

