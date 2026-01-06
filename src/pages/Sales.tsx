import { useState, useEffect, useRef } from 'react'
import { useDebounce } from '../hooks/useDebounce'
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PencilIcon,
  ChartBarIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import {
  sales,
  hampers,
  inventory,
  Sale,
  SalePreview,
  Hamper,
  CategoryLot,
  SaleChannel,
  SalesSummary,
} from '../lib/api'
import { formatCurrency, formatUnitCost } from '../lib/formatting'

interface SaleLineInput {
  hamperId?: string
  description?: string
  quantity: number
  unitPrice?: number
  isBespoke?: boolean
}

interface LotOverride {
  lotId: string
  productName: string
  quantity: number
  unitCost: number
  maxAvailable: number
}

type ViewMode = 'list' | 'record'

const channelLabels: Record<SaleChannel, string> = {
  etsy: 'Etsy',
  direct: 'Direct',
  fair: 'Fair/Market',
}

const channelColors: Record<SaleChannel, string> = {
  etsy: 'bg-orange-100 text-orange-800',
  direct: 'bg-green-100 text-green-800',
  fair: 'bg-purple-100 text-purple-800',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MarginBadge({ margin, revenue }: { margin: number; revenue: number }) {
  const percent = revenue > 0 ? (margin / revenue) * 100 : 0
  const colorClass = margin >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {formatCurrency(margin)} ({percent.toFixed(0)}%)
    </span>
  )
}

export default function Sales() {
  const [saleList, setSaleList] = useState<Sale[]>([])
  const [hamperList, setHamperList] = useState<Hamper[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Summary and filter state
  const [showSummary, setShowSummary] = useState(false)
  const [summary, setSummary] = useState<SalesSummary | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 400) // Debounce search to avoid excessive API calls
  const [totalSales, setTotalSales] = useState(0)
  const PAGE_SIZE = 20

  // Record sale state
  const [lines, setLines] = useState<SaleLineInput[]>([{ quantity: 1 }])
  const [preview, setPreview] = useState<SalePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [etsyOrderId, setEtsyOrderId] = useState('')
  const [saleChannel, setSaleChannel] = useState<SaleChannel>('etsy')
  const [postageCharged, setPostageCharged] = useState('5.00')
  const [postageCost, setPostageCost] = useState('5.35')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0] ?? '')
  const [saving, setSaving] = useState(false)

  // Override state
  const [editingOverride, setEditingOverride] = useState<{ hamperIdx: number; categoryId: string } | null>(null)
  const [availableLots, setAvailableLots] = useState<CategoryLot[]>([])
  const [lotsLoading, setLotsLoading] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, LotOverride[]>>({})

  const loadData = async (isInitialLoad = false) => {
    try {
      // Only show full loading state on initial page load, not on filter changes
      if (isInitialLoad) {
        setLoading(true)
      }
      const params: { limit?: number; offset?: number; startDate?: string; endDate?: string; search?: string } = {
        limit: PAGE_SIZE,
        offset: 0,
      }
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (debouncedSearchQuery) params.search = debouncedSearchQuery

      const [salesData, hampersData, summaryData] = await Promise.all([
        sales.list(params),
        hampers.list(),
        sales.summary({ startDate: startDate || undefined, endDate: endDate || undefined, search: debouncedSearchQuery || undefined }),
      ])
      setSaleList(salesData.sales)
      setTotalSales(salesData.total)
      setHamperList(hampersData)
      setSummary(summaryData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    try {
      setLoadingMore(true)
      const params: { limit?: number; offset?: number; startDate?: string; endDate?: string; search?: string } = {
        limit: PAGE_SIZE,
        offset: saleList.length,
      }
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (debouncedSearchQuery) params.search = debouncedSearchQuery

      const result = await sales.list(params)
      setSaleList([...saleList, ...result.sales])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more sales')
    } finally {
      setLoadingMore(false)
    }
  }

  // Track if this is the first render to show loading state only initially
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Initial load - show loading indicator
    loadData(true)
    isFirstRender.current = false
  }, [])

  // Re-fetch when filters change (no loading indicator - data updates in place)
  useEffect(() => {
    if (!isFirstRender.current) {
      loadData(false)
    }
  }, [startDate, endDate, debouncedSearchQuery])

  // Load preview when lines change
  useEffect(() => {
    const validLines = lines.filter((l) => (l.hamperId || (l.isBespoke && l.description && l.unitPrice)) && l.quantity > 0)
    if (validLines.length === 0) {
      setPreview(null)
      return
    }

    const fetchPreview = async () => {
      setPreviewLoading(true)
      try {
        const result = await sales.preview({
          lines: validLines,
          postageCharged: postageCharged ? parseFloat(postageCharged) : undefined,
          saleChannel,
        })
        setPreview(result)
      } catch (err) {
        console.error('Preview failed:', err)
        setPreview(null)
      } finally {
        setPreviewLoading(false)
      }
    }

    const debounce = setTimeout(fetchPreview, 300)
    return () => clearTimeout(debounce)
  }, [lines, postageCharged, saleChannel])

  // Load available lots when editing override
  useEffect(() => {
    if (!editingOverride) {
      setAvailableLots([])
      return
    }

    const fetchLots = async () => {
      setLotsLoading(true)
      try {
        const lots = await inventory.lotsByCategory(editingOverride.categoryId)
        setAvailableLots(lots)
      } catch (err) {
        console.error('Failed to load lots:', err)
        setAvailableLots([])
      } finally {
        setLotsLoading(false)
      }
    }

    fetchLots()
  }, [editingOverride])

  const handleAddLine = (bespoke = false) => {
    if (bespoke) {
      setLines([...lines, { quantity: 1, isBespoke: true, description: '', unitPrice: 0 }])
    } else {
      setLines([...lines, { quantity: 1 }])
    }
  }

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleUpdateLine = (index: number, updates: Partial<SaleLineInput>) => {
    setLines(lines.map((l, i) => (i === index ? { ...l, ...updates } : l)))
    // Clear overrides for this hamper if it changes
    if (updates.hamperId !== undefined) {
      const newOverrides = { ...overrides }
      Object.keys(newOverrides).forEach((key) => {
        if (key.startsWith(`${index}:`)) {
          delete newOverrides[key]
        }
      })
      setOverrides(newOverrides)
    }
  }

  const handleCancel = () => {
    setViewMode('list')
    setLines([{ quantity: 1 }])
    setPreview(null)
    setNotes('')
    setEtsyOrderId('')
    setSaleChannel('etsy')
    setPostageCharged('5.00')
    setPostageCost('5.35')
    setSaleDate(new Date().toISOString().split('T')[0] ?? '')
    setError(null)
    setOverrides({})
    setEditingOverride(null)
  }

  const getOverrideKey = (hamperIdx: number, categoryId: string) => `${hamperIdx}:${categoryId}`

  const handleStartOverride = (hamperIdx: number, categoryId: string) => {
    setEditingOverride({ hamperIdx, categoryId })
  }

  const handleCancelOverride = () => {
    setEditingOverride(null)
  }

  const handleSaveOverride = (selectedLots: LotOverride[]) => {
    if (!editingOverride) return
    const key = getOverrideKey(editingOverride.hamperIdx, editingOverride.categoryId)
    if (selectedLots.length === 0) {
      const newOverrides = { ...overrides }
      delete newOverrides[key]
      setOverrides(newOverrides)
    } else {
      setOverrides({ ...overrides, [key]: selectedLots })
    }
    setEditingOverride(null)
  }

  const handleClearOverride = (hamperIdx: number, categoryId: string) => {
    const key = getOverrideKey(hamperIdx, categoryId)
    const newOverrides = { ...overrides }
    delete newOverrides[key]
    setOverrides(newOverrides)
  }

  const handleSubmit = async () => {
    if (!preview) {
      setError('No preview available')
      return
    }

    // Check fulfillment considering overrides
    const canFulfillAll = preview.lines.every((linePreview, idx) => {
      return linePreview.requirements.every((req) => {
        const key = getOverrideKey(idx, req.categoryId)
        const override = overrides[key]
        if (override) {
          const totalOverride = override.reduce((sum, o) => sum + o.quantity, 0)
          return totalOverride >= req.quantityRequired
        }
        return req.fulfilled
      })
    })

    if (!canFulfillAll) {
      setError('Cannot fulfill all requirements - check stock levels')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const validLines = lines.filter((l) => (l.hamperId || (l.isBespoke && l.description && l.unitPrice)) && l.quantity > 0)

      // Convert overrides to API format: { "hamperId:categoryId": [...] }
      const allocationOverrides: Record<string, { lotId: string; quantity: number }[]> = {}
      Object.entries(overrides).forEach(([key, lots]) => {
        const parts = key.split(':')
        const hamperIdx = parts[0]
        const categoryId = parts[1]
        if (hamperIdx && categoryId) {
          const hamperId = validLines[parseInt(hamperIdx)]?.hamperId
          if (hamperId) {
            const apiKey = `${hamperId}:${categoryId}`
            allocationOverrides[apiKey] = lots.map((l) => ({ lotId: l.lotId, quantity: l.quantity }))
          }
        }
      })

      await sales.create({
        grossRevenue: preview.summary.totalGross,
        postageCharged: postageCharged ? parseFloat(postageCharged) : undefined,
        postageCost: postageCost ? parseFloat(postageCost) : undefined,
        saleChannel,
        saleDate: saleDate ? new Date(saleDate).toISOString() : undefined,
        lines: validLines,
        notes: notes || undefined,
        etsyOrderId: etsyOrderId || undefined,
        allocationOverrides: Object.keys(allocationOverrides).length > 0 ? allocationOverrides : undefined,
      })
      handleCancel()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record sale')
    } finally {
      setSaving(false)
    }
  }

  const handleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  if (loading && saleList.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  // Record Sale View
  if (viewMode === 'record') {
    // Check if can submit considering overrides
    const canSubmit = preview && !saving && preview.lines.every((linePreview, idx) => {
      return linePreview.requirements.every((req) => {
        const key = getOverrideKey(idx, req.categoryId)
        const override = overrides[key]
        if (override) {
          const totalOverride = override.reduce((sum, o) => sum + o.quantity, 0)
          return totalOverride >= req.quantityRequired
        }
        return req.fulfilled
      })
    })

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Record Sale</h2>
          <button onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        {/* Sale Channel */}
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
                    setPostageCost('5.35')
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
        </div>

        {/* Hamper Selection */}
        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Items</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleAddLine(true)} className="text-sm text-gray-600 hover:text-gray-800">
                + Bespoke Item
              </button>
              <button type="button" onClick={() => handleAddLine(false)} className="text-sm text-primary-600 hover:text-primary-700">
                + Add Hamper
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => {
              const selectedHamper = line.hamperId ? hamperList.find((h) => h.id === line.hamperId) : null
              const lineTotal = line.isBespoke
                ? (line.unitPrice || 0) * line.quantity
                : selectedHamper
                  ? Number(selectedHamper.sellingPrice) * line.quantity
                  : 0

              return (
                <div key={index} className="bg-gray-50 p-2 rounded-lg space-y-2">
                  {line.isBespoke ? (
                    // Bespoke item row
                    <div className="flex gap-2 items-center">
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Bespoke</span>
                      <input
                        type="text"
                        value={line.description || ''}
                        onChange={(e) => handleUpdateLine(index, { description: e.target.value })}
                        className="input flex-1"
                        placeholder="Item description..."
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice || ''}
                        onChange={(e) => handleUpdateLine(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                        className="input w-24"
                        placeholder="Price"
                      />
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => handleUpdateLine(index, { quantity: parseInt(e.target.value) || 1 })}
                        className="input w-16"
                      />
                      <span className="text-sm text-gray-500 w-20 text-right">
                        {formatCurrency(lineTotal)}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(index)}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    // Hamper selection row
                    <div className="flex gap-2 items-center">
                      <select
                        value={line.hamperId || ''}
                        onChange={(e) => handleUpdateLine(index, { hamperId: e.target.value })}
                        className="input flex-1"
                      >
                        <option value="">Select hamper...</option>
                        {hamperList.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} - {formatCurrency(Number(h.sellingPrice))} (Can make: {h.canMake})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => handleUpdateLine(index, { quantity: parseInt(e.target.value) || 1 })}
                        className="input w-20"
                      />
                      <span className="text-sm text-gray-500 w-20 text-right">
                        {formatCurrency(lineTotal)}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(index)}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Postage */}
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

        {/* Optional Fields */}
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

        {/* Allocation Preview */}
        {previewLoading && (
          <div className="card text-center py-4 text-gray-500">Loading preview...</div>
        )}

        {preview && !previewLoading && (
          <div className="card space-y-4">
            <h3 className="font-medium">Stock Allocation Preview</h3>

            {preview.lines.map((linePreview, hamperIdx) => (
              <div key={hamperIdx} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="font-medium">
                    {linePreview.hamperName} × {linePreview.quantity}
                  </div>
                  <div className="flex items-center gap-2">
                    {linePreview.canFulfill ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    ) : (
                      <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                    )}
                    <span className={linePreview.canFulfill ? 'text-green-600' : 'text-red-600'}>
                      {linePreview.canFulfill ? 'Can fulfill' : 'Insufficient stock'}
                    </span>
                  </div>
                </div>

                {/* Requirements breakdown */}
                <div className="text-sm space-y-2">
                  {linePreview.requirements.map((req) => {
                    const overrideKey = getOverrideKey(hamperIdx, req.categoryId)
                    const override = overrides[overrideKey]
                    const isEditing = editingOverride?.hamperIdx === hamperIdx && editingOverride?.categoryId === req.categoryId
                    const isFulfilled = override
                      ? override.reduce((sum, o) => sum + o.quantity, 0) >= req.quantityRequired
                      : req.fulfilled

                    return (
                      <div key={req.categoryId}>
                        <div
                          className={`flex justify-between items-center p-2 rounded ${isFulfilled ? 'bg-green-50' : 'bg-red-50'
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{req.categoryName}</span>
                            {override && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                Manual
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="text-gray-500">Need {req.quantityRequired} → </span>
                              {override ? (
                                <span>
                                  {override.map((o) => o.productName).join(', ')} (
                                  {formatCurrency(override.reduce((sum, o) => sum + o.quantity * o.unitCost, 0))})
                                </span>
                              ) : req.allocations.length > 0 ? (
                                <span>
                                  {req.allocations.map((a) => a.productName).join(', ')} ({formatCurrency(req.totalCost)})
                                </span>
                              ) : (
                                <span className="text-red-600">No stock</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStartOverride(hamperIdx, req.categoryId)}
                              className="p-1 text-gray-400 hover:text-primary-600"
                              title="Override allocation"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            {override && (
                              <button
                                type="button"
                                onClick={() => handleClearOverride(hamperIdx, req.categoryId)}
                                className="p-1 text-gray-400 hover:text-red-600"
                                title="Clear override"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Override Editor */}
                        {isEditing && (
                          <OverrideEditor
                            categoryName={req.categoryName}
                            quantityRequired={req.quantityRequired}
                            availableLots={availableLots}
                            loading={lotsLoading}
                            initialSelection={override || []}
                            onSave={handleSaveOverride}
                            onCancel={handleCancelOverride}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="text-right text-sm font-medium">
                  Line cost: {formatCurrency(
                    linePreview.requirements.reduce((sum, req) => {
                      const overrideKey = getOverrideKey(hamperIdx, req.categoryId)
                      const override = overrides[overrideKey]
                      if (override) {
                        return sum + override.reduce((oSum, o) => oSum + o.quantity * o.unitCost, 0)
                      }
                      return sum + req.totalCost
                    }, 0)
                  )}
                </div>
              </div>
            ))}

            {/* Summary */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Gross Revenue</span>
                <span className="font-medium">{formatCurrency(preview.summary.totalGross)}</span>
              </div>
              {postageCharged && (
                <div className="flex justify-between text-sm">
                  <span>+ Postage Charged</span>
                  <span className="font-medium">{formatCurrency(parseFloat(postageCharged))}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Stock Cost</span>
                <span className="font-medium text-red-600">
                  -{formatCurrency(
                    preview.lines.reduce((sum, linePreview, hamperIdx) => {
                      return sum + linePreview.requirements.reduce((reqSum, req) => {
                        const overrideKey = getOverrideKey(hamperIdx, req.categoryId)
                        const override = overrides[overrideKey]
                        if (override) {
                          return reqSum + override.reduce((oSum, o) => oSum + o.quantity * o.unitCost, 0)
                        }
                        return reqSum + req.totalCost
                      }, 0)
                    }, 0)
                  )}
                </span>
              </div>
              {postageCost && (
                <div className="flex justify-between text-sm">
                  <span>Postage Cost</span>
                  <span className="font-medium text-red-600">-{formatCurrency(parseFloat(postageCost))}</span>
                </div>
              )}
              {saleChannel === 'etsy' && preview.summary.estimatedFees > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Etsy Fees (estimated)</span>
                  <span className="font-medium text-red-600">-{formatCurrency(preview.summary.estimatedFees)}</span>
                </div>
              )}
              {preview.summary.packagingOverhead > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Packaging Overhead</span>
                  <span className="font-medium text-red-600">-{formatCurrency(preview.summary.packagingOverhead)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-semibold border-t pt-2">
                <span>Estimated Margin</span>
                <span className={preview.summary.estimatedMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatCurrency(preview.summary.estimatedMargin)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn-primary flex-1"
          >
            {saving ? 'Recording...' : 'Confirm Sale'}
          </button>
        </div>
      </div>
    )
  }

  // Helper to set date range for quick selectors
  const setDateRange = (start: string, end: string) => {
    setStartDate(start)
    setEndDate(end)
  }

  const clearDateFilter = () => {
    setStartDate('')
    setEndDate('')
  }

  // Get current year for quick selectors
  const currentYear = new Date().getFullYear()

  const getQuarterDates = (quarter: number, year: number) => {
    const quarters = [
      { start: `${year}-01-01`, end: `${year}-03-31` },
      { start: `${year}-04-01`, end: `${year}-06-30` },
      { start: `${year}-07-01`, end: `${year}-09-30` },
      { start: `${year}-10-01`, end: `${year}-12-31` },
    ]
    return quarters[quarter - 1] || { start: '', end: '' }
  }

  // Financial year is April to March
  const getFYDates = (year: number) => ({
    start: `${year}-04-01`,
    end: `${year + 1}-03-31`,
  })

  const hasMore = saleList.length < totalSales

  // List View (default)
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Sales</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className={`p-2 rounded-lg ${showSummary ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}
            title="Toggle summary"
          >
            <ChartBarIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setViewMode('record')}
            className="btn-primary flex items-center gap-1"
          >
            <PlusIcon className="h-5 w-5" />
            Record Sale
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

      {/* Sales Summary */}
      {showSummary && summary && (
        <div className="card bg-gray-50 space-y-4">
          <h3 className="font-medium">Sales Summary</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg">
              <div className="text-xs text-gray-500">Total Sales</div>
              <div className="text-lg font-semibold">{summary.totals.salesCount}</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="text-xs text-gray-500">Revenue</div>
              <div className="text-lg font-semibold">{formatCurrency(summary.totals.totalRevenue)}</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="text-xs text-gray-500">Total Fees</div>
              <div className="text-lg font-semibold text-red-600">-{formatCurrency(summary.totals.totalFees)}</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="text-xs text-gray-500">Net Margin</div>
              <div className={`text-lg font-semibold ${summary.totals.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.totals.totalMargin)}
              </div>
            </div>
          </div>

          {summary.byChannel.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-600">By Channel</div>
              {summary.byChannel.map((ch) => (
                <div key={ch.channel} className="flex justify-between items-center bg-white p-2 rounded-lg text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs ${channelColors[ch.channel as SaleChannel] || 'bg-gray-100 text-gray-800'}`}>
                    {channelLabels[ch.channel as SaleChannel] || ch.channel}
                  </span>
                  <div className="flex gap-4">
                    <span className="text-gray-500">{ch.count} sales</span>
                    <span className="font-medium">{formatCurrency(ch.revenue)}</span>
                    <span className={ch.margin >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(ch.margin)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Date Filter */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 flex-wrap justify-between">
          {/* Date filters on the left */}
          <div className="flex items-center gap-2 flex-wrap">
            <FunnelIcon className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm border rounded-lg px-2 py-1"
              placeholder="Start date"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm border rounded-lg px-2 py-1"
              placeholder="End date"
            />
            {(startDate || endDate) && (
              <button
                onClick={clearDateFilter}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            )}
          </div>

          {/* Search on the right */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1 w-48"
              placeholder="Search sales..."
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Quick selectors */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 self-center">Quick:</span>
          {[1, 2, 3, 4].map((q) => {
            const dates = getQuarterDates(q, currentYear)
            return (
              <button
                key={q}
                onClick={() => setDateRange(dates.start || '', dates.end || '')}
                className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                Q{q} {currentYear}
              </button>
            )
          })}
          <button
            onClick={() => setDateRange(`${currentYear}-01-01`, `${currentYear}-12-31`)}
            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            {currentYear}
          </button>
          <button
            onClick={() => {
              const fy = getFYDates(currentYear - 1) // Current FY started last April
              setDateRange(fy.start, fy.end)
            }}
            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            FY {currentYear - 1}/{currentYear}
          </button>
          <button
            onClick={clearDateFilter}
            className="text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700"
          >
            All Time
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : saleList.length === 0 ? (
        <div className="card text-gray-500 text-center py-12">
          <p className="mb-4">{startDate || endDate ? 'No sales found for this period' : 'No sales recorded yet'}</p>
          <p className="text-sm">{startDate || endDate ? 'Try adjusting your date filter' : 'Record your first sale to start tracking margins'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {saleList.map((sale) => (
            <div key={sale.id} className="card">
              <button
                onClick={() => handleExpand(sale.id)}
                className="w-full text-left flex justify-between items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${channelColors[sale.saleChannel]}`}>
                      {channelLabels[sale.saleChannel]}
                    </span>
                    <span className="font-medium">
                      {sale.lines.map((l) => `${l.hamper?.name || l.description || 'Bespoke Item'} ×${l.quantity}`).join(', ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(sale.saleDate)}
                    {sale.etsyOrderId && ` • Order #${sale.etsyOrderId}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(Number(sale.grossRevenue))}</div>
                    <MarginBadge margin={Number(sale.margin)} revenue={Number(sale.grossRevenue)} />
                  </div>
                  {expandedId === sale.id ? (
                    <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </button>

              {expandedId === sale.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                  {/* Financial breakdown */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-center">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Gross Revenue</div>
                      <div className="font-semibold">{formatCurrency(Number(sale.grossRevenue))}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Stock Cost</div>
                      <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.totalCost))}</div>
                    </div>
                    {sale.saleChannel === 'etsy' && Number(sale.etsyFees) > 0 && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Etsy Fees</div>
                        <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.etsyFees))}</div>
                      </div>
                    )}
                    {Number(sale.packagingOverhead) > 0 && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Packaging</div>
                        <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.packagingOverhead))}</div>
                      </div>
                    )}
                  </div>

                  {/* Postage breakdown */}
                  {(Number(sale.postageCharged) > 0 || Number(sale.postageCost) > 0) && (
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Postage Charged</div>
                        <div className="font-semibold">{formatCurrency(Number(sale.postageCharged))}</div>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Postage Cost</div>
                        <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.postageCost))}</div>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500">Postage Profit</div>
                        <div className={`font-semibold ${Number(sale.postageCharged) - Number(sale.postageCost) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(Number(sale.postageCharged) - Number(sale.postageCost))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center bg-gray-100 p-3 rounded-lg">
                    <span className="font-medium">Net Margin</span>
                    <span className={`text-lg font-bold ${Number(sale.margin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Number(sale.margin))}
                    </span>
                  </div>

                  {/* Line items */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Items Sold</h4>
                    {sale.lines.map((line) => (
                      <div key={line.id} className="text-sm bg-gray-50 p-2 rounded-lg mb-2">
                        <div className="flex justify-between">
                          <span className="font-medium">{line.hamper?.name || line.description || 'Bespoke Item'} × {line.quantity}</span>
                          <span>{formatCurrency(Number(line.unitPrice) * line.quantity)}</span>
                        </div>
                        {line.consumptions.length > 0 && (
                          <div className="mt-1 text-xs text-gray-500">
                            Stock used: {line.consumptions.map((c) =>
                              `${c.lot.product.name} (${Number(c.quantity).toFixed(1)})`
                            ).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {sale.notes && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Notes:</span> {sale.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-secondary"
              >
                {loadingMore ? 'Loading...' : `Load More (${saleList.length} of ${totalSales})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Override Editor Component
function OverrideEditor({
  categoryName,
  quantityRequired,
  availableLots,
  loading,
  initialSelection,
  onSave,
  onCancel,
}: {
  categoryName: string
  quantityRequired: number
  availableLots: CategoryLot[]
  loading: boolean
  initialSelection: LotOverride[]
  onSave: (lots: LotOverride[]) => void
  onCancel: () => void
}) {
  const [selection, setSelection] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    initialSelection.forEach((s) => {
      initial[s.lotId] = s.quantity
    })
    return initial
  })

  const totalSelected = Object.values(selection).reduce((sum, qty) => sum + qty, 0)
  const isFulfilled = totalSelected >= quantityRequired

  const handleQuantityChange = (lotId: string, quantity: number) => {
    if (quantity <= 0) {
      const newSelection = { ...selection }
      delete newSelection[lotId]
      setSelection(newSelection)
    } else {
      setSelection({ ...selection, [lotId]: quantity })
    }
  }

  const handleSave = () => {
    const lots: LotOverride[] = availableLots
      .filter((lot) => (selection[lot.id] ?? 0) > 0)
      .map((lot) => ({
        lotId: lot.id,
        productName: lot.productName,
        quantity: selection[lot.id] ?? 0,
        unitCost: Number(lot.unitCost),
        maxAvailable: Number(lot.remaining),
      }))
    onSave(lots)
  }

  if (loading) {
    return (
      <div className="mt-2 p-3 bg-gray-50 rounded-lg text-center text-gray-500">
        Loading available lots...
      </div>
    )
  }

  if (availableLots.length === 0) {
    return (
      <div className="mt-2 p-3 bg-red-50 rounded-lg">
        <p className="text-sm text-red-700">No stock available in this category</p>
        <button onClick={onCancel} className="mt-2 text-sm text-gray-600 hover:text-gray-800">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 p-3 bg-blue-50 rounded-lg space-y-3">
      <div className="flex justify-between items-center">
        <span className="font-medium text-sm">Select lots for {categoryName}</span>
        <span className={`text-sm ${isFulfilled ? 'text-green-600' : 'text-red-600'}`}>
          {totalSelected} / {quantityRequired} required
        </span>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {availableLots.map((lot) => (
          <div key={lot.id} className="flex items-center gap-2 bg-white p-2 rounded text-sm">
            <div className="flex-1">
              <div className="font-medium">{lot.productName}</div>
              <div className="text-xs text-gray-500">
                {formatUnitCost(lot.unitCost, 'unit')} • {Number(lot.remaining).toFixed(1)} available
                {lot.expiresAt && ` • Exp: ${new Date(lot.expiresAt).toLocaleDateString()}`}
              </div>
            </div>
            <input
              type="number"
              min="0"
              max={Number(lot.remaining)}
              step="0.1"
              value={selection[lot.id] || ''}
              onChange={(e) => handleQuantityChange(lot.id, parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="input w-20 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!isFulfilled} className="btn-primary text-sm flex-1">
          Apply
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}
