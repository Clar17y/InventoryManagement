import { z } from 'zod'
import {
  etsyAccountSchema,
  etsyImportResultSchema,
  etsyListingSchema,
  etsyProvisionalUserSchema,
  etsyStatusSchema,
} from '../domain/etsy'

export const etsyStatusResponseSchema = etsyStatusSchema

export const etsyAuthResponseSchema = z.union([
  z.object({
    authUrl: z.string().min(1),
    state: z.string().min(1),
  }),
  z.object({
    mockMode: z.literal(true),
    message: z.string(),
  }),
])

export const etsyDisconnectResponseSchema = z.object({
  success: z.boolean(),
  mockMode: z.boolean().optional(),
})

export const etsyListingsResponseSchema = z.object({
  listings: z.array(etsyListingSchema),
  count: z.number().int().nonnegative(),
})

export const etsyImportResponseSchema = etsyImportResultSchema

export const etsyAccountsResponseSchema = z.object({
  accounts: z.array(etsyAccountSchema),
})

export const etsyAccountActionResponseSchema = z.object({ success: z.boolean() })

export const etsyProvisionalUsersResponseSchema = z.object({
  provisionalUsers: z.array(etsyProvisionalUserSchema),
})

export const etsyAddProvisionalUserBodySchema = z.object({
  loginName: z.string().trim().min(1),
})

export type EtsyStatusResponse = z.infer<typeof etsyStatusResponseSchema>
export type EtsyAuthResponse = z.infer<typeof etsyAuthResponseSchema>
export type EtsyDisconnectResponse = z.infer<typeof etsyDisconnectResponseSchema>
export type EtsyListingsResponse = z.infer<typeof etsyListingsResponseSchema>
export type EtsyImportResponse = z.infer<typeof etsyImportResponseSchema>
export type EtsyAccountsResponse = z.infer<typeof etsyAccountsResponseSchema>
export type EtsyAccountActionResponse = z.infer<typeof etsyAccountActionResponseSchema>
export type EtsyProvisionalUsersResponse = z.infer<typeof etsyProvisionalUsersResponseSchema>
export type EtsyAddProvisionalUserBody = z.input<typeof etsyAddProvisionalUserBodySchema>
