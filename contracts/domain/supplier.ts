import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'

export const supplierSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(100),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Supplier = z.infer<typeof supplierSchema>
