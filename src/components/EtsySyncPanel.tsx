import { useState, useEffect } from 'react'
import {
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    LinkIcon,
    ShoppingBagIcon,
} from '@heroicons/react/24/outline'
import { etsy, EtsyStatus, EtsySyncComparison, EtsyImportResult, EtsyPendingOrder } from '../lib/api'
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
    const [activeTab, setActiveTab] = useState<'inventory' | 'orders'>('inventory')
    const [pendingOrders, setPendingOrders] = useState<EtsyPendingOrder[]>([])
    const [orderPostageCosts, setOrderPostageCosts] = useState<Record<number, string>>({})
    const [importingOrderId, setImportingOrderId] = useState<number | null>(null)

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

    const loadPendingOrders = async () => {
        try {
            const data = await etsy.getPendingOrders()
            setPendingOrders(data.orders)
            // Initialize postage cost fields
            const costs: Record<number, string> = {}
            data.orders.forEach(o => {
                costs[o.receiptId] = o.shippingCost.toFixed(2)
            })
            setOrderPostageCosts(costs)
        } catch (err) {
            console.warn('Failed to load pending orders:', err)
            setPendingOrders([])
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
        if (!confirm('Import all Etsy listings as hampers? Existing hampers with matching Etsy IDs will be skipped.')) return

        setImporting(true)
        setError(null)
        setImportResult(null)

        try {
            const result = await etsy.importListings()
            setImportResult(result)

            if (result.created > 0) {
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

        const updates: Array<{ etsyListingId: string; etsySku: string | null; quantity: number }> = []

        for (const comparison of comparisons) {
            for (const variant of comparison.variants) {
                const key = `${comparison.etsyListingId}-${variant.etsySku || 'default'}`
                if (selectedItems.has(key) && variant.needsSync) {
                    updates.push({
                        etsyListingId: comparison.etsyListingId,
                        etsySku: variant.etsySku ?? null,
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

    const toggleItem = (listingId: string, sku: string | null) => {
        const key = `${listingId}-${sku || 'default'}`
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
                    newSelected.add(`${comparison.etsyListingId}-${variant.etsySku || 'default'}`)
                }
            }
        }
        setSelectedItems(newSelected)
    }

    const handleImportOrder = async (receiptId: number) => {
        const postageCostStr = orderPostageCosts[receiptId]
        const postageCost = parseFloat(postageCostStr || '0')

        if (isNaN(postageCost) || postageCost < 0) {
            setError('Please enter a valid postage cost')
            return
        }

        setImportingOrderId(receiptId)
        setError(null)

        try {
            await etsy.importOrder({ receiptId, postageCost })
            // Remove from pending list
            setPendingOrders(prev => prev.filter(o => o.receiptId !== receiptId))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to import order')
        } finally {
            setImportingOrderId(null)
        }
    }

    const filteredComparisons = showOnlyDiff
        ? comparisons.filter(c => c.variants.some(v => v.needsSync))
        : comparisons

    const needsSyncCount = comparisons.reduce(
        (sum, c) => sum + c.variants.filter(v => v.needsSync).length,
        0
    )

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
                                        Created: {importResult.created} • Skipped: {importResult.skipped}
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
                                    onClick={() => { setActiveTab('orders'); loadPendingOrders(); }}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'orders'
                                        ? 'border-primary-500 text-primary-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <ShoppingBagIcon className="h-4 w-4 inline mr-1" />
                                    Pending Orders {pendingOrders.length > 0 && `(${pendingOrders.length})`}
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
                                                        const key = `${comparison.etsyListingId}-${variant.etsySku || 'default'}`
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
                                                                            onChange={() => toggleItem(comparison.etsyListingId, variant.etsySku)}
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

                            {/* Pending Orders Tab */}
                            {activeTab === 'orders' && (
                                <div className="space-y-3">
                                    {pendingOrders.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500">
                                            <ShoppingBagIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                                            <p className="mb-1">No pending orders</p>
                                            <p className="text-sm">New Etsy orders will appear here for import.</p>
                                        </div>
                                    ) : (
                                        pendingOrders.map(order => (
                                            <div key={order.receiptId} className="border rounded-lg p-4 space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-medium text-gray-900">
                                                            Order #{order.receiptId}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {order.buyerName} • {new Date(order.createdAt).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-medium">{formatCurrency(order.grandTotal)}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {order.isShipped ? '✓ Shipped' : 'Not shipped'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Items */}
                                                <div className="bg-gray-50 rounded p-2 space-y-1">
                                                    {order.items.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between text-sm">
                                                            <span className="truncate max-w-[200px]" title={item.title}>
                                                                {item.quantity}× {item.title}
                                                            </span>
                                                            <span className="text-gray-600">{formatCurrency(item.price)}</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Postage Cost Input */}
                                                <div className="flex items-center gap-3">
                                                    <label className="text-sm text-gray-600 whitespace-nowrap">
                                                        Actual postage cost:
                                                    </label>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-gray-500">£</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={orderPostageCosts[order.receiptId] || ''}
                                                            onChange={(e) => setOrderPostageCosts(prev => ({
                                                                ...prev,
                                                                [order.receiptId]: e.target.value
                                                            }))}
                                                            className="input w-24 text-sm py-1"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => handleImportOrder(order.receiptId)}
                                                        disabled={importingOrderId === order.receiptId}
                                                        className="btn-primary text-sm py-1 ml-auto"
                                                    >
                                                        {importingOrderId === order.receiptId ? 'Importing...' : 'Import as Sale'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))
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
