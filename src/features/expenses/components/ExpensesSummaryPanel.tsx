import { formatPrice } from '../../../lib/formatting'
import type { ExpenseSummary } from '../../../lib/api'
import { categoryColors, categoryLabels } from '../constants'

interface ExpensesSummaryPanelProps {
  summary: ExpenseSummary
}

export default function ExpensesSummaryPanel({ summary }: ExpensesSummaryPanelProps) {
  return (
    <div className="card bg-gray-50 space-y-4">
      <h3 className="font-medium">Expense Summary</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-3 rounded-lg">
          <div className="text-xs text-gray-500">Total (inc VAT)</div>
          <div className="text-lg font-semibold text-red-600">
            {formatPrice(summary.totals.totalIncVat)}
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg">
          <div className="text-xs text-gray-500">Total (exc VAT)</div>
          <div className="text-lg font-semibold text-gray-700">
            {formatPrice(summary.totals.totalExcVat)}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-600">By Category</div>
        {summary.byCategory.map((cat) => (
          <div key={cat.category} className="flex justify-between items-center bg-white p-2 rounded-lg text-sm">
            <span className={`px-2 py-0.5 rounded text-xs ${categoryColors[cat.category]}`}>
              {categoryLabels[cat.category]}
            </span>
            <span className="font-medium">{formatPrice(cat.totalIncVat)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

