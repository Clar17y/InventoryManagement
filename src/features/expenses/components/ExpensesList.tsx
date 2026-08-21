import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatPrice } from '../../../lib/formatting'
import type { BusinessExpense } from '../../../lib/api'
import UpdatingResults from '../../../components/ui/UpdatingResults'
import PaginationControls from '../../../components/ui/PaginationControls'
import type { PageSize, PaginationMeta } from '#contracts/http/pagination'
import { categoryColors, categoryLabels } from '../constants'

interface ExpensesListProps {
  expenseList: BusinessExpense[]
  pagination: PaginationMeta
  isUpdating: boolean
  listError: string | null
  onRetry: () => void
  onEdit: (expense: BusinessExpense) => void
  onDelete: (id: string) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
}

export default function ExpensesList({
  expenseList,
  pagination,
  isUpdating,
  listError,
  onRetry,
  onEdit,
  onDelete,
  onPageChange,
  onPageSizeChange,
}: ExpensesListProps) {
  if (expenseList.length === 0) {
    return (
      <UpdatingResults updating={isUpdating} error={listError} onRetry={onRetry}>
      <div className="card text-gray-500 text-center py-8">
        <p className="mb-2">No expenses recorded</p>
        <p className="text-sm">Track your business expenses like advertising, postage, and packaging costs</p>
      </div>
      </UpdatingResults>
    )
  }

  return (
    <div className="space-y-2">
      <UpdatingResults updating={isUpdating} error={listError} onRetry={onRetry}>
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
        </div>
      </UpdatingResults>
      {pagination.totalItems > 0 && (
        <PaginationControls
          {...pagination}
          loading={isUpdating}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  )
}

