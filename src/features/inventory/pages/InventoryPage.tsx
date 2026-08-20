import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  inventory,
  type InventoryLot,
  type InventoryProduct,
} from '../../../lib/api'
import { inventorySortSchema, type InventorySort } from '#contracts/routes/inventory'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePaginationSearchParams } from '../../../hooks/usePaginationSearchParams'
import { usePaginatedList } from '../../../hooks/usePaginatedList'
import AddStockForm from '../../../components/inventory/AddStockForm'
import StockLevelBar from '../../../components/inventory/StockLevelBar'
import PaginationControls from '../../../components/ui/PaginationControls'
import UpdatingResults from '../../../components/ui/UpdatingResults'
import InventoryProductRow from '../components/InventoryProductRow'

const INVENTORY_SORT_OPTIONS: { value: InventorySort; label: string }[] = [
  { value: 'stock-desc', label: 'Amount (high→low)' },
  { value: 'stock-asc', label: 'Amount (low→high)' },
  { value: 'name-asc', label: 'Name (A→Z)' },
  { value: 'name-desc', label: 'Name (Z→A)' },
  { value: 'category', label: 'Category' },
  { value: 'cost-asc', label: 'Cost (low→high)' },
  { value: 'cost-desc', label: 'Cost (high→low)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

function getInventorySort(searchParams: URLSearchParams): InventorySort {
  const urlSort = inventorySortSchema.safeParse(searchParams.get('sort'))
  if (urlSort.success) return urlSort.data

  const storedSort = inventorySortSchema.safeParse(localStorage.getItem('inventory-sort'))
  return storedSort.success ? storedSort.data : 'category'
}

export default function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAddStock, setShowAddStock] = useState(false)
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [productLots, setProductLots] = useState<Record<string, InventoryLot[]>>({})
  const [lowStockCount, setLowStockCount] = useState(0)
  const [expiringCount, setExpiringCount] = useState(0)
  const sortBy = getInventorySort(searchParams)
  const urlSearch = searchParams.get('search') ?? ''
  const [searchQuery, setSearchQuery] = useState(urlSearch)
  const searchEditingRef = useRef(false)
  const debouncedSearch = useDebounce(searchQuery, 300)
  const { page, pageSize, setPage, setPageSize } = usePaginationSearchParams()
  const lowStockFilter = searchParams.get('filter') === 'low-stock'
  const categoryId = searchParams.get('categoryId') || undefined

  const listParams = {
    page,
    pageSize,
    search: urlSearch.trim() || undefined,
    categoryId,
    lowStockOnly: lowStockFilter,
    sort: sortBy,
  }
  const listState = usePaginatedList({
    queryKey: JSON.stringify(listParams),
    load: (signal) => inventory.list(listParams, { signal }),
  })
  const productList = useMemo(() => listState.data?.items ?? [], [listState.data])
  const pagination = listState.data?.pagination ?? {
    page,
    pageSize,
    totalItems: 0,
    totalPages: 0,
  }
  // Edit lot state
  const [editingLot, setEditingLot] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    remaining: string
    unitCost: string
    expiresAt: string
  }>({ remaining: '', unitCost: '', expiresAt: '' })

  const loadAlerts = useCallback(async () => {
    try {
      const [lowStock, expiring] = await Promise.all([
        inventory.lowStock(),
        inventory.expiring(30),
      ])
      setLowStockCount(lowStock.length)
      setExpiringCount(expiring.length)
    } catch (err) {
      console.error('Failed to load inventory alerts', err)
    }
  }, [])

  useEffect(() => {
    void loadAlerts()
  }, [loadAlerts])

  useEffect(() => {
    setSearchQuery((current) => {
      if (searchEditingRef.current && current.trim() === urlSearch) {
        searchEditingRef.current = false
        return current
      }
      searchEditingRef.current = false
      return urlSearch
    })
  }, [urlSearch])

  useEffect(() => {
    if (!searchEditingRef.current) return
    if (searchQuery !== debouncedSearch) return
    const normalizedSearch = debouncedSearch.trim()
    if (normalizedSearch === urlSearch) {
      searchEditingRef.current = false
      return
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (normalizedSearch) next.set('search', normalizedSearch)
      else next.delete('search')
      next.set('page', '1')
      return next
    }, { replace: true })
  }, [debouncedSearch, searchQuery, setSearchParams, urlSearch])

  useEffect(() => {
    if (
      listState.data
      && listState.data.items.length === 0
      && listState.data.pagination.totalItems > 0
      && page > 1
      && page !== listState.data.pagination.totalPages
    ) {
      setPage(listState.data.pagination.totalPages)
    }
  }, [listState.data, page, setPage])

  const handleStockAdded = async () => {
    setShowAddStock(false)
    // Clear the lots cache so it reloads with fresh data
    setProductLots({})
    listState.retry()
    await loadAlerts()

    // If a product was expanded, reload its lots
    if (expandedProduct) {
      try {
        const lots = await inventory.lots(expandedProduct)
        setProductLots(prev => ({ ...prev, [expandedProduct]: lots }))
      } catch (err) {
        console.error('Failed to reload lots', err)
      }
    }
  }

  const toggleProductExpand = async (productId: string) => {
    if (expandedProduct === productId) {
      setExpandedProduct(null)
      return
    }

    setExpandedProduct(productId)

    // Always fetch fresh lot data when expanding
    try {
      const lots = await inventory.lots(productId)
      setProductLots(prev => ({ ...prev, [productId]: lots }))
    } catch (err) {
      console.error('Failed to load lots', err)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString()
  }

  const handleDeleteLot = async (lotId: string, productId: string) => {
    if (!confirm('Are you sure you want to delete this lot? This cannot be undone.')) {
      return
    }

    try {
      await inventory.deleteLot(lotId)
      // Reload lots for this product
      const lots = await inventory.lots(productId)
      setProductLots(prev => ({ ...prev, [productId]: lots }))
      // Reload products to update stock counts
      listState.retry()
      await loadAlerts()
    } catch (err) {
      console.error('Failed to delete lot', err)
      alert('Failed to delete lot. Please try again.')
    }
  }

  const startEditLot = (lot: InventoryLot) => {
    setEditingLot(lot.id)
    setEditForm({
      remaining: String(lot.remaining),
      unitCost: String(lot.unitCost),
      expiresAt: lot.expiresAt?.split('T')[0] ?? '',
    })
  }

  const handleSaveEdit = async (lotId: string, productId: string) => {
    try {
      // Convert expiry date to ISO if provided
      let expiresAtISO: string | null | undefined
      if (editForm.expiresAt) {
        expiresAtISO = new Date(editForm.expiresAt + 'T23:59:59.999Z').toISOString()
      } else {
        expiresAtISO = null
      }

      await inventory.updateLot(lotId, {
        remaining: parseFloat(editForm.remaining),
        unitCost: parseFloat(editForm.unitCost),
        expiresAt: expiresAtISO,
      })

      setEditingLot(null)
      // Reload lots for this product
      const lots = await inventory.lots(productId)
      setProductLots(prev => ({ ...prev, [productId]: lots }))
      // Reload products to update stock counts
      listState.retry()
      await loadAlerts()
    } catch (err) {
      console.error('Failed to update lot', err)
      alert('Failed to update lot. Please try again.')
    }
  }

  const productsByCategory = useMemo(() => {
    const grouped: Record<string, InventoryProduct[]> = {}
    productList.forEach((product) => {
      const categoryName = product.category.name
      grouped[categoryName] ??= []
      grouped[categoryName].push(product)
    })
    return grouped
  }, [productList])

  // Stock totals describe the visible page; the product count comes from the server-filtered total.
  const totalProducts = pagination.totalItems
  const totalUnitItems = productList
    .filter(p => p.unit === 'units')
    .reduce((sum, p) => sum + (p.totalStock ?? 0), 0)
  const totalLots = productList
    .filter(p => p.unit !== 'units')
    .reduce((sum, p) => sum + (p.lotCount ?? 0), 0)

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Inventory</h2>
        <button
          onClick={() => setShowAddStock(true)}
          className="btn-primary flex items-center gap-1 text-sm py-1.5 px-3"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Stock
        </button>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              searchEditingRef.current = true
              setSearchQuery(e.target.value)
            }}
            placeholder="Search products..."
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => {
                searchEditingRef.current = true
                setSearchQuery('')
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort:</span>
          <select
            aria-label="Inventory sort"
            value={sortBy}
            onChange={(e) => {
              const nextSort = e.target.value as InventorySort
              localStorage.setItem('inventory-sort', nextSort)
              setSearchParams((current) => {
                const next = new URLSearchParams(current)
                next.set('sort', nextSort)
                next.set('page', '1')
                return next
              })
            }}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {INVENTORY_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Low Stock Filter Chip */}
      {lowStockFilter && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
            Low Stock Only
            <button
              onClick={() => setSearchParams((current) => {
                const next = new URLSearchParams(current)
                next.delete('filter')
                next.set('page', '1')
                return next
              })}
              className="ml-1 hover:text-amber-900"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card py-2 px-3 text-center">
          <div className="text-xl font-bold text-gray-900">{totalProducts}</div>
          <div className="text-xs text-gray-500">Products</div>
        </div>
        <button
          onClick={() => setSearchParams((current) => {
            const next = new URLSearchParams(current)
            if (lowStockFilter) next.delete('filter')
            else next.set('filter', 'low-stock')
            next.set('page', '1')
            return next
          })}
          className={`card py-2 px-3 text-center cursor-pointer transition-shadow ${lowStockFilter ? 'ring-2 ring-amber-400' : 'hover:ring-2 hover:ring-amber-300'}`}
        >
          <div className={`text-xl font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {lowStockCount}
          </div>
          <div className="text-xs text-gray-500">Low Stock</div>
        </button>
        <div className="card py-2 px-3 text-center">
          <div className={`text-xl font-bold ${expiringCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {expiringCount}
          </div>
          <div className="text-xs text-gray-500">Expiring</div>
        </div>
      </div>

      {/* Total Stock Bar */}
      <div className="card py-2 px-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-gray-700">Total Inventory</span>
          <span className="text-xs text-gray-500">
            {totalUnitItems} items + {totalLots} bulk lots
          </span>
        </div>
        <StockLevelBar current={totalUnitItems + totalLots} max={100} showLabel={false} />
      </div>

      {/* Product List */}
      {listState.isInitialLoading ? (
        <div className="card text-gray-500 text-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto mb-2" />
          Loading inventory...
        </div>
      ) : (
        <div className="space-y-2">
          <UpdatingResults
            updating={listState.isUpdating}
            error={listState.error}
            onRetry={listState.retry}
          >
            {productList.length === 0 ? (
              <div className="card text-gray-500 text-center py-8">
                <p className="mb-2">
                  {debouncedSearch ? `No products match "${debouncedSearch}"` : 'No products yet'}
                </p>
                <p className="text-sm">
                  {debouncedSearch ? 'Try a different search term' : 'Add your first product to get started'}
                </p>
              </div>
            ) : sortBy !== 'category' ? (
              <div className="card py-1 px-2">
                <div className="divide-y divide-gray-100">
                  {productList.map((product) => (
                    <InventoryProductRow
                      key={product.id}
                      product={{ ...product, barcode: null }}
                      expanded={expandedProduct === product.id}
                      onToggle={() => toggleProductExpand(product.id)}
                      lots={productLots[product.id]}
                      editingLot={editingLot}
                      editForm={editForm}
                      setEditForm={setEditForm}
                      onStartEdit={startEditLot}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={() => setEditingLot(null)}
                      onDeleteLot={handleDeleteLot}
                      formatDate={formatDate}
                      showCategory
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(productsByCategory).map(([categoryName, categoryProducts]) => (
                  <div key={categoryName} className="card py-2 px-2">
                    <h3 className="text-sm font-medium text-gray-900 mb-1 flex items-center gap-2 px-1">
                      <span>{categoryName}</span>
                      <span className="text-xs font-normal text-gray-500">
                        ({categoryProducts.length})
                      </span>
                    </h3>
                    <div className="divide-y divide-gray-100">
                      {categoryProducts.map((product) => (
                        <InventoryProductRow
                          key={product.id}
                          product={{ ...product, barcode: null }}
                          expanded={expandedProduct === product.id}
                          onToggle={() => toggleProductExpand(product.id)}
                          lots={productLots[product.id]}
                          editingLot={editingLot}
                          editForm={editForm}
                          setEditForm={setEditForm}
                          onStartEdit={startEditLot}
                          onSaveEdit={handleSaveEdit}
                          onCancelEdit={() => setEditingLot(null)}
                          onDeleteLot={handleDeleteLot}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </UpdatingResults>
          {pagination.totalItems > 0 && (
            <PaginationControls
              {...pagination}
              loading={listState.isUpdating}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </div>
      )}

      {showAddStock && (
        <AddStockForm
          onSuccess={handleStockAdded}
          onClose={() => setShowAddStock(false)}
        />
      )}
    </div>
  )
}
