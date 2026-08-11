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
