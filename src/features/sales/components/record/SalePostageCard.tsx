import { formatCurrency } from '../../../../lib/formatting'

interface SalePostageCardProps {
  postageCharged: string
  setPostageCharged: (value: string) => void
  postageCost: string
  setPostageCost: (value: string) => void
}

export default function SalePostageCard({
  postageCharged,
  setPostageCharged,
  postageCost,
  setPostageCost,
}: SalePostageCardProps) {
  return (
    <div className="card space-y-4">
      <h3 className="font-medium">Postage</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Postage Charged</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={postageCharged}
            onChange={(e) => setPostageCharged(e.target.value)}
            className="input"
            placeholder="What customer pays"
          />
          <p className="text-xs text-gray-500 mt-1">Amount charged to customer</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Postage Cost</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={postageCost}
            onChange={(e) => setPostageCost(e.target.value)}
            className="input"
            placeholder="What you pay Royal Mail"
          />
          <p className="text-xs text-gray-500 mt-1">Your actual shipping cost</p>
        </div>
      </div>
      {postageCharged && postageCost && (
        <div className="text-sm">
          <span className="text-gray-500">Postage profit: </span>
          <span className={parseFloat(postageCharged) >= parseFloat(postageCost) ? 'text-green-600' : 'text-red-600'}>
            {formatCurrency(parseFloat(postageCharged) - parseFloat(postageCost))}
          </span>
        </div>
      )}
    </div>
  )
}

