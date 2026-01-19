import { request, requestWithSchema } from './request'
import {
  hamperDetailResponseSchema,
  hamperResponseSchema,
  hamperVariantResponseSchema,
  hamperVariantsListResponseSchema,
  hampersListResponseSchema,
  type HamperDetailResponse,
  type HamperVariantCreateBody,
  type HamperVariantResponse,
  type HamperVariantUpdateBody,
  type HampersCreateBody,
  type HampersListResponse,
  type HampersUpdateBody,
} from '#contracts/routes/hampers'
import type {
  HamperVariantAvailability as DomainHamperVariantAvailability,
} from '#contracts/domain/hamper'

export type Hamper = HampersListResponse[number]
export type HamperDetail = HamperDetailResponse
export type HamperCreateData = HampersCreateBody
export type HamperUpdateData = HampersUpdateBody
export type HamperVariant = HamperVariantResponse
export type HamperVariantCreateData = HamperVariantCreateBody
export type HamperVariantUpdateData = HamperVariantUpdateBody
export type HamperVariantAvailability = DomainHamperVariantAvailability

export const hampers = {
  list: () => requestWithSchema('/hampers', hampersListResponseSchema),
  get: (id: string) => requestWithSchema(`/hampers/${id}`, hamperDetailResponseSchema),
  create: (data: HamperCreateData) =>
    requestWithSchema('/hampers', hamperResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: HamperUpdateData) =>
    requestWithSchema(`/hampers/${id}`, hamperResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/hampers/${id}`, { method: 'DELETE' }),
}

export const hamperVariants = {
  list: (hamperId: string) =>
    requestWithSchema(`/hampers/${hamperId}/variants`, hamperVariantsListResponseSchema),
  create: (hamperId: string, data: HamperVariantCreateData) =>
    requestWithSchema(`/hampers/${hamperId}/variants`, hamperVariantResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (hamperId: string, variantId: string, data: HamperVariantUpdateData) =>
    requestWithSchema(`/hampers/${hamperId}/variants/${variantId}`, hamperVariantResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (hamperId: string, variantId: string) =>
    request<void>(`/hampers/${hamperId}/variants/${variantId}`, { method: 'DELETE' }),
}

