import type { Product } from '../../../lib/api'

export default function AddStockLinkBarcodeView({
  scannedBarcode,
  searchQuery,
  setSearchQuery,
  isLoading,
  filteredProducts,
  isSubmitting,
  handleLinkBarcodeToProduct,
  onBack,
}: {
  scannedBarcode: string | null
  searchQuery: string
  setSearchQuery: (value: string) => void
  isLoading: boolean
  filteredProducts: Product[]
  isSubmitting: boolean
  handleLinkBarcodeToProduct: (product: Product) => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-primary-50 border border-primary-200 rounded-xl">
        <p className="text-primary-800 font-medium mb-1">Link Barcode to Product</p>
        <p className="text-primary-700 text-sm">
          Barcode: <span className="font-mono font-bold">{scannedBarcode}</span>
        </p>
        <p className="text-primary-600 text-xs mt-1">Search for a product to link this barcode to.</p>
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
          placeholder="Search for a product..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Product list */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading products...</div>
      ) : searchQuery && filteredProducts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No products found</div>
      ) : searchQuery ? (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => handleLinkBarcodeToProduct(product)}
              disabled={isSubmitting}
              className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-primary-50 hover:border-primary-200 border border-transparent rounded-lg transition-colors text-left disabled:opacity-50"
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
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-500 text-sm py-4">Start typing to search for a product</p>
      )}

      <button
        type="button"
        onClick={onBack}
        className="w-full py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
      >
        ← Back
      </button>
    </div>
  )
}

