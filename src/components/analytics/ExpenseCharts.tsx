import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../../lib/formatting'
import type { AnalyticsExpensesResponse } from '../../lib/api/analytics'
import type { ExpenseCategory } from '../../lib/api/expenses'

const categoryLabels: Record<ExpenseCategory, string> = {
  ADVERTISING: 'Advertising',
  LISTING_FEE: 'Listing Fee',
  POSTAGE: 'Postage',
  PACKAGING: 'Packaging',
  STOCK: 'Stock',
  OTHER: 'Other',
}

const categoryColors: Record<ExpenseCategory, string> = {
  ADVERTISING: '#a855f7',
  LISTING_FEE: '#0ea5e9',
  POSTAGE: '#f59e0b',
  PACKAGING: '#16a34a',
  STOCK: '#ef4444',
  OTHER: '#64748b',
}

export default function ExpenseCharts({ data }: { data: AnalyticsExpensesResponse | null }) {
  if (!data) {
    return (
      <div className="card text-gray-500 text-center py-8">
        Loading expense analytics...
      </div>
    )
  }

  const pieData = data.categoryBreakdown
    .filter((c) => Number(c.total) > 0)
    .map((c) => ({
      name: categoryLabels[c.category],
      value: c.total,
      category: c.category,
    }))

  const categories: ExpenseCategory[] = [
    'ADVERTISING',
    'LISTING_FEE',
    'POSTAGE',
    'PACKAGING',
    'STOCK',
    'OTHER',
  ]

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="font-semibold mb-3">Expenses by Category (Monthly)</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.categoryTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => `£${Number(v).toFixed(0)}`} />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  categoryLabels[name as ExpenseCategory] ?? String(name),
                ]}
              />
              <Legend />
              {categories.map((c) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stackId="1"
                  stroke={categoryColors[c]}
                  fill={categoryColors[c]}
                  fillOpacity={0.25}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="font-semibold mb-3">Expense Breakdown</div>
        {pieData.length === 0 ? (
          <div className="text-gray-500 text-sm">No expenses for this period.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {pieData.map((p) => (
                      <Cell key={p.category} fill={categoryColors[p.category]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {pieData.map((p) => (
                <div key={p.category} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: categoryColors[p.category] }}
                    />
                    <span className="text-gray-700">{p.name}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(p.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

