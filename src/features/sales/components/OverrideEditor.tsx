import { useState } from 'react'
import { formatUnitCost } from '../../../lib/formatting'
import type { CategoryLot } from '../../../lib/api'
import type { LotOverride } from '../types'

export default function OverrideEditor({
  categoryName,
  quantityRequired,
  availableLots,
  loading,
  initialSelection,
  onSave,
  onCancel,
}: {
  categoryName: string
  quantityRequired: number
  availableLots: CategoryLot[]
  loading: boolean
  initialSelection: LotOverride[]
  onSave: (lots: LotOverride[]) => void
  onCancel: () => void
}) {
  const [selection, setSelection] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    initialSelection.forEach((s) => {
      initial[s.lotId] = s.quantity
    })
    return initial
  })

  const totalSelected = Object.values(selection).reduce((sum, qty) => sum + qty, 0)
  const isFulfilled = totalSelected >= quantityRequired

  const handleQuantityChange = (lotId: string, quantity: number) => {
    if (quantity <= 0) {
      const newSelection = { ...selection }
      delete newSelection[lotId]
      setSelection(newSelection)
    } else {
      setSelection({ ...selection, [lotId]: quantity })
    }
  }

  const handleSave = () => {
    const lots: LotOverride[] = availableLots
      .filter((lot) => (selection[lot.id] ?? 0) > 0)
      .map((lot) => ({
        lotId: lot.id,
        productName: lot.productName,
        quantity: selection[lot.id] ?? 0,
        unitCost: Number(lot.unitCost),
        maxAvailable: Number(lot.remaining),
      }))
    onSave(lots)
  }

  if (loading) {
    return (
      <div className="mt-2 p-3 bg-gray-50 rounded-lg text-center text-gray-500">
        Loading available lots...
      </div>
    )
  }

  if (availableLots.length === 0) {
    return (
      <div className="mt-2 p-3 bg-red-50 rounded-lg">
        <p className="text-sm text-red-700">No stock available in this category</p>
        <button onClick={onCancel} className="mt-2 text-sm text-gray-600 hover:text-gray-800">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 p-3 bg-info-50 rounded-lg space-y-3">
      <div className="flex justify-between items-center">
        <span className="font-medium text-sm">Select lots for {categoryName}</span>
        <span className={`text-sm ${isFulfilled ? 'text-green-600' : 'text-red-600'}`}>
          {totalSelected} / {quantityRequired} required
        </span>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {availableLots.map((lot) => (
          <div key={lot.id} className="flex items-center gap-2 bg-white p-2 rounded text-sm">
            <div className="flex-1">
              <div className="font-medium">{lot.productName}</div>
              <div className="text-xs text-gray-500">
                {formatUnitCost(lot.unitCost, 'unit')} • {Number(lot.remaining).toFixed(1)} available
                {lot.expiresAt && ` • Exp: ${new Date(lot.expiresAt).toLocaleDateString()}`}
              </div>
            </div>
            <input
              type="number"
              min="0"
              max={Number(lot.remaining)}
              step="0.1"
              value={selection[lot.id] || ''}
              onChange={(e) => handleQuantityChange(lot.id, parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="input w-20 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!isFulfilled} className="btn-primary text-sm flex-1">
          Apply
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}

