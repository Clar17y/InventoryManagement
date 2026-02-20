import { useEffect, useMemo, useState } from 'react'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { etsy, EtsyPendingOrder, EtsyStatus, inventory, settings, type CategoryLot } from '../../../lib/api'
import { ApiError } from '../../../lib/api/request'
import OverrideEditor from '../../sales/components/OverrideEditor'
import type { LotOverride } from '../../sales/types'
import EtsyPendingOrdersList from './EtsyPendingOrdersList'

type InsufficientStockShortage = {
  key: string
  categoryId: string
  categoryName: string
  variantId: string | null
  pickRule: string
  productName?: string
  need: number
  have: number
  missing: number
}

type InsufficientStockErrorBody = {
  code?: string
  receiptId?: number
  message?: string
  shortages: InsufficientStockShortage[]
}

function isInsufficientStockErrorBody(body: unknown): body is InsufficientStockErrorBody {
  if (!body || typeof body !== 'object') return false
  const shortages = (body as any).shortages
  if (!Array.isArray(shortages) || shortages.length === 0) return false

  return shortages.every((s: any) => {
    return (
      s &&
      typeof s === 'object' &&
      typeof s.key === 'string' &&
      typeof s.categoryId === 'string' &&
      typeof s.categoryName === 'string' &&
      typeof s.need === 'number'
    )
  })
}

interface EtsyOrdersSyncPanelProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

export default function EtsyOrdersSyncPanel({ isOpen, onClose, onImportComplete }: EtsyOrdersSyncPanelProps) {
  const [status, setStatus] = useState<EtsyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingOrders, setPendingOrders] = useState<EtsyPendingOrder[]>([])
  const [orderPostageCosts, setOrderPostageCosts] = useState<Record<number, string>>({})
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [importingOrderId, setImportingOrderId] = useState<number | null>(null)
  const [importingSelected, setImportingSelected] = useState(false)
  const [lastImport, setLastImport] = useState<{ receiptId: number; saleId: string } | null>(null)
  const [bulkImportResult, setBulkImportResult] = useState<{ imported: number; failed: number } | null>(null)
  const [isHistorical, setIsHistorical] = useState(false)

  const [insufficientStock, setInsufficientStock] = useState<{
    receiptId: number
    postageCost: number
    isHistorical: boolean
    message?: string
    shortages: InsufficientStockShortage[]
  } | null>(null)
  const [substitutionOverrides, setSubstitutionOverrides] = useState<Record<string, LotOverride[]>>({})
  const [editingSubstitution, setEditingSubstitution] = useState<{
    key: string
    categoryId: string
    categoryName: string
    quantityRequired: number
  } | null>(null)
  const [availableLots, setAvailableLots] = useState<CategoryLot[]>([])
  const [lotsLoading, setLotsLoading] = useState(false)
  const [substitutionSaving, setSubstitutionSaving] = useState(false)

  const pendingCount = pendingOrders.length

  const loadStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      const statusData = await etsy.getStatus()
      setStatus(statusData)
      return statusData
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Etsy status')
      setStatus(null)
      return null
    } finally {
      setLoading(false)
    }
  }

  const loadPendingOrders = async () => {
    try {
      setError(null)
      const [data, tiers] = await Promise.allSettled([
        etsy.getPendingOrders(),
        settings.getPostageTiers(),
      ])

      if (data.status === 'rejected') {
        throw data.reason
      }

      setPendingOrders(data.value.orders)
      setSelectedOrders(new Set())

      const resolvedTiers = tiers.status === 'fulfilled' ? tiers.value : []
      const costs: Record<number, string> = {}
      data.value.orders.forEach((order) => {
        const matchingTier = resolvedTiers.find(
          (t) => Number(t.etsyCharge) === order.shippingCost
        )
        costs[order.receiptId] = matchingTier
          ? Number(matchingTier.actualCost).toFixed(2)
          : order.shippingCost.toFixed(2)
      })
      setOrderPostageCosts(costs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending orders')
      setPendingOrders([])
    }
  }

  useEffect(() => {
    if (!isOpen) return

    setError(null)
    setInsufficientStock(null)
    setSubstitutionOverrides({})
    setEditingSubstitution(null)

      ; (async () => {
        const statusData = await loadStatus()
        if (statusData?.connected) {
          await loadPendingOrders()
        }
      })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!editingSubstitution) {
      setAvailableLots([])
      return
    }

    const fetchLots = async () => {
      setLotsLoading(true)
      try {
        const lots = await inventory.lotsByCategory(editingSubstitution.categoryId)
        setAvailableLots(lots)
      } catch (err) {
        console.error('Failed to load lots for substitution', err)
        setAvailableLots([])
      } finally {
        setLotsLoading(false)
      }
    }

    fetchLots()
  }, [editingSubstitution?.categoryId])

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
      setPendingOrders([])
      setOrderPostageCosts({})
      setSelectedOrders(new Set())
      setLastImport(null)
      setBulkImportResult(null)
      setInsufficientStock(null)
      setSubstitutionOverrides({})
      setEditingSubstitution(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  const toggleOrderSelection = (receiptId: number) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev)
      if (next.has(receiptId)) next.delete(receiptId)
      else next.add(receiptId)
      return next
    })
  }

  const selectAllOrders = () => {
    setSelectedOrders(new Set(pendingOrders.map((o) => o.receiptId)))
  }

  const updateOrderPostageCost = (receiptId: number, value: string) => {
    setOrderPostageCosts((prev) => ({
      ...prev,
      [receiptId]: value,
    }))
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
    setLastImport(null)
    setBulkImportResult(null)
    setInsufficientStock(null)
    setSubstitutionOverrides({})
    setEditingSubstitution(null)

    try {
      const result = await etsy.importOrder({ receiptId, postageCost, isHistorical })
      setLastImport({ receiptId, saleId: result.sale.id })
      setPendingOrders((prev) => prev.filter((o) => o.receiptId !== receiptId))
      onImportComplete()
    } catch (err) {
      if (err instanceof ApiError && isInsufficientStockErrorBody(err.body)) {
        setInsufficientStock({
          receiptId,
          postageCost,
          isHistorical,
          message: err.body.message || err.message,
          shortages: err.body.shortages,
        })
        setError(null)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to import order')
      }
    } finally {
      setImportingOrderId(null)
    }
  }

  const getSelectedQuantity = (key: string) => {
    return (substitutionOverrides[key] || []).reduce((sum, l) => sum + l.quantity, 0)
  }

  const substitutionReady = insufficientStock
    ? insufficientStock.shortages.every((s) => getSelectedQuantity(s.key) >= s.need)
    : false

  const startSubstitution = (shortage: InsufficientStockShortage) => {
    setEditingSubstitution({
      key: shortage.key,
      categoryId: shortage.categoryId,
      categoryName: shortage.categoryName,
      quantityRequired: shortage.need,
    })
  }

  const cancelSubstitutionEdit = () => {
    setEditingSubstitution(null)
  }

  const saveSubstitutionEdit = (lots: LotOverride[]) => {
    if (!editingSubstitution) return
    setSubstitutionOverrides((prev) => ({
      ...prev,
      [editingSubstitution.key]: lots,
    }))
    setEditingSubstitution(null)
  }

  const cancelSubstitutionFlow = () => {
    setInsufficientStock(null)
    setSubstitutionOverrides({})
    setEditingSubstitution(null)
    setAvailableLots([])
    setSubstitutionSaving(false)
  }

  const importWithSubstitutions = async () => {
    if (!insufficientStock) return
    if (!substitutionReady) return

    setSubstitutionSaving(true)
    setError(null)
    setLastImport(null)
    setBulkImportResult(null)

    try {
      const allocationOverrides = Object.fromEntries(
        Object.entries(substitutionOverrides).map(([key, lots]) => [
          key,
          lots.map((l) => ({ lotId: l.lotId, quantity: l.quantity })),
        ])
      )

      const result = await etsy.importOrder({
        receiptId: insufficientStock.receiptId,
        postageCost: insufficientStock.postageCost,
        isHistorical: insufficientStock.isHistorical,
        allocationOverrides,
      })

      setLastImport({ receiptId: insufficientStock.receiptId, saleId: result.sale.id })
      setPendingOrders((prev) => prev.filter((o) => o.receiptId !== insufficientStock.receiptId))
      cancelSubstitutionFlow()
      onImportComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import order')
    } finally {
      setSubstitutionSaving(false)
    }
  }

  const handleImportSelectedOrders = async () => {
    if (selectedOrders.size === 0) return

    const selected = pendingOrders.filter((o) => selectedOrders.has(o.receiptId))
    if (selected.length === 0) return

    // Validate postage costs
    for (const order of selected) {
      const postageCostStr = orderPostageCosts[order.receiptId]
      const postageCost = parseFloat(postageCostStr || '0')
      if (isNaN(postageCost) || postageCost < 0) {
        setError(`Please enter a valid postage cost for order #${order.receiptId}`)
        return
      }
    }

    if (!confirm(`Import ${selected.length} order(s) as sales?`)) return

    setImportingSelected(true)
    setError(null)
    setLastImport(null)
    setBulkImportResult(null)

    try {
      // Build orders array for bulk import
      const orders = selected.map((order) => ({
        receiptId: order.receiptId,
        postageCost: parseFloat(orderPostageCosts[order.receiptId] || '0'),
      }))

      // Single bulk API call instead of one per order
      const result = await etsy.importOrdersBulk({ orders, isHistorical })

      // Update UI based on results
      const importedIds = new Set(
        result.results.filter((r) => r.success).map((r) => r.receiptId)
      )

      if (importedIds.size > 0) {
        setPendingOrders((prev) => prev.filter((o) => !importedIds.has(o.receiptId)))
        setSelectedOrders((prev) => {
          const next = new Set(prev)
          importedIds.forEach((id) => next.delete(id))
          return next
        })
        onImportComplete()
      }

      setBulkImportResult({ imported: result.imported, failed: result.failed })
      if (result.failed > 0) {
        const firstFailed = result.results.find((r) => !r.success)
        if (firstFailed) {
          setError(`Failed to import ${result.failed} order(s). First: #${firstFailed.receiptId} — ${firstFailed.error}`)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import orders')
    } finally {
      setImportingSelected(false)
    }
  }

  const badge = useMemo(() => {
    if (!status?.connected) return null
    return (
      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
        Connected
      </span>
    )
  }, [status?.connected])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Etsy Sync</h2>
            {badge}
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
          {error && (
            <div className="alert-danger flex items-start gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {insufficientStock && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-3">
              <div className="text-sm font-medium text-red-800">
                Insufficient stock for order #{insufficientStock.receiptId}
              </div>
              {insufficientStock.message && (
                <div className="text-sm text-red-700">{insufficientStock.message}</div>
              )}

              <div className="space-y-3">
                {insufficientStock.shortages.map((s) => {
                  const selectedLots = substitutionOverrides[s.key] || []
                  const selectedQty = getSelectedQuantity(s.key)
                  const isEditing = editingSubstitution?.key === s.key

                  return (
                    <div key={s.key} className="bg-white rounded-lg border border-red-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {s.categoryName}
                            {s.productName && <span className="text-gray-500"> ({s.productName})</span>}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Need {s.need}, have {s.have} (missing {s.missing}) • Pick rule: {s.pickRule}
                          </div>
                          {selectedLots.length > 0 && (
                            <div className="text-xs text-gray-700 mt-2">
                              Selected {selectedQty} / {s.need}:{' '}
                              {selectedLots.map((l) => `${l.productName} ${l.quantity}`).join(', ')}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          onClick={() => startSubstitution(s)}
                          disabled={substitutionSaving}
                        >
                          Substitute
                        </button>
                      </div>

                      {isEditing && (
                        <OverrideEditor
                          categoryName={s.categoryName}
                          quantityRequired={s.need}
                          availableLots={availableLots}
                          loading={lotsLoading}
                          initialSelection={selectedLots}
                          onSave={saveSubstitutionEdit}
                          onCancel={cancelSubstitutionEdit}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={cancelSubstitutionFlow}
                  disabled={substitutionSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary text-sm flex-1"
                  onClick={importWithSubstitutions}
                  disabled={!substitutionReady || substitutionSaving}
                >
                  {substitutionSaving ? 'Importing…' : 'Import with substitutions'}
                </button>
              </div>
            </div>
          )}

          {lastImport && (
            <div className="bg-green-50 p-3 rounded-lg text-sm text-green-800">
              <CheckCircleIcon className="h-5 w-5 inline mr-2" />
              Imported order #{lastImport.receiptId} (sale {lastImport.saleId})
            </div>
          )}

          {bulkImportResult && (
            <div className={`p-3 rounded-lg text-sm ${bulkImportResult.failed > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'}`}>
              <CheckCircleIcon className="h-5 w-5 inline mr-2" />
              Imported {bulkImportResult.imported} order(s)
              {bulkImportResult.failed > 0 && ` (${bulkImportResult.failed} failed)`}
            </div>
          )}

          {loading && (
            <div className="text-center py-12 text-gray-500">
              <ArrowPathIcon className="h-8 w-8 animate-spin mx-auto mb-2" />
              Loading Etsy status...
            </div>
          )}

          {!loading && !status?.connected && (
            <div className="text-center py-12">
              <LinkIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Connect to Etsy</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                Connect your Etsy shop to import pending orders as sales.
              </p>
              <button onClick={handleConnect} className="btn-primary">
                Connect Etsy Shop
              </button>
            </div>
          )}

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

              {/* Actions */}
              <div className="flex gap-2 items-center justify-between">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div>
                    Pending orders: <span className="font-medium">{pendingCount}</span>
                  </div>
                  {pendingCount > 0 && (
                    <button onClick={selectAllOrders} className="text-sm text-primary-600 hover:text-primary-700">
                      Select All
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={loadPendingOrders}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Refresh
                  </button>
                  <button
                    onClick={handleImportSelectedOrders}
                    disabled={importingSelected || selectedOrders.size === 0}
                    className="btn-primary text-sm py-1 flex items-center gap-1"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    {importingSelected ? 'Importing...' : `Import Selected (${selectedOrders.size})`}
                  </button>
                </div>
              </div>

              {/* Historical Mode Toggle */}
              <div className="bg-gray-50 p-3 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isHistorical}
                    onChange={(e) => setIsHistorical(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-medium text-sm">Skip Inventory Checks</span>
                    <p className="text-xs text-gray-500">Import without checking/consuming stock (for historical orders)</p>
                  </div>
                </label>
                {isHistorical && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-sm text-amber-800">
                    ⚠️ Orders will be imported without consuming stock or checking availability.
                  </div>
              )}
              </div>

              {/* Orders */}
              <EtsyPendingOrdersList
                pendingOrders={pendingOrders}
                selectedOrders={selectedOrders}
                toggleOrderSelection={toggleOrderSelection}
                orderPostageCosts={orderPostageCosts}
                updateOrderPostageCost={updateOrderPostageCost}
                handleImportOrder={handleImportOrder}
                importingSelected={importingSelected}
                importingOrderId={importingOrderId}
              />
            </>
          )}
        </div>

      </div>
    </div>
  )
}
