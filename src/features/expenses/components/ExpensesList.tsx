import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatPrice } from '../../../lib/formatting'
import type { BusinessExpense } from '../../../lib/api'
import { categoryColors, categoryLabels } from '../constants'

interface ExpensesListProps {
  expenseList: BusinessExpense[]
  totalExpenses: number
  loadingMore: boolean
  onEdit: (expense: BusinessExpense) => void
  onDelete: (id: string) => void
  onLoadMore: () => void
}

export default function ExpensesList({
  expenseList,
  totalExpenses,
  loadingMore,
  onEdit,
  onDelete,
  onLoadMore,
}: ExpensesListProps) {
  if (expenseList.length === 0) {
    return (
      <div className="card text-gray-500 text-center py-8">
        <p className="mb-2">No expenses recorded</p>
        <p className="text-sm">Track your business expenses like advertising, postage, and packaging costs</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {expenseList.map((expense) => (
        <div key={expense.id} className="card">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs ${categoryColors[expense.category]}`}>
                  {categoryLabels[expense.category]}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(expense.date).toLocaleDateString('en-GB')}
                </span>
              </div>
              <div className="font-medium mt-1">{expense.description}</div>
              {expense.supplier && (
                <div className="text-sm text-gray-500">{expense.supplier}</div>
              )}
            </div>
            <div className="text-right">
              <div className="font-semibold text-red-600">
                {formatPrice(expense.amountIncVat)}
              </div>
              <div className="text-xs text-gray-400">
                exc VAT: {formatPrice(expense.amountExcVat)}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2 pt-2 border-t">
            <button
              type="button"
              onClick={() => onEdit(expense)}
              className="p-1.5 text-gray-500 hover:text-primary-600"
              aria-label={`Edit expense ${expense.description}`}
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(expense.id)}
              className="p-1.5 text-gray-500 hover:text-red-600"
              aria-label={`Delete expense ${expense.description}`}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {expenseList.length < totalExpenses && (
        <div className="text-center py-4">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="btn-secondary"
          >
            {loadingMore ? 'Loading...' : `Load More (${expenseList.length}/${totalExpenses})`}
          </button>
        </div>
      )}
    </div>
  )
}

