import { z } from 'zod'

export const pickRuleSchema = z.enum(['FIFO', 'FEFO', 'CHEAPEST', 'MANUAL'])

export type PickRule = z.infer<typeof pickRuleSchema>

