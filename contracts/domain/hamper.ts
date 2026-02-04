import { z } from 'zod'
import { cuidSchema, decimalSchema, isoDateTimeSchema } from '../http/primitives'
import { categorySchema } from './category'
import { productSchema } from './product'

export const categoryRefSchema = categorySchema.pick({ id: true, name: true })

export const productRefSchema = productSchema.pick({ id: true, name: true })

export const hamperRequirementSchema = z.object({
  id: cuidSchema,
  categoryId: cuidSchema,
  category: categoryRefSchema,
  quantity: decimalSchema,
  isOptional: z.boolean(),
})

export type HamperRequirement = z.infer<typeof hamperRequirementSchema>

export const hamperVariantMappingSchema = z.object({
  categoryId: cuidSchema,
  productId: cuidSchema,
  priority: z.number().int().min(1),
  category: categoryRefSchema.optional(),
  product: productRefSchema.optional(),
})

export type HamperVariantMapping = z.infer<typeof hamperVariantMappingSchema>

const hamperVariantMappingWithRefsSchema = hamperVariantMappingSchema.extend({
  category: categoryRefSchema,
  product: productRefSchema,
})

export const hamperVariantSchema = z.object({
  id: cuidSchema,
  hamperId: cuidSchema,
  name: z.string().min(1).max(100),
  sellingPrice: decimalSchema.nullable().optional(),
  etsySku: z.string().max(50).nullable(),
  indicativeQuantity: z.number().int().nonnegative().nullable().optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  canMake: z.number().int().nonnegative().optional(),
  mappings: z.array(hamperVariantMappingWithRefsSchema),
})

export type HamperVariant = z.infer<typeof hamperVariantSchema>

export const hamperVariantAvailabilitySchema = z.object({
  variantId: cuidSchema,
  name: z.string().min(1).max(100),
  etsySku: z.string().max(50).nullable(),
  sellingPrice: decimalSchema.nullable(),
  indicativeQuantity: z.number().int().nonnegative().nullable().optional(),
  canMake: z.number().int().nonnegative(),
  mappings: z
    .array(
      hamperVariantMappingSchema.extend({
        product: productRefSchema,
        stock: z.number().nonnegative().optional(),
      })
    )
    .optional(),
})

export type HamperVariantAvailability = z.infer<typeof hamperVariantAvailabilitySchema>

export const hamperBaseSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(200),
  sellingPrice: decimalSchema,
  etsyListingId: z.string().max(50).nullable(),
  indicativeQuantity: z.number().int().nonnegative().nullable().optional(),
  hasVariants: z.boolean(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  requirements: z.array(hamperRequirementSchema),
})

export type HamperBase = z.infer<typeof hamperBaseSchema>

export const hamperListItemSchema = hamperBaseSchema.extend({
  canMake: z.number().int().nonnegative(),
  variantAvailability: z.array(hamperVariantAvailabilitySchema).optional(),
})

export type HamperListItem = z.infer<typeof hamperListItemSchema>
