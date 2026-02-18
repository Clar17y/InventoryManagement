import { request, requestWithSchema } from './request'
import {
  suppliersResponseSchema,
  supplierResponseSchema,
  supplierLowStockResponseSchema,
  productSupplierIdsResponseSchema,
  type SupplierCreateBody,
  type SupplierUpdateBody,
  type SupplierResponse,
  type SupplierLowStockProduct,
} from '#contracts/routes/suppliers'

export type Supplier = SupplierResponse
export type SupplierLowStockItem = SupplierLowStockProduct

export const suppliers = {
  list: () => requestWithSchema('/suppliers', suppliersResponseSchema),
  create: (data: SupplierCreateBody) =>
    requestWithSchema('/suppliers', supplierResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: SupplierUpdateBody) =>
    requestWithSchema(`/suppliers/${id}`, supplierResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/suppliers/${id}`, { method: 'DELETE' }),
  lowStock: (supplierId: string) =>
    requestWithSchema(`/suppliers/${supplierId}/low-stock`, supplierLowStockResponseSchema),
  getProductSuppliers: (productId: string) =>
    requestWithSchema(`/suppliers/by-product/${productId}`, productSupplierIdsResponseSchema),
  setProductSuppliers: (productId: string, supplierIds: string[]) =>
    requestWithSchema(`/suppliers/by-product/${productId}`, productSupplierIdsResponseSchema, {
      method: 'PUT',
      body: JSON.stringify({ supplierIds }),
    }),
}
