import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, TagIcon } from '@heroicons/react/24/outline'
import type { EtsyPendingSku } from '../../../lib/api'
import { exportToXlsx, isoDatePrefix } from '../../../lib/exportXlsx'

export default function EtsySkuSyncTab({
  skuGenerateResult,
  skuPushResult,
  handleGenerateSkus,
  generatingSkus,
  showOnlySkuDiff,
  setShowOnlySkuDiff,
  skuNeedsSyncCount,
  selectAllSkuDiff,
  handlePushSkus,
  pushingSkus,
  pendingSkus,
  filteredSkus,
  selectedSkuItems,
  toggleSkuItem,
}: {
  skuGenerateResult: { generated: number } | null
  skuPushResult: { updated: number; errors: number } | null
  handleGenerateSkus: () => void
  generatingSkus: boolean
  showOnlySkuDiff: boolean
  setShowOnlySkuDiff: (value: boolean) => void
  skuNeedsSyncCount: number
  selectAllSkuDiff: () => void
  handlePushSkus: () => void
  pushingSkus: boolean
  pendingSkus: EtsyPendingSku[]
  filteredSkus: EtsyPendingSku[]
  selectedSkuItems: Set<string>
  toggleSkuItem: (variantId: string) => void
}) {
  return (
    <div className="space-y-4">
      {/* SKU Generate Result */}
      {skuGenerateResult && (
        <div className="p-3 rounded-lg text-sm bg-green-50 text-green-800">
          <CheckCircleIcon className="h-5 w-5 inline mr-2" />
          Generated {skuGenerateResult.generated} SKU(s)
        </div>
      )}

      {/* SKU Push Result */}
      {skuPushResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            skuPushResult.errors > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'
          }`}
        >
          <CheckCircleIcon className="h-5 w-5 inline mr-2" />
          Updated {skuPushResult.updated} SKU(s) on Etsy
          {skuPushResult.errors > 0 && ` (${skuPushResult.errors} error(s))`}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <button
          onClick={handleGenerateSkus}
          disabled={generatingSkus}
          className="btn-secondary text-sm py-1 flex items-center gap-1"
        >
          <TagIcon className="h-4 w-4" />
          {generatingSkus ? 'Generating...' : 'Generate Missing SKUs'}
        </button>
      </div>

      {/* Filter and Sync */}
      <div className="flex justify-between items-center">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOnlySkuDiff}
            onChange={(e) => setShowOnlySkuDiff(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show only differences ({skuNeedsSyncCount})
        </label>
        <div className="flex gap-2">
          {skuNeedsSyncCount > 0 && (
            <button onClick={selectAllSkuDiff} className="text-sm text-primary-600 hover:text-primary-700">
              Select All Diff
            </button>
          )}
          <button
            onClick={() => {
              const rows = filteredSkus.map((s) => ({
                Hamper: s.hamperName,
                Variant: s.variantName,
                'Local SKU': s.localSku,
                'Etsy SKU': s.etsySku ?? '',
                Status: s.needsSync ? 'Needs Sync' : 'In Sync',
              }))
              exportToXlsx(rows, 'SKU Sync', `etsy-sku-sync-${isoDatePrefix()}.xlsx`)
            }}
            disabled={filteredSkus.length === 0}
            className="btn-secondary text-sm py-1 flex items-center gap-1"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={handlePushSkus}
            disabled={pushingSkus || selectedSkuItems.size === 0}
            className="btn-primary text-sm py-1 flex items-center gap-1"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            {pushingSkus ? 'Syncing...' : `Sync Selected (${selectedSkuItems.size})`}
          </button>
        </div>
      </div>

      {pendingSkus.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <TagIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p className="mb-1">No variant SKUs to display</p>
          <p className="text-sm">Click &quot;Generate Missing SKUs&quot; to create SKUs for your variants.</p>
        </div>
      ) : filteredSkus.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <TagIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p className="mb-1">No SKU differences found</p>
          <p className="text-sm">Your variant SKUs match Etsy.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="text-left px-3 py-2">Hamper / Variant</th>
                <th className="text-left px-3 py-2">Local SKU</th>
                <th className="text-left px-3 py-2">Etsy SKU</th>
                <th className="text-center px-3 py-2 w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSkus.map((sku, idx) => {
                const isSelected = selectedSkuItems.has(sku.variantId)
                return (
                  <tr
                    key={`${sku.variantId}-${idx}`}
                    className={isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-3 py-2 text-center">
                      {sku.needsSync ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSkuItem(sku.variantId)}
                          className="rounded border-gray-300"
                        />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4 text-green-500 mx-auto" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900 truncate max-w-[180px]" title={sku.hamperName}>
                        {sku.hamperName}
                      </div>
                      <div className="text-xs text-gray-500">{sku.variantName}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{sku.localSku}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">
                      {sku.etsySku || <span className="italic text-gray-400">empty</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {sku.needsSync ? (
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

