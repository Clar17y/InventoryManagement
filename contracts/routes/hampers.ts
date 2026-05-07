import { z } from 'zod'
import { cuidSchema } from '../http/primitives'
import {
  categoryRefSchema,
  hamperBaseSchema,
  hamperListItemSchema,
  hamperVariantAvailabilitySchema,
  hamperVariantSchema,
} from '../domain/hamper'

export const hamperIdParamSchema = cuidSchema

export const hamperResponseSchema = hamperBaseSchema

export const hampersListResponseSchema = z.array(hamperListItemSchema)

export const hamperRequirementDetailSchema = z.object({
  id: cuidSchema,
  category: categoryRefSchema,
  quantityRequired: z.number().finite().positive(),
  isOptional: z.boolean(),
  availableStock: z.number().finite().nonnegative(),
  canFulfill: z.number().int().nonnegative(),
  estimatedCost: z.number().finite().nonnegative(),
})

export const hamperDetailResponseSchema = hamperBaseSchema.omit({ requirements: true }).extend({
  requirements: z.array(hamperRequirementDetailSchema),
  canMake: z.number().int().nonnegative(),
  estimatedCost: z.number().finite().nonnegative(),
  estimatedMargin: z.number().finite(),
  variantAvailability: z.array(hamperVariantAvailabilitySchema).optional(),
  variants: z.array(hamperVariantSchema),
})

const hamperRequirementInputSchema = z.object({
  categoryId: cuidSchema,
  quantity: z.number().positive(),
  isOptional: z.boolean().default(false),
})

const nullableIntSchema = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((value) => {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    const num = typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10)
    if (Number.isNaN(num) || num <= 0 || !Number.isFinite(num)) return null
    return num
  })

export const hampersCreateBodySchema = z.object({
  name: z.string().min(1).max(200),
  sellingPrice: z.number().positive(),
  etsyListingId: z
    .string()
    .max(50)
    .optional()
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  indicativeQuantity: nullableIntSchema,
  etsyIsEnabled: z.boolean().default(true),
  hasVariants: z.boolean().default(false),
  requirements: z.array(hamperRequirementInputSchema).min(1),
})

export const hampersUpdateBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sellingPrice: z.number().positive().optional(),
  etsyListingId: z
    .string()
    .max(50)
    .optional()
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  indicativeQuantity: nullableIntSchema,
  etsyIsEnabled: z.boolean().optional(),
  hasVariants: z.boolean().optional(),
  requirements: z.array(hamperRequirementInputSchema).optional(),
})

const variantMappingInputSchema = z.object({
  categoryId: cuidSchema,
  productId: cuidSchema,
  priority: z.number().int().min(1).default(1),
})

const nullableNumberSchema = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((value) => {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    const num = typeof value === 'number' ? value : parseFloat(value)
    return Number.isNaN(num) ? null : num
  })

const nullableStringSchema = z
  .string()
  .max(50)
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value))

export const hamperVariantCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  sellingPrice: nullableNumberSchema,
  etsySku: nullableStringSchema,
  etsyIsEnabled: z.boolean().default(true),
  indicativeQuantity: nullableIntSchema,
  mappings: z.array(variantMappingInputSchema),
})

export const hamperVariantUpdateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sellingPrice: nullableNumberSchema,
  etsySku: nullableStringSchema,
  etsyIsEnabled: z.boolean().optional(),
  indicativeQuantity: nullableIntSchema,
  mappings: z.array(variantMappingInputSchema).optional(),
})

export const hamperVariantResponseSchema = hamperVariantSchema

export const hamperVariantsListResponseSchema = z.array(hamperVariantSchema)

export type HamperIdParam = z.infer<typeof hamperIdParamSchema>
export type HamperResponse = z.infer<typeof hamperResponseSchema>
export type HampersListResponse = z.infer<typeof hampersListResponseSchema>
export type HamperDetailResponse = z.infer<typeof hamperDetailResponseSchema>
export type HampersCreateBody = z.input<typeof hampersCreateBodySchema>
export type HampersUpdateBody = z.input<typeof hampersUpdateBodySchema>
export type HamperVariantResponse = z.infer<typeof hamperVariantResponseSchema>
export type HamperVariantsListResponse = z.infer<typeof hamperVariantsListResponseSchema>
export type HamperVariantCreateBody = z.input<typeof hamperVariantCreateBodySchema>
export type HamperVariantUpdateBody = z.input<typeof hamperVariantUpdateBodySchema>
