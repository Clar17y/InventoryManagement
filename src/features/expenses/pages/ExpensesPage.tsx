import { useState, useEffect } from 'react'
import { expenses, BusinessExpense, ExpenseCategory, ExpenseSummary } from '../../../lib/api'
import { useScrollToForm } from '../../../hooks/useScrollToForm'
import { usePaginationSearchParams } from '../../../hooks/usePaginationSearchParams'
import { usePaginatedList } from '../../../hooks/usePaginatedList'
import DateSearchFilter, { useDateSearchFilter } from '../../../components/filters/DateSearchFilter'
import ExpenseForm from '../components/ExpenseForm'
import ExpensesHeader from '../components/ExpensesHeader'
import ExpensesList from '../components/ExpensesList'
import ExpensesSummaryPanel from '../components/ExpensesSummaryPanel'
import { categoryLabels, emptyForm } from '../constants'
import type { ExpenseFormData } from '../types'

export default function Expenses() {
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ExpenseFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | ''>('')

  // Date and search filter state
  const {
    startDate,
    endDate,
    searchQuery,
    debouncedSearchQuery,
    setStartDate: updateStartDate,
    setEndDate: updateEndDate,
    setSearchQuery: updateSearchQuery,
  } = useDateSearchFilter()

  const { page, pageSize, setPage, setPageSize, resetPage } = usePaginationSearchParams()
  const { formRef, scrollToForm } = useScrollToForm()

  const startDateIso = startDate ? new Date(startDate).toISOString() : undefined
  const endDateIso = endDate
    ? (() => {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      return end.toISOString()
    })()
    : undefined
  const listParams = {
    page,
    pageSize,
    category: filterCategory || undefined,
    startDate: startDateIso,
    endDate: endDateIso,
    search: debouncedSearchQuery || undefined,
  }
  const summaryParams = {
    startDate: startDateIso,
    endDate: endDateIso,
    search: debouncedSearchQuery || undefined,
  }
  const listState = usePaginatedList({
    queryKey: JSON.stringify(listParams),
    load: (signal) => expenses.list(listParams, { signal }),
  })
  const summaryState = usePaginatedList({
    queryKey: JSON.stringify(summaryParams),
    load: (signal) => expenses.summary(summaryParams, { signal }),
  })

  const expenseList = listState.data?.items ?? []
  const pagination = listState.data?.pagination ?? {
    page,
    pageSize,
    totalItems: 0,
    totalPages: 0,
  }
  const summary: ExpenseSummary | null = summaryState.data

  const loadData = () => {
    listState.retry()
    summaryState.retry()
  }

  useEffect(() => {
    if (
      listState.data
      && listState.data.items.length === 0
      && listState.data.pagination.totalItems > 0
      && page > 1
    ) {
      setPage(listState.data.pagination.totalPages)
    }
  }, [listState.data, page, setPage])

  const setStartDate = (value: string) => {
    resetPage()
    updateStartDate(value)
  }

  const setEndDate = (value: string) => {
    resetPage()
    updateEndDate(value)
  }

  const setSearchQuery = (value: string) => {
    resetPage()
    updateSearchQuery(value)
  }

  const setCategory = (value: ExpenseCategory | '') => {
    resetPage()
    setFilterCategory(value)
  }

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
      loadData()
    } catch (err) {
      setError(err instanceof Error ? `Failed to save expense: ${err.message}` : 'Failed to save expense')
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
      loadData()
    } catch (err) {
      setError(err instanceof Error ? `Failed to delete expense: ${err.message}` : 'Failed to delete expense')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
    setError(null)
  }

  const handleIncVatChange = (value: string) => {
    setFormData(prev => ({ ...prev, amountIncVat: value }))
  }

  const handleExcVatChange = (value: string) => {
    setFormData(prev => ({ ...prev, amountExcVat: value }))
  }

  if (listState.isInitialLoading) {
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
        <div role="alert" className="alert-danger">{error}</div>
      )}

      {showSummary && summaryState.error && (
        <div role="alert" className="alert-danger flex items-center justify-between gap-3">
          <span>Failed to load expense summary: {summaryState.error}</span>
          <button type="button" onClick={summaryState.retry} className="font-medium underline">
            Retry summary
          </button>
        </div>
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
            onExcVatChange={handleExcVatChange}
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
          aria-label="Expense category"
          value={filterCategory}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}
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
        pagination={pagination}
        isUpdating={listState.isUpdating}
        listError={listState.error}
        onRetry={listState.retry}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  )
}
