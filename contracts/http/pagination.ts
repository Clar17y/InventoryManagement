import { z } from 'zod'

export const PAGE_SIZES = [25, 50, 100] as const
export const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
])
export const pageSizeSchema = z.coerce.number().pipe(
  z.union([z.literal(25), z.literal(50), z.literal(100)])
).default(25)

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: pageSizeSchema,
})

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  items: z.array(itemSchema),
  pagination: paginationMetaSchema,
})

export type PageSize = z.infer<typeof pageSizeSchema>
export type PaginationQuery = z.infer<typeof paginationQuerySchema>
export type PaginationMeta = z.infer<typeof paginationMetaSchema>
export type PaginatedResponse<T> = { items: T[]; pagination: PaginationMeta }
