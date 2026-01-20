import { ArrowUpTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import type { EtsySyncComparison } from '../../../lib/api'

export default function EtsyInventorySyncTab({
  comparisons,
  filteredComparisons,
  selectedItems,
  toggleItem,
  showOnlyDiff,
  setShowOnlyDiff,
  needsSyncCount,
  selectAllDiff,
  handleSync,
  syncing,
  importing,
}: {
  comparisons: EtsySyncComparison[]
  filteredComparisons: EtsySyncComparison[]
  selectedItems: Set<string>
  toggleItem: (listingId: string, productId: string | null, sku: string | null) => void
  showOnlyDiff: boolean
  setShowOnlyDiff: (value: boolean) => void
  needsSyncCount: number
  selectAllDiff: () => void
  handleSync: () => void
  syncing: boolean
  importing: boolean
}) {
  if (comparisons.length === 0) {
    if (importing) return null

    return (
      <div className="text-center py-8 text-gray-500">
        <p className="mb-2">No hampers with Etsy IDs found.</p>
        <p className="text-sm">Click &quot;Import from Etsy&quot; to create hampers from your Etsy listings.</p>
      </div>
    )
  }

  return (
    <>
      {/* Filter and Actions */}
      <div className="flex justify-between items-center">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOnlyDiff}
            onChange={(e) => setShowOnlyDiff(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show only differences ({needsSyncCount})
        </label>
        <div className="flex gap-2">
          <button onClick={selectAllDiff} className="text-sm text-primary-600 hover:text-primary-700">
            Select All Diff
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || selectedItems.size === 0}
            className="btn-primary text-sm py-1 flex items-center gap-1"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            {syncing ? 'Syncing...' : `Sync Selected (${selectedItems.size})`}
          </button>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="text-left px-3 py-2">Hamper / Variant</th>
              <th className="text-center px-3 py-2 w-20">Etsy</th>
              <th className="text-center px-3 py-2 w-20">Ours</th>
              <th className="text-center px-3 py-2 w-20">Diff</th>
              <th className="text-center px-3 py-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredComparisons.map((comparison) =>
              comparison.variants.map((variant, idx) => {
                const key = `${comparison.etsyListingId}-${variant.etsySku || variant.etsyProductId || 'default'}`
                const isSelected = selectedItems.has(key)

                return (
                  <tr key={key} className={isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-2 text-center">
                      {variant.needsSync ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(comparison.etsyListingId, variant.etsyProductId, variant.etsySku)}
                          className="rounded border-gray-300"
                        />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4 text-green-500 mx-auto" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {idx === 0 && (
                        <div
                          className="font-medium text-gray-900 truncate max-w-[200px]"
                          title={comparison.hamperName}
                        >
                          {comparison.hamperName}
                        </div>
                      )}
                      {comparison.variants.length > 1 && (
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <span className="text-primary-600 font-medium">{variant.variantName}</span>
                          {variant.etsySku && <span className="font-mono">({variant.etsySku})</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{variant.etsyQuantity}</td>
                    <td className="px-3 py-2 text-center font-mono font-medium">{variant.inventoryQuantity}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`font-mono ${
                          variant.difference > 0
                            ? 'text-green-600'
                            : variant.difference < 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                        }`}
                      >
                        {variant.difference > 0 ? '+' : ''}
                        {variant.difference}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {variant.needsSync ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-info-100 text-info-700">Needs Sync</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">In Sync</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

