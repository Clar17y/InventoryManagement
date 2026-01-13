import { formatCurrency } from '../../lib/formatting'
import type { AnalyticsOverviewResponse } from '../../lib/api/analytics'

function formatPercent(value: number) {
  return `${Number(value).toFixed(1)}%`
}

function ChangeBadge({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return <span className="text-xs text-gray-400">—</span>
  }

  const numeric = Number(value) || 0
  const isPositive = numeric > 0
  const isNegative = numeric < 0

  const good = invert ? isNegative : isPositive
  const bad = invert ? isPositive : isNegative

  const color = good ? 'text-emerald-700' : bad ? 'text-red-700' : 'text-gray-500'
  const prefix = numeric > 0 ? '+' : ''

  return <span className={`text-xs ${color}`}>{`${prefix}${numeric.toFixed(1)}%`}</span>
}

function KpiCard({
  label,
  value,
  change,
  invertChange,
}: {
  label: string
  value: string
  change: number | null
  invertChange?: boolean
}) {
  return (
    <div className="card">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1">
        <ChangeBadge value={change} invert={invertChange} />
        <span className="text-xs text-gray-400"> vs prev</span>
      </div>
    </div>
  )
}

export default function OverviewCards({
  data,
  loading,
}: {
  data: AnalyticsOverviewResponse | null
  loading: boolean
}) {
  const kpis = data?.kpis
  const change = data?.change

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <KpiCard
        label="Revenue"
        value={loading ? '—' : formatCurrency(kpis?.totalRevenue ?? 0)}
        change={change?.totalRevenue ?? null}
      />
      <KpiCard
        label="Profit"
        value={loading ? '—' : formatCurrency(kpis?.totalProfit ?? 0)}
        change={change?.totalProfit ?? null}
      />
      <KpiCard
        label="Margin"
        value={loading ? '—' : formatPercent(kpis?.avgMarginPercent ?? 0)}
        change={change?.avgMarginPercent ?? null}
      />
      <KpiCard
        label="Expenses"
        value={loading ? '—' : formatCurrency(kpis?.totalExpenses ?? 0)}
        change={change?.totalExpenses ?? null}
        invertChange
      />
      <KpiCard
        label="Net Profit"
        value={loading ? '—' : formatCurrency(kpis?.netProfit ?? 0)}
        change={change?.netProfit ?? null}
      />
      <KpiCard
        label="Orders (AOV)"
        value={
          loading
            ? '—'
            : `${kpis?.salesCount ?? 0} (${formatCurrency(kpis?.avgOrderValue ?? 0)})`
        }
        change={change?.salesCount ?? null}
      />
    </div>
  )
}

