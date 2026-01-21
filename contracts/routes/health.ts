import { z } from 'zod'
import { isoDateTimeSchema } from '../http/primitives'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: isoDateTimeSchema,
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

