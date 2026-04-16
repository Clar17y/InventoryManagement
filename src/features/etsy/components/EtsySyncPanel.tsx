import { useEffect, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  etsy,
  type EtsyImportResult,
  type EtsyStatus,
  type EtsySyncComparison,
} from '../../../lib/api'
import EtsyInventorySyncTab from './EtsyInventorySyncTab'
import EtsyPriceSyncTab from './EtsyPriceSyncTab'
import EtsySkuSyncTab from './EtsySkuSyncTab'
import EtsySyncTabs from './EtsySyncTabs'
import { useEtsyPriceSync } from '../hooks/useEtsyPriceSync'
import { useEtsySkuSync } from '../hooks/useEtsySkuSync'

interface EtsySyncPanelProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

export default function EtsySyncPanel({ isOpen, onClose, onImportComplete }: EtsySyncPanelProps) {
  const [status, setStatus] = useState<EtsyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparisons, setComparisons] = useState<EtsySyncComparison[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<EtsyImportResult | null>(null)
  const [showOnlyDiff, setShowOnlyDiff] = useState(true)
  const [activeTab, setActiveTab] = useState<'inventory' | 'skus' | 'prices'>('inventory')

  const skuSync = useEtsySkuSync({ setError })
  const priceSync = useEtsyPriceSync({ setError })

  const loadStatus = async () => {
    try {
      setLoading(true)
      const statusData = await etsy.getStatus()
      setStatus(statusData)

      if (statusData.connected) {
        await loadComparison()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Etsy status')
    } finally {
      setLoading(false)
    }
  }

  const loadComparison = async () => {
    try {
      const data = await etsy.getComparison()
      setComparisons(data.comparisons)
    } catch (err) {
      console.warn('Failed to load comparison:', err)
      setComparisons([])
    }
  }

  useEffect(() => {
    if (isOpen) {
      void loadStatus()
    }
  }, [isOpen])

  const handleConnect = async () => {
    try {
      setError(null)
      const { authUrl } = await etsy.initiateAuth()
      window.location.href = authUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate connection')
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect from Etsy? You will need to reconnect to sync again.')) return
    try {
      await etsy.disconnect()
      setStatus({ connected: false })
      setComparisons([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  const handleImport = async () => {
    if (
      !confirm(
        "Import all Etsy listings as hampers? Existing hampers will be refreshed with the latest Etsy variant mapping (requirements/mappings won't be changed)."
      )
    ) {
      return
    }

    setImporting(true)
    setError(null)
    setImportResult(null)

    try {
      const result = await etsy.importListings()
      setImportResult(result)

      if (result.created > 0 || result.updated > 0) {
        onImportComplete()
        await loadComparison()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import listings')
    } finally {
      setImporting(false)
    }
  }

  const handleSync = async () => {
    if (selectedItems.size === 0) return

    const updates: Array<{
      etsyListingId: string
      etsySku: string | null
      etsyProductId: string | null
      quantity: number
    }> = []

    for (const comparison of comparisons) {
      for (const variant of comparison.variants) {
        const key = `${comparison.etsyListingId}-${variant.etsySku || variant.etsyProductId || 'default'}`
        if (selectedItems.has(key) && variant.needsSync) {
          updates.push({
            etsyListingId: comparison.etsyListingId,
            etsySku: variant.etsySku ?? null,
            etsyProductId: variant.etsyProductId ?? null,
            quantity: variant.inventoryQuantity,
          })
        }
      }
    }

    if (updates.length === 0) return

    setSyncing(true)
    setError(null)

    try {
      const result = await etsy.pushUpdates({ updates })

      if (result.success) {
        setSelectedItems(new Set())
        await loadComparison()
      } else {
        setError(result.error || 'Sync failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync')
    } finally {
      setSyncing(false)
    }
  }

  const toggleItem = (listingId: string, productId: string | null, sku: string | null) => {
    const key = `${listingId}-${sku || productId || 'default'}`
    const newSelected = new Set(selectedItems)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelectedItems(newSelected)
  }

  const selectAllDiff = () => {
    const newSelected = new Set<string>()
    for (const comparison of comparisons) {
      for (const variant of comparison.variants) {
        if (variant.needsSync) {
          newSelected.add(`${comparison.etsyListingId}-${variant.etsySku || variant.etsyProductId || 'default'}`)
        }
      }
    }
    setSelectedItems(newSelected)
  }

  const filteredComparisons = showOnlyDiff
    ? comparisons.filter((c) => c.variants.some((v) => v.needsSync))
    : comparisons

  const needsSyncCount = comparisons.reduce((sum, c) => sum + c.variants.filter((v) => v.needsSync).length, 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Etsy Sync</h2>
            {status?.connected && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Connected</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Error Display */}
          {error && (
            <div className="alert-danger flex items-start gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12 text-gray-500">
              <ArrowPathIcon className="h-8 w-8 animate-spin mx-auto mb-2" />
              Loading Etsy status...
            </div>
          )}

          {/* Not Connected State */}
          {!loading && !status?.connected && (
            <div className="text-center py-12">
              <LinkIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Connect to Etsy</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                Connect your Etsy shop to import listings as hampers and sync inventory levels.
              </p>
              <button onClick={handleConnect} className="btn-primary">
                Connect Etsy Shop
              </button>
            </div>
          )}

          {/* Connected State */}
          {!loading && status?.connected && (
            <>
              {/* Shop Info */}
              <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center">
                <div>
                  <div className="font-medium text-gray-900">{status.shopName}</div>
                  <div className="text-xs text-gray-500">Shop ID: {status.shopId}</div>
                </div>
                <button onClick={handleDisconnect} className="text-sm text-red-600 hover:text-red-700">
                  Disconnect
                </button>
              </div>

              {/* Import Result */}
              {importResult && (
                <div className="bg-info-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 font-medium text-info-900 mb-1">
                    <CheckCircleIcon className="h-5 w-5" />
                    Import Complete
                  </div>
                  <div className="text-sm text-info-700">
                    Created: {importResult.created} • Updated: {importResult.updated} • Skipped: {importResult.skipped}
                    {importResult.errors.length > 0 && (
                      <span className="text-red-600"> • Errors: {importResult.errors.length}</span>
                    )}
                  </div>
                  {importResult.details && importResult.details.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-info-600 cursor-pointer hover:text-info-800">
                        View {importResult.details.length} change(s)
                      </summary>
                      <div className="mt-2 max-h-48 overflow-y-auto text-xs space-y-1 bg-white/50 rounded p-2">
                        {importResult.details.map((d, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-info-600 font-medium whitespace-nowrap">
                              {d.action.replace(/_/g, ' ')}:
                            </span>
                            <span className="text-gray-700 truncate" title={d.hamper}>
                              {d.hamper}
                              {d.variant && <span className="text-gray-500"> → {d.variant}</span>}
                              {d.info && <span className="text-gray-400"> ({d.info})</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="btn-secondary flex items-center gap-2"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  {importing ? 'Importing...' : 'Import from Etsy'}
                </button>
                <button onClick={loadComparison} className="btn-secondary flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              {/* Tabs */}
              <EtsySyncTabs
                activeTab={activeTab}
                onSelectInventory={() => {
                  setActiveTab('inventory')
                  void loadComparison()
                }}
                onSelectSkus={() => {
                  setActiveTab('skus')
                  void skuSync.loadPendingSkus()
                }}
                onSelectPrices={() => {
                  setActiveTab('prices')
                  void priceSync.loadPendingPrices()
                }}
              />

              {activeTab === 'inventory' && (
                <EtsyInventorySyncTab
                  comparisons={comparisons}
                  filteredComparisons={filteredComparisons}
                  selectedItems={selectedItems}
                  toggleItem={toggleItem}
                  showOnlyDiff={showOnlyDiff}
                  setShowOnlyDiff={setShowOnlyDiff}
                  needsSyncCount={needsSyncCount}
                  selectAllDiff={selectAllDiff}
                  handleSync={handleSync}
                  syncing={syncing}
                  importing={importing}
                />
              )}

              {activeTab === 'skus' && (
                <EtsySkuSyncTab
                  skuGenerateResult={skuSync.skuGenerateResult}
                  skuPushResult={skuSync.skuPushResult}
                  handleGenerateSkus={skuSync.handleGenerateSkus}
                  generatingSkus={skuSync.generatingSkus}
                  showOnlySkuDiff={skuSync.showOnlySkuDiff}
                  setShowOnlySkuDiff={skuSync.setShowOnlySkuDiff}
                  skuNeedsSyncCount={skuSync.skuNeedsSyncCount}
                  selectAllSkuDiff={skuSync.selectAllSkuDiff}
                  handlePushSkus={skuSync.handlePushSkus}
                  pushingSkus={skuSync.pushingSkus}
                  pendingSkus={skuSync.pendingSkus}
                  filteredSkus={skuSync.filteredSkus}
                  selectedSkuItems={skuSync.selectedSkuItems}
                  toggleSkuItem={skuSync.toggleSkuItem}
                />
              )}

              {activeTab === 'prices' && (
                <EtsyPriceSyncTab
                  pricePushResult={priceSync.pricePushResult}
                  pricePullResult={priceSync.pricePullResult}
                  showOnlyPriceDiff={priceSync.showOnlyPriceDiff}
                  setShowOnlyPriceDiff={priceSync.setShowOnlyPriceDiff}
                  priceNeedsSyncCount={priceSync.priceNeedsSyncCount}
                  selectAllPriceDiff={priceSync.selectAllPriceDiff}
                  handlePushPrices={priceSync.handlePushPrices}
                  handlePullPrices={priceSync.handlePullPrices}
                  pushingPrices={priceSync.pushingPrices}
                  pullingPrices={priceSync.pullingPrices}
                  pendingPrices={priceSync.pendingPrices}
                  filteredPrices={priceSync.filteredPrices}
                  selectedPriceItems={priceSync.selectedPriceItems}
                  togglePriceItem={priceSync.togglePriceItem}
                />
              )}
            </>
          )}
        </div>
      </div>

    </div>
  )
}
