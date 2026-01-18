import { useState, useEffect } from 'react'
import {
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    LinkIcon,
    TagIcon,
    CurrencyDollarIcon,
} from '@heroicons/react/24/outline'
import { etsy, EtsyStatus, EtsySyncComparison, EtsyImportResult, EtsyPendingSku, EtsyPendingPriceUpdate } from '../lib/api'
import { formatCurrency } from '../lib/formatting'

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
    const [showOnlySkuDiff, setShowOnlySkuDiff] = useState(true)
    const [showOnlyPriceDiff, setShowOnlyPriceDiff] = useState(true)
    const [activeTab, setActiveTab] = useState<'inventory' | 'skus' | 'prices'>('inventory')

    // SKU Sync State
    const [pendingSkus, setPendingSkus] = useState<EtsyPendingSku[]>([])
    const [selectedSkuItems, setSelectedSkuItems] = useState<Set<string>>(new Set())
    const [pushingSkus, setPushingSkus] = useState(false)
    const [generatingSkus, setGeneratingSkus] = useState(false)
    const [skuPushResult, setSkuPushResult] = useState<{ updated: number; errors: number } | null>(null)
    const [skuGenerateResult, setSkuGenerateResult] = useState<{ generated: number } | null>(null)

    // Price Sync State
    const [pendingPrices, setPendingPrices] = useState<EtsyPendingPriceUpdate[]>([])
    const [selectedPriceItems, setSelectedPriceItems] = useState<Set<string>>(new Set())
    const [pushingPrices, setPushingPrices] = useState(false)
    const [pricePushResult, setPricePushResult] = useState<{ updated: number; errors: number } | null>(null)

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

    const loadPendingSkus = async (listingIds?: string[]) => {
        try {
            const data = await etsy.getPendingSkus(listingIds)
            if (listingIds && listingIds.length > 0) {
                // Partial refresh: merge updated listings into existing state
                setPendingSkus(prev => {
                    const updated = new Map(prev.map(s => [s.variantId, s]))
                    for (const sku of data.skus) {
                        updated.set(sku.variantId, sku)
                    }
                    // Remove entries from refreshed listings that no longer need sync
                    const refreshedListingSet = new Set(listingIds)
                    return [...updated.values()].filter(
                        s => !refreshedListingSet.has(s.etsyListingId) || data.skus.some(d => d.variantId === s.variantId)
                    )
                })
            } else {
                setPendingSkus(data.skus)
            }
        } catch (err) {
            console.warn('Failed to load pending SKUs:', err)
            if (!listingIds) setPendingSkus([])
        }
    }

    const loadPendingPrices = async (listingIds?: string[]) => {
        try {
            const data = await etsy.getPendingPriceUpdates(listingIds)
            if (listingIds && listingIds.length > 0) {
                // Partial refresh: merge updated listings into existing state
                setPendingPrices(prev => {
                    const updated = new Map(prev.map(p => [p.variantId, p]))
                    for (const price of data.updates) {
                        updated.set(price.variantId, price)
                    }
                    // Remove entries from refreshed listings that no longer exist in response
                    const refreshedListingSet = new Set(listingIds)
                    return [...updated.values()].filter(
                        p => !refreshedListingSet.has(p.etsyListingId) || data.updates.some(d => d.variantId === p.variantId)
                    )
                })
            } else {
                setPendingPrices(data.updates)
            }
        } catch (err) {
            console.warn('Failed to load pending prices:', err)
            if (!listingIds) setPendingPrices([])
        }
    }

    const handleGenerateSkus = async () => {
        if (!confirm('Generate SKUs for all variants without one? This will create SKUs like "PTSH-9096-BRN" based on hamper and variant names.')) {
            return
        }

        setGeneratingSkus(true)
        setError(null)
        setSkuGenerateResult(null)

        try {
            const result = await etsy.generateSkus()
            setSkuGenerateResult({ generated: result.generated })
            if (result.generated > 0) {
                await loadPendingSkus() // Refresh the list
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate SKUs')
        } finally {
            setGeneratingSkus(false)
        }
    }

    const handlePushSkus = async () => {
        if (selectedSkuItems.size === 0) return

        const skusToPush = pendingSkus.filter(s => s.needsSync && selectedSkuItems.has(s.variantId))
        if (skusToPush.length === 0) return

        // Extract unique listing IDs from selected SKUs
        const listingIds = [...new Set(skusToPush.map(s => s.etsyListingId))]

        if (!confirm(`Push ${skusToPush.length} SKU(s) to Etsy? This will update SKUs on your Etsy listings.`)) {
            return
        }

        setPushingSkus(true)
        setError(null)
        setSkuPushResult(null)

        try {
            const result = await etsy.pushSkus(listingIds)
            setSkuPushResult({ updated: result.totalUpdated, errors: result.errors })
            if (result.success) {
                setSelectedSkuItems(new Set())
                await loadPendingSkus(listingIds) // Partial refresh - only refetch updated listings
            } else {
                setError(`Some SKUs failed to sync: ${result.errors} error(s)`)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to push SKUs')
        } finally {
            setPushingSkus(false)
        }
    }

    const toggleSkuItem = (variantId: string) => {
        const newSelected = new Set(selectedSkuItems)
        if (newSelected.has(variantId)) {
            newSelected.delete(variantId)
        } else {
            newSelected.add(variantId)
        }
        setSelectedSkuItems(newSelected)
    }

    const selectAllSkuDiff = () => {
        const newSelected = new Set<string>()
        for (const sku of pendingSkus) {
            if (sku.needsSync) {
                newSelected.add(sku.variantId)
            }
        }
        setSelectedSkuItems(newSelected)
    }

    const togglePriceItem = (variantId: string) => {
        const newSelected = new Set(selectedPriceItems)
        if (newSelected.has(variantId)) {
            newSelected.delete(variantId)
        } else {
            newSelected.add(variantId)
        }
        setSelectedPriceItems(newSelected)
    }

    const selectAllPriceDiff = () => {
        const newSelected = new Set<string>()
        for (const item of pendingPrices) {
            if (item.needsSync) {
                newSelected.add(item.variantId)
            }
        }
        setSelectedPriceItems(newSelected)
    }

    const handleSyncPrices = async () => {
        if (selectedPriceItems.size === 0) return

        const pricesToPush = pendingPrices
            .filter(p => p.needsSync && selectedPriceItems.has(p.variantId) && p.localPrice !== null)
            .map(p => ({
                etsyListingId: p.etsyListingId,
                etsySku: p.etsySku,
                etsyProductId: p.etsyProductId,
                price: p.localPrice!
            }))

        if (pricesToPush.length === 0) return

        // Extract unique listing IDs for partial refresh
        const listingIds = [...new Set(pricesToPush.map(p => p.etsyListingId))]

        if (!confirm(`Update ${pricesToPush.length} variant price(s) on Etsy?`)) {
            return
        }

        setPushingPrices(true)
        setError(null)
        setPricePushResult(null)

        try {
            const result = await etsy.pushPrices(pricesToPush)
            setPricePushResult({ updated: result.updated, errors: result.errors })
            if (result.success) {
                setSelectedPriceItems(new Set())
                await loadPendingPrices(listingIds) // Partial refresh - only refetch updated listings
            } else {
                setError(`Some prices failed to sync: ${result.errors} error(s)`)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to push prices')
        } finally {
            setPushingPrices(false)
        }
    }

    useEffect(() => {
        if (isOpen) {
            loadStatus()
        }
    }, [isOpen])

    const handleConnect = async () => {
        try {
            setError(null)
            const { authUrl } = await etsy.initiateAuth()
            // Redirect to Etsy OAuth
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
        if (!confirm('Import all Etsy listings as hampers? Existing hampers will be refreshed with the latest Etsy variant mapping (requirements/mappings won\'t be changed).')) return

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

        const updates: Array<{ etsyListingId: string; etsySku: string | null; etsyProductId: string | null; quantity: number }> = []

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
        ? comparisons.filter(c => c.variants.some(v => v.needsSync))
        : comparisons

    const needsSyncCount = comparisons.reduce(
        (sum, c) => sum + c.variants.filter(v => v.needsSync).length,
        0
    )

    const skuNeedsSyncCount = pendingSkus.filter(s => s.needsSync).length
    const filteredSkus = showOnlySkuDiff ? pendingSkus.filter(s => s.needsSync) : pendingSkus

    const priceNeedsSyncCount = pendingPrices.filter(p => p.needsSync).length
    const filteredPrices = showOnlyPriceDiff ? pendingPrices.filter(p => p.needsSync) : pendingPrices

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
            <div className="bg-white w-full max-w-2xl h-full overflow-y-auto animate-slide-in-right">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">Etsy Sync</h2>
                        {status?.connected && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                                Connected
                            </span>
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
                        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2">
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
                                <button
                                    onClick={handleDisconnect}
                                    className="text-sm text-red-600 hover:text-red-700"
                                >
                                    Disconnect
                                </button>
                            </div>

                            {/* Import Result */}
                            {importResult && (
                                <div className="bg-blue-50 p-4 rounded-lg">
                                    <div className="flex items-center gap-2 font-medium text-blue-900 mb-1">
                                        <CheckCircleIcon className="h-5 w-5" />
                                        Import Complete
                                    </div>
                                    <div className="text-sm text-blue-700">
                                        Created: {importResult.created} • Updated: {importResult.updated} • Skipped: {importResult.skipped}
                                        {importResult.errors.length > 0 && (
                                            <span className="text-red-600"> • Errors: {importResult.errors.length}</span>
                                        )}
                                    </div>
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
                                <button
                                    onClick={loadComparison}
                                    className="btn-secondary flex items-center gap-2"
                                >
                                    <ArrowPathIcon className="h-4 w-4" />
                                    Refresh
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-gray-200">
                                <button
                                    onClick={() => { setActiveTab('inventory'); loadComparison(); }}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'inventory'
                                        ? 'border-primary-500 text-primary-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <ArrowUpTrayIcon className="h-4 w-4 inline mr-1" />
                                    Inventory Sync
                                </button>
                                <button
                                    onClick={() => { setActiveTab('skus'); loadPendingSkus(); }}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'skus'
                                        ? 'border-primary-500 text-primary-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <TagIcon className="h-4 w-4 inline mr-1" />
                                    SKU Sync
                                </button>
                                <button
                                    onClick={() => { setActiveTab('prices'); loadPendingPrices(); }}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'prices'
                                        ? 'border-primary-500 text-primary-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <CurrencyDollarIcon className="h-4 w-4 inline mr-1" />
                                    Price Sync
                                </button>
                            </div>

                            {/* Inventory Sync Tab */}
                            {activeTab === 'inventory' && comparisons.length > 0 && (
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
                                                {filteredComparisons.map((comparison) => (
                                                    comparison.variants.map((variant, idx) => {
                                                        const key = `${comparison.etsyListingId}-${variant.etsySku || variant.etsyProductId || 'default'}`
                                                        const isSelected = selectedItems.has(key)

                                                        return (
                                                            <tr
                                                                key={key}
                                                                className={isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}
                                                            >
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
                                                                        <div className="font-medium text-gray-900 truncate max-w-[200px]" title={comparison.hamperName}>
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
                                                                    <span className={`font-mono ${variant.difference > 0 ? 'text-green-600' :
                                                                        variant.difference < 0 ? 'text-red-600' :
                                                                            'text-gray-400'
                                                                        }`}>
                                                                        {variant.difference > 0 ? '+' : ''}{variant.difference}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {variant.needsSync ? (
                                                                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                                                                            Needs Sync
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                                                                            In Sync
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {/* Inventory Sync Empty State */}
                            {activeTab === 'inventory' && comparisons.length === 0 && !importing && (
                                <div className="text-center py-8 text-gray-500">
                                    <p className="mb-2">No hampers with Etsy IDs found.</p>
                                    <p className="text-sm">Click "Import from Etsy" to create hampers from your Etsy listings.</p>
                                </div>
                            )}

                            {/* SKU Sync Tab */}
                            {activeTab === 'skus' && (
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
                                        <div className={`p-3 rounded-lg text-sm ${skuPushResult.errors > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'}`}>
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
                                            <p className="text-sm">Click "Generate Missing SKUs" to create SKUs for your variants.</p>
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
                                                            <tr key={`${sku.variantId}-${idx}`} className={isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}>
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
                                                                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                                                                            Needs Sync
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                                                                            In Sync
                                                                        </span>
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
                            )}

                            {/* Price Sync Tab */}
                            {activeTab === 'prices' && (
                                <div className="space-y-4">
                                    {/* Price Push Result */}
                                    {pricePushResult && (
                                        <div className={`p-3 rounded-lg text-sm ${pricePushResult.errors > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'}`}>
                                            <CheckCircleIcon className="h-5 w-5 inline mr-2" />
                                            Updated {pricePushResult.updated} price(s) on Etsy
                                            {pricePushResult.errors > 0 && ` (${pricePushResult.errors} error(s))`}
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
                                                onClick={handleSyncPrices}
                                                disabled={pushingPrices || selectedPriceItems.size === 0}
                                                className="btn-primary text-sm py-1 flex items-center gap-1"
                                            >
                                                <ArrowUpTrayIcon className="h-4 w-4" />
                                                {pushingPrices ? 'Syncing...' : `Sync Selected (${selectedPriceItems.size})`}
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
                                                            <tr key={`${item.variantId}-${idx}`} className={isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}>
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
                                                                    {item.localPrice !== null ? formatCurrency(item.localPrice) : <span className="text-gray-400 italic">--</span>}
                                                                </td>
                                                                <td className="px-3 py-2 text-right font-medium">
                                                                    {formatCurrency(item.etsyPrice)}
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {item.needsSync ? (
                                                                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                                                                            Needs Sync
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                                                                            In Sync
                                                                        </span>
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
                            )}
                        </>
                    )}
                </div>
            </div>

            <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
        </div>
    )
}
