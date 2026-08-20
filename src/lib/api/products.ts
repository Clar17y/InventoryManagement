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

const COMPATIBILITY_PAGE_SIZE = 100 as const

function throwIfAborted(signal?: AbortSignal | null) {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted', 'AbortError')
  }
}

/**
 * Temporary compatibility loader for legacy all-products pickers.
 * Tasks 7–8 will replace these consumers with paged product UIs.
 */
export async function listAllProducts(
  params: Omit<ProductsListQuery, 'page' | 'pageSize'> = {},
  options?: Pick<RequestInit, 'signal'>,
): Promise<ProductsListResponse> {
  const items: Product[] = []
  let page = 1
  let firstResponse: ProductsListResponse | null = null

  while (true) {
    throwIfAborted(options?.signal)
    const response = await products.list({ ...params, page, pageSize: COMPATIBILITY_PAGE_SIZE }, options)
    throwIfAborted(options?.signal)
    firstResponse ??= response
    items.push(...response.items)

    if (page >= response.pagination.totalPages) break
    page += 1
  }

  return { ...firstResponse!, items }
}

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
  listAll: listAllProducts,
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

