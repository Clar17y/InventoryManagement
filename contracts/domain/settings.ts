import { z } from 'zod'
import { cuidSchema, decimalSchema, isoDateTimeSchema } from '../http/primitives'

export const etsyFeeConfigSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(100),
  transactionFee: decimalSchema,
  regulatoryFee: decimalSchema,
  paymentFeePercent: decimalSchema,
  paymentFeeFixed: decimalSchema,
  vatRate: decimalSchema,
  listingFee: decimalSchema,
  effectiveFrom: isoDateTimeSchema,
  effectiveTo: isoDateTimeSchema.nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
})

export type EtsyFeeConfig = z.infer<typeof etsyFeeConfigSchema>

export const packagingOverheadSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(100),
  costPerOrder: decimalSchema,
  effectiveFrom: isoDateTimeSchema,
  effectiveTo: isoDateTimeSchema.nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
})

export type PackagingOverhead = z.infer<typeof packagingOverheadSchema>

export const postageTierSchema = z.object({
  id: cuidSchema,
  etsyCharge: decimalSchema,
  actualCost: decimalSchema,
  label: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
})

export type PostageTier = z.infer<typeof postageTierSchema>
