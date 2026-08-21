import { z } from 'zod'
import { cuidSchema, decimalSchema } from '../http/primitives'
import { categorySchema } from '../domain/category'
import { productSchema } from '../domain/product'
import { paginatedResponseSchema, paginationQuerySchema } from '../http/pagination'

const productBarcodeValueSchema = z.string().max(50)

export const productIdParamSchema = cuidSchema

export const productBarcodeSchema = z.object({
  id: cuidSchema,
  barcode: productBarcodeValueSchema,
})

export const productResponseSchema = productSchema.extend({
  barcode: productBarcodeValueSchema.nullable(),
  barcodes: z.array(productBarcodeSchema).optional(),
  category: categorySchema.optional(),
  totalStock: z.number().finite().nonnegative().optional(),
  totalRemaining: z.number().finite().nonnegative().optional(),
  lotCount: z.number().int().nonnegative().optional(),
  currentCost: decimalSchema.nullable().optional(),
})

export const productsListQuerySchema = paginationQuerySchema.extend({
  categoryId: cuidSchema.optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['name', 'createdAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export const productsListResponseSchema = paginatedResponseSchema(productResponseSchema)

export const productsCreateBodySchema = z.object({
  name: z.string().min(1).max(200),
  barcode: productBarcodeValueSchema.optional(),
  categoryId: cuidSchema,
  unit: z.string().max(20).default('units'),
  lowStockThreshold: z.number().int().min(0).default(5),
})

export const productsUpdateBodySchema = productsCreateBodySchema
  .partial()
  .omit({ barcode: true })

export const productsAddBarcodeBodySchema = z.object({
  barcode: z.string().min(1).max(50),
})

export const productBarcodeResponseSchema = productBarcodeSchema

export type ProductIdParam = z.infer<typeof productIdParamSchema>
export type ProductResponse = z.infer<typeof productResponseSchema>
export type ProductsListQuery = z.input<typeof productsListQuerySchema>
export type ProductsListResponse = z.infer<typeof productsListResponseSchema>
export type ProductsCreateBody = z.input<typeof productsCreateBodySchema>
export type ProductsUpdateBody = z.input<typeof productsUpdateBodySchema>
export type ProductsAddBarcodeBody = z.input<typeof productsAddBarcodeBodySchema>
export type ProductBarcodeResponse = z.infer<typeof productBarcodeResponseSchema>
