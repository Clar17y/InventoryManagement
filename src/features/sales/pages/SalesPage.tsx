import { useState, useEffect, useRef } from 'react'
import { useDateSearchFilter } from '../../../components/filters/DateSearchFilter'
import {
  sales,
  hampers,
  inventory,
  settings,
  Sale,
  SalePreview,
  Hamper,
  CategoryLot,
  SaleChannel,
  SalesSummary,
  type SalesVerificationFilter,
  type PostageTier,
} from '../../../lib/api'
import SalesListView from '../components/SalesListView'
import SalesRecordView from '../components/SalesRecordView'
import { getOverrideKey } from '../utils'
import type { LotOverride, SaleLineInput } from '../types'

type ViewMode = 'list' | 'record'

export default function Sales() {
  const [saleList, setSaleList] = useState<Sale[]>([])
  const [hamperList, setHamperList] = useState<Hamper[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showEtsyOrdersPanel, setShowEtsyOrdersPanel] = useState(false)

  // Summary and filter state
  const [showSummary, setShowSummary] = useState(false)
  const [summary, setSummary] = useState<SalesSummary | null>(null)

  // Date and search filter state
  const {
    startDate,
    endDate,
    searchQuery,
    debouncedSearchQuery,
    setStartDate,
    setEndDate,
    setSearchQuery,
  } = useDateSearchFilter()
  const [verificationStatus, setVerificationStatus] = useState<SalesVerificationFilter | ''>('')

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
  const [isHistorical, setIsHistorical] = useState(false)

  // Postage tiers state
  const [postageTiers, setPostageTiers] = useState<PostageTier[]>([])

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
      const params: {
        limit?: number
        offset?: number
        startDate?: string
        endDate?: string
        search?: string
        verificationStatus?: SalesVerificationFilter
      } = {
        limit: PAGE_SIZE,
        offset: 0,
      }
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (debouncedSearchQuery) params.search = debouncedSearchQuery
      if (verificationStatus) params.verificationStatus = verificationStatus

      const [salesData, hampersData, summaryData] = await Promise.all([
        sales.list(params),
        hampers.list(),
        sales.summary({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          search: debouncedSearchQuery || undefined,
          verificationStatus: verificationStatus || undefined,
        }),
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
      const params: {
        limit?: number
        offset?: number
        startDate?: string
        endDate?: string
        search?: string
        verificationStatus?: SalesVerificationFilter
      } = {
        limit: PAGE_SIZE,
        offset: saleList.length,
      }
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (debouncedSearchQuery) params.search = debouncedSearchQuery
      if (verificationStatus) params.verificationStatus = verificationStatus

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

  // Load postage tiers on mount and set default cost
  useEffect(() => {
    settings.getPostageTiers().then((tiers) => {
      setPostageTiers(tiers)
      if (tiers.length > 0 && tiers[0]) {
        setPostageCost(Number(tiers[0].actualCost).toFixed(2))
      }
    }).catch(() => {})
  }, [])

  // Re-fetch when filters change (no loading indicator - data updates in place)
  useEffect(() => {
    if (!isFirstRender.current) {
      loadData(false)
    }
  }, [startDate, endDate, debouncedSearchQuery, verificationStatus])

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
      totalSales={totalSales}
      loading={loading}
      loadingMore={loadingMore}
      error={error}
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
      verificationStatus={verificationStatus}
      setVerificationStatus={setVerificationStatus}
      expandedId={expandedId}
      handleExpand={handleExpand}
      setViewMode={setViewMode}
      loadData={loadData}
      loadMore={loadMore}
    />
  )
}
