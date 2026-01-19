import { z } from 'zod'
import { cuidSchema, decimalSchema, isoDateTimeSchema } from '../http/primitives'
import { hamperBaseSchema } from './hamper'
import { productSchema } from './product'

export const saleChannelSchema = z.enum(['etsy', 'direct', 'fair'])

export type SaleChannel = z.infer<typeof saleChannelSchema>

export const saleLineHamperSchema = hamperBaseSchema.pick({
  id: true,
  name: true,
  sellingPrice: true,
})

export type SaleLineHamper = z.infer<typeof saleLineHamperSchema>

export const saleConsumptionLotProductSchema = productSchema.pick({ id: true, name: true })

export type SaleConsumptionLotProduct = z.infer<typeof saleConsumptionLotProductSchema>

export const saleConsumptionLotSchema = z.object({
  id: cuidSchema,
  product: saleConsumptionLotProductSchema,
})

export type SaleConsumptionLot = z.infer<typeof saleConsumptionLotSchema>

export const saleConsumptionSchema = z.object({
  id: cuidSchema,
  lotId: cuidSchema,
  quantity: decimalSchema,
  unitCost: decimalSchema,
  lot: saleConsumptionLotSchema,
})

export type SaleConsumption = z.infer<typeof saleConsumptionSchema>

export const saleLineSchema = z.object({
  id: cuidSchema,
  hamperId: cuidSchema.nullable(),
  hamper: saleLineHamperSchema.nullable(),
  variantId: cuidSchema.nullable(),
  description: z.string().max(200).nullable(),
  quantity: z.number().int().positive(),
  unitPrice: decimalSchema,
  lineCost: decimalSchema,
  consumptions: z.array(saleConsumptionSchema),
})

export type SaleLine = z.infer<typeof saleLineSchema>

export const saleSchema = z.object({
  id: cuidSchema,
  saleDate: isoDateTimeSchema,
  saleChannel: saleChannelSchema,
  etsyOrderId: z.string().max(100).nullable(),
  grossRevenue: decimalSchema,
  postageCharged: decimalSchema,
  postageCost: decimalSchema,
  etsyFees: decimalSchema,
  transactionFee: decimalSchema,
  postageTransactionFee: decimalSchema,
  regulatoryFee: decimalSchema,
  processingFee: decimalSchema,
  vatOnProcessingFee: decimalSchema,
  listingFee: decimalSchema,
  packagingOverhead: decimalSchema,
  netRevenue: decimalSchema,
  totalCost: decimalSchema,
  margin: decimalSchema,
  notes: z.string().max(1000).nullable(),
  isHistorical: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  lines: z.array(saleLineSchema),
})

export type Sale = z.infer<typeof saleSchema>
