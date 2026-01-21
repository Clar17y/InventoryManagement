import type { PackagingOverhead } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'

interface PackagingOverheadSectionProps {
  packagingOverheads: PackagingOverhead[]
  packagingTotal: number
  newOverheadName: string
  newOverheadCost: string
  onNewOverheadNameChange: (value: string) => void
  onNewOverheadCostChange: (value: string) => void
  saving: boolean
  onAddOverhead: () => void
  onDeleteOverhead: (id: string) => void
}

export default function PackagingOverheadSection({
  packagingOverheads,
  packagingTotal,
  newOverheadName,
  newOverheadCost,
  onNewOverheadNameChange,
  onNewOverheadCostChange,
  saving,
  onAddOverhead,
  onDeleteOverhead,
}: PackagingOverheadSectionProps) {
  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Packaging Overhead</h3>
      <p className="text-sm text-gray-500">
        Average costs for tape, bubble wrap, and other consumables per order
      </p>

      {packagingOverheads.length > 0 && (
        <div className="space-y-2">
          {packagingOverheads.map((overhead) => (
            <div key={overhead.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
              <span>{overhead.name}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatCurrency(Number(overhead.costPerOrder))}</span>
                <button
                  onClick={() => onDeleteOverhead(overhead.id)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="font-medium">Total per order</span>
            <span className="font-semibold">{formatCurrency(packagingTotal)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newOverheadName}
          onChange={(e) => onNewOverheadNameChange(e.target.value)}
          className="input flex-1"
          placeholder="Item name (e.g., Tape)"
        />
        <input
          type="number"
          step="0.01"
          value={newOverheadCost}
          onChange={(e) => onNewOverheadCostChange(e.target.value)}
          className="input w-24"
          placeholder="Cost"
        />
        <button
          onClick={onAddOverhead}
          disabled={saving || !newOverheadName.trim() || !newOverheadCost}
          className="btn-primary"
        >
          Add
        </button>
      </div>
    </section>
  )
}

