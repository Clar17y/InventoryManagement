import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'
import {
  inventoryCategoryLotSchema,
  inventoryCategorySummarySchema,
  inventoryLotSchema,
} from '../domain/inventory'
import { categorySchema } from '../domain/category'
import { productSchema } from '../domain/product'
import {
  paginatedResponseSchema,
  paginationQuerySchema,
  queryBooleanSchema,
} from '../http/pagination'

export const inventoryCategoryIdParamSchema = cuidSchema

export const inventoryProductIdParamSchema = cuidSchema

export const inventoryLotIdParamSchema = cuidSchema

export const inventoryByCategoryResponseSchema = z.array(inventoryCategorySummarySchema)

export const inventoryLotsResponseSchema = z.array(inventoryLotSchema)

export const inventoryLotsByCategoryResponseSchema = z.array(inventoryCategoryLotSchema)

export const inventoryLotResponseSchema = inventoryLotSchema

export const inventoryAddLotBodySchema = z.object({
  productId: cuidSchema,
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  expiresAt: isoDateTimeSchema.optional(),
})

export const inventoryUpdateLotBodySchema = z.object({
  quantity: z.number().positive().optional(),
  remaining: z.number().nonnegative().optional(),
  unitCost: z.number().nonnegative().optional(),
  expiresAt: isoDateTimeSchema.nullable().optional(),
})

export const inventoryLowStockProductSchema = productSchema.extend({
  category: categorySchema,
  totalStock: z.number().finite().nonnegative(),
  totalRemaining: z.number().finite().nonnegative(),
  lotCount: z.number().int().nonnegative(),
})

export const inventoryLowStockResponseSchema = z.array(inventoryLowStockProductSchema)

export const inventorySortSchema = z.enum([
  'category',
  'stock-desc',
  'stock-asc',
  'name-asc',
  'name-desc',
  'cost-asc',
  'cost-desc',
  'newest',
  'oldest',
])

export const inventoryProductsQuerySchema = paginationQuerySchema.extend({
  categoryId: cuidSchema.optional(),
  search: z.string().trim().max(200).optional(),
  lowStockOnly: queryBooleanSchema.default(false),
  sort: inventorySortSchema.default('category'),
})

export const inventoryProductSchema = inventoryLowStockProductSchema.extend({
  currentCost: z.number().finite().nonnegative().nullable(),
})

export const inventoryProductsTotalsSchema = z.object({
  totalUnitItems: z.number().finite().nonnegative(),
  totalLots: z.number().int().nonnegative(),
})

export const inventoryProductsResponseSchema = paginatedResponseSchema(inventoryProductSchema).extend({
  totals: inventoryProductsTotalsSchema,
})

export const inventoryExpiringResponseSchema = z.array(inventoryLotSchema)

export type InventoryCategoryIdParam = z.infer<typeof inventoryCategoryIdParamSchema>
export type InventoryProductIdParam = z.infer<typeof inventoryProductIdParamSchema>
export type InventoryLotIdParam = z.infer<typeof inventoryLotIdParamSchema>
export type InventoryByCategoryResponse = z.infer<typeof inventoryByCategoryResponseSchema>
export type InventoryLotsResponse = z.infer<typeof inventoryLotsResponseSchema>
export type InventoryLotsByCategoryResponse = z.infer<typeof inventoryLotsByCategoryResponseSchema>
export type InventoryLotResponse = z.infer<typeof inventoryLotResponseSchema>
export type InventoryAddLotBody = z.input<typeof inventoryAddLotBodySchema>
export type InventoryUpdateLotBody = z.input<typeof inventoryUpdateLotBodySchema>
export type InventoryLowStockProduct = z.infer<typeof inventoryLowStockProductSchema>
export type InventoryLowStockResponse = z.infer<typeof inventoryLowStockResponseSchema>
export type InventorySort = z.infer<typeof inventorySortSchema>
export type InventoryProductsQuery = z.input<typeof inventoryProductsQuerySchema>
export type ParsedInventoryProductsQuery = z.infer<typeof inventoryProductsQuerySchema>
export type InventoryProduct = z.infer<typeof inventoryProductSchema>
export type InventoryProductsTotals = z.infer<typeof inventoryProductsTotalsSchema>
export type InventoryProductsResponse = z.infer<typeof inventoryProductsResponseSchema>
export type InventoryExpiringResponse = z.infer<typeof inventoryExpiringResponseSchema>
