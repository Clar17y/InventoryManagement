import { requestWithSchema } from './request'
import { healthResponseSchema } from '#contracts/routes/health'

export const health = {
  get: () => requestWithSchema('/health', healthResponseSchema),
}

