import { XMarkIcon } from '@heroicons/react/24/outline'
import type { Hamper } from '../../../../lib/api'
import { formatCurrency } from '../../../../lib/formatting'
import type { SaleLineInput } from '../../types'

interface SaleItemsCardProps {
  lines: SaleLineInput[]
  hamperList: Hamper[]
  handleAddLine: (bespoke?: boolean) => void
  handleRemoveLine: (index: number) => void
  handleUpdateLine: (index: number, updates: Partial<SaleLineInput>) => void
}

export default function SaleItemsCard({
  lines,
  hamperList,
  handleAddLine,
  handleRemoveLine,
  handleUpdateLine,
}: SaleItemsCardProps) {
  return (
    <div className="card space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Items</h3>
        <div className="flex gap-2">
          <button type="button" onClick={() => handleAddLine(true)} className="text-sm text-gray-600 hover:text-gray-800">
            + Bespoke Item
          </button>
          <button type="button" onClick={() => handleAddLine(false)} className="text-sm text-primary-600 hover:text-primary-700">
            + Add Hamper
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {lines.map((line, index) => {
          const selectedHamper = line.hamperId ? hamperList.find((h) => h.id === line.hamperId) : null
          const lineTotal = line.isBespoke
            ? (line.unitPrice || 0) * line.quantity
            : selectedHamper
              ? Number(selectedHamper.sellingPrice) * line.quantity
              : 0

          return (
            <div key={index} className="bg-gray-50 p-2 rounded-lg space-y-2">
              {line.isBespoke ? (
                // Bespoke item row
                <div className="flex gap-2 items-center">
                  <span className="text-xs bg-accent-100 text-accent-800 px-2 py-0.5 rounded">Bespoke</span>
                  <input
                    type="text"
                    value={line.description || ''}
                    onChange={(e) => handleUpdateLine(index, { description: e.target.value })}
                    className="input flex-1"
                    placeholder="Item description..."
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice || ''}
                    onChange={(e) => handleUpdateLine(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="input w-24"
                    placeholder="Price"
                  />
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => handleUpdateLine(index, { quantity: parseInt(e.target.value) || 1 })}
                    className="input w-16"
                  />
                  <span className="text-sm text-gray-500 w-20 text-right">
                    {formatCurrency(lineTotal)}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(index)}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ) : (
                // Hamper selection row
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <select
                      value={line.hamperId || ''}
                      onChange={(e) => handleUpdateLine(index, { hamperId: e.target.value, variantId: undefined })}
                      className="input flex-1"
                    >
                      <option value="">Select hamper...</option>
                      {hamperList.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} - {formatCurrency(Number(h.sellingPrice))}
                          {h.hasVariants ? ' (has variants)' : ` (Can make: ${h.canMake})`}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => handleUpdateLine(index, { quantity: parseInt(e.target.value) || 1 })}
                      className="input w-20"
                    />
                    <span className="text-sm text-gray-500 w-20 text-right">
                      {formatCurrency(lineTotal)}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(index)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  {/* Variant selection for hampers with variants */}
                  {selectedHamper?.hasVariants && selectedHamper.variantAvailability && selectedHamper.variantAvailability.length > 0 && (
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs text-gray-500">Variant:</span>
                      <select
                        value={line.variantId || ''}
                        onChange={(e) => handleUpdateLine(index, { variantId: e.target.value || undefined })}
                        className="input text-sm flex-1 max-w-xs"
                      >
                        <option value="">Select variant...</option>
                        {selectedHamper.variantAvailability.map((v) => (
                          <option key={v.variantId} value={v.variantId}>
                            {v.name} (Can make: {v.canMake}){v.etsySku ? ` [${v.etsySku}]` : ''}
                          </option>
                        ))}
                      </select>
                      {!line.variantId && (
                        <span className="text-xs text-amber-600">
                          No variant selected - will use any available stock
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

