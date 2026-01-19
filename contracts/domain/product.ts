import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'

export const productSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(200),
  categoryId: cuidSchema,
  unit: z.string().max(20),
  lowStockThreshold: z.number().int().min(0),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Product = z.infer<typeof productSchema>

