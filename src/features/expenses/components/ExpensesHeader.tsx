import { ChartBarIcon, PlusIcon } from '@heroicons/react/24/outline'

interface ExpensesHeaderProps {
  showForm: boolean
  showSummary: boolean
  onToggleSummary: () => void
  onShowForm: () => void
}

export default function ExpensesHeader({
  showForm,
  showSummary,
  onToggleSummary,
  onShowForm,
}: ExpensesHeaderProps) {
  return (
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-semibold">Business Expenses</h2>
      <div className="flex gap-2">
        <button
          onClick={onToggleSummary}
          className={`p-2 rounded-lg ${showSummary ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}
          title="Toggle summary"
        >
          <ChartBarIcon className="h-5 w-5" />
        </button>
        {!showForm && (
          <button onClick={onShowForm} className="btn-primary flex items-center gap-1">
            <PlusIcon className="h-5 w-5" />
            Add
          </button>
        )}
      </div>
    </div>
  )
}

