import { request, requestWithSchema } from './request'
import { withArchived } from './query'
import {
  suppliersResponseSchema,
  supplierResponseSchema,
  supplierMutationResponseSchema,
  supplierLowStockResponseSchema,
  productSupplierIdsResponseSchema,
  type SupplierCreateBody,
  type SupplierMutationResponse,
  type SupplierUpdateBody,
  type SupplierResponse,
  type SupplierLowStockProduct,
} from '#contracts/routes/suppliers'

export type Supplier = SupplierResponse
export type SupplierLowStockItem = SupplierLowStockProduct

export const suppliers = {
  list: (options?: { includeArchived?: boolean }) =>
    requestWithSchema(withArchived('/suppliers', options), suppliersResponseSchema),
  create: (data: SupplierCreateBody) =>
    requestWithSchema('/suppliers', supplierMutationResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: SupplierUpdateBody) =>
    requestWithSchema(`/suppliers/${id}`, supplierResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/suppliers/${id}`, { method: 'DELETE' }),
  restore: (id: string) =>
    requestWithSchema(`/suppliers/${id}/restore`, supplierResponseSchema, { method: 'POST' }),
  lowStock: (supplierId: string) =>
    requestWithSchema(`/suppliers/${supplierId}/low-stock`, supplierLowStockResponseSchema),
  getProductSuppliers: (productId: string) =>
    requestWithSchema(`/suppliers/by-product/${productId}`, productSupplierIdsResponseSchema),
  setProductSuppliers: (productId: string, supplierIds: string[]) =>
    requestWithSchema(`/suppliers/by-product/${productId}`, productSupplierIdsResponseSchema, {
      method: 'PUT',
      body: JSON.stringify({ supplierIds }),
    }),
  getSupplierProducts: (supplierId: string) =>
    requestWithSchema(`/suppliers/${supplierId}/products`, productSupplierIdsResponseSchema),
  setSupplierProducts: (supplierId: string, productIds: string[]) =>
    requestWithSchema(`/suppliers/${supplierId}/products`, productSupplierIdsResponseSchema, {
      method: 'PUT',
      body: JSON.stringify({ productIds }),
    }),
}

export type { SupplierMutationResponse }
