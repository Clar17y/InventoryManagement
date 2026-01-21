import type { SaleChannel } from '../../../../lib/api'

interface SaleOptionalDetailsCardProps {
  saleDate: string
  setSaleDate: (value: string) => void
  saleChannel: SaleChannel
  etsyOrderId: string
  setEtsyOrderId: (value: string) => void
  notes: string
  setNotes: (value: string) => void
}

export default function SaleOptionalDetailsCard({
  saleDate,
  setSaleDate,
  saleChannel,
  etsyOrderId,
  setEtsyOrderId,
  notes,
  setNotes,
}: SaleOptionalDetailsCardProps) {
  return (
    <div className="card space-y-4">
      <h3 className="font-medium">Optional Details</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sale Date</label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            className="input"
          />
          <p className="text-xs text-gray-500 mt-1">Defaults to today</p>
        </div>
        {saleChannel === 'etsy' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Etsy Order ID</label>
            <input
              type="text"
              value={etsyOrderId}
              onChange={(e) => setEtsyOrderId(e.target.value)}
              className="input"
              placeholder="e.g., 123456789"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            placeholder="Optional notes"
          />
        </div>
      </div>
    </div>
  )
}

