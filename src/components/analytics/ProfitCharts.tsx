import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../../lib/formatting'
import type { AnalyticsProfitResponse } from '../../lib/api/analytics'

function formatShortDate(label: string) {
  const d = new Date(label)
  if (Number.isNaN(d.getTime())) return label
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const feeColors = ['#16a34a', '#0ea5e9', '#a855f7', '#f59e0b', '#ef4444', '#64748b', '#334155', '#c2410c', '#7c3aed']

export default function ProfitCharts({ data }: { data: AnalyticsProfitResponse | null }) {
  if (!data) {
    return (
      <div className="card text-gray-500 text-center py-8">
        Loading profit analytics...
      </div>
    )
  }

  const feeData = [
    { name: 'Transaction', value: data.feeBreakdown.transaction },
    { name: 'Processing', value: data.feeBreakdown.processing },
    { name: 'Regulatory', value: data.feeBreakdown.regulatory },
    { name: 'Listing', value: data.feeBreakdown.listing },
    { name: 'Postage', value: data.feeBreakdown.postage },
    { name: 'Stock (COGS)', value: data.feeBreakdown.stock },
    { name: 'Packaging', value: data.feeBreakdown.packaging },
    { name: 'Offsite Ads', value: data.feeBreakdown.offsiteAds },
    { name: 'VAT on Offsite Ads', value: data.feeBreakdown.offsiteAdsVat },
  ].filter((d) => Number(d.value) > 0)

  const hasNetProfit = data.dailyTrend.every((p) => typeof p.netProfit === 'number')
  const profitSeriesKey = hasNetProfit ? 'netProfit' : 'profit'
  const profitSeriesLabel = hasNetProfit ? 'Net Profit' : 'Profit'

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="font-semibold mb-3">Revenue vs {profitSeriesLabel} (Daily)</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatShortDate} />
              <YAxis tickFormatter={(v) => `£${Number(v).toFixed(0)}`} />
              <Tooltip
                labelFormatter={(label) => formatShortDate(String(label))}
                formatter={(value, name) => {
                  if (name === 'marginPercent') return [`${Number(value).toFixed(1)}%`, 'Margin %']
                  if (name === 'revenue' || name === 'Revenue') return [formatCurrency(Number(value)), 'Revenue']
                  if (name === profitSeriesKey || name === profitSeriesLabel) {
                    return [formatCurrency(Number(value)), profitSeriesLabel]
                  }
                  return [value as number, name]
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line
                type="monotone"
                dataKey={profitSeriesKey}
                name={profitSeriesLabel}
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="font-semibold mb-3">Fee/Cost Breakdown</div>
        {feeData.length === 0 ? (
          <div className="text-gray-500 text-sm">No fee data for this period.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Pie
                    data={feeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {feeData.map((_, idx) => (
                      <Cell key={idx} fill={feeColors[idx % feeColors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {feeData.map((f, idx) => (
                <div key={f.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: feeColors[idx % feeColors.length] }}
                    />
                    <span className="text-gray-700">{f.name}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(f.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="font-semibold mb-3">Top Hampers by Margin %</div>
        {data.marginByHamper.length === 0 ? (
          <div className="text-gray-500 text-sm">No hamper sales in this period.</div>
        ) : (
          <div className="space-y-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.marginByHamper}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === 'marginPercent') return [`${Number(value).toFixed(1)}%`, 'Margin %']
                      return [formatCurrency(Number(value)), String(name)]
                    }}
                  />
                  <Bar dataKey="marginPercent" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Hamper</th>
                    <th className="py-2 pr-4">Revenue</th>
                    <th className="py-2 pr-4">Profit</th>
                    <th className="py-2">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.marginByHamper.map((h) => (
                    <tr key={h.name} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-medium">{h.name}</td>
                      <td className="py-2 pr-4">{formatCurrency(h.revenue)}</td>
                      <td className="py-2 pr-4">{formatCurrency(h.profit)}</td>
                      <td className="py-2">{`${h.marginPercent.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
