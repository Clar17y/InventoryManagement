import { useState, useEffect, useRef } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { expenses, BusinessExpense, ExpenseCategory, ExpenseSummary } from '../lib/api'
import { formatPrice } from '../lib/formatting'
import DateSearchFilter, { useDateSearchFilter } from '../components/filters/DateSearchFilter'

interface ExpenseFormData {
  date: string
  category: ExpenseCategory
  supplier: string
  description: string
  amountIncVat: string
  amountExcVat: string
}

const emptyForm: ExpenseFormData = {
  date: new Date().toISOString().split('T')[0] ?? '',
  category: 'OTHER',
  supplier: '',
  description: '',
  amountIncVat: '',
  amountExcVat: '',
}

const categoryLabels: Record<ExpenseCategory, string> = {
  ADVERTISING: 'Advertising',
  LISTING_FEE: 'Listing Fee',
  POSTAGE: 'Postage',
  PACKAGING: 'Packaging',
  STOCK: 'Stock/Contents',
  OTHER: 'Other',
}

const categoryColors: Record<ExpenseCategory, string> = {
  ADVERTISING: 'bg-purple-100 text-purple-800',
  LISTING_FEE: 'bg-blue-100 text-blue-800',
  POSTAGE: 'bg-orange-100 text-orange-800',
  PACKAGING: 'bg-green-100 text-green-800',
  STOCK: 'bg-amber-100 text-amber-800',
  OTHER: 'bg-gray-100 text-gray-800',
}

export default function Expenses() {
  const [expenseList, setExpenseList] = useState<BusinessExpense[]>([])
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ExpenseFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | ''>()
  const [totalExpenses, setTotalExpenses] = useState(0)
  const PAGE_SIZE = 20

  // Date and search filter state
  const {
    startDate,
    endDate,
    searchQuery,
    debouncedSearchQuery,
    setStartDate,
    setEndDate,
    setSearchQuery,
  } = useDateSearchFilter()

  const isFirstRender = useRef(true)

  const loadExpenses = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true)
      }
      const params: { category?: ExpenseCategory; startDate?: string; endDate?: string; search?: string; limit?: number; offset?: number } = {
        limit: PAGE_SIZE,
        offset: 0,
      }
      if (filterCategory) params.category = filterCategory
      if (startDate) params.startDate = new Date(startDate).toISOString()
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        params.endDate = end.toISOString()
      }
      if (debouncedSearchQuery) params.search = debouncedSearchQuery

      const [listRes, summaryRes] = await Promise.all([
        expenses.list(params),
        expenses.summary(params),
      ])
      setExpenseList(listRes.expenses)
      setTotalExpenses(listRes.total ?? listRes.expenses.length)
      setSummary(summaryRes)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    try {
      setLoadingMore(true)
      const params: { category?: ExpenseCategory; startDate?: string; endDate?: string; search?: string; limit?: number; offset?: number } = {
        limit: PAGE_SIZE,
        offset: expenseList.length,
      }
      if (filterCategory) params.category = filterCategory
      if (startDate) params.startDate = new Date(startDate).toISOString()
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        params.endDate = end.toISOString()
      }
      if (debouncedSearchQuery) params.search = debouncedSearchQuery

      const result = await expenses.list(params)
      setExpenseList([...expenseList, ...result.expenses])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more expenses')
    } finally {
      setLoadingMore(false)
    }
  }

  // Initial load
  useEffect(() => {
    loadExpenses(true)
    isFirstRender.current = false
  }, [])

  // Re-fetch when filters change
  useEffect(() => {
    if (!isFirstRender.current) {
      loadExpenses(false)
    }
  }, [filterCategory, startDate, endDate, debouncedSearchQuery])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const data = {
        date: new Date(formData.date).toISOString(),
        category: formData.category,
        supplier: formData.supplier || undefined,
        description: formData.description,
        amountIncVat: parseFloat(formData.amountIncVat) || 0,
        amountExcVat: parseFloat(formData.amountExcVat) || 0,
      }

      if (editingId) {
        await expenses.update(editingId, data)
      } else {
        await expenses.create(data)
      }
      setShowForm(false)
      setEditingId(null)
      setFormData(emptyForm)
      await loadExpenses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (expense: BusinessExpense) => {
    setFormData({
      date: expense.date.split('T')[0] ?? '',
      category: expense.category,
      supplier: expense.supplier || '',
      description: expense.description,
      amountIncVat: String(expense.amountIncVat),
      amountExcVat: String(expense.amountExcVat),
    })
    setEditingId(expense.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return

    try {
      await expenses.delete(id)
      await loadExpenses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete expense')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
    setError(null)
  }

  const handleIncVatChange = (value: string) => {
    setFormData(prev => {
      const incVat = parseFloat(value) || 0
      const excVat = incVat / 1.2
      return {
        ...prev,
        amountIncVat: value,
        amountExcVat: incVat > 0 ? excVat.toFixed(2) : '',
      }
    })
  }

  if (loading && expenseList.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Business Expenses</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className={`p-2 rounded-lg ${showSummary ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}
            title="Toggle summary"
          >
            <ChartBarIcon className="h-5 w-5" />
          </button>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1">
              <PlusIcon className="h-5 w-5" />
              Add
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      )}

      {showSummary && summary && (
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
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h3 className="font-medium">{editingId ? 'Edit Expense' : 'New Expense'}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as ExpenseCategory })}
                className="input"
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
            <input
              type="text"
              value={formData.supplier}
              onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
              className="input"
              placeholder="e.g., Etsy, Royal Mail, Amazon"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              placeholder="What was this expense for?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (inc VAT) *</label>
              <input
                type="number"
                required
                step="0.01"
                min="0"
                value={formData.amountIncVat}
                onChange={(e) => handleIncVatChange(e.target.value)}
                className="input"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (exc VAT)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amountExcVat}
                onChange={(e) => setFormData({ ...formData, amountExcVat: e.target.value })}
                className="input"
                placeholder="Auto-calculated"
              />
              <p className="text-xs text-gray-500 mt-1">Auto-fills at 20% VAT</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter */}
      <DateSearchFilter
        startDate={startDate}
        endDate={endDate}
        searchQuery={searchQuery}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search expenses..."
        showQuickSelectors={true}
      />

      {/* Category filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Category:</span>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as ExpenseCategory | '')}
          className="text-sm border rounded-lg px-2 py-1"
        >
          <option value="">All Categories</option>
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {expenseList.length === 0 ? (
        <div className="card text-gray-500 text-center py-8">
          <p className="mb-2">No expenses recorded</p>
          <p className="text-sm">Track your business expenses like advertising, postage, and packaging costs</p>
        </div>
      ) : (
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
                  onClick={() => handleEdit(expense)}
                  className="p-1.5 text-gray-500 hover:text-primary-600"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(expense.id)}
                  className="p-1.5 text-gray-500 hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Load More */}
          {expenseList.length < totalExpenses && (
            <div className="text-center py-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-secondary"
              >
                {loadingMore ? 'Loading...' : `Load More (${expenseList.length}/${totalExpenses})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
