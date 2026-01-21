import type { Hamper } from '../../../../lib/api'
import { formatCurrency } from '../../../../lib/formatting'
import type { SaleLineInput } from '../../types'

interface HistoricalSaleSummaryCardProps {
  lines: SaleLineInput[]
  hamperList: Hamper[]
  postageCharged: string
}

export default function HistoricalSaleSummaryCard({
  lines,
  hamperList,
  postageCharged,
}: HistoricalSaleSummaryCardProps) {
  return (
    <div className="card space-y-4">
      <h3 className="font-medium">Sale Summary (Historical)</h3>
      <div className="text-sm text-gray-600">
        <p>This sale will be recorded without checking or consuming inventory.</p>
      </div>
      <div className="border-t pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span>Gross Revenue</span>
          <span className="font-medium">
            {formatCurrency(
              lines.reduce((sum, line) => {
                if (line.isBespoke) {
                  return sum + (line.unitPrice || 0) * line.quantity
                }
                const hamper = hamperList.find((h) => h.id === line.hamperId)
                return sum + (hamper ? Number(hamper.sellingPrice) * line.quantity : 0)
              }, 0)
            )}
          </span>
        </div>
        {postageCharged && (
          <div className="flex justify-between text-sm">
            <span>+ Postage Charged</span>
            <span className="font-medium">{formatCurrency(parseFloat(postageCharged))}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-gray-500">
          <span>Stock Cost</span>
          <span>Not tracked (historical)</span>
        </div>
      </div>
    </div>
  )
}

