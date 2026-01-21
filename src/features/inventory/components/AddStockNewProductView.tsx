import type { FormEvent } from 'react'
import type { Category } from '../../../lib/api'

export default function AddStockNewProductView({
  scannedBarcode,
  onLinkToExistingProduct,
  newProductName,
  setNewProductName,
  newProductCategoryId,
  setNewProductCategoryId,
  newProductUnit,
  setNewProductUnit,
  newProductLowStockThreshold,
  setNewProductLowStockThreshold,
  allCategories,
  isCreatingCategory,
  setIsCreatingCategory,
  newCategoryName,
  setNewCategoryName,
  isCreatingCategoryLoading,
  handleCreateCategory,
  isSubmitting,
  handleCreateProduct,
  onCancel,
}: {
  scannedBarcode: string | null
  onLinkToExistingProduct: () => void
  newProductName: string
  setNewProductName: (value: string) => void
  newProductCategoryId: string
  setNewProductCategoryId: (value: string) => void
  newProductUnit: string
  setNewProductUnit: (value: string) => void
  newProductLowStockThreshold: number
  setNewProductLowStockThreshold: (value: number) => void
  allCategories: Category[]
  isCreatingCategory: boolean
  setIsCreatingCategory: (value: boolean) => void
  newCategoryName: string
  setNewCategoryName: (value: string) => void
  isCreatingCategoryLoading: boolean
  handleCreateCategory: () => void
  isSubmitting: boolean
  handleCreateProduct: (e: FormEvent) => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-amber-800 font-medium mb-1">New Barcode Detected</p>
        <p className="text-amber-700 text-sm">
          No product found for barcode: <span className="font-mono font-bold">{scannedBarcode}</span>
        </p>
      </div>

      {/* Two options: Create new or Link to existing */}
      <div className="space-y-3">
        <button
          onClick={onLinkToExistingProduct}
          className="w-full flex items-center gap-3 p-4 bg-white border-2 border-primary-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-900">Link to Existing Product</p>
            <p className="text-sm text-gray-500">This barcode is for a product already in your inventory</p>
          </div>
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        <p className="text-sm text-gray-600 font-medium">Create a New Product</p>

        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
            <input
              type="text"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g., Organic Milk 1L"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            {isCreatingCategory ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category name..."
                    autoFocus
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button
                    type="button"
                    disabled={!newCategoryName.trim() || isCreatingCategoryLoading}
                    onClick={handleCreateCategory}
                    className="px-4 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingCategoryLoading ? '...' : 'Add'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingCategory(false)
                    setNewCategoryName('')
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to category list
                </button>
              </div>
            ) : (
              <>
                <select
                  value={newProductCategoryId}
                  onChange={(e) => setNewProductCategoryId(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select a category...</option>
                  {allCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(true)}
                  className="mt-2 text-sm text-primary-600 hover:text-primary-800 font-medium"
                >
                  + Create new category
                </button>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit of Measure</label>
            <select
              value={newProductUnit}
              onChange={(e) => setNewProductUnit(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="units">Units</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="g">Grams (g)</option>
              <option value="L">Litres (L)</option>
              <option value="ml">Millilitres (ml)</option>
              <option value="packs">Packs</option>
              <option value="boxes">Boxes</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert Threshold</label>
            <input
              type="number"
              min="0"
              value={newProductLowStockThreshold}
              onChange={(e) => setNewProductLowStockThreshold(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g., 5"
            />
            <p className="text-xs text-gray-500 mt-1">Get alerted when stock falls below this quantity</p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newProductName.trim() || !newProductCategoryId || isSubmitting}
              className="flex-1 py-3 bg-gradient-to-r from-primary-500 to-accent-600 text-white rounded-xl font-medium hover:from-primary-600 hover:to-accent-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

