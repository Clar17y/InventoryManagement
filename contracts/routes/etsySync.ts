import { z } from 'zod'
import { cuidSchema } from '../http/primitives'
import {
  etsyOrdersBulkImportResultSchema,
  etsyOrderImportResultSchema,
  etsyDuplicateSkuRepairResultSchema,
  etsyDuplicateSkuReportSchema,
  etsyPendingOrderSchema,
  etsyPendingPriceUpdateSchema,
  etsyPendingSkuSchema,
  etsyPricePullResultSchema,
  etsyPricePullUpdateSchema,
  etsyPricePushResultSchema,
  etsySkuGenerateResultSchema,
  etsySkuPushResultSchema,
  etsySyncComparisonSchema,
  etsySyncInventoryUpdateSchema,
  etsySyncPushResultSchema,
} from '../domain/etsy'

const listingIdsQueryValueSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return trimmed.split(',').map((id) => id.trim()).filter(Boolean)
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
      .map((id) => id.trim())
      .filter(Boolean)
  }

  return undefined
}, z.array(z.string().min(1)).optional())

export const etsySyncListingIdsQuerySchema = z.object({
  listingIds: listingIdsQueryValueSchema,
})

export const etsySyncComparisonResponseSchema = z.object({
  comparisons: z.array(etsySyncComparisonSchema),
})

export const etsySyncPushBodySchema = z.object({
  updates: z.array(etsySyncInventoryUpdateSchema).min(1),
  dryRun: z.boolean().optional(),
})

export const etsySyncPushResponseSchema = etsySyncPushResultSchema

export const etsyPendingOrdersResponseSchema = z.object({
  orders: z.array(etsyPendingOrderSchema),
})

export const etsyOrderImportBodySchema = z.object({
  receiptId: z.number().int().positive(),
  postageCost: z.number().finite().nonnegative(),
  isHistorical: z.boolean().optional(),
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

export const etsyOrderImportResponseSchema = etsyOrderImportResultSchema

export const etsyOrdersBulkImportBodySchema = z.object({
  orders: z
    .array(
      z.object({
        receiptId: z.number().int().positive(),
        postageCost: z.number().finite().nonnegative(),
      })
    )
    .min(1),
  isHistorical: z.boolean().optional(),
})

export const etsyOrdersBulkImportResponseSchema = etsyOrdersBulkImportResultSchema

export const etsySkuGenerateResponseSchema = etsySkuGenerateResultSchema

export const etsySkusPendingResponseSchema = z.object({
  skus: z.array(etsyPendingSkuSchema),
  needsSyncCount: z.number().int().nonnegative(),
  totalVariants: z.number().int().nonnegative(),
})

export const etsySkusPushBodySchema = z.object({
  listingIds: z.array(z.string().min(1)).optional(),
})

export const etsySkusPushResponseSchema = etsySkuPushResultSchema

export const etsyDuplicateSkusResponseSchema = etsyDuplicateSkuReportSchema

export const etsyDuplicateSkusRepairBodySchema = z.object({
  listingIds: z.array(z.string().min(1)).optional(),
  dryRun: z.boolean().optional(),
})

export const etsyDuplicateSkusRepairResponseSchema = etsyDuplicateSkuRepairResultSchema

export const etsyPricesPendingResponseSchema = z.object({
  updates: z.array(etsyPendingPriceUpdateSchema),
  count: z.number().int().nonnegative(),
  needsSyncCount: z.number().int().nonnegative(),
})

export const etsyPricesPushBodySchema = z.object({
  updates: z
    .array(
      z.object({
        etsyListingId: z.string().min(1),
        etsySku: z.string().nullable(),
        etsyProductId: z.string().nullable(),
        price: z.number().finite().nonnegative(),
      })
    )
    .min(1),
  dryRun: z.boolean().optional(),
})

export const etsyPricesPushResponseSchema = etsyPricePushResultSchema

export const etsyPricesPullBodySchema = z.object({
  updates: z.array(etsyPricePullUpdateSchema).min(1),
})

export const etsyPricesPullResponseSchema = etsyPricePullResultSchema

export type EtsySyncListingIdsQuery = z.input<typeof etsySyncListingIdsQuerySchema>
export type EtsySyncComparisonResponse = z.infer<typeof etsySyncComparisonResponseSchema>
export type EtsySyncPushBody = z.input<typeof etsySyncPushBodySchema>
export type EtsySyncPushResponse = z.infer<typeof etsySyncPushResponseSchema>
export type EtsyPendingOrdersResponse = z.infer<typeof etsyPendingOrdersResponseSchema>
export type EtsyOrderImportBody = z.input<typeof etsyOrderImportBodySchema>
export type EtsyOrderImportResponse = z.infer<typeof etsyOrderImportResponseSchema>
export type EtsyOrdersBulkImportBody = z.input<typeof etsyOrdersBulkImportBodySchema>
export type EtsyOrdersBulkImportResponse = z.infer<typeof etsyOrdersBulkImportResponseSchema>
export type EtsySkuGenerateResponse = z.infer<typeof etsySkuGenerateResponseSchema>
export type EtsySkusPendingResponse = z.infer<typeof etsySkusPendingResponseSchema>
export type EtsySkusPushBody = z.input<typeof etsySkusPushBodySchema>
export type EtsySkusPushResponse = z.infer<typeof etsySkusPushResponseSchema>
export type EtsyDuplicateSkusResponse = z.infer<typeof etsyDuplicateSkusResponseSchema>
export type EtsyDuplicateSkusRepairBody = z.input<typeof etsyDuplicateSkusRepairBodySchema>
export type EtsyDuplicateSkusRepairResponse = z.infer<typeof etsyDuplicateSkusRepairResponseSchema>
export type EtsyPricesPendingResponse = z.infer<typeof etsyPricesPendingResponseSchema>
export type EtsyPricesPushBody = z.input<typeof etsyPricesPushBodySchema>
export type EtsyPricesPushResponse = z.infer<typeof etsyPricesPushResponseSchema>
export type EtsyPricesPullBody = z.input<typeof etsyPricesPullBodySchema>
export type EtsyPricesPullResponse = z.infer<typeof etsyPricesPullResponseSchema>
