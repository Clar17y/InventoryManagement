import { useState, useEffect } from 'react'
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import {
  sales,
  hampers,
  inventory,
  Sale,
  SalePreview,
  Hamper,
  CategoryLot,
} from '../lib/api'
import { formatCurrency, formatUnitCost } from '../lib/formatting'

interface SaleLineInput {
  hamperId: string
  quantity: number
}

interface LotOverride {
  lotId: string
  productName: string
  quantity: number
  unitCost: number
  maxAvailable: number
}

type ViewMode = 'list' | 'record'

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
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Record sale state
  const [lines, setLines] = useState<SaleLineInput[]>([{ hamperId: '', quantity: 1 }])
  const [preview, setPreview] = useState<SalePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [etsyOrderId, setEtsyOrderId] = useState('')
  const [saving, setSaving] = useState(false)

  // Override state
  const [editingOverride, setEditingOverride] = useState<{ hamperIdx: number; categoryId: string } | null>(null)
  const [availableLots, setAvailableLots] = useState<CategoryLot[]>([])
  const [lotsLoading, setLotsLoading] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, LotOverride[]>>({})

  const loadData = async () => {
    try {
      setLoading(true)
      const [salesData, hampersData] = await Promise.all([
        sales.list(),
        hampers.list(),
      ])
      setSaleList(salesData)
      setHamperList(hampersData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Load preview when lines change
  useEffect(() => {
    const validLines = lines.filter((l) => l.hamperId && l.quantity > 0)
    if (validLines.length === 0) {
      setPreview(null)
      return
    }

    const fetchPreview = async () => {
      setPreviewLoading(true)
      try {
        const result = await sales.preview({ lines: validLines })
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
  }, [lines])

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

  const handleAddLine = () => {
    setLines([...lines, { hamperId: '', quantity: 1 }])
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
    setLines([{ hamperId: '', quantity: 1 }])
    setPreview(null)
    setNotes('')
    setEtsyOrderId('')
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
      const validLines = lines.filter((l) => l.hamperId && l.quantity > 0)

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

        {/* Hamper Selection */}
        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Select Hampers</h3>
            <button type="button" onClick={handleAddLine} className="text-sm text-primary-600 hover:text-primary-700">
              + Add Hamper
            </button>
          </div>

          {hamperList.length === 0 ? (
            <p className="text-sm text-amber-600">Create hampers first before recording sales</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line, index) => {
                const selectedHamper = hamperList.find((h) => h.id === line.hamperId)
                return (
                  <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                    <select
                      value={line.hamperId}
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
                    {selectedHamper && (
                      <span className="text-sm text-gray-500 w-20 text-right">
                        {formatCurrency(Number(selectedHamper.sellingPrice) * line.quantity)}
                      </span>
                    )}
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
                )
              })}
            </div>
          )}
        </div>

        {/* Optional Fields */}
        <div className="card space-y-4">
          <h3 className="font-medium">Optional Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          className={`flex justify-between items-center p-2 rounded ${
                            isFulfilled ? 'bg-green-50' : 'bg-red-50'
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
              <div className="flex justify-between text-sm">
                <span>Total Cost</span>
                <span className="font-medium">
                  {formatCurrency(
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
              <div className="flex justify-between text-sm text-gray-500">
                <span>Etsy Fees + Overhead</span>
                <span>(calculated on confirm)</span>
              </div>
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

  // List View (default)
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Sales</h2>
        <button
          onClick={() => setViewMode('record')}
          className="btn-primary flex items-center gap-1"
        >
          <PlusIcon className="h-5 w-5" />
          Record Sale
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

      {saleList.length === 0 ? (
        <div className="card text-gray-500 text-center py-12">
          <p className="mb-4">No sales recorded yet</p>
          <p className="text-sm">Record your first sale to start tracking margins</p>
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
                  <div className="font-medium">
                    {sale.lines.map((l) => `${l.hamper?.name || l.description || 'Bespoke Item'} ×${l.quantity}`).join(', ')}
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Gross Revenue</div>
                      <div className="font-semibold">{formatCurrency(Number(sale.grossRevenue))}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Etsy Fees</div>
                      <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.etsyFees))}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Packaging</div>
                      <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.packagingOverhead))}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Stock Cost</div>
                      <div className="font-semibold text-red-600">-{formatCurrency(Number(sale.totalCost))}</div>
                    </div>
                  </div>

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
