import { request, requestWithSchema } from './request'
import {
  productBarcodeResponseSchema,
  productResponseSchema,
  type ProductsListQuery as ContractProductsListQuery,
  productsListResponseSchema,
  type ProductBarcodeResponse,
  type ProductResponse,
  type ProductsListResponse as ContractProductsListResponse,
  type ProductsCreateBody,
  type ProductsUpdateBody,
} from '#contracts/routes/products'

export type ProductBarcode = ProductBarcodeResponse
export type Product = ProductResponse
export type ProductsListQuery = ContractProductsListQuery
export type ProductsListResponse = ContractProductsListResponse

export const products = {
  list: (params: ProductsListQuery = {}, options?: Pick<RequestInit, 'signal'>) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value))
    }
    const queryString = query.toString()
    const path = `/products${queryString ? `?${queryString}` : ''}`
    return options
      ? requestWithSchema(path, productsListResponseSchema, options)
      : requestWithSchema(path, productsListResponseSchema)
  },
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

