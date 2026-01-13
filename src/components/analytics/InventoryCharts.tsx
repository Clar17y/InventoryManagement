import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../../lib/formatting'
import type { AnalyticsInventoryResponse } from '../../lib/api/analytics'

function formatShortDate(label: string) {
  const d = new Date(label)
  if (Number.isNaN(d.getTime())) return label
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function InventoryCharts({ data }: { data: AnalyticsInventoryResponse | null }) {
  if (!data) {
    return (
      <div className="card text-gray-500 text-center py-8">
        Loading inventory analytics...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-sm text-gray-500">Current Stock Value</div>
        <div className="text-2xl font-bold">{formatCurrency(data.currentStockValue)}</div>
      </div>

      <div className="card">
        <div className="font-semibold mb-3">COGS (Daily)</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.cogsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatShortDate} />
              <YAxis tickFormatter={(v) => `£${Number(v).toFixed(0)}`} />
              <Tooltip
                labelFormatter={(label) => formatShortDate(String(label))}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Line type="monotone" dataKey="cogs" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="font-semibold mb-3">Avg Cost by Hamper</div>
        {data.costByHamper.length === 0 ? (
          <div className="text-gray-500 text-sm">No hamper sales in this period.</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.costByHamper}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={(v) => `£${Number(v).toFixed(0)}`} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'avgCost') return [formatCurrency(Number(value)), 'Avg Cost']
                    if (name === 'unitsSold') return [Number(value), 'Units']
                    return [value as number, String(name)]
                  }}
                />
                <Legend />
                <Bar dataKey="avgCost" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

