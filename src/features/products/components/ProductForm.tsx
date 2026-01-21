import { XMarkIcon } from '@heroicons/react/24/outline'
import type { Category, Product } from '../../../lib/api'
import type { ProductFormData } from '../types'

interface ProductFormProps {
  editingId: string | null
  editingProduct: Product | null
  formData: ProductFormData
  setFormData: React.Dispatch<React.SetStateAction<ProductFormData>>
  categoryList: Category[]
  saving: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  newBarcode: string
  onNewBarcodeChange: (value: string) => void
  addingBarcode: boolean
  onAddBarcode: () => void
  onRemoveBarcode: (barcodeId: string) => void
}

export default function ProductForm({
  editingId,
  editingProduct,
  formData,
  setFormData,
  categoryList,
  saving,
  onSubmit,
  onCancel,
  newBarcode,
  onNewBarcodeChange,
  addingBarcode,
  onAddBarcode,
  onRemoveBarcode,
}: ProductFormProps) {
  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <h3 className="font-medium">{editingId ? 'Edit Product' : 'New Product'}</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="input"
          placeholder="e.g., Lavender Hand Cream 100ml"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
        <select
          required
          value={formData.categoryId}
          onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
          className="input"
        >
          <option value="">Select category...</option>
          {categoryList.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        {categoryList.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            Create categories first before adding products
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
        <select
          value={formData.unit}
          onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
          className="input"
        >
          <option value="units">Units (individual items)</option>
          <option value="grams">Grams (g)</option>
          <option value="ml">Millilitres (ml)</option>
          <option value="metres">Metres (m)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert Threshold</label>
        <input
          type="number"
          min="0"
          value={formData.lowStockThreshold}
          onChange={(e) => setFormData({ ...formData, lowStockThreshold: Math.max(0, parseInt(e.target.value) || 0) })}
          className="input"
        />
        <p className="text-xs text-gray-500 mt-1">
          Alert when stock falls to this level. Set to 0 to disable alerts.
        </p>
      </div>

      {editingId && editingProduct && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Barcodes</label>

          {editingProduct.barcodes && editingProduct.barcodes.length > 0 ? (
            <div className="space-y-2 mb-3">
              {editingProduct.barcodes.map((bc) => (
                <div key={bc.id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                  <span className="font-mono text-sm flex-1">{bc.barcode}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveBarcode(bc.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove barcode"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-3">No barcodes linked to this product</p>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newBarcode}
              onChange={(e) => onNewBarcodeChange(e.target.value)}
              className="input flex-1"
              placeholder="Enter barcode to add..."
            />
            <button
              type="button"
              onClick={onAddBarcode}
              disabled={!newBarcode.trim() || addingBarcode}
              className="btn-secondary disabled:opacity-50"
            >
              {addingBarcode ? '...' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Barcodes can also be linked by scanning in Add Stock
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving || categoryList.length === 0} className="btn-primary">
          {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}

