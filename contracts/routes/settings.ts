import { z } from 'zod'
import { cuidSchema, decimalSchema } from '../http/primitives'
import {
  etsyFeeConfigSchema,
  packagingOverheadSchema,
  postageTierSchema,
  settingsAuditEntrySchema,
} from '../domain/settings'

const finiteNonNegativeNumberSchema = z.number().finite().nonnegative()
const feeRateSchema = finiteNonNegativeNumberSchema.max(1)

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
  name: z.string().trim().min(1).max(100),
  transactionFee: feeRateSchema,
  regulatoryFee: feeRateSchema,
  paymentFeePercent: feeRateSchema,
  paymentFeeFixed: finiteNonNegativeNumberSchema,
  vatRate: feeRateSchema,
  listingFee: finiteNonNegativeNumberSchema,
})

export const etsyFeeConfigResponseSchema = etsyFeeConfigSchema

// Packaging overhead
export const packagingOverheadIdParamSchema = cuidSchema

export const packagingOverheadCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  costPerOrder: finiteNonNegativeNumberSchema,
})

export const packagingOverheadUpdateBodySchema = packagingOverheadCreateBodySchema.partial()

export const packagingOverheadItemResponseSchema = packagingOverheadSchema

export const packagingOverheadResponseSchema = z.object({
  overheads: z.array(packagingOverheadSchema),
  totalPerOrder: z.number().finite().nonnegative(),
})

// Postage tiers
export const postageTiersResponseSchema = z.array(postageTierSchema)

export const includeArchivedQuerySchema = z.object({
  includeArchived: z.literal('true').optional().transform((value) => value === 'true'),
})

export const postageTierIdParamSchema = cuidSchema

export const postageTierCreateBodySchema = z.object({
  etsyCharge: finiteNonNegativeNumberSchema,
  actualCost: finiteNonNegativeNumberSchema,
  label: z.string().trim().max(100).transform((value) => value || undefined).optional(),
})

export const postageTierUpdateBodySchema = z.object({
  etsyCharge: finiteNonNegativeNumberSchema.optional(),
  actualCost: finiteNonNegativeNumberSchema.optional(),
  label: z.string().trim().max(100).nullable().optional(),
})

export const postageTierResponseSchema = postageTierSchema

export const settingsMutationOutcomeSchema = z.enum(['created', 'updated', 'restored'])

export const postageTierMutationResponseSchema = z.object({
  item: postageTierSchema,
  outcome: settingsMutationOutcomeSchema,
})

export const settingsAuditEntriesResponseSchema = z.array(settingsAuditEntrySchema)

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
export type IncludeArchivedQuery = z.infer<typeof includeArchivedQuerySchema>
export type PostageTierMutationResponse = z.infer<typeof postageTierMutationResponseSchema>
export type SettingsAuditEntriesResponse = z.infer<typeof settingsAuditEntriesResponseSchema>
