import { z } from 'zod'
import { cuidSchema, decimalSchema, isoDateTimeSchema } from '../http/primitives'
import { categorySchema } from './category'
import { productSchema } from './product'

export const inventoryCategorySummarySchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(100),
  productCount: z.number().int().nonnegative(),
  totalStock: z.number().finite().nonnegative(),
})

export type InventoryCategorySummary = z.infer<typeof inventoryCategorySummarySchema>

export const inventoryLotProductSchema = productSchema.extend({
  category: categorySchema.optional(),
})

export type InventoryLotProduct = z.infer<typeof inventoryLotProductSchema>

export const inventoryLotSchema = z.object({
  id: cuidSchema,
  productId: cuidSchema,
  product: inventoryLotProductSchema.optional(),
  quantity: decimalSchema,
  remaining: decimalSchema,
  unitCost: decimalSchema,
  receivedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.nullable(),
})

export type InventoryLot = z.infer<typeof inventoryLotSchema>

export const inventoryCategoryLotSchema = inventoryLotSchema.extend({
  productName: z.string().min(1).max(200),
})

export type InventoryCategoryLot = z.infer<typeof inventoryCategoryLotSchema>
