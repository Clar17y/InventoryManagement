import { useState, useEffect } from 'react'
import { products, inventory, type Product, type InventoryLot } from '../lib/api'
import AddStockForm from '../components/inventory/AddStockForm'
import StockLevelBar from '../components/inventory/StockLevelBar'

export default function Inventory() {
  const [showAddStock, setShowAddStock] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [productLots, setProductLots] = useState<Record<string, InventoryLot[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [expiringCount, setExpiringCount] = useState(0)
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
        inventory.lowStock(5),
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

  // Group products by category
  const productsByCategory: Record<string, Product[]> = {}
  allProducts.forEach((p) => {
    const catName = p.category?.name || 'Uncategorized'
    if (!productsByCategory[catName]) {
      productsByCategory[catName] = []
    }
    productsByCategory[catName].push(p)
  })

  // Calculate totals
  const totalProducts = allProducts.length
  const totalStock = allProducts.reduce((sum, p) => sum + (p.totalStock ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Inventory</h2>
        <button
          onClick={() => setShowAddStock(true)}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Stock
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <div className="text-2xl font-bold text-gray-900">{totalProducts}</div>
          <div className="text-xs text-gray-500">Products</div>
        </div>
        <div className="card text-center">
          <div className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {lowStockCount}
          </div>
          <div className="text-xs text-gray-500">Low Stock</div>
        </div>
        <div className="card text-center">
          <div className={`text-2xl font-bold ${expiringCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {expiringCount}
          </div>
          <div className="text-xs text-gray-500">Expiring</div>
        </div>
      </div>

      {/* Total Stock Bar */}
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Total Inventory</span>
          <span className="text-sm text-gray-500">{totalStock} units</span>
        </div>
        <StockLevelBar current={totalStock} max={100} showLabel={false} />
      </div>

      {/* Product List */}
      {isLoading ? (
        <div className="card text-gray-500 text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
          Loading inventory...
        </div>
      ) : allProducts.length === 0 ? (
        <div className="card text-gray-500 text-center py-12">
          <p className="mb-4">No products yet</p>
          <p className="text-sm">Add your first product to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(productsByCategory).map(([categoryName, categoryProducts]) => (
            <div key={categoryName} className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
                <span>{categoryName}</span>
                <span className="text-sm font-normal text-gray-500">
                  ({categoryProducts.length} products)
                </span>
              </h3>
              <div className="divide-y divide-gray-100">
                {categoryProducts.map((product) => (
                  <div key={product.id}>
                    <button
                      onClick={() => toggleProductExpand(product.id)}
                      className="w-full py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="font-medium text-gray-900 truncate">{product.name}</p>
                        <p className="text-sm text-gray-500">
                          {product.unit}
                          {product.barcode && ` · ${product.barcode}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-24">
                          <StockLevelBar current={product.totalStock ?? 0} size="sm" />
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${expandedProduct === product.id ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded Lot Details */}
                    {expandedProduct === product.id && (
                      <div className="pb-3 pl-4 pr-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Lot Breakdown</h4>
                          {productLots[product.id]?.length ? (
                            <div className="space-y-2">
                              {productLots[product.id]?.map((lot) => (
                                <div key={lot.id} className="text-sm bg-white rounded-lg p-2 border border-gray-100">
                                  {editingLot === lot.id ? (
                                    // Edit mode
                                    <div className="space-y-2">
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">Remaining</label>
                                          <input
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editForm.remaining}
                                            onChange={(e) => setEditForm(f => ({ ...f, remaining: e.target.value }))}
                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">Unit Cost (£)</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editForm.unitCost}
                                            onChange={(e) => setEditForm(f => ({ ...f, unitCost: e.target.value }))}
                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">Expires</label>
                                          <input
                                            type="date"
                                            value={editForm.expiresAt}
                                            onChange={(e) => setEditForm(f => ({ ...f, expiresAt: e.target.value }))}
                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <button
                                          onClick={() => setEditingLot(null)}
                                          className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded text-sm"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleSaveEdit(lot.id, product.id)}
                                          className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    // Display mode
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <span className="text-gray-600">
                                          Received {formatDate(lot.receivedAt)}
                                        </span>
                                        {lot.expiresAt && (
                                          <span className="text-amber-600 ml-2">
                                            · Expires {formatDate(lot.expiresAt)}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-gray-500">
                                          £{Number(lot.unitCost).toFixed(2)}
                                        </span>
                                        <span className="font-medium text-gray-900">
                                          {Number(lot.remaining).toFixed(0)} left
                                        </span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            startEditLot(lot)
                                          }}
                                          className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                          title="Edit lot"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteLot(lot.id, product.id)
                                          }}
                                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                          title="Delete lot"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No active lots</p>
                          )}
                          {product.currentCost && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <span className="text-sm text-gray-600">
                                Current cost: <strong>£{Number(product.currentCost).toFixed(2)}</strong> per {product.unit}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
