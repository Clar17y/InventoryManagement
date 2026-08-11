import { z } from 'zod'

export const etsyFeeReconciliationStatusSchema = z.enum([
  'NOT_APPLICABLE',
  'PENDING',
  'PAYMENT_SYNCED',
  'STATEMENT_VERIFIED',
  'MANUAL_REVIEW',
])

export const etsyFeeReconciliationSourceSchema = z.enum([
  'ETSY_PAYMENT_API',
  'ETSY_STATEMENT',
])

export type EtsyFeeReconciliationStatus = z.infer<typeof etsyFeeReconciliationStatusSchema>
export type EtsyFeeReconciliationSource = z.infer<typeof etsyFeeReconciliationSourceSchema>

const moneySchema = z.number().finite()
const nullableMoneySchema = moneySchema.nullable()
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const etsyFeeOrderOutcomeSchema = z.enum([
  'changed',
  'unchanged',
  'unmatched',
  'manual_review',
])

export const etsyFeeOrderAllocationSchema = z.object({
  saleId: z.string().min(1),
  offsiteAdsFee: moneySchema,
  vatOnOffsiteAdsFee: moneySchema,
})

/** A single order-level preview/apply change, with money represented in pounds. */
export const etsyFeeOrderChangeSchema = z.object({
  receiptId: z.string().regex(/^\d+$/),
  saleIds: z.array(z.string().min(1)),
  oldStatus: etsyFeeReconciliationStatusSchema.nullable(),
  newStatus: etsyFeeReconciliationStatusSchema.nullable(),
  attributed: z.boolean().nullable(),
  oldFees: nullableMoneySchema,
  newFees: nullableMoneySchema,
  feeDelta: moneySchema,
  oldNetRevenue: nullableMoneySchema,
  newNetRevenue: nullableMoneySchema,
  marginDelta: moneySchema,
  offsiteAdsFee: nullableMoneySchema,
  vatOnOffsiteAdsFee: nullableMoneySchema,
  source: etsyFeeReconciliationSourceSchema.nullable(),
  outcome: etsyFeeOrderOutcomeSchema,
  message: z.string().min(1).optional(),
  allocations: z.array(etsyFeeOrderAllocationSchema),
})

export const etsyFeeReconciliationSummarySchema = z.object({
  matched: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  manualReview: z.number().int().nonnegative(),
  attributed: z.number().int().nonnegative(),
  notAttributed: z.number().int().nonnegative(),
  oldFees: moneySchema,
  newFees: moneySchema,
  marginDelta: moneySchema,
})

export const etsyFeeReconciliationPreviewSchema = z.object({
  fingerprint: fingerprintSchema,
  statementChecksum: fingerprintSchema.nullable(),
  receiptIds: z.array(z.string().regex(/^\d+$/)),
  summary: etsyFeeReconciliationSummarySchema,
  changes: z.array(etsyFeeOrderChangeSchema),
})

export const etsyFeeReconciliationApplyResultSchema = etsyFeeReconciliationPreviewSchema.extend({
  applied: z.boolean(),
  duplicate: z.boolean(),
  statementImportId: z.string().min(1).nullable(),
})

export const etsyPaymentFeePreviewSchema = etsyFeeReconciliationPreviewSchema.extend({
  canApplyCanonicalFees: z.boolean(),
  failures: z.array(z.object({
    receiptId: z.string().regex(/^\d+$/),
    status: z.enum(['PENDING', 'MANUAL_REVIEW']),
    message: z.string().min(1),
  })),
})

export const etsyPaymentFeeApplyResultSchema = etsyPaymentFeePreviewSchema.extend({
  applied: z.boolean(),
  duplicate: z.boolean(),
  statementImportId: z.string().min(1).nullable(),
})

export const etsyFeeReconciliationStatusCountsSchema = z.object({
  NOT_APPLICABLE: z.number().int().nonnegative(),
  PENDING: z.number().int().nonnegative(),
  PAYMENT_SYNCED: z.number().int().nonnegative(),
  STATEMENT_VERIFIED: z.number().int().nonnegative(),
  MANUAL_REVIEW: z.number().int().nonnegative(),
})

export const etsyFeeReconciliationSummarySchemaResponse = z.object({
  counts: etsyFeeReconciliationStatusCountsSchema,
})

// Route-facing alias kept alongside the domain name for consumers that import
// response schemas directly from the shared contracts package.
export const etsyFeeReconciliationSummaryResponseSchema = etsyFeeReconciliationSummarySchemaResponse

export type EtsyFeeOrderOutcome = z.infer<typeof etsyFeeOrderOutcomeSchema>
export type EtsyFeeOrderAllocation = z.infer<typeof etsyFeeOrderAllocationSchema>
export type EtsyFeeOrderChange = z.infer<typeof etsyFeeOrderChangeSchema>
export type EtsyFeeReconciliationSummary = z.infer<typeof etsyFeeReconciliationSummarySchema>
export type EtsyFeeReconciliationPreview = z.infer<typeof etsyFeeReconciliationPreviewSchema>
export type EtsyFeeReconciliationApplyResult = z.infer<typeof etsyFeeReconciliationApplyResultSchema>
export type EtsyPaymentFeePreview = z.infer<typeof etsyPaymentFeePreviewSchema>
export type EtsyPaymentFeeApplyResult = z.infer<typeof etsyPaymentFeeApplyResultSchema>
export type EtsyFeeReconciliationStatusCounts = z.infer<typeof etsyFeeReconciliationStatusCountsSchema>
