import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { products, inventory, type Product, type InventoryLot } from '../../../lib/api'
import { useDebounce } from '../../../hooks/useDebounce'
import AddStockForm from '../../../components/inventory/AddStockForm'
import StockLevelBar from '../../../components/inventory/StockLevelBar'
import InventoryProductRow from '../components/InventoryProductRow'

type InventorySortOption =
  | 'stock-desc' | 'stock-asc'
  | 'name-asc' | 'name-desc'
  | 'category'
  | 'cost-asc' | 'cost-desc'
  | 'date-desc' | 'date-asc'

const INVENTORY_SORT_OPTIONS: { value: InventorySortOption; label: string }[] = [
  { value: 'stock-desc', label: 'Amount (high→low)' },
  { value: 'stock-asc', label: 'Amount (low→high)' },
  { value: 'name-asc', label: 'Name (A→Z)' },
  { value: 'name-desc', label: 'Name (Z→A)' },
  { value: 'category', label: 'Category' },
  { value: 'cost-asc', label: 'Cost (low→high)' },
  { value: 'cost-desc', label: 'Cost (high→low)' },
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
]

export default function Inventory() {
  const [showAddStock, setShowAddStock] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [productLots, setProductLots] = useState<Record<string, InventoryLot[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [expiringCount, setExpiringCount] = useState(0)
  const [sortBy, setSortBy] = useState<InventorySortOption>(
    () => (localStorage.getItem('inventory-sort') as InventorySortOption) || 'category'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)
  const [searchParams, setSearchParams] = useSearchParams()
  const lowStockFilter = searchParams.get('filter') === 'low-stock'
  // Edit lot state
  const [editingLot, setEditingLot] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    remaining: string
    unitCost: string
    expiresAt: string
  }>({ remaining: '', unitCost: '', expiresAt: '' })

  const loadProducts = async () => {
    setIsLoading(true)
    try {
      const [data, lowStock, expiring] = await Promise.all([
        products.list(),
        inventory.lowStock(),
        inventory.expiring(30),
      ])
      setAllProducts(data)
      setLowStockCount(lowStock.length)
      setExpiringCount(expiring.length)
    } catch (err) {
      console.error('Failed to load products', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    localStorage.setItem('inventory-sort', sortBy)
  }, [sortBy])

  // Filter products by search and low-stock filter
  const filteredProducts = useMemo(() => {
    let filtered = allProducts
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase()
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.category?.name?.toLowerCase().includes(query)
      )
    }
    if (lowStockFilter) {
      filtered = filtered.filter(p =>
        p.lowStockThreshold > 0 && (p.totalStock ?? 0) <= p.lowStockThreshold
      )
    }
    return filtered
  }, [allProducts, debouncedSearch, lowStockFilter])

  // Sort products based on selected option
  const sortedProducts = useMemo(() => {
    if (sortBy === 'category') return null // Use grouped view

    const sorted = [...filteredProducts]
    switch (sortBy) {
      case 'stock-desc':
        sorted.sort((a, b) => (b.totalStock ?? 0) - (a.totalStock ?? 0))
        break
      case 'stock-asc':
        sorted.sort((a, b) => (a.totalStock ?? 0) - (b.totalStock ?? 0))
        break
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'cost-asc':
        sorted.sort((a, b) => (a.currentCost ?? 0) - (b.currentCost ?? 0))
        break
      case 'cost-desc':
        sorted.sort((a, b) => (b.currentCost ?? 0) - (a.currentCost ?? 0))
        break
      case 'date-desc':
        sorted.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
        break
      case 'date-asc':
        sorted.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())
        break
    }
    return sorted
  }, [filteredProducts, sortBy])

  const handleStockAdded = async () => {
    setShowAddStock(false)
    // Clear the lots cache so it reloads with fresh data
    setProductLots({})
    await loadProducts()

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
      await loadProducts()
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
      await loadProducts()
    } catch (err) {
      console.error('Failed to update lot', err)
      alert('Failed to update lot. Please try again.')
    }
  }

  // Group products by category (uses filtered list)
  const productsByCategory: Record<string, Product[]> = {}
  filteredProducts.forEach((p) => {
    const catName = p.category?.name || 'Uncategorized'
    if (!productsByCategory[catName]) {
      productsByCategory[catName] = []
    }
    productsByCategory[catName].push(p)
  })

  // Calculate totals - for unit products sum remaining, for others count lots
  const totalProducts = allProducts.length
  const totalUnitItems = allProducts
    .filter(p => p.unit === 'units')
    .reduce((sum, p) => sum + (p.totalStock ?? 0), 0)
  const totalLots = allProducts
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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
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
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as InventorySortOption)}
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
              onClick={() => setSearchParams({})}
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
        <div className="card py-2 px-3 text-center">
          <div className={`text-xl font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {lowStockCount}
          </div>
          <div className="text-xs text-gray-500">Low Stock</div>
        </div>
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
      {isLoading ? (
        <div className="card text-gray-500 text-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto mb-2" />
          Loading inventory...
        </div>
      ) : allProducts.length === 0 ? (
        <div className="card text-gray-500 text-center py-8">
          <p className="mb-2">No products yet</p>
          <p className="text-sm">Add your first product to get started</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="card text-gray-500 text-center py-8">
          <p className="mb-2">No products match "{debouncedSearch}"</p>
          <p className="text-sm">Try a different search term</p>
        </div>
      ) : sortedProducts ? (
        // Flat sorted view
        <div className="card py-1 px-2">
          <div className="divide-y divide-gray-100">
            {sortedProducts.map((product) => (
              <InventoryProductRow
                key={product.id}
                product={product}
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
        // Grouped by category view
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
                    product={product}
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

      {showAddStock && (
        <AddStockForm
          onSuccess={handleStockAdded}
          onClose={() => setShowAddStock(false)}
        />
      )}
    </div>
  )
}
