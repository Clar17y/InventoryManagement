import { z } from 'zod'
import { cuidSchema } from '../http/primitives'
import { supplierSchema } from '../domain/supplier'

const supplierNameSchema = z.string().trim().min(1).max(100)

export const supplierIdParamSchema = cuidSchema

export const suppliersResponseSchema = z.array(supplierSchema)

export const supplierCreateBodySchema = z.object({
  name: supplierNameSchema,
})

export const supplierUpdateBodySchema = supplierCreateBodySchema.partial()

export const supplierResponseSchema = supplierSchema

export const supplierMutationOutcomeSchema = z.enum(['created', 'existing', 'restored'])

export const supplierMutationResponseSchema = z.object({
  item: supplierSchema,
  outcome: supplierMutationOutcomeSchema,
})

export const supplierLowStockProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryName: z.string().nullable(),
  unit: z.string(),
  totalStock: z.number(),
  lowStockThreshold: z.number(),
})

export const supplierLowStockResponseSchema = z.array(supplierLowStockProductSchema)

export const productSupplierIdsResponseSchema = z.array(z.string())

export type SuppliersResponse = z.infer<typeof suppliersResponseSchema>
export type SupplierCreateBody = z.input<typeof supplierCreateBodySchema>
export type SupplierUpdateBody = z.input<typeof supplierUpdateBodySchema>
export type SupplierResponse = z.infer<typeof supplierResponseSchema>
export type SupplierIdParam = z.infer<typeof supplierIdParamSchema>
export type SupplierMutationResponse = z.infer<typeof supplierMutationResponseSchema>
export type SupplierLowStockProduct = z.infer<typeof supplierLowStockProductSchema>
export type SupplierLowStockResponse = z.infer<typeof supplierLowStockResponseSchema>
export type ProductSupplierIdsResponse = z.infer<typeof productSupplierIdsResponseSchema>
