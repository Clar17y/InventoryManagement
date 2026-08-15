import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'
import {
  etsyFeeReconciliationSourceSchema,
  etsyFeeReconciliationStatusSchema,
  isPlausibleEtsyReceiptId,
} from '../domain/etsyFees'
import { saleChannelSchema, saleSchema } from '../domain/sale'

export const saleIdParamSchema = cuidSchema

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/)
const penceSchema = z.number().int().safe()
const nullablePenceSchema = penceSchema.nullable()
const manualResolutionNoteSchema = z.string().trim().min(1).max(500)
const plausibleEtsyReceiptIdSchema = z.string().refine(
  isPlausibleEtsyReceiptId,
  'Etsy receipt ID must contain at least six digits within the safe integer range',
)

export const etsySaleResolutionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reclassify'),
    channel: z.enum(['direct', 'fair']),
    note: manualResolutionNoteSchema.optional(),
  }),
  z.object({
    type: z.literal('correct_receipt_id'),
    etsyOrderId: plausibleEtsyReceiptIdSchema,
    note: manualResolutionNoteSchema.optional(),
  }),
  z.object({
    type: z.literal('manual_verify'),
    etsyOrderId: plausibleEtsyReceiptIdSchema.optional(),
    attributed: z.boolean(),
    offsiteAdsFeePence: z.number().int().nonnegative().safe(),
    vatOnOffsiteAdsFeePence: z.number().int().nonnegative().safe(),
    note: manualResolutionNoteSchema.optional(),
  }),
]).superRefine((value, ctx) => {
  if (value.type === 'manual_verify' && !value.attributed
    && (value.offsiteAdsFeePence !== 0 || value.vatOnOffsiteAdsFeePence !== 0)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Not-attributed receipts must have zero Offsite fee and VAT',
    })
  }
})

export const etsySaleResolutionPreviewBodySchema = z.object({
  resolution: etsySaleResolutionSchema,
}).strict()

export const etsySaleResolutionApplyBodySchema = etsySaleResolutionPreviewBodySchema.extend({
  fingerprint: fingerprintSchema,
}).strict()

const etsySaleResolutionStateSchema = z.object({
  saleChannel: saleChannelSchema,
  etsyOrderId: z.string().max(100).nullable(),
  status: etsyFeeReconciliationStatusSchema,
  source: etsyFeeReconciliationSourceSchema.nullable(),
  offsiteAdsAttributed: z.boolean().nullable(),
  transactionFeePence: penceSchema,
  postageTransactionFeePence: penceSchema,
  regulatoryFeePence: penceSchema,
  processingFeePence: penceSchema,
  vatOnProcessingFeePence: penceSchema,
  listingFeePence: penceSchema,
  offsiteAdsFeePence: nullablePenceSchema,
  vatOnOffsiteAdsFeePence: nullablePenceSchema,
  etsyFeesPence: penceSchema,
  netRevenuePence: penceSchema,
  marginPence: penceSchema,
})

const etsySaleResolutionRowSchema = z.object({
  saleId: cuidSchema,
  before: etsySaleResolutionStateSchema,
  after: etsySaleResolutionStateSchema,
})

const etsySaleResolutionSummarySchema = z.object({
  oldFeesPence: penceSchema,
  newFeesPence: penceSchema,
  feeDeltaPence: penceSchema,
  oldNetRevenuePence: penceSchema,
  newNetRevenuePence: penceSchema,
  netRevenueDeltaPence: penceSchema,
  oldMarginPence: penceSchema,
  newMarginPence: penceSchema,
  marginDeltaPence: penceSchema,
})

export const etsySaleResolutionPreviewSchema = z.object({
  resolution: etsySaleResolutionSchema,
  baseReceiptId: z.string().min(1),
  saleIds: z.array(cuidSchema),
  fingerprint: fingerprintSchema,
  summary: etsySaleResolutionSummarySchema,
  rows: z.array(etsySaleResolutionRowSchema),
  warnings: z.array(z.string().min(1)),
})

export const etsySaleResolutionApplyResultSchema = etsySaleResolutionPreviewSchema.extend({
  applied: z.boolean(),
})

export const salesVerificationFilterSchema = z.union([
  z.literal('needs_verification'),
  etsyFeeReconciliationStatusSchema,
])

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
export type EtsySaleResolution = z.infer<typeof etsySaleResolutionSchema>
export type EtsySaleResolutionPreviewBody = z.input<typeof etsySaleResolutionPreviewBodySchema>
export type EtsySaleResolutionApplyBody = z.input<typeof etsySaleResolutionApplyBodySchema>
export type EtsySaleResolutionPreview = z.infer<typeof etsySaleResolutionPreviewSchema>
export type EtsySaleResolutionApplyResult = z.infer<typeof etsySaleResolutionApplyResultSchema>
export type SalesVerificationFilter = z.infer<typeof salesVerificationFilterSchema>
export type SaleLineInput = z.input<typeof saleLineInputSchema>
export type SalesPreviewBody = z.input<typeof salesPreviewBodySchema>
export type SalePreviewResponse = z.infer<typeof salePreviewResponseSchema>
export type SalesCreateBody = z.input<typeof salesCreateBodySchema>
export type SaleResponse = z.infer<typeof saleResponseSchema>
export type SalesListResponse = z.infer<typeof salesListResponseSchema>
export type SalesSummaryResponse = z.infer<typeof salesSummaryResponseSchema>
export type SalesMarginAnalyticsResponse = z.infer<typeof salesMarginAnalyticsResponseSchema>
