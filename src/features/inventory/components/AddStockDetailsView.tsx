import type { FormEvent } from 'react'
import type { Product } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'

export default function AddStockDetailsView({
  scanError,
  onSearchForProductManually,
  selectedProduct,
  onChangeProduct,
  onSelectProduct,
  quantity,
  setQuantity,
  costMode,
  setCostMode,
  costValue,
  setCostValue,
  excludesVAT,
  setExcludesVAT,
  expiresAt,
  setExpiresAt,
  isSubmitting,
  handleSubmit,
}: {
  scanError: string | null
  onSearchForProductManually: () => void
  selectedProduct: Product | null
  onChangeProduct: () => void
  onSelectProduct: () => void
  quantity: string
  setQuantity: (value: string) => void
  costMode: 'total' | 'unit'
  setCostMode: (value: 'total' | 'unit') => void
  costValue: string
  setCostValue: (value: string) => void
  excludesVAT: boolean
  setExcludesVAT: (value: boolean) => void
  expiresAt: string
  setExpiresAt: (value: string) => void
  isSubmitting: boolean
  handleSubmit: (e: FormEvent) => void
}) {
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {scanError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
          {scanError}
          <button
            type="button"
            onClick={onSearchForProductManually}
            className="block mt-2 text-amber-800 font-medium underline"
          >
            Search for product manually
          </button>
        </div>
      )}

      {selectedProduct ? (
        <div className="p-4 bg-primary-50 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-primary-900">{selectedProduct.name}</p>
              <p className="text-sm text-primary-700">
                {selectedProduct.category?.name} • {selectedProduct.unit}
              </p>
            </div>
            <button
              type="button"
              onClick={onChangeProduct}
              className="text-primary-600 hover:text-primary-800 text-sm font-medium"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-gray-50 rounded-xl text-center">
          <p className="text-gray-500">No product selected</p>
          <button type="button" onClick={onSelectProduct} className="mt-2 text-primary-600 font-medium">
            Select product
          </button>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Quantity ({selectedProduct?.unit || 'units'})
        </label>
        <input
          type="number"
          step="any"
          min="0.001"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="e.g., 10"
        />
      </div>

      <div>
        {/* Cost Mode Toggle */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-3">
          <button
            type="button"
            onClick={() => setCostMode('total')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
              costMode === 'total' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Total Cost
          </button>
          <button
            type="button"
            onClick={() => setCostMode('unit')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
              costMode === 'unit' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Unit Cost
          </button>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          {costMode === 'total' ? 'Total Cost (£)' : `Cost per ${selectedProduct?.unit || 'unit'} (£)`}
        </label>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={costValue}
          onChange={(e) => setCostValue(e.target.value)}
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder={costMode === 'total' ? 'e.g., 25.00' : 'e.g., 0.125'}
        />

        {/* VAT Checkbox */}
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={excludesVAT}
            onChange={(e) => setExcludesVAT(e.target.checked)}
            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-gray-600">
            Price excludes VAT <span className="text-gray-400">(+20%)</span>
          </span>
        </label>

        {/* Calculated Cost Display */}
        {quantity && costValue && parseFloat(quantity) > 0 && (
          <div className="mt-3 p-3 bg-primary-50 rounded-lg">
            <p className="text-sm text-primary-700">
              <span className="font-medium">Per {selectedProduct?.unit || 'unit'}:</span>{' '}
              £{(() => {
                const qty = parseFloat(quantity)
                const cost = parseFloat(costValue)
                let unitCost = costMode === 'total' ? cost / qty : cost
                if (excludesVAT) unitCost *= 1.2
                return unitCost.toFixed(4)
              })()}
              {excludesVAT && <span className="text-primary-500"> (inc. VAT)</span>}
            </p>
            {costMode === 'unit' && (
              <p className="text-sm text-primary-600 mt-1">
                <span className="font-medium">Total:</span>{' '}
                {formatCurrency(
                  (() => {
                    const qty = parseFloat(quantity)
                    const cost = parseFloat(costValue)
                    let total = cost * qty
                    if (excludesVAT) total *= 1.2
                    return total
                  })()
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date (optional)</label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <button
        type="submit"
        disabled={!selectedProduct || !quantity || !costValue || isSubmitting}
        className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Adding...' : 'Add Stock'}
      </button>
    </form>
  )
}

