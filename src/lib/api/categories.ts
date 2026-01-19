import { request, requestWithSchema } from './request'
import {
  categoriesListResponseSchema,
  categoryResponseSchema,
  type CategoriesCreateBody,
  type CategoriesUpdateBody,
  type CategoryResponse,
} from '#contracts/routes/categories'

export type Category = CategoryResponse

export const categories = {
  list: () => requestWithSchema('/categories', categoriesListResponseSchema),
  get: (id: string) => requestWithSchema(`/categories/${id}`, categoryResponseSchema),
  create: (data: CategoriesCreateBody) =>
    requestWithSchema('/categories', categoryResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: CategoriesUpdateBody) =>
    requestWithSchema(`/categories/${id}`, categoryResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
}
