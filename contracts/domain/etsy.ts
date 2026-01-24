import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'

export const etsyStatusSchema = z.object({
  connected: z.boolean(),
  shopId: z.string().optional(),
  shopName: z.string().optional(),
  expiresAt: isoDateTimeSchema.optional(),
  mockMode: z.boolean().optional(),
})

export type EtsyStatus = z.infer<typeof etsyStatusSchema>

export const etsyListingMoneySchema = z.object({
  amount: z.number().int(),
  divisor: z.number().int().positive(),
  currency_code: z.string().min(1),
})

export type EtsyListingMoney = z.infer<typeof etsyListingMoneySchema>

export const etsyProductOfferingSchema = z.object({
  offering_id: z.number().int(),
  quantity: z.number().int().nonnegative(),
  price: etsyListingMoneySchema,
  is_enabled: z.boolean(),
  readiness_state_id: z.number().int().optional(),
})

export type EtsyProductOffering = z.infer<typeof etsyProductOfferingSchema>

export const etsyProductPropertyValueSchema = z.object({
  property_id: z.number().int(),
  property_name: z.string().min(1),
  values: z.array(z.string()),
  value_ids: z.array(z.number().int()).optional(),
})

export type EtsyProductPropertyValue = z.infer<typeof etsyProductPropertyValueSchema>

export const etsyProductSchema = z.object({
  product_id: z.number().int(),
  sku: z.string(),
  offerings: z.array(etsyProductOfferingSchema),
  property_values: z.array(etsyProductPropertyValueSchema),
  is_deleted: z.boolean().optional(),
})

export type EtsyProduct = z.infer<typeof etsyProductSchema>

export const etsyInventorySchema = z.object({
  products: z.array(etsyProductSchema),
  listing_id: z.number().int(),
})

export type EtsyInventory = z.infer<typeof etsyInventorySchema>

export const etsyListingStateSchema = z.enum(['active', 'inactive', 'draft', 'expired', 'sold_out'])

export type EtsyListingState = z.infer<typeof etsyListingStateSchema>

export const etsyListingSchema = z.object({
  listing_id: z.number().int(),
  title: z.string(),
  description: z.string(),
  price: etsyListingMoneySchema,
  quantity: z.number().int(),
  state: etsyListingStateSchema,
  url: z.string(),
  has_variations: z.boolean(),
  inventory: etsyInventorySchema.nullish(),
})

export type EtsyListing = z.infer<typeof etsyListingSchema>

export const etsyImportDetailSchema = z.object({
  hamper: z.string(),
  action: z.enum([
    'created_hamper',
    'created_variant',
    'linked_product_id',
    'set_sku',
    'set_price',
    'renamed_variant',
    'toggled_has_variants',
    'relinked_variant',
  ]),
  variant: z.string().optional(),
  info: z.string().optional(),
})

export type EtsyImportDetail = z.infer<typeof etsyImportDetailSchema>

export const etsyImportResultSchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  details: z.array(etsyImportDetailSchema).optional(),
})

export type EtsyImportResult = z.infer<typeof etsyImportResultSchema>

export const etsySyncComparisonVariantSchema = z.object({
  etsySku: z.string().nullable(),
  etsyProductId: z.string().nullable(),
  variantId: cuidSchema.nullable(),
  variantName: z.string(),
  etsyQuantity: z.number().int().nonnegative(),
  inventoryQuantity: z.number().int().nonnegative(),
  indicativeQuantity: z.number().int().nonnegative().nullable(),
  isIndicative: z.boolean(),
  difference: z.number().int(),
  needsSync: z.boolean(),
})

export type EtsySyncComparisonVariant = z.infer<typeof etsySyncComparisonVariantSchema>

export const etsySyncComparisonSchema = z.object({
  etsyListingId: z.string(),
  title: z.string(),
  hamperName: z.string(),
  hamperId: cuidSchema,
  variants: z.array(etsySyncComparisonVariantSchema),
})

export type EtsySyncComparison = z.infer<typeof etsySyncComparisonSchema>

export const etsySyncInventoryUpdateSchema = z.object({
  etsyListingId: z.string().min(1),
  etsySku: z.string().nullable(),
  etsyProductId: z.string().nullable(),
  quantity: z.number().int().nonnegative(),
})

export type EtsySyncInventoryUpdate = z.infer<typeof etsySyncInventoryUpdateSchema>

export const etsySyncPushListingChangeSchema = z.object({
  sku: z.string(),
  currentQuantity: z.number().int().nonnegative(),
  newQuantity: z.number().int().nonnegative(),
})

export type EtsySyncPushListingChange = z.infer<typeof etsySyncPushListingChangeSchema>

export const etsySyncPushListingResultSchema = z.object({
  listingId: z.string(),
  success: z.boolean(),
  skipped: z.boolean(),
  dryRun: z.boolean(),
  changes: z.array(etsySyncPushListingChangeSchema).optional(),
  error: z.string().optional(),
})

export type EtsySyncPushListingResult = z.infer<typeof etsySyncPushListingResultSchema>

export const etsySyncPushResultSchema = z.object({
  success: z.boolean(),
  dryRun: z.boolean(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  results: z.array(etsySyncPushListingResultSchema),
  error: z.string().optional(),
})

export type EtsySyncPushResult = z.infer<typeof etsySyncPushResultSchema>

export const etsyPendingOrderItemSchema = z.object({
  transactionId: z.number().int(),
  listingId: z.number().int(),
  title: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().finite(),
  sku: z.string().nullable(),
  productId: z.number().int().nullable(),
  variantName: z.string().nullable(),
})

export type EtsyPendingOrderItem = z.infer<typeof etsyPendingOrderItemSchema>

export const etsyPendingOrderSchema = z.object({
  receiptId: z.number().int(),
  buyerName: z.string(),
  createdAt: isoDateTimeSchema,
  isPaid: z.boolean(),
  isShipped: z.boolean(),
  grandTotal: z.number().finite().nonnegative(),
  subtotal: z.number().finite().nonnegative(),
  shippingCost: z.number().finite().nonnegative(),
  items: z.array(etsyPendingOrderItemSchema),
})

export type EtsyPendingOrder = z.infer<typeof etsyPendingOrderSchema>

export const etsyOrderImportSaleSchema = z.object({
  id: cuidSchema,
  etsyOrderId: z.string(),
  totalCost: z.number().finite().nonnegative(),
  margin: z.number().finite(),
  lines: z.number().int().nonnegative(),
})

export type EtsyOrderImportSale = z.infer<typeof etsyOrderImportSaleSchema>

export const etsyOrderImportResultSchema = z.object({
  success: z.literal(true),
  sale: etsyOrderImportSaleSchema,
  warnings: z.array(z.string()).optional(),
})

export type EtsyOrderImportResult = z.infer<typeof etsyOrderImportResultSchema>

export const etsyOrdersBulkImportResultSchema = z.object({
  success: z.literal(true),
  imported: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      receiptId: z.number().int(),
      success: z.boolean(),
      saleId: cuidSchema.optional(),
      error: z.string().optional(),
    })
  ),
})

export type EtsyOrdersBulkImportResult = z.infer<typeof etsyOrdersBulkImportResultSchema>

export const etsySkuGenerateResultSchema = z.object({
  success: z.boolean(),
  generated: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      hamperName: z.string(),
      variantName: z.string(),
      sku: z.string(),
    })
  ),
})

export type EtsySkuGenerateResult = z.infer<typeof etsySkuGenerateResultSchema>

export const etsyPendingSkuSchema = z.object({
  hamperId: cuidSchema,
  hamperName: z.string(),
  etsyListingId: z.string(),
  variantId: cuidSchema,
  variantName: z.string(),
  localSku: z.string(),
  etsySku: z.string().nullable(),
  etsyProductId: z.string().nullable(),
  needsSync: z.boolean(),
})

export type EtsyPendingSku = z.infer<typeof etsyPendingSkuSchema>

export const etsySkuPushResultSchema = z.object({
  success: z.boolean(),
  totalUpdated: z.number().int().nonnegative(),
  totalListings: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      etsyListingId: z.string(),
      hamperName: z.string(),
      success: z.boolean(),
      updated: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      error: z.string().optional(),
    })
  ),
})

export type EtsySkuPushResult = z.infer<typeof etsySkuPushResultSchema>

export const etsyPendingPriceUpdateSchema = z.object({
  hamperId: cuidSchema,
  hamperName: z.string(),
  etsyListingId: z.string(),
  variantId: z.string(),
  variantName: z.string(),
  etsySku: z.string().nullable(),
  etsyProductId: z.string().nullable(),
  localPrice: z.number().finite().nullable(),
  etsyPrice: z.number().finite(),
  needsSync: z.boolean(),
})

export type EtsyPendingPriceUpdate = z.infer<typeof etsyPendingPriceUpdateSchema>

export const etsyPricePushResultSchema = z.object({
  success: z.boolean(),
  updated: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      listingId: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })
  ),
})

export type EtsyPricePushResult = z.infer<typeof etsyPricePushResultSchema>

export const etsyAccountSchema = z.object({
  userId: z.string(),
  shopId: z.string(),
  shopName: z.string(),
  loginName: z.string().nullable(),
  isDefault: z.boolean(),
  isAppOwner: z.boolean(),
  expiresAt: isoDateTimeSchema,
})

export type EtsyAccount = z.infer<typeof etsyAccountSchema>

export const etsyProvisionalUserSchema = z.object({
  user_id: z.number().int(),
  login_name: z.string(),
})

export type EtsyProvisionalUser = z.infer<typeof etsyProvisionalUserSchema>
