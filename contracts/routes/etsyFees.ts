import { z } from 'zod'
import {
  etsyFeeReconciliationApplyResultSchema,
  etsyFeeReconciliationPreviewSchema,
  etsyFeeReconciliationSummarySchemaResponse,
  etsyFeeReconciliationStatusCountsSchema,
  etsyPaymentFeeApplyResultSchema,
  etsyPaymentFeePreviewSchema,
} from '../domain/etsyFees'

const receiptIdSchema = z.string().regex(/^\d+$/)
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/)
const statementMonthSchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)

export const etsyPaymentFeePreviewBodySchema = z.object({
  receiptIds: z.array(receiptIdSchema).min(1).max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict()

export const etsyPaymentFeeApplyBodySchema = z.object({
  receiptIds: z.array(receiptIdSchema).min(1).max(100),
  fingerprint: fingerprintSchema,
}).strict()

export const etsyStatementFeePreviewBodySchema = z.object({
  statementMonth: statementMonthSchema,
  fileName: z.string().min(1),
  csv: z.string().max(2_500_000),
  allowStatementRevision: z.boolean().optional(),
}).strict()

export const etsyStatementFeeApplyBodySchema = etsyStatementFeePreviewBodySchema.extend({
  fingerprint: fingerprintSchema,
}).strict()

export const etsyFeeReconciliationSummaryResponseSchema = etsyFeeReconciliationSummarySchemaResponse
export const etsyFeeReconciliationStatusCountsResponseSchema = etsyFeeReconciliationStatusCountsSchema
export const etsyPaymentFeePreviewResponseSchema = etsyPaymentFeePreviewSchema
export const etsyPaymentFeeApplyResponseSchema = etsyPaymentFeeApplyResultSchema
export const etsyStatementFeePreviewResponseSchema = etsyFeeReconciliationPreviewSchema
export const etsyStatementFeeApplyResponseSchema = etsyFeeReconciliationApplyResultSchema

export type EtsyPaymentFeePreviewBody = z.input<typeof etsyPaymentFeePreviewBodySchema>
export type EtsyPaymentFeeApplyBody = z.input<typeof etsyPaymentFeeApplyBodySchema>
export type EtsyStatementFeePreviewBody = z.input<typeof etsyStatementFeePreviewBodySchema>
export type EtsyStatementFeeApplyBody = z.input<typeof etsyStatementFeeApplyBodySchema>
export type EtsyFeeReconciliationSummaryResponse = z.infer<typeof etsyFeeReconciliationSummaryResponseSchema>
export type EtsyPaymentFeePreviewResponse = z.infer<typeof etsyPaymentFeePreviewResponseSchema>
export type EtsyPaymentFeeApplyResponse = z.infer<typeof etsyPaymentFeeApplyResponseSchema>
export type EtsyStatementFeePreviewResponse = z.infer<typeof etsyStatementFeePreviewResponseSchema>
export type EtsyStatementFeeApplyResponse = z.infer<typeof etsyStatementFeeApplyResponseSchema>
