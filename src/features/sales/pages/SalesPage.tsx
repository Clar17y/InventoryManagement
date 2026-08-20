import { useState, useEffect } from 'react'
import { useDateSearchFilter } from '../../../components/filters/DateSearchFilter'
import { usePaginationSearchParams } from '../../../hooks/usePaginationSearchParams'
import { usePaginatedList } from '../../../hooks/usePaginatedList'
import {
  sales,
  hampers,
  inventory,
  settings,
  SalePreview,
  Hamper,
  CategoryLot,
  SaleChannel,
  type SalesSort,
  type SortDirection,
  type PostageTier,
} from '../../../lib/api'
import SalesListView from '../components/SalesListView'
import SalesRecordView from '../components/SalesRecordView'
import { getOverrideKey } from '../utils'
import type { LotOverride, SaleLineInput } from '../types'

type ViewMode = 'list' | 'record'

export default function Sales() {
  const [hamperList, setHamperList] = useState<Hamper[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showEtsyOrdersPanel, setShowEtsyOrdersPanel] = useState(false)

  // Summary and filter state
  const [showSummary, setShowSummary] = useState(false)
  const [sort, setSort] = useState<SalesSort>('saleDate')
  const [direction, setDirection] = useState<SortDirection>('desc')

  // Date and search filter state
  const {
    startDate,
    endDate,
    searchQuery,
    debouncedSearchQuery,
    setStartDate: updateStartDate,
    setEndDate: updateEndDate,
    setSearchQuery: updateSearchQuery,
  } = useDateSearchFilter()

  const { page, pageSize, setPage, setPageSize, resetPage } = usePaginationSearchParams()

  const listParams = {
    page,
    pageSize,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: debouncedSearchQuery || undefined,
    sort,
    direction,
  }
  const listState = usePaginatedList({
    queryKey: JSON.stringify(listParams),
    load: (signal) => sales.list(listParams, { signal }),
  })
  const summaryState = usePaginatedList({
    queryKey: JSON.stringify({ startDate, endDate, search: debouncedSearchQuery }),
    load: () => sales.summary({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: debouncedSearchQuery || undefined,
    }),
  })

  const saleList = listState.data?.items ?? []
  const pagination = listState.data?.pagination ?? {
    page,
    pageSize,
    totalItems: 0,
    totalPages: 0,
  }
  const summary = summaryState.data

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
  const [isHistorical, setIsHistorical] = useState(false)

  // Postage tiers state
  const [postageTiers, setPostageTiers] = useState<PostageTier[]>([])

  // Override state
  const [editingOverride, setEditingOverride] = useState<{ hamperIdx: number; categoryId: string } | null>(null)
  const [availableLots, setAvailableLots] = useState<CategoryLot[]>([])
  const [lotsLoading, setLotsLoading] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, LotOverride[]>>({})

  const loadData = () => {
    listState.retry()
    summaryState.retry()
  }

  // Load hampers once for the record-sale reference data.
  useEffect(() => {
    let active = true
    hampers.list({ page: 1, pageSize: 100, hideEtsyHidden: false, sort: 'name-asc' }).then((response) => {
      if (active) setHamperList(response.items)
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Failed to load hampers')
    })

    return () => {
      active = false
    }
  }, [])

  // Load postage tiers on mount and set default cost
  useEffect(() => {
    settings.getPostageTiers().then((tiers) => {
      setPostageTiers(tiers)
      if (tiers.length > 0 && tiers[0]) {
        setPostageCost(Number(tiers[0].actualCost).toFixed(2))
      }
    }).catch(() => {})
  }, [])

  // Keep a valid page after a create/delete refresh empties the current page.
  useEffect(() => {
    if (
      listState.data
      && listState.data.items.length === 0
      && listState.data.pagination.totalItems > 0
      && page > 1
    ) {
      setPage(Math.max(1, page - 1))
    }
  }, [listState.data, page, setPage])

  const setStartDate = (value: string) => {
    resetPage()
    updateStartDate(value)
  }

  const setEndDate = (value: string) => {
    resetPage()
    updateEndDate(value)
  }

  const setSearchQuery = (value: string) => {
    resetPage()
    updateSearchQuery(value)
  }

  const setSalesSort = (value: SalesSort) => {
    resetPage()
    setSort(value)
  }

  const setSalesDirection = (value: SortDirection) => {
    resetPage()
    setDirection(value)
  }

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
    setPostageCost(postageTiers.length > 0 && postageTiers[0]
      ? Number(postageTiers[0].actualCost).toFixed(2) : '5.35')
    setSaleDate(new Date().toISOString().split('T')[0] ?? '')
    setError(null)
    setOverrides({})
    setEditingOverride(null)
    setIsHistorical(false)
  }

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
    // For historical sales, we don't need preview or fulfillment checks
    if (!isHistorical && !preview) {
      setError('No preview available')
      return
    }

    // Check fulfillment only for non-historical sales
    if (!isHistorical && preview) {
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
    }

    setSaving(true)
    setError(null)

    try {
      const validLines = lines.filter((l) => (l.hamperId || (l.isBespoke && l.description && l.unitPrice)) && l.quantity > 0)

      if (validLines.length === 0) {
        setError('At least one valid line is required')
        setSaving(false)
        return
      }

      // Calculate gross revenue from lines for historical sales
      const grossRevenue = isHistorical
        ? validLines.reduce((sum, line) => {
          if (line.isBespoke) {
            return sum + (line.unitPrice || 0) * line.quantity
          }
          const hamper = hamperList.find((h) => h.id === line.hamperId)
          return sum + (hamper ? Number(hamper.sellingPrice) * line.quantity : 0)
        }, 0)
        : preview!.summary.totalGross

      // Convert overrides to API format (only for non-historical)
      const allocationOverrides: Record<string, { lotId: string; quantity: number }[]> = {}
      if (!isHistorical) {
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
      }

      await sales.create({
        grossRevenue,
        postageCharged: postageCharged ? parseFloat(postageCharged) : undefined,
        postageCost: postageCost ? parseFloat(postageCost) : undefined,
        saleChannel,
        saleDate: saleDate ? new Date(saleDate).toISOString() : undefined,
        lines: validLines,
        notes: notes || undefined,
        etsyOrderId: etsyOrderId || undefined,
        isHistorical: isHistorical || undefined,
        allocationOverrides: Object.keys(allocationOverrides).length > 0 ? allocationOverrides : undefined,
      })
      handleCancel()
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record sale')
    } finally {
      setSaving(false)
    }
  }

  const handleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  if (listState.isInitialLoading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  // Record Sale View
  if (viewMode === 'record') {
    return (
      <SalesRecordView
        error={error}
        lines={lines}
        hamperList={hamperList}
        saleChannel={saleChannel}
        setSaleChannel={setSaleChannel}
        postageCharged={postageCharged}
        setPostageCharged={setPostageCharged}
        postageCost={postageCost}
        setPostageCost={setPostageCost}
        saleDate={saleDate}
        setSaleDate={setSaleDate}
        etsyOrderId={etsyOrderId}
        setEtsyOrderId={setEtsyOrderId}
        notes={notes}
        setNotes={setNotes}
        preview={preview}
        previewLoading={previewLoading}
        saving={saving}
        isHistorical={isHistorical}
        setIsHistorical={setIsHistorical}
        overrides={overrides}
        editingOverride={editingOverride}
        availableLots={availableLots}
        lotsLoading={lotsLoading}
        postageTiers={postageTiers}
        handleCancel={handleCancel}
        handleAddLine={handleAddLine}
        handleRemoveLine={handleRemoveLine}
        handleUpdateLine={handleUpdateLine}
        handleSubmit={handleSubmit}
        handleStartOverride={handleStartOverride}
        handleClearOverride={handleClearOverride}
        handleSaveOverride={handleSaveOverride}
        handleCancelOverride={handleCancelOverride}
      />
    )
  }

  return (
    <SalesListView
      saleList={saleList}
      pagination={pagination}
      isUpdating={listState.isUpdating}
      listError={listState.error ?? error}
      onRetry={listState.retry}
      showEtsyOrdersPanel={showEtsyOrdersPanel}
      setShowEtsyOrdersPanel={setShowEtsyOrdersPanel}
      showSummary={showSummary}
      setShowSummary={setShowSummary}
      summary={summary}
      startDate={startDate}
      endDate={endDate}
      searchQuery={searchQuery}
      setStartDate={setStartDate}
      setEndDate={setEndDate}
      setSearchQuery={setSearchQuery}
      sort={sort}
      direction={direction}
      setSort={setSalesSort}
      setDirection={setSalesDirection}
      expandedId={expandedId}
      handleExpand={handleExpand}
      setViewMode={setViewMode}
      loadData={loadData}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />
  )
}
