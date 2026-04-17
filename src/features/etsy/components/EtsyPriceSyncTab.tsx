import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import type { EtsyPendingPriceUpdate } from '../../../lib/api'
import { exportToXlsx, isoDatePrefix } from '../../../lib/exportXlsx'
import { formatCurrency } from '../../../lib/formatting'

export default function EtsyPriceSyncTab({
  pricePushResult,
  pricePullResult,
  showOnlyPriceDiff,
  setShowOnlyPriceDiff,
  priceNeedsSyncCount,
  selectAllPriceDiff,
  handlePushPrices,
  handlePullPrices,
  pushingPrices,
  pullingPrices,
  pendingPrices,
  filteredPrices,
  selectedPriceItems,
  togglePriceItem,
}: {
  pricePushResult: { updated: number; errors: number } | null
  pricePullResult: { updated: number; errors: number } | null
  showOnlyPriceDiff: boolean
  setShowOnlyPriceDiff: (value: boolean) => void
  priceNeedsSyncCount: number
  selectAllPriceDiff: () => void
  handlePushPrices: () => void
  handlePullPrices: () => void
  pushingPrices: boolean
  pullingPrices: boolean
  pendingPrices: EtsyPendingPriceUpdate[]
  filteredPrices: EtsyPendingPriceUpdate[]
  selectedPriceItems: Set<string>
  togglePriceItem: (variantId: string) => void
}) {
  return (
    <div className="space-y-4">
      {/* Price Push Result */}
      {pricePushResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            pricePushResult.errors > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'
          }`}
        >
          <CheckCircleIcon className="h-5 w-5 inline mr-2" />
          Updated {pricePushResult.updated} price(s) on Etsy
          {pricePushResult.errors > 0 && ` (${pricePushResult.errors} error(s))`}
        </div>
      )}

      {/* Price Pull Result */}
      {pricePullResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            pricePullResult.errors > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'
          }`}
        >
          <CheckCircleIcon className="h-5 w-5 inline mr-2" />
          Pulled {pricePullResult.updated} price(s) into local records
          {pricePullResult.errors > 0 && ` (${pricePullResult.errors} error(s))`}
        </div>
      )}

      {/* Filter and Sync */}
      <div className="flex justify-between items-center">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOnlyPriceDiff}
            onChange={(e) => setShowOnlyPriceDiff(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show only differences ({priceNeedsSyncCount})
        </label>
        <div className="flex gap-2">
          {priceNeedsSyncCount > 0 && (
            <button onClick={selectAllPriceDiff} className="text-sm text-primary-600 hover:text-primary-700">
              Select All Diff
            </button>
          )}
          <button
            onClick={() => {
              const rows = filteredPrices.map((p) => ({
                Hamper: p.hamperName,
                Variant: p.variantName,
                'Local Price': p.localPrice ?? '',
                'Etsy Price': p.etsyPrice,
                Difference: p.localPrice !== null ? +(p.localPrice - p.etsyPrice).toFixed(2) : '',
                Status: p.needsSync ? 'Needs Sync' : 'In Sync',
              }))
              exportToXlsx(rows, 'Price Sync', `etsy-price-sync-${isoDatePrefix()}.xlsx`)
            }}
            disabled={filteredPrices.length === 0}
            className="btn-secondary text-sm py-1 flex items-center gap-1"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={handlePushPrices}
            disabled={pushingPrices || pullingPrices || selectedPriceItems.size === 0}
            className="btn-primary text-sm py-1 flex items-center gap-1"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            {pushingPrices ? 'Pushing...' : `Push to Etsy (${selectedPriceItems.size})`}
          </button>
          <button
            onClick={handlePullPrices}
            disabled={pullingPrices || pushingPrices || selectedPriceItems.size === 0}
            className="btn-secondary text-sm py-1 flex items-center gap-1"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {pullingPrices ? 'Pulling...' : `Pull from Etsy (${selectedPriceItems.size})`}
          </button>
        </div>
      </div>

      {pendingPrices.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <CurrencyDollarIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p className="mb-1">No prices to display</p>
          <p className="text-sm">No Etsy-linked hampers/variants found.</p>
        </div>
      ) : filteredPrices.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <CurrencyDollarIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p className="mb-1">No price differences found</p>
          <p className="text-sm">Your prices match Etsy.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="text-left px-3 py-2">Hamper / Variant</th>
                <th className="text-right px-3 py-2">Local</th>
                <th className="text-right px-3 py-2">Etsy</th>
                <th className="text-center px-3 py-2 w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPrices.map((item, idx) => {
                const isSelected = selectedPriceItems.has(item.variantId)

                return (
                  <tr
                    key={`${item.variantId}-${idx}`}
                    className={isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-3 py-2 text-center">
                      {item.needsSync ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePriceItem(item.variantId)}
                          className="rounded border-gray-300"
                        />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4 text-green-500 mx-auto" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900 truncate max-w-[180px]" title={item.hamperName}>
                        {item.hamperName}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        {item.variantName}
                        {item.etsySku && <span className="font-mono text-gray-400">({item.etsySku})</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {item.localPrice !== null ? (
                        formatCurrency(item.localPrice)
                      ) : (
                        <span className="text-gray-400 italic">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.etsyPrice)}</td>
                    <td className="px-3 py-2 text-center">
                      {item.needsSync ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-info-100 text-info-700">Needs Sync</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">In Sync</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

