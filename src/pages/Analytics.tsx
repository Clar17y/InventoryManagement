import { useMemo, useState } from 'react'
import DateRangePicker from '../components/analytics/DateRangePicker'
import OverviewCards from '../components/analytics/OverviewCards'
import ProfitCharts from '../components/analytics/ProfitCharts'
import SalesCharts from '../components/analytics/SalesCharts'
import ExpenseCharts from '../components/analytics/ExpenseCharts'
import InventoryCharts from '../components/analytics/InventoryCharts'
import { useAnalytics } from '../hooks/useAnalytics'

type PresetDays = 7 | 30 | 90
type Tab = 'overview' | 'profit' | 'sales' | 'expenses' | 'stock'

function toDateInputValue(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toStartOfDayIso(dateStr: string) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function toEndOfDayIso(dateStr: string) {
  const d = new Date(dateStr)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

export default function Analytics() {
  const today = new Date()
  const initialEnd = toDateInputValue(today)
  const initialStart = toDateInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29))

  const [presetDays, setPresetDays] = useState<PresetDays | null>(30)
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  const [tab, setTab] = useState<Tab>('overview')

  const params = useMemo(
    () => ({
      startDate: toStartOfDayIso(startDate),
      endDate: toEndOfDayIso(endDate),
    }),
    [startDate, endDate]
  )

  const { overview, profit, sales, expenses, inventory, loading, error, refetch } = useAnalytics(params)

  const handlePresetSelect = (days: PresetDays) => {
    setPresetDays(days)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    setStartDate(toDateInputValue(start))
    setEndDate(toDateInputValue(end))
  }

  const handleStartDateChange = (next: string) => {
    if (!next) return
    setPresetDays(null)
    setStartDate(next)
    if (endDate && next > endDate) setEndDate(next)
  }

  const handleEndDateChange = (next: string) => {
    if (!next) return
    setPresetDays(null)
    setEndDate(next)
    if (startDate && next < startDate) setStartDate(next)
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'profit', label: 'Profit' },
    { id: 'sales', label: 'Sales' },
    { id: 'expenses', label: 'Expense' },
    { id: 'stock', label: 'Stock' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Financial Analytics</h2>
        <div className="text-sm text-gray-500">{startDate} to {endDate}</div>
      </div>

      <DateRangePicker
        presetDays={presetDays}
        startDate={startDate}
        endDate={endDate}
        onPresetSelect={handlePresetSelect}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
      />

      <div className="overflow-x-auto -mx-4 px-4 pb-1">
        <div className="flex gap-2 min-w-max">
          {tabs.map((t) => {
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50 text-red-700 flex items-center justify-between gap-3">
          <div className="text-sm">{error}</div>
          <button type="button" onClick={refetch} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      )}

      <OverviewCards data={overview} loading={loading} />

      {tab === 'overview' && (
        <div className="card text-sm text-gray-600">
          Pick a section to explore trends and breakdowns.
        </div>
      )}
      {tab === 'profit' && <ProfitCharts data={profit} />}
      {tab === 'sales' && <SalesCharts data={sales} />}
      {tab === 'expenses' && <ExpenseCharts data={expenses} />}
      {tab === 'stock' && <InventoryCharts data={inventory} />}
    </div>
  )
}

