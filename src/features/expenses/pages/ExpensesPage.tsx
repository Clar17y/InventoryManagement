import { useState, useEffect, useRef } from 'react'
import { expenses, BusinessExpense, ExpenseCategory, ExpenseSummary } from '../../../lib/api'
import { useScrollToForm } from '../../../hooks/useScrollToForm'
import DateSearchFilter, { useDateSearchFilter } from '../../../components/filters/DateSearchFilter'
import ExpenseForm from '../components/ExpenseForm'
import ExpensesHeader from '../components/ExpensesHeader'
import ExpensesList from '../components/ExpensesList'
import ExpensesSummaryPanel from '../components/ExpensesSummaryPanel'
import { categoryLabels, emptyForm, PAGE_SIZE } from '../constants'
import type { ExpenseFormData } from '../types'

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
  const { formRef, scrollToForm } = useScrollToForm()

  const buildParams = (offset: number) => {
    const params: { category?: ExpenseCategory; startDate?: string; endDate?: string; search?: string; limit?: number; offset?: number } = {
      limit: PAGE_SIZE,
      offset,
    }
    if (filterCategory) params.category = filterCategory
    if (startDate) params.startDate = new Date(startDate).toISOString()
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      params.endDate = end.toISOString()
    }
    if (debouncedSearchQuery) params.search = debouncedSearchQuery

    return params
  }

  const loadExpenses = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true)
      }
      const params = buildParams(0)

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
      const params = buildParams(expenseList.length)

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
    scrollToForm()
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
      <ExpensesHeader
        showForm={showForm}
        showSummary={showSummary}
        onToggleSummary={() => setShowSummary(!showSummary)}
        onShowForm={() => setShowForm(true)}
      />

      {error && (
        <div className="alert-danger">{error}</div>
      )}

      {showSummary && summary && (
        <ExpensesSummaryPanel summary={summary} />
      )}

      {showForm && (
        <div ref={formRef}>
          <ExpenseForm
            key={editingId ?? 'new'}
            editingId={editingId}
            formData={formData}
            saving={saving}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            setFormData={setFormData}
            onIncVatChange={handleIncVatChange}
          />
        </div>
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

      <ExpensesList
        expenseList={expenseList}
        totalExpenses={totalExpenses}
        loadingMore={loadingMore}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onLoadMore={loadMore}
      />
    </div>
  )
}
