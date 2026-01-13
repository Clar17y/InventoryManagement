import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../../lib/formatting'
import type { AnalyticsSalesResponse } from '../../lib/api/analytics'

function formatShortDate(label: string) {
  const d = new Date(label)
  if (Number.isNaN(d.getTime())) return label
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const channelLabels: Record<string, string> = {
  etsy: 'Etsy',
  direct: 'Direct',
  fair: 'Fair/Market',
}

export default function SalesCharts({ data }: { data: AnalyticsSalesResponse | null }) {
  if (!data) {
    return (
      <div className="card text-gray-500 text-center py-8">
        Loading sales analytics...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="font-semibold mb-3">Sales Volume (Daily)</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.volumeTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatShortDate} />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => `£${Number(v).toFixed(0)}`}
              />
              <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
              <Tooltip
                labelFormatter={(label) => formatShortDate(String(label))}
                formatter={(value, name) => {
                  if (name === 'revenue') return [formatCurrency(Number(value)), 'Revenue']
                  if (name === 'count') return [Number(value), 'Orders']
                  return [value as number, String(name)]
                }}
              />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="revenue" fill="#bbf7d0" stroke="#16a34a" />
              <Line yAxisId="right" type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="font-semibold mb-3">Sales by Channel</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.byChannel.map((c) => (
            <div key={c.channel} className="bg-gray-50 rounded-lg p-3 border">
              <div className="text-sm text-gray-500">{channelLabels[c.channel] ?? c.channel}</div>
              <div className="text-lg font-semibold">{formatCurrency(c.revenue)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {c.count} order{c.count !== 1 ? 's' : ''} · Profit {formatCurrency(c.profit)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="font-semibold mb-3">Best Sellers (Units)</div>
        {data.bestSellers.length === 0 ? (
          <div className="text-gray-500 text-sm">No hamper sales in this period.</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bestSellers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'unitsSold') return [Number(value), 'Units']
                    if (name === 'revenue') return [formatCurrency(Number(value)), 'Revenue']
                    return [value as number, String(name)]
                  }}
                />
                <Bar dataKey="unitsSold" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

