import { z } from 'zod'
import { supplierSchema } from '../domain/supplier'

export const suppliersResponseSchema = z.array(supplierSchema)

export const supplierCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
})

export const supplierUpdateBodySchema = supplierCreateBodySchema.partial()

export const supplierResponseSchema = supplierSchema

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
export type SupplierLowStockProduct = z.infer<typeof supplierLowStockProductSchema>
export type SupplierLowStockResponse = z.infer<typeof supplierLowStockResponseSchema>
export type ProductSupplierIdsResponse = z.infer<typeof productSupplierIdsResponseSchema>
