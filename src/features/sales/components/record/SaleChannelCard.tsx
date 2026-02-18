import type { PostageTier, SaleChannel } from '../../../../lib/api'
import { channelColors, channelLabels } from '../../constants'

interface SaleChannelCardProps {
  saleChannel: SaleChannel
  setSaleChannel: (value: SaleChannel) => void
  setPostageCharged: (value: string) => void
  setPostageCost: (value: string) => void
  isHistorical: boolean
  setIsHistorical: (value: boolean) => void
  postageTiers: PostageTier[]
}

export default function SaleChannelCard({
  saleChannel,
  setSaleChannel,
  setPostageCharged,
  setPostageCost,
  isHistorical,
  setIsHistorical,
  postageTiers,
}: SaleChannelCardProps) {
  return (
    <div className="card space-y-3">
      <h3 className="font-medium">Sale Channel</h3>
      <div className="flex gap-2">
        {(Object.keys(channelLabels) as SaleChannel[]).map((channel) => (
          <button
            key={channel}
            type="button"
            onClick={() => {
              setSaleChannel(channel)
              if (channel === 'direct' || channel === 'fair') {
                setPostageCharged('0')
                setPostageCost('0')
              } else if (channel === 'etsy') {
                setPostageCharged('5.00')
                const defaultCost = postageTiers.length > 0 && postageTiers[0]
                  ? Number(postageTiers[0].actualCost).toFixed(2) : '5.35'
                setPostageCost(defaultCost)
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${saleChannel === channel
              ? channelColors[channel]
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            {channelLabels[channel]}
          </button>
        ))}
      </div>
      {saleChannel === 'etsy' && (
        <p className="text-xs text-gray-500">Etsy fees will be calculated automatically</p>
      )}
      {saleChannel !== 'etsy' && (
        <p className="text-xs text-gray-500">No marketplace fees for {channelLabels[saleChannel]} sales</p>
      )}

      {/* Historical Sale Toggle */}
      <div className="pt-3 border-t">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isHistorical}
            onChange={(e) => setIsHistorical(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <div>
            <span className="font-medium text-sm">Historical Sale</span>
            <p className="text-xs text-gray-500">Skip inventory checks (for importing past sales)</p>
          </div>
        </label>
        {isHistorical && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm text-amber-800">
            ⚠️ Historical mode: This sale will not consume stock or check availability.
          </div>
        )}
      </div>
    </div>
  )
}

