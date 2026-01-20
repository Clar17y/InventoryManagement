import type { Dispatch, SetStateAction } from 'react'
import type { InventoryLot, Product } from '../../../lib/api'
import { formatUnitCost } from '../../../lib/formatting'
import StockLevelBar from '../../../components/inventory/StockLevelBar'

export interface InventoryLotEditForm {
  remaining: string
  unitCost: string
  expiresAt: string
}

export interface InventoryProductRowProps {
  product: Product
  expanded: boolean
  onToggle: () => void
  lots?: InventoryLot[]
  editingLot: string | null
  editForm: InventoryLotEditForm
  setEditForm: Dispatch<SetStateAction<InventoryLotEditForm>>
  onStartEdit: (lot: InventoryLot) => void
  onSaveEdit: (lotId: string, productId: string) => Promise<void>
  onCancelEdit: () => void
  onDeleteLot: (lotId: string, productId: string) => Promise<void>
  formatDate: (dateStr: string) => string
  showCategory?: boolean
}

export default function InventoryProductRow({
  product,
  expanded,
  onToggle,
  lots,
  editingLot,
  editForm,
  setEditForm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteLot,
  formatDate,
  showCategory,
}: InventoryProductRowProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full py-2 px-1 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
          <p className="text-xs text-gray-500">
            {showCategory && product.category?.name && (
              <span className="text-primary-600">{product.category.name} • </span>
            )}
            {product.unit}
            {product.barcode && ` • ${product.barcode}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right text-xs">
            {product.unit === 'units' ? (
              <span className="text-gray-600">{product.totalStock ?? 0}</span>
            ) : (
              <span className="text-gray-600">
                {product.lotCount ?? 0} lot{(product.lotCount ?? 0) !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="w-16">
            <StockLevelBar current={product.totalStock ?? 0} size="sm" />
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Lot Details */}
      {expanded && (
        <div className="pb-2 px-1">
          <div className="bg-gray-50 rounded-lg p-2">
            <h4 className="text-xs font-medium text-gray-700 mb-1">Lot Breakdown</h4>
            {lots?.length ? (
              <div className="space-y-1">
                {lots.map((lot) => (
                  <div key={lot.id} className="text-xs bg-white rounded p-1.5 border border-gray-100">
                    {editingLot === lot.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Remaining</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={editForm.remaining}
                              onChange={(e) => setEditForm((f) => ({ ...f, remaining: e.target.value }))}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Unit Cost (£)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editForm.unitCost}
                              onChange={(e) => setEditForm((f) => ({ ...f, unitCost: e.target.value }))}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Expires</label>
                            <input
                              type="date"
                              value={editForm.expiresAt}
                              onChange={(e) => setEditForm((f) => ({ ...f, expiresAt: e.target.value }))}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={onCancelEdit} className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded text-sm">
                            Cancel
                          </button>
                          <button
                            onClick={() => onSaveEdit(lot.id, product.id)}
                            className="px-3 py-1 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <span className="text-gray-600">Received {formatDate(lot.receivedAt)}</span>
                          {lot.expiresAt && (
                            <span className="text-amber-600 ml-2">• Expires {formatDate(lot.expiresAt)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">{formatUnitCost(lot.unitCost)}</span>
                          <span className="font-medium text-gray-900">{Number(lot.remaining).toFixed(0)} left</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onStartEdit(lot)
                            }}
                            className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                            title="Edit lot"
                            aria-label={`Edit lot ${lot.id}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteLot(lot.id, product.id)
                            }}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete lot"
                            aria-label={`Delete lot ${lot.id}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No active lots</p>
            )}
            {product.currentCost && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <span className="text-xs text-gray-600">
                  Current cost: <strong>{formatUnitCost(product.currentCost, product.unit)}</strong>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

