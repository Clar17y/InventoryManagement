import { z } from 'zod'

export const cuidSchema = z.string().cuid()

export const isoDateTimeSchema = z.string().datetime()

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected ISO date (YYYY-MM-DD)')

const numericStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => Number.isFinite(Number(value)), 'Expected a numeric string')

export const decimalSchema = z.union([
  z.number().finite(),
  numericStringSchema.transform((value) => Number(value)),
])
