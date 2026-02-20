import { z } from 'zod'
import { cuidSchema, decimalSchema } from '../http/primitives'
import { etsyFeeConfigSchema, packagingOverheadSchema, postageTierSchema } from '../domain/settings'

export const dashboardStatsResponseSchema = z.object({
  products: z.number().int().nonnegative(),
  categories: z.number().int().nonnegative(),
  hampers: z.number().int().nonnegative(),
  lowStockProducts: z.number().int().nonnegative(),
  today: z.object({
    salesCount: z.number().int().nonnegative(),
    revenue: decimalSchema,
    margin: decimalSchema,
  }),
  thisWeek: z.object({
    salesCount: z.number().int().nonnegative(),
    revenue: decimalSchema,
    margin: decimalSchema,
  }),
})

// Etsy fees
export const etsyFeeConfigsResponseSchema = z.array(etsyFeeConfigSchema)

export const etsyFeeCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  transactionFee: z.number().min(0).max(1),
  regulatoryFee: z.number().min(0).max(1),
  paymentFeePercent: z.number().min(0).max(1),
  paymentFeeFixed: z.number().nonnegative(),
  vatRate: z.number().min(0).max(1),
  listingFee: z.number().nonnegative(),
})

export const etsyFeeConfigResponseSchema = etsyFeeConfigSchema

// Packaging overhead
export const packagingOverheadIdParamSchema = cuidSchema

export const packagingOverheadCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  costPerOrder: z.number().nonnegative(),
})

export const packagingOverheadUpdateBodySchema = packagingOverheadCreateBodySchema.partial()

export const packagingOverheadItemResponseSchema = packagingOverheadSchema

export const packagingOverheadResponseSchema = z.object({
  overheads: z.array(packagingOverheadSchema),
  totalPerOrder: z.number().finite().nonnegative(),
})

// Postage tiers
export const postageTiersResponseSchema = z.array(postageTierSchema)

export const postageTierCreateBodySchema = z.object({
  etsyCharge: z.number().nonnegative(),
  actualCost: z.number().nonnegative(),
  label: z.string().max(100).optional(),
})

export const postageTierUpdateBodySchema = postageTierCreateBodySchema.partial()

export const postageTierResponseSchema = postageTierSchema

export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponseSchema>
export type EtsyFeeConfigsResponse = z.infer<typeof etsyFeeConfigsResponseSchema>
export type EtsyFeeCreateBody = z.input<typeof etsyFeeCreateBodySchema>
export type EtsyFeeConfigResponse = z.infer<typeof etsyFeeConfigResponseSchema>
export type PackagingOverheadIdParam = z.infer<typeof packagingOverheadIdParamSchema>
export type PackagingOverheadCreateBody = z.input<typeof packagingOverheadCreateBodySchema>
export type PackagingOverheadUpdateBody = z.input<typeof packagingOverheadUpdateBodySchema>
export type PackagingOverheadItemResponse = z.infer<typeof packagingOverheadItemResponseSchema>
export type PackagingOverheadResponse = z.infer<typeof packagingOverheadResponseSchema>
export type PostageTiersResponse = z.infer<typeof postageTiersResponseSchema>
export type PostageTierCreateBody = z.input<typeof postageTierCreateBodySchema>
export type PostageTierUpdateBody = z.input<typeof postageTierUpdateBodySchema>
export type PostageTierResponse = z.infer<typeof postageTierResponseSchema>
