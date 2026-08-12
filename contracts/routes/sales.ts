import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'
import { saleChannelSchema, saleSchema } from '../domain/sale'

export const saleIdParamSchema = cuidSchema

export const saleLineInputSchema = z.object({
  hamperId: cuidSchema.optional(),
  variantId: cuidSchema.optional(),
  description: z.string().max(200).optional(),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative().optional(),
}).refine(
  (data) => data.hamperId || (data.description && data.unitPrice !== undefined),
  { message: 'Either hamperId or both description and unitPrice are required' }
)

export const salesPreviewBodySchema = z.object({
  lines: z.array(saleLineInputSchema).min(1),
  postageCharged: z.number().nonnegative().default(0),
  saleChannel: saleChannelSchema.default('etsy'),
})

export const salePreviewAllocationLineSchema = z.object({
  lotId: cuidSchema,
  productId: cuidSchema,
  productName: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unitCost: z.number().finite().nonnegative(),
})

export const salePreviewRequirementAllocationSchema = z.object({
  categoryId: cuidSchema,
  categoryName: z.string().min(1).max(100),
  productId: cuidSchema.optional(),
  productName: z.string().min(1).max(200).optional(),
  quantityRequired: z.number().finite().positive(),
  allocations: z.array(salePreviewAllocationLineSchema),
  totalCost: z.number().finite().nonnegative(),
  fulfilled: z.boolean(),
})

export const saleLinePreviewSchema = z.object({
  hamperId: cuidSchema.nullable(),
  hamperName: z.string().min(1).max(200),
  description: z.string().max(200).optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().finite().nonnegative(),
  requirements: z.array(salePreviewRequirementAllocationSchema),
  totalCost: z.number().finite().nonnegative(),
  canFulfill: z.boolean(),
  isBespoke: z.boolean(),
})

export const salePreviewResponseSchema = z.object({
  lines: z.array(saleLinePreviewSchema),
  summary: z.object({
    totalGross: z.number().finite().nonnegative(),
    postageCharged: z.number().finite().nonnegative(),
    totalCost: z.number().finite().nonnegative(),
    estimatedFees: z.number().finite().nonnegative(),
    packagingOverhead: z.number().finite().nonnegative(),
    estimatedMargin: z.number().finite(),
  }),
})

export const salesCreateBodySchema = z.object({
  grossRevenue: z.number().positive(),
  postageCharged: z.number().nonnegative().default(0),
  postageCost: z.number().nonnegative().default(0),
  saleChannel: saleChannelSchema.default('etsy'),
  saleDate: isoDateTimeSchema.optional(),
  etsyOrderId: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(saleLineInputSchema).min(1),
  isHistorical: z.boolean().default(false),
  allocationOverrides: z
    .record(
      z.string(),
      z.array(
        z.object({
          lotId: cuidSchema,
          quantity: z.number().positive(),
        })
      )
    )
    .optional(),
})

export const saleResponseSchema = saleSchema

export const salesListResponseSchema = z.object({
  sales: z.array(saleSchema),
  total: z.number().int().nonnegative(),
})

export const salesSummaryResponseSchema = z.object({
  unverifiedEtsySales: z.number().int().nonnegative(),
  totals: z.object({
    salesCount: z.number().int().nonnegative(),
    totalRevenue: z.number().finite().nonnegative(),
    totalPostageCharged: z.number().finite().nonnegative(),
    totalPostageCost: z.number().finite().nonnegative(),
    totalFees: z.number().finite().nonnegative(),
    totalCost: z.number().finite().nonnegative(),
    totalMargin: z.number().finite(),
  }),
  byChannel: z.array(z.object({
    channel: saleChannelSchema,
    count: z.number().int().nonnegative(),
    revenue: z.number().finite().nonnegative(),
    fees: z.number().finite().nonnegative(),
    margin: z.number().finite(),
  })),
  byHamper: z.array(z.object({
    name: z.string().min(1).max(200),
    count: z.number().int().nonnegative(),
    revenue: z.number().finite().nonnegative(),
  })),
})

export const salesMarginAnalyticsResponseSchema = z.object({
  period: z.object({
    days: z.number().int().positive(),
    startDate: isoDateTimeSchema,
    endDate: isoDateTimeSchema,
  }),
  summary: z.object({
    salesCount: z.number().int().nonnegative(),
    unverifiedEtsySales: z.number().int().nonnegative(),
    totalRevenue: z.number().finite().nonnegative(),
    totalPostageCharged: z.number().finite().nonnegative(),
    totalPostageCost: z.number().finite().nonnegative(),
    postageProfit: z.number().finite(),
    totalFees: z.number().finite().nonnegative(),
    totalOverhead: z.number().finite().nonnegative(),
    totalCost: z.number().finite().nonnegative(),
    totalMargin: z.number().finite(),
    marginPercent: z.number().finite(),
  }),
  byHamper: z.array(z.object({
    name: z.string().min(1).max(200),
    count: z.number().int().nonnegative(),
    revenue: z.number().finite().nonnegative(),
  })),
  byChannel: z.array(z.object({
    channel: saleChannelSchema,
    count: z.number().int().nonnegative(),
    revenue: z.number().finite().nonnegative(),
    fees: z.number().finite().nonnegative(),
    margin: z.number().finite(),
  })),
})

export type SaleIdParam = z.infer<typeof saleIdParamSchema>
export type SaleLineInput = z.input<typeof saleLineInputSchema>
export type SalesPreviewBody = z.input<typeof salesPreviewBodySchema>
export type SalePreviewResponse = z.infer<typeof salePreviewResponseSchema>
export type SalesCreateBody = z.input<typeof salesCreateBodySchema>
export type SaleResponse = z.infer<typeof saleResponseSchema>
export type SalesListResponse = z.infer<typeof salesListResponseSchema>
export type SalesSummaryResponse = z.infer<typeof salesSummaryResponseSchema>
export type SalesMarginAnalyticsResponse = z.infer<typeof salesMarginAnalyticsResponseSchema>
