import { z } from 'zod'
import { cuidSchema } from '../http/primitives'
import { categoryListItemSchema, categorySchema } from '../domain/category'
import { pickRuleSchema } from '../domain/enums'
import { productSchema } from '../domain/product'

export const categoryIdParamSchema = cuidSchema

export const categoriesListResponseSchema = z.array(categoryListItemSchema)

export const categoryResponseSchema = categorySchema

export const categoryDetailResponseSchema = categorySchema.extend({
  products: z.array(productSchema),
})

export const categoriesCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  pickRule: pickRuleSchema.default('FIFO'),
})

export const categoriesUpdateBodySchema = categoriesCreateBodySchema.partial()

export type CategoryIdParam = z.infer<typeof categoryIdParamSchema>
export type CategoriesListResponse = z.infer<typeof categoriesListResponseSchema>
export type CategoryResponse = z.infer<typeof categoryResponseSchema>
export type CategoryDetailResponse = z.infer<typeof categoryDetailResponseSchema>
export type CategoriesCreateBody = z.input<typeof categoriesCreateBodySchema>
export type CategoriesUpdateBody = z.input<typeof categoriesUpdateBodySchema>
