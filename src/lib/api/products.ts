import { request, requestWithSchema } from './request'
import {
  productBarcodeResponseSchema,
  productResponseSchema,
  productsListResponseSchema,
  type ProductBarcodeResponse,
  type ProductResponse,
  type ProductsCreateBody,
  type ProductsUpdateBody,
} from '#contracts/routes/products'

export type ProductBarcode = ProductBarcodeResponse
export type Product = ProductResponse

export const products = {
  list: (categoryId?: string) =>
    requestWithSchema(
      `/products${categoryId ? `?categoryId=${categoryId}` : ''}`,
      productsListResponseSchema
    ),
  get: (id: string) => requestWithSchema(`/products/${id}`, productResponseSchema),
  getByBarcode: (barcode: string) =>
    requestWithSchema(`/products/barcode/${barcode}`, productResponseSchema),
  create: (data: ProductsCreateBody) =>
    requestWithSchema('/products', productResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: ProductsUpdateBody) =>
    requestWithSchema(`/products/${id}`, productResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  // Barcode management
  addBarcode: (productId: string, barcode: string) =>
    requestWithSchema(`/products/${productId}/barcodes`, productBarcodeResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ barcode }),
    }),
  removeBarcode: (productId: string, barcodeId: string) =>
    request<void>(`/products/${productId}/barcodes/${barcodeId}`, { method: 'DELETE' }),
}

