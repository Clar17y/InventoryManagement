import { formatCurrency } from '../../../lib/formatting'

export default function MarginBadge({ margin, revenue }: { margin: number; revenue: number }) {
  const percent = revenue > 0 ? (margin / revenue) * 100 : 0
  const colorClass = margin >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {formatCurrency(margin)} ({percent.toFixed(0)}%)
    </span>
  )
}

