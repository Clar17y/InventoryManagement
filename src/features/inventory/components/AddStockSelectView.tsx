import type { RefObject } from 'react'
import type { PageSize, PaginationMeta } from '#contracts/http/pagination'
import type { Product } from '../../../lib/api'
import { formatPrice } from '../../../lib/formatting'
import PaginationControls from '../../../components/ui/PaginationControls'

export default function AddStockSelectView({
  handheldInputRef,
  handheldBarcode,
  setHandheldBarcode,
  handleHandheldSubmit,
  isProcessingHandheld,
  onUseCamera,
  searchQuery,
  setSearchQuery,
  isInitialLoading,
  isUpdating,
  error,
  retry,
  products,
  pagination,
  setPage,
  setPageSize,
  handleProductSelect,
}: {
  handheldInputRef: RefObject<HTMLInputElement | null>
  handheldBarcode: string
  setHandheldBarcode: (value: string) => void
  handleHandheldSubmit: () => void
  isProcessingHandheld: boolean
  onUseCamera: () => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  isInitialLoading: boolean
  isUpdating: boolean
  error: string | null
  retry: () => void
  products: Product[]
  pagination: PaginationMeta
  setPage: (page: number) => void
  setPageSize: (pageSize: PageSize) => void
  handleProductSelect: (product: Product) => void
}) {
  return (
    <div className="space-y-4">
      {/* Handheld Scanner Input */}
      <div className="p-4 bg-gradient-to-r from-primary-50 to-accent-50 rounded-xl border-2 border-primary-200">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2m0-8v8" />
            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
          </svg>
          <span className="text-sm font-medium text-primary-700">Barcode Scanner</span>
        </div>
        <div className="flex gap-2">
          <input
            ref={handheldInputRef}
            type="text"
            value={handheldBarcode}
            onChange={(e) => setHandheldBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleHandheldSubmit()
              }
            }}
            placeholder="Scan with handheld or type barcode..."
            disabled={isProcessingHandheld}
            className="flex-1 px-4 py-3 border border-primary-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white disabled:opacity-50"
            aria-label="Barcode input for handheld scanner"
          />
          <button
            type="button"
            onClick={handleHandheldSubmit}
            disabled={!handheldBarcode.trim() || isProcessingHandheld}
            className="px-4 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessingHandheld ? '...' : 'Go'}
          </button>
        </div>
        <p className="text-xs text-primary-600 mt-2">Ready for handheld scanner - auto-submits on scan</p>
      </div>

      {/* Camera Scanner Button */}
      <button
        onClick={onUseCamera}
        className="w-full flex items-center justify-center gap-3 p-4 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:border-primary-300 hover:bg-primary-50 transition-all"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Use Camera
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">or search manually</span>
        </div>
      </div>

      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Product list */}
      {isInitialLoading ? (
        <div className="text-center py-8 text-gray-500">Loading products...</div>
      ) : error ? (
        <div className="space-y-2 text-center py-6 text-sm text-red-600">
          <p>{error}</p>
          <button type="button" onClick={retry} className="btn-secondary text-sm">Retry</button>
        </div>
      ) : searchQuery && products.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No products found</div>
      ) : searchQuery ? (
        <div aria-busy={isUpdating}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => handleProductSelect(product)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left"
              >
                <div>
                  <p className="font-medium text-gray-900">{product.name}</p>
                  <p className="text-sm text-gray-500">
                    {product.category?.name} • {product.unit}
                    {product.barcode && ` • ${product.barcode}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-700">Stock: {product.totalStock ?? 0}</p>
                  {product.currentCost && <p className="text-xs text-gray-500">{formatPrice(product.currentCost)}</p>}
                </div>
              </button>
            ))}
          </div>
          <PaginationControls
            {...pagination}
            loading={isUpdating}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : (
        <p className="text-center text-gray-500 text-sm py-4">Start typing to search for a product</p>
      )}
    </div>
  )
}
